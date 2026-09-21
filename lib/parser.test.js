import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseScholarProfile } from './parser.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadFixture(name) {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('parseScholarProfile', () => {
  it('parsea un perfil normal con métricas y citas por año', () => {
    const html = loadFixture('perfil_normal.html');
    const result = parseScholarProfile(html);

    expect(result.blocked).toBe(false);
    expect(result.data.name).toBe('Víctor Martínez-Cagigal');
    expect(result.data.affiliation).toBe(
      'Ph.D., Assistant Professor, Dpt. Computer Science, University of Valladolid (Spain)'
    );
    expect(result.data.citationsTotal).toBe(1413);
    expect(result.data.citationsSince).toBe(1313);
    expect(result.data.hIndex).toBe(21);
    expect(result.data.hIndexSince).toBe(20);
    expect(result.data.i10).toBe(27);
    expect(result.data.i10Since).toBe(25);
    expect(result.data.byYear).toContainEqual({ year: 2017, count: 8 });
    expect(result.data.byYear.length).toBeGreaterThan(0);
    expect(result.data.photoUrl).toContain('scholar.googleusercontent.com');
  });

  it('parsea un perfil sin foto de autor', () => {
    const html = loadFixture('perfil_sin_foto.html');
    const result = parseScholarProfile(html);

    expect(result.blocked).toBe(false);
    expect(result.data.name).toBe('Eduardo Santamaría-Vázquez');
    expect(result.data.citationsTotal).toBe(1264);
    expect(result.data.hIndex).toBe(18);
    expect(result.data.i10).toBe(22);
  });

  it('parsea un perfil con pocas citas', () => {
    const html = loadFixture('perfil_pocas_citas.html');
    const result = parseScholarProfile(html);

    expect(result.blocked).toBe(false);
    expect(result.data.name).toBe('Ana Ejemplo Ruiz');
    expect(result.data.citationsTotal).toBe(6);
    expect(result.data.hIndex).toBe(2);
    expect(result.data.i10).toBe(0);
    expect(result.data.byYear).toEqual([
      { year: 2024, count: 2 },
      { year: 2025, count: 4 },
    ]);
    expect(result.data.photoUrl).toBe('');
  });

  it('detecta la página de bloqueo/CAPTCHA', () => {
    const html = loadFixture('pagina_bloqueada.html');
    const result = parseScholarProfile(html);

    expect(result.blocked).toBe(true);
    expect(result.data).toBeUndefined();
  });
});
