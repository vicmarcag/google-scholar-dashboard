// Simula chrome.storage.local (+ runtime.sendMessage + alarms) para poder
// desarrollar el side panel y las options en un dev server normal (Vite),
// en una pestaña de navegador corriente, sin cargar la extensión.
const listeners = new Set();

const seedState = {
  authors: [
    { id: 'Jqb-LMgAAAAJ', addedAt: Date.now() - 3 * 86400000 },
    { id: 'RNo2pwkAAAAJ', addedAt: Date.now() - 2 * 86400000 },
    { id: 'MwXGkggAAAAJ', addedAt: Date.now() - 1 * 86400000 },
    { id: 'bloqueado-demo', addedAt: Date.now() },
  ],
  cache: {
    'Jqb-LMgAAAAJ': {
      status: 'ok',
      fetchedAt: Date.now() - 3600000,
      data: {
        name: 'Víctor Martínez-Cagigal',
        affiliation: 'Ph.D., Assistant Professor, Dpt. Computer Science, University of Valladolid (Spain)',
        photoUrl: 'https://scholar.googleusercontent.com/citations?view_op=view_photo&user=Jqb-LMgAAAAJ&citpid=12',
        citationsTotal: 1413,
        citationsSince: 1313,
        hIndex: 21,
        hIndexSince: 20,
        i10: 27,
        i10Since: 25,
        byYear: [
          { year: 2017, count: 8 },
          { year: 2018, count: 11 },
          { year: 2019, count: 29 },
          { year: 2020, count: 45 },
          { year: 2021, count: 87 },
          { year: 2022, count: 135 },
          { year: 2023, count: 186 },
          { year: 2024, count: 295 },
          { year: 2025, count: 348 },
          { year: 2026, count: 255 },
        ],
      },
    },
    'RNo2pwkAAAAJ': { status: 'pending', fetchedAt: null, data: null },
    'MwXGkggAAAAJ': {
      status: 'error',
      fetchedAt: Date.now() - 7200000,
      error: 'Network error (demo)',
      data: null,
    },
    'bloqueado-demo': {
      status: 'blocked',
      fetchedAt: Date.now() - 60000,
      blockedUntil: Date.now() + 6 * 3600000,
      data: null,
    },
  },
};

let state = structuredClone(seedState);

function notify(changes) {
  for (const listener of listeners) listener(changes, 'local');
}

function toChanges(before, after) {
  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { oldValue: before[key], newValue: after[key] };
    }
  }
  return changes;
}

const shim = {
  storage: {
    local: {
      async get(keys) {
        if (!keys) return structuredClone(state);
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result = {};
        for (const key of keyList) result[key] = structuredClone(state[key]);
        return result;
      },
      async set(patch) {
        const before = structuredClone(state);
        state = { ...state, ...structuredClone(patch) };
        notify(toChanges(before, state));
      },
    },
    onChanged: {
      addListener(fn) {
        listeners.add(fn);
      },
      removeListener(fn) {
        listeners.delete(fn);
      },
    },
  },
  runtime: {
    async sendMessage(message) {
      console.log('[shim] chrome.runtime.sendMessage', message);
      if (message?.type === 'REFRESH_AUTHOR' || message?.type === 'ADD_AUTHOR_FETCH_NOW') {
        const before = structuredClone(state);
        state.cache[message.id] = { ...state.cache[message.id], status: 'pending' };
        notify(toChanges(before, state));
        setTimeout(() => {
          const before2 = structuredClone(state);
          const existing = state.cache[message.id]?.data;
          state.cache[message.id] = {
            status: 'ok',
            fetchedAt: Date.now(),
            data: existing ?? seedState.cache['Jqb-LMgAAAAJ'].data,
          };
          notify(toChanges(before2, state));
        }, 1500);
      }
      return { ok: true };
    },
  },
  alarms: {
    create() {},
    onAlarm: { addListener() {} },
  },
};

if (typeof globalThis.chrome === 'undefined' || !globalThis.chrome.storage) {
  globalThis.chrome = shim;
}
