const BLOCKED_MARKERS = ['gs_captcha_ccl', 'g-recaptcha'];

function isBlocked(doc, html) {
  if (doc.querySelector('#gs_captcha_ccl')) return true;
  return BLOCKED_MARKERS.some((marker) => html.includes(marker));
}

function toInt(text) {
  const n = parseInt((text || '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseByYear(doc) {
  const years = Array.from(doc.querySelectorAll('.gsc_g_t')).map((el) => toInt(el.textContent));
  const counts = Array.from(doc.querySelectorAll('.gsc_g_a')).map((el) => toInt(el.textContent));
  return years.map((year, i) => ({ year, count: counts[i] ?? 0 }));
}

/**
 * Parsea el HTML de un perfil de Google Scholar.
 * Función pura: sin red, sin chrome.*, solo DOMParser sobre una cadena.
 * @param {string} html
 * @returns {{ blocked: true } | { blocked: false, data: object }}
 */
export function parseScholarProfile(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (isBlocked(doc, html)) {
    return { blocked: true };
  }

  const name = doc.querySelector('#gsc_prf_in')?.textContent?.trim() ?? '';
  const affiliation = doc.querySelector('.gsc_prf_il')?.textContent?.trim() ?? '';
  const photoUrl = doc.querySelector('#gsc_prf_pup-img')?.getAttribute('src') ?? '';

  const stats = Array.from(doc.querySelectorAll('#gsc_rsb_st td.gsc_rsb_std')).map((td) =>
    toInt(td.textContent)
  );
  const [citationsTotal, citationsSince, hIndex, hIndexSince, i10, i10Since] = stats;

  const byYear = parseByYear(doc);

  return {
    blocked: false,
    data: {
      name,
      affiliation,
      photoUrl,
      citationsTotal: citationsTotal ?? 0,
      citationsSince: citationsSince ?? 0,
      hIndex: hIndex ?? 0,
      hIndexSince: hIndexSince ?? 0,
      i10: i10 ?? 0,
      i10Since: i10Since ?? 0,
      byYear,
    },
  };
}
