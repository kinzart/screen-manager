// Vite é usado SOMENTE como bundler/dev-server — sem framework de UI.
// source root: mobile/www/ (continua sendo o código-fonte real).
// build output: mobile/dist/ (exclusivamente gerado, nunca editado à mão).
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'www'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
