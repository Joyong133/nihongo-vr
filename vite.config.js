import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

// base './' so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { main: page('./index.html'), village: page('./village.html') },
    },
  },
  server: {
    host: true,
  },
});
