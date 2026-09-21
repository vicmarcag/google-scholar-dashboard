# Scholar Dashboard — extensión de navegador

Extensión para Chrome/Brave (Manifest V3) que muestra, en un panel lateral, una
tarjeta por cada investigador de Google Scholar que el usuario decide seguir:
nombre, afiliación, citas totales, índice h, índice i10 y la serie de citas
por año (el gráfico que se ve al pulsar "Citado por" en el perfil).

Este documento recoge las decisiones de arquitectura ya tomadas. Una futura
instancia de Claude Code debe usarlo como especificación para generar el
proyecto — no rediscutir estas decisiones salvo que el usuario lo pida
explícitamente.

## Por qué esta solución (contexto de decisión)

- Google Scholar no tiene API oficial y bloquea el scraping automatizado a
  volumen (CAPTCHA, bloqueo de IP).
- Se evaluaron APIs académicas gratuitas alternativas (OpenAlex, Semantic
  Scholar) y **se descartaron**: comparadas contra un perfil real, OpenAlex
  devolvió un 34% menos de citas totales y 5 puntos menos de h-index, con la
  brecha creciendo mucho en los años recientes (peor indexación de citas
  nuevas). No sirven como sustituto fiel de los números de Scholar.
- Se evaluaron servicios de scraping de pago (SerpApi, Apify): dan números
  exactos pero tienen coste y requieren ocultar la API key tras un proxy.
- **Decisión: extensión de navegador que hace scraping directo del HTML del
  perfil de Scholar**, ejecutándose con la sesión/IP normal del propio
  usuario (patrón de bajo volumen, el menos sospechoso para Google), sin
  coste y sin infraestructura que mantener.
- Se descartó GitHub Pages puro como solución principal: sin backend no se
  puede hacer fetch a Scholar (CORS + bloqueo), y las alternativas viables
  (GitHub Actions con cron, o proxy hacia una API de pago) añaden
  complejidad y frescura de datos peor que la extensión.

## Componentes

```
Side Panel (dashboard)          Options page
- Grid de tarjetas por autor     - Añadir/quitar autores (por URL)
- Botón refrescar por tarjeta    - Botón "Test mode"
- Lee de chrome.storage.local
        │ mensajes runtime               │ storage.set
        ▼                                ▼
Background service worker
- chrome.alarms: refresco diario, EN LOTES ESCALONADOS
- Refresco manual bajo demanda (mensaje desde el dashboard)
- Orquesta: fetcher → parser → storage
- Backoff/detección de bloqueo (CAPTCHA)
        │                                │
        ▼                                ▼
lib/fetcher.js                  lib/parser.js (PURO)
fetch(scholar url)              html string → JSON estructurado
→ texto HTML                    sin dependencias de chrome.*
(mockable en test mode)
```

## Manifest / permisos

- Manifest V3.
- `host_permissions`: `https://scholar.google.com/*` (todas las peticiones
  reales se hacen contra `.com`, sea cual sea el TLD que el usuario haya
  pegado en la URL — `.es`, `.com`, etc. — porque Scholar resuelve el mismo
  perfil en cualquier dominio local).
- `permissions`: `storage`, `alarms`, `sidePanel`.
- `unlimitedStorage` opcional (gratis de declarar); en la práctica no hace
  falta, cada perfil ocupa pocos KB.
- Vista principal: **side panel** (`chrome.sidePanel`), no popup — se queda
  abierto mientras se navega, mejor para comparar "de un vistazo" muchas
  tarjetas a la vez que un popup que se cierra al perder foco.

## Modelo de datos (`chrome.storage.local`)

```jsonc
{
  "authors": [
    { "id": "Jqb-LMgAAAAJ", "addedAt": 1732000000000 }
  ],
  "cache": {
    "Jqb-LMgAAAAJ": {
      "status": "ok" | "pending" | "blocked" | "error",
      "fetchedAt": 1732000000000,
      "data": {
        "name": "Víctor Martínez-Cagigal",
        "affiliation": "Ph.D., Assistant Professor, ...",
        "photoUrl": "https://scholar.googleusercontent.com/citations?view_op=view_photo&user=...",
        "citationsTotal": 1413,
        "citationsSince": 1313,
        "hIndex": 21,
        "hIndexSince": 20,
        "i10": 27,
        "i10Since": 25,
        "byYear": [ { "year": 2017, "count": 8 }, ... ]
      }
    }
  }
}
```

- `id` es siempre el valor del parámetro `user=` de la URL de Scholar, nunca
  la URL completa.
- El `authorId` es la clave primaria en todo el sistema (storage, mensajes
  runtime, UI).

## Añadir un perfil (por URL, no por ID)

El usuario pega la URL completa del perfil tal cual la copia del navegador
(p. ej. `https://scholar.google.es/citations?user=Jqb-LMgAAAAJ&hl=es`) en un
formulario de la página de Options. Extracción del ID:

```js
function extractAuthorId(url) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get('user');
  if (!id || !/^[\w-]{12}$/.test(id)) {
    throw new Error('URL no reconocida como perfil de Google Scholar');
  }
  return id;
}
```

Flujo al pulsar "Añadir":
1. Validar formato con la regex de arriba → error inline si no matchea.
2. Comprobar que el `authorId` no esté ya en `authors` (evitar duplicados).
3. Guardar el autor con `status: "pending"` y disparar un fetch inmediato
   fuera del ciclo de alarmas, para que la tarjeta aparezca con datos sin
   esperar al siguiente refresco programado.
4. Si el fetch falla o Scholar devuelve la página de bloqueo, el autor queda
   igualmente en la lista, marcado como pendiente/bloqueado, y se reintenta
   en el siguiente ciclo.

Quitar un perfil: botón "✕" en cada tarjeta → borra la entrada de
`authors` y de `cache` para ese `authorId`.

## Refresco: SIEMPRE en lotes escalonados

Requisito explícito del usuario: nunca lanzar todas las peticiones de golpe,
ni en el refresco automático ni en el manual masivo.

- El refresco periódico (`chrome.alarms`, 1x/día) recorre la lista de
  `authors` y encola sus IDs.
- Un procesador de cola en el background worker consume esa cola con un
  espaciado fijo entre peticiones (p. ej. 3-5 segundos configurable), nunca
  en paralelo.
- Si la lista de autores crece mucho, el ciclo completo tarda más en
  terminar en vez de lanzar más peticiones concurrentes — esto es
  intencional, prioriza no bloquear la IP del usuario sobre la velocidad de
  refresco.
- No hay un tope duro de número de autores (la cuota de storage no es el
  cuello de botella), pero sí un aviso blando en la UI a partir de un umbral
  configurable (p. ej. 50 autores: "con muchos autores, los refrescos
  tardarán más en completarse para evitar bloqueos").

## Refresco manual por autor

Requisito explícito del usuario: cada tarjeta del dashboard debe tener un
botón para refrescar ese autor en concreto, en el momento, sin esperar al
ciclo programado.

- Botón "↻" en la tarjeta → mensaje runtime `{ type: 'REFRESH_AUTHOR', id }`
  al background worker.
- Esta petición individual **entra en la misma cola escalonada** que el
  refresco automático (no la salta ni hace un fetch paralelo fuera de banda)
  para no romper el espaciado entre peticiones a Scholar — pero se prioriza
  al frente de la cola para que el usuario perciba respuesta rápida.
- Mientras está en curso, la tarjeta muestra un estado "actualizando..."
  (spinner o similar), usando el campo `status` en storage.

## Detección de bloqueo / backoff

- `parser.js` detecta la página de CAPTCHA/bloqueo de Scholar (marcador
  característico en el HTML, p. ej. `#gs_captcha_ccl` o el texto de aviso) y
  devuelve `{ blocked: true }` en vez de lanzar una excepción.
- El background worker, ante `blocked`, marca `status: "blocked"` para ese
  autor y aplica backoff exponencial: no se reintenta ese autor hasta pasadas
  N horas, aunque la cola general siga procesando al resto.
- La UI debe mostrar visiblemente ese estado ("Google ha bloqueado
  temporalmente las consultas") en la tarjeta afectada, no fallar en
  silencio.

## Parser (`lib/parser.js`) — pieza central, debe ser función pura

`parseScholarProfile(html: string) -> ParsedProfile`. Sin dependencias de
`chrome.*`, sin red — solo `DOMParser` sobre una cadena HTML. Esto es
deliberado para poder testear sin cargar la extensión ni tocar la red (ver
estrategia de testing).

Selectores objetivo en el HTML del perfil de Scholar:
- Nombre: `#gsc_prf_in`
- Afiliación: `.gsc_prf_il`
- Foto: `#gsc_prf_pup-img` (atributo `src`; Scholar sirve un avatar por
  defecto aunque el autor no tenga foto propia, así que el selector siempre
  resuelve a una URL válida)
- Tabla de métricas (6 valores: citas/h-index/i10, total y "desde año"):
  `#gsc_rsb_st td.gsc_rsb_std`
- Citas por año (el gráfico de "Citado por" ya viene en la misma página, no
  hace falta clicar nada): años en `.gsc_g_t` y recuentos en `.gsc_g_a`,
  emparejados por índice — en el HTML real actual (verificado en el momento
  de escribir esto) no existe el id `#gsc_graph_bars`, están bajo
  `#gsc_rsb_cit`
- Página bloqueada/CAPTCHA: marcador `#gs_captcha_ccl` o texto característico

## Fetcher (`lib/fetcher.js`)

`fetchProfileHtml(authorId: string) -> Promise<string>`. Única pieza que
hace red real: `fetch('https://scholar.google.com/citations?user=' +
authorId)`. Debe ser sustituible por una versión que lee fixtures locales
(ver "Test mode"), mediante inyección de dependencia o flag de build, para
que el resto del pipeline (background, storage, UI) se pueda probar sin red.

## Estrategia de testing (requisito explícito: testear lo más fácil posible)

Tres capas, de más rápida/aislada a más realista:

1. **Tests unitarios del parser con Vitest + jsdom.** Como es función pura,
   se testea sin abrir Chrome ni tocar la red. Fixtures en `/fixtures/*.html`
   capturadas una vez de perfiles reales (incluyendo casos límite: sin foto,
   pocas citas, y una captura real de la página de bloqueo/CAPTCHA). Cada
   test compara la salida del parser contra los números verificados a mano
   una vez.

2. **Desarrollo del dashboard aislado, sin recargar la extensión.** El side
   panel solo lee JSON de `chrome.storage.local` y pinta tarjetas. Se
   levanta con un dev server normal (Vite) en una pestaña de navegador
   corriente, con un `chrome-storage-shim.js` que simula la API de storage
   con datos de ejemplo (varios autores: normal, cargando, bloqueado) cuando
   `chrome.storage` no existe. Permite iterar CSS/layout con hot-reload
   instantáneo sin tocar `chrome://extensions`.

3. **Extensión completa con hot-reload real.** Usar Vite + el plugin
   `@crxjs/vite-plugin`, que recarga automáticamente el service worker y las
   vistas al guardar, sin recargar manualmente desde `chrome://extensions`.
   Cargar la extensión una sola vez como "Cargar descomprimida"
   (modo desarrollador).

4. **"Test mode" para evitar bloqueos durante el desarrollo del fetch real.**
   Interruptor en la página de Options que hace que `fetcher.js` devuelva el
   contenido de `/fixtures/*.html` en vez de llamar a `scholar.google.com`.
   Permite probar el pipeline completo (background → parser → storage →
   dashboard, incluyendo la cola escalonada y el backoff) sin una sola
   petición real. El modo real (contra Scholar de verdad) solo se activa
   puntualmente, con 1-2 autores, para validar que los selectores no han
   cambiado.

## Estructura de carpetas

```
scholar-dashboard/
├── CLAUDE.md
├── manifest.json
├── background.js
├── lib/
│   ├── parser.js
│   ├── parser.test.js
│   ├── fetcher.js
│   ├── queue.js        # cola escalonada de refresco
│   └── storage.js
├── fixtures/
│   ├── perfil_normal.html
│   ├── perfil_sin_foto.html
│   ├── perfil_pocas_citas.html
│   └── pagina_bloqueada.html
├── sidepanel/
│   ├── index.html
│   ├── main.js
│   └── style.css
├── options/
│   ├── index.html
│   └── main.js
├── vite.config.js
└── package.json
```

## Siguiente paso para la instancia que ejecute esto

Generar el scaffold completo empezando por `lib/parser.js` + `lib/
parser.test.js` con una fixture basada en un perfil real, luego `lib/
fetcher.js`, `lib/queue.js` (cola escalonada con soporte de prioridad para
refresco manual), `lib/storage.js`, `background.js`, y finalmente las vistas
de `sidepanel/` y `options/`. Configurar Vite + CRXJS antes de escribir las
vistas para tener hot-reload desde el principio.
