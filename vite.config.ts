import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { reatom } from '@reatom/vite';
import { defineConfig } from 'vite';
import { atlasContent } from './src/content/build.ts';

export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    reatom(),
    atlasContent(),
    {
      name: 'atlas-boundary-geometry',
      enforce: 'pre',
      load(id) {
        if (!id.replaceAll('\\', '/').endsWith('/ne_110m_admin_0_countries.geojson?raw')) return;
        const path = id.slice(0, -4);
        this.addWatchFile(path);
        const source = JSON.parse(readFileSync(path, 'utf8')) as { features: { geometry: unknown }[] };
        // Keep the pinned coordinates intact; the map does not need country metadata.
        const geometry = { features: source.features.map(({ geometry }) => ({ geometry })) };
        return 'export default ' + JSON.stringify(JSON.stringify(geometry));
      },
    },
  ],
  oxc: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'hf' } },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        ru: fileURLToPath(new URL('./ru/index.html', import.meta.url)),
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        components: fileURLToPath(new URL('./components/index.html', import.meta.url)),
      },
    },
  },
});
