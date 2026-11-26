import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react()],
  server: { fs: { allow: [fileURLToPath(new URL('../../../../', import.meta.url))] } },
  build: {
    outDir: fileURLToPath(new URL('../../../../node_modules/.cache/game0011/a1-foundation-dist', import.meta.url)),
    emptyOutDir: true,
  },
});
