import './security/tester-hardening.js';
import { BUILD_VERSION, FEATURES } from './core/constants.js';
import { createEventBus } from './core/event-bus.js';
import { bootEngine } from './legacy/engine.js';
import { showUpdateAlertIfNeeded } from './ui/update-alert.js';

/** Ponto de entrada modular — Alpha 02 */
document.documentElement.dataset.build = BUILD_VERSION;
showUpdateAlertIfNeeded(BUILD_VERSION);

const bus = createEventBus();

bootEngine({
  bus,
  features: FEATURES,
  buildVersion: BUILD_VERSION,
}).catch(error => {
  document.documentElement.dataset.bootError = String(error?.stack || error);
  console.error('Matchday Football failed to initialize', error);
});
