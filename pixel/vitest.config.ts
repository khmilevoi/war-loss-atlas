import { defineConfig } from 'vitest/config';
import { atlasContent } from './src/content/build.ts';

export default defineConfig({
  plugins: [atlasContent()],
  test: { include: ['tests/**/*.test.ts'] },
});
