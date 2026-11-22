import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: the GitHub Pages path the site is served under (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: process.env.PAGES_BASE ?? './',
  plugins: [react()],
  resolve: { preserveSymlinks: false },
  test: { environment: 'node' },
});
