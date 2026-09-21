import { defineConfig } from 'vite';

// Dev server plano (sin CRXJS) para iterar en el side panel y las options
// con hot-reload instantáneo, usando el chrome-storage-shim en vez de una
// extensión real cargada en Chrome.
export default defineConfig({
  root: '.',
  server: {
    open: '/sidepanel/index.html',
  },
});
