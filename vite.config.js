import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const githubPagesBase = repoName ? `/${repoName}/` : './';

/** Mercado: on no build local/testers; off no GitHub Pages até validar. */
const enableTransfers = process.env.GITHUB_PAGES !== 'true';

export default defineConfig({
  root: '.',
  base: process.env.GITHUB_PAGES === 'true' ? githubPagesBase : './',
  define: {
    __MATCHDAY_ENABLE_TRANSFERS__: JSON.stringify(enableTransfers),
  },
  plugins: [
    {
      name: 'inject-build-time',
      transformIndexHtml(html) {
        const stamp = new Date().toISOString();
        if (html.includes('name="build-time"')) {
          return html.replace(
            /(<meta name="build-time" content=")[^"]*(")/,
            `$1${stamp}$2`,
          );
        }
        return html.replace('<head>', `<head>\n  <meta name="build-time" content="${stamp}">`);
      },
    },
  ],
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
