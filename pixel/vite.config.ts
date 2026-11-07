import { fileURLToPath } from 'node:url';
import { reatom } from '@reatom/vite';
import { defineConfig } from 'vite';
import { atlasContent } from './src/content/build.ts';

export default defineConfig({
  plugins: [reatom(), atlasContent()],
  oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'hf' } },
  build: {
    target: 'es2022',
    outDir: '../dist/pixel',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ru: fileURLToPath(new URL('./ru/index.html', import.meta.url)),
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
      },
    },
  },
});
