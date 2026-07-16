import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = repoName ? `/${repoName}/` : './';

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_PAGES === 'true' ? githubPagesBase : './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'home.html'),
      },
    },
  },
  server: {
    port: 5080,
    strictPort: true,
  },
});
