import { parseScholarProfile } from '../lib/parser.js';

// Documento offscreen: único lugar donde el background (service worker, sin
// DOM) puede usar DOMParser para parsear el HTML descargado de Scholar.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'PARSE_HTML') return false;

  try {
    const result = parseScholarProfile(message.html);
    sendResponse({ ok: true, result });
  } catch (err) {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return false;
});
