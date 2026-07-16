import { bootEngine } from './legacy/engine.js';

/** Ponte de compatibilidade — preferir js/main.js */
bootEngine().catch(error => {
  document.documentElement.dataset.bootError = String(error?.stack || error);
  console.error('Matchday Football failed to initialize', error);
});
