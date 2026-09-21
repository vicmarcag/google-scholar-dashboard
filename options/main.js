if (typeof chrome === 'undefined' || !chrome.storage) {
  await import('../dev-shim/chrome-storage-shim.js');
}

import {
  getAuthors,
  getCache,
  getSettings,
  setSettings,
  addAuthor,
  removeAuthor,
  onStorageChanged,
} from '../lib/storage.js';
import { extractAuthorId } from '../lib/authorId.js';

const STATUS_LABEL = {
  ok: 'Updated',
  pending: 'Updating…',
  blocked: 'Blocked',
  error: 'Error',
};

const form = document.getElementById('add-author-form');
const input = document.getElementById('author-url-input');
const errorMsg = document.getElementById('error-msg');
const tableBody = document.getElementById('authors-table-body');
const testModeToggle = document.getElementById('test-mode-toggle');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const savedMsg = document.getElementById('saved-msg');

async function render() {
  const [authors, cache] = await Promise.all([getAuthors(), getCache()]);
  tableBody.innerHTML = '';
  for (const author of authors) {
    const entry = cache[author.id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${entry?.data?.name ?? '—'}</td>
      <td><code>${author.id}</code></td>
      <td>${STATUS_LABEL[entry?.status] ?? entry?.status ?? 'pending'}</td>
      <td><button class="remove-btn" data-id="${author.id}">Remove</button></td>
    `;
    tableBody.appendChild(tr);
  }

  tableBody.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await removeAuthor(btn.dataset.id);
      render();
    });
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';

  let authorId;
  try {
    authorId = extractAuthorId(input.value.trim());
  } catch (err) {
    errorMsg.textContent = err.message;
    return;
  }

  const existing = await getAuthors();
  if (existing.some((a) => a.id === authorId)) {
    errorMsg.textContent = 'That author is already in the list.';
    return;
  }

  await addAuthor(authorId);
  chrome.runtime.sendMessage({ type: 'ADD_AUTHOR_FETCH_NOW', id: authorId });
  input.value = '';
  render();
});

let savedMsgTimer = null;

saveSettingsBtn.addEventListener('click', async () => {
  await setSettings({ testMode: testModeToggle.checked });

  savedMsg.hidden = false;
  clearTimeout(savedMsgTimer);
  savedMsgTimer = setTimeout(() => {
    savedMsg.hidden = true;
  }, 2000);
});

async function initSettings() {
  const settings = await getSettings();
  testModeToggle.checked = Boolean(settings.testMode);
}

onStorageChanged(() => render());
render();
initSettings();
