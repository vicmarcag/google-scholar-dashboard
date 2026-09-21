import { fetchProfileHtml, createFixtureFetcher } from './lib/fetcher.js';
import { StaggeredQueue } from './lib/queue.js';
import {
  getAuthors,
  getSettings,
  setAuthorStatus,
  setAuthorData,
  setAuthorBlocked,
  setAuthorError,
} from './lib/storage.js';

const REFRESH_ALARM = 'scholar-dashboard-daily-refresh';
const QUEUE_SPACING_MS = 4000;
const BLOCK_BACKOFF_HOURS = 6;

const FIXTURE_MAP = {
  default: 'fixtures/perfil_normal.html',
};

const OFFSCREEN_URL = 'offscreen/index.html';

const blockedUntilByAuthor = new Map();

const queue = new StaggeredQueue({
  spacingMs: QUEUE_SPACING_MS,
  processItem: refreshAuthor,
});

async function getFetcher() {
  const settings = await getSettings();
  return settings.testMode ? createFixtureFetcher(FIXTURE_MAP) : fetchProfileHtml;
}

let creatingOffscreenPromise = null;

// El service worker no tiene DOM (no hay DOMParser), así que parser.js solo
// puede ejecutarse en un documento offscreen, que sí tiene DOM completo.
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime
    .getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    .catch(() => null);

  if (existingContexts && existingContexts.length > 0) return;

  if (!creatingOffscreenPromise) {
    creatingOffscreenPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_PARSER'],
        justification: 'Parse Google Scholar profile HTML with DOMParser',
      })
      .catch((err) => {
        if (!String(err).includes('single offscreen')) throw err;
      })
      .finally(() => {
        creatingOffscreenPromise = null;
      });
  }

  await creatingOffscreenPromise;
}

async function parseHtmlOffscreen(html) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: 'PARSE_HTML', html });
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Unknown error parsing profile HTML');
  }
  return response.result;
}

async function refreshAuthor(authorId) {
  const blockedUntil = blockedUntilByAuthor.get(authorId);
  if (blockedUntil && blockedUntil > Date.now()) {
    return;
  }

  await setAuthorStatus(authorId, 'pending');

  try {
    const fetchHtml = await getFetcher();
    const html = await fetchHtml(authorId);
    const result = await parseHtmlOffscreen(html);

    if (result.blocked) {
      const until = Date.now() + BLOCK_BACKOFF_HOURS * 60 * 60 * 1000;
      blockedUntilByAuthor.set(authorId, until);
      await setAuthorBlocked(authorId, until);
      return;
    }

    blockedUntilByAuthor.delete(authorId);
    await setAuthorData(authorId, result.data);
  } catch (err) {
    console.error(`[scholar-dashboard] refresh failed for ${authorId}`, err);
    await setAuthorError(authorId, err instanceof Error ? err.message : String(err));
  }
}

async function enqueueAllAuthors() {
  const authors = await getAuthors();
  queue.enqueueAll(authors.map((a) => a.id));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 60 * 24 });
});

// Con esto un solo click en el icono de la extensión abre/cierra el side
// panel (comportamiento nativo de toggle), en vez de no hacer nada.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    enqueueAllAuthors();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'REFRESH_AUTHOR') {
    queue.enqueueFront(message.id);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'REFRESH_ALL') {
    enqueueAllAuthors();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === 'ADD_AUTHOR_FETCH_NOW') {
    queue.enqueueFront(message.id);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
