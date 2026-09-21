/**
 * Extrae el authorId (parámetro `user=`) de una URL de perfil de Google Scholar.
 * @param {string} url
 * @returns {string}
 */
export function extractAuthorId(url) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get('user');
  if (!id || !/^[\w-]{12}$/.test(id)) {
    throw new Error('URL no reconocida como perfil de Google Scholar');
  }
  return id;
}
