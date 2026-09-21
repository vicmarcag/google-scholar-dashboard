const PROFILE_URL = (authorId) => `https://scholar.google.com/citations?user=${authorId}&hl=en`;

/**
 * Descarga el HTML del perfil de un autor de Google Scholar.
 * @param {string} authorId
 * @returns {Promise<string>}
 */
export async function fetchProfileHtml(authorId) {
  const res = await fetch(PROFILE_URL(authorId), { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Scholar responded with ${res.status} for author ${authorId}`);
  }
  return res.text();
}

/**
 * Fetcher de test mode: lee fixtures locales en vez de llamar a Scholar.
 * @param {Record<string, string>} fixtureMap authorId -> ruta del fixture (bajo fixtures/)
 * @returns {(authorId: string) => Promise<string>}
 */
export function createFixtureFetcher(fixtureMap) {
  return async function fetchProfileHtmlFromFixture(authorId) {
    const fixturePath = fixtureMap[authorId] ?? fixtureMap.default;
    if (!fixturePath) {
      throw new Error(`No fixture configured for author ${authorId}`);
    }
    const res = await fetch(chrome.runtime.getURL(fixturePath));
    return res.text();
  };
}
