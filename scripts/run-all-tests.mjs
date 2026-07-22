/**
 * Roda a bateria completa de testes headless do projeto.
 * Uso: npm run test:all
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ label: string, steps: string[][] }[]} */
const SUITES = [
  { label: 'league-fixtures', steps: [['scripts/league-fixtures-tests.mjs']] },
  { label: 'season-scheduler', steps: [['scripts/season-scheduler-tests.mjs']] },
  { label: 'season-calendar-plan', steps: [['scripts/season-calendar-plan-tests.mjs']] },
  { label: 'knockout-shootout', steps: [['scripts/knockout-shootout-tests.mjs']] },
  { label: 'competition-rules', steps: [['scripts/competition-rules-tests.mjs']] },
  { label: 'serie-c-calendar', steps: [['scripts/serie-c-calendar-tests.mjs']] },
  { label: 'messages-stale', steps: [['scripts/messages-stale-tests.mjs']] },
  { label: 'club-solvency', steps: [['scripts/club-solvency-tests.mjs']] },
  { label: 'bank-loan', steps: [['scripts/bank-loan-tests.mjs']] },
  { label: 'season-objectives', steps: [['scripts/season-objectives-tests.mjs']] },
  { label: 'player-history', steps: [['scripts/player-history-tests.mjs']] },
  { label: 'match-ratings', steps: [['scripts/match-ratings-tests.mjs']] },
  { label: 'finance-mood', steps: [['scripts/finance-mood-tests.mjs']] },
  { label: 'finances-impact', steps: [['scripts/finances-impact-tests.mjs']] },
  { label: 'transfer-division-fit', steps: [['scripts/transfer-division-fit-tests.mjs']] },
  { label: 'transfer-division-phase', steps: [['scripts/transfer-division-phase-tests.mjs']] },
  { label: 'loan-fit', steps: [['scripts/loan-fit-tests.mjs']] },
  { label: 'loan-buy-option', steps: [['scripts/loan-buy-option-tests.mjs']] },
  { label: 'loan-salary-split', steps: [['scripts/loan-salary-split-tests.mjs']] },
  { label: 'overdraft', steps: [['scripts/overdraft-tests.mjs']] },
  { label: 'sell-down-buyout', steps: [['scripts/sell-down-buyout-tests.mjs']] },
  { label: 'stadium-sectors', steps: [['scripts/stadium-sectors-tests.mjs']] },
  { label: 'stadium-naming', steps: [['scripts/stadium-naming-tests.mjs']] },
  { label: 'stadium-visual-tier', steps: [['scripts/stadium-visual-tier-tests.mjs']] },
  { label: 'soft-envelope', steps: [['scripts/soft-envelope-tests.mjs']] },
  { label: 'tv-advance', steps: [['scripts/tv-advance-tests.mjs']] },
  { label: 'season-goal-live', steps: [['scripts/season-goal-live-tests.mjs']] },
  { label: 'own-goal-report', steps: [['scripts/own-goal-report-tests.mjs']] },
  { label: 'transfers', steps: [['scripts/transfers-tests.mjs']] },
  {
    label: 'match-view-all',
    steps: [['scripts/match-view-world-tests.mjs'], ['scripts/match-view-play-tests.mjs']],
  },
  {
    label: 'ao-vivo-2d',
    steps: [['modules/ao-vivo-2d/scripts/run-tests.mjs', 'lab']],
  },
];

const runStep = scriptArgs => {
  const [script, ...args] = scriptArgs;
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
};

const runSuite = ({ label, steps }) => {
  console.log(`\n=== ${label} ===\n`);
  for (const step of steps) {
    const result = runStep(step);
    const code = result.status ?? 1;
    if (code !== 0) return { label, ok: false, code };
  }
  return { label, ok: true, code: 0 };
};

const results = SUITES.map(runSuite);
const failed = results.filter(r => !r.ok);

console.log('\n--- resumo ---');
console.log(`${results.length - failed.length}/${results.length} suítes OK`);
if (failed.length) {
  console.error('Falharam:', failed.map(r => r.label).join(', '));
  process.exit(1);
}
console.log('test:all OK');
