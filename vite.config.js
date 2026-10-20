import { defineConfig } from 'vite';

// base './' so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
  },
});
