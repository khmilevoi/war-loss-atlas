import { defineConfig } from 'vite';
import { reatom } from '@reatom/vite';

export default defineConfig({
  // This plugin's route HMR tracking reads parent outlets at module evaluation.
  // Keep that browser lifetime behavior out of request-isolated SSR modules.
  plugins: [{ ...reatom(), applyToEnvironment: environment => environment.config.consumer === 'client' }],
  build: { target: 'es2022', sourcemap: false },
});
