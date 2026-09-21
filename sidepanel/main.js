if (typeof chrome === 'undefined' || !chrome.storage) {
  await import('../dev-shim/chrome-storage-shim.js');
}

import { getAuthors, getCache, removeAuthor, onStorageChanged } from '../lib/storage.js';

const WARN_AUTHOR_THRESHOLD = 50;

const cardsEl = document.getElementById('cards');
const emptyStateEl = document.getElementById('empty-state');
const warningBannerEl = document.getElementById('warning-banner');
const refreshAllBtn = document.getElementById('refresh-all-btn');
const sortSelect = document.getElementById('sort-select');

const STATUS_LABEL = {
  ok: 'Updated',
  pending: 'Updating…',
  blocked: 'Google has temporarily blocked requests',
  error: 'Error updating',
};

function scholarProfileUrl(authorId) {
  return `https://scholar.google.com/citations?user=${authorId}&hl=en`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

const SPARKLINE_YEARS = 10;
const SPARKLINE_BAR_MAX_PX = 90;

function sparkline(byYear) {
  if (!byYear || byYear.length === 0) return '<div class="sparkline sparkline-empty">No yearly citation data</div>';
  const recentYears = byYear.slice(-SPARKLINE_YEARS);
  const max = Math.max(...recentYears.map((p) => p.count), 1);
  const bars = recentYears
    .map(
      (p) =>
        `<div class="spark-bar-wrap" title="${p.year}: ${p.count} citations">
          <span class="spark-count">${p.count}</span>
          <div class="spark-bar" style="height:${Math.max((p.count / max) * SPARKLINE_BAR_MAX_PX, 3)}px"></div>
          <span class="spark-year">${String(p.year).slice(2)}</span>
        </div>`
    )
    .join('');
  return `<div class="sparkline">${bars}</div>`;
}

const SORT_COMPARATORS = {
  default: null,
  'hindex-desc': (a, b) => (b.hIndex ?? -1) - (a.hIndex ?? -1),
  'hindex-asc': (a, b) => (a.hIndex ?? -1) - (b.hIndex ?? -1),
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

function sortAuthors(authors, cache, sortMode) {
  const comparator = SORT_COMPARATORS[sortMode];
  if (!comparator) return authors;

  return [...authors].sort((a, b) =>
    comparator(
      { name: (cache[a.id]?.data?.name ?? a.id).toLowerCase(), hIndex: cache[a.id]?.data?.hIndex },
      { name: (cache[b.id]?.data?.name ?? b.id).toLowerCase(), hIndex: cache[b.id]?.data?.hIndex }
    )
  );
}

function renderCard(authorId, entry) {
  const status = entry?.status ?? 'pending';
  const data = entry?.data;
  const card = document.createElement('article');
  card.className = `card card-${status}`;
  card.dataset.authorId = authorId;

  const profileUrl = scholarProfileUrl(authorId);
  const hasPhoto = typeof data?.photoUrl === 'string' && data.photoUrl.startsWith('https://');

  card.innerHTML = `
    <div class="card-header">
      ${
        hasPhoto
          ? `<img class="avatar" src="${data.photoUrl}" alt="" referrerpolicy="no-referrer" />`
          : '<div class="avatar avatar-placeholder"></div>'
      }
      <div class="card-header-text">
        <h2><a class="author-link" href="${profileUrl}" target="_blank" rel="noopener">${data?.name ?? authorId}</a></h2>
        <p class="affiliation">${data?.affiliation ?? ''}</p>
      </div>
      <div class="card-actions">
        <button class="icon-btn refresh-btn" title="Refresh this author">↻</button>
        <button class="icon-btn remove-btn" title="Unfollow">✕</button>
      </div>
    </div>
    <div class="card-body">
      <p class="status-line status-${status}" title="${entry?.error ?? ''}">${STATUS_LABEL[status] ?? status}${status === 'pending' ? '<span class=\"spinner\"></span>' : ''}</p>
      ${status === 'error' && entry?.error ? `<p class="error-detail">${entry.error}</p>` : ''}
      ${
        data
          ? `<div class="metrics">
              <div class="metric"><span class="metric-value">${data.citationsTotal}</span><span class="metric-label">Citations</span></div>
              <div class="metric"><span class="metric-value">${data.hIndex}</span><span class="metric-label">h-index</span></div>
              <div class="metric"><span class="metric-value">${data.i10}</span><span class="metric-label">i10-index</span></div>
            </div>
            ${sparkline(data.byYear)}`
          : ''
      }
      <p class="fetched-at">Last updated: ${formatDate(entry?.fetchedAt)}</p>
    </div>
  `;

  card.querySelector('.refresh-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REFRESH_AUTHOR', id: authorId });
  });

  card.querySelector('.remove-btn').addEventListener('click', async () => {
    if (!confirm(`Unfollow "${data?.name ?? authorId}"?`)) return;
    await removeAuthor(authorId);
    render();
  });

  return card;
}

async function render() {
  const [authors, cache] = await Promise.all([getAuthors(), getCache()]);

  emptyStateEl.hidden = authors.length > 0;
  warningBannerEl.hidden = authors.length < WARN_AUTHOR_THRESHOLD;
  if (authors.length >= WARN_AUTHOR_THRESHOLD) {
    warningBannerEl.textContent = `With ${authors.length} authors, refreshes will take longer to complete to avoid getting blocked.`;
  }

  const sortedAuthors = sortAuthors(authors, cache, sortSelect.value);

  cardsEl.innerHTML = '';
  for (const author of sortedAuthors) {
    cardsEl.appendChild(renderCard(author.id, cache[author.id]));
  }
}

refreshAllBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'REFRESH_ALL' });
});

sortSelect.addEventListener('change', () => render());

onStorageChanged(() => render());
render();
