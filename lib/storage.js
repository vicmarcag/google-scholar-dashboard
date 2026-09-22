const DEFAULT_STATE = { authors: [], cache: {} };

async function readState() {
  const stored = await chrome.storage.local.get(['authors', 'cache']);
  return {
    authors: stored.authors ?? DEFAULT_STATE.authors,
    cache: stored.cache ?? DEFAULT_STATE.cache,
  };
}

export async function getAuthors() {
  const { authors } = await readState();
  return authors;
}

export async function getCache() {
  const { cache } = await readState();
  return cache;
}

export async function addAuthor(authorId) {
  const authors = await getAuthors();
  if (authors.some((a) => a.id === authorId)) {
    return authors;
  }
  const next = [...authors, { id: authorId, addedAt: Date.now() }];
  await chrome.storage.local.set({ authors: next });

  const cache = await getCache();
  await chrome.storage.local.set({
    cache: { ...cache, [authorId]: { status: 'pending', fetchedAt: null, data: null } },
  });

  return next;
}

export async function removeAuthor(authorId) {
  const authors = await getAuthors();
  const next = authors.filter((a) => a.id !== authorId);
  await chrome.storage.local.set({ authors: next });

  const cache = await getCache();
  const { [authorId]: _removed, ...restCache } = cache;
  await chrome.storage.local.set({ cache: restCache });

  return next;
}

export async function setAuthorStatus(authorId, status) {
  const cache = await getCache();
  const entry = cache[authorId] ?? { status: 'pending', fetchedAt: null, data: null };
  const next = { ...cache, [authorId]: { ...entry, status } };
  await chrome.storage.local.set({ cache: next });
  return next[authorId];
}

export async function setAuthorData(authorId, data) {
  const cache = await getCache();
  const entry = {
    status: 'ok',
    fetchedAt: Date.now(),
    data,
  };
  await chrome.storage.local.set({ cache: { ...cache, [authorId]: entry } });
  return entry;
}

export async function setAuthorBlocked(authorId, blockedUntil) {
  const cache = await getCache();
  const entry = cache[authorId] ?? { data: null };
  const next = {
    ...cache,
    [authorId]: { ...entry, status: 'blocked', fetchedAt: Date.now(), blockedUntil },
  };
  await chrome.storage.local.set({ cache: next });
  return next[authorId];
}

export async function setAuthorError(authorId, message) {
  const cache = await getCache();
  const entry = cache[authorId] ?? { data: null };
  const next = {
    ...cache,
    [authorId]: { ...entry, status: 'error', fetchedAt: Date.now(), error: message },
  };
  await chrome.storage.local.set({ cache: next });
  return next[authorId];
}

export function onStorageChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') callback(changes);
  });
}
