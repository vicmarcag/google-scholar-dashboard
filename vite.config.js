import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel/index.html',
        options: 'options/index.html',
        offscreen: 'offscreen/index.html',
      },
    },
  },
});
