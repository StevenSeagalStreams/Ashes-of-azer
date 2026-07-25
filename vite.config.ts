import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // /assets is the project's static-asset folder (maps, future art/audio):
  // its contents are served at the site root and copied into dist verbatim.
  publicDir: 'assets',
  server: {
    port: 5173,
  },
});
