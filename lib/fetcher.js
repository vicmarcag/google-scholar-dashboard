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
