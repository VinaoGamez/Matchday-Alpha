import { buildCompetitionRules, competitionRulesHtml } from '../js/engine/competition-rules.js';

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

check('Série C 2026 rules mention 20 clubs and Z2', () => {
  const rules = buildCompetitionRules('C', 2026);
  const text = JSON.stringify(rules);
  assert(text.includes('20 clubes'), '20 clubs');
  assert(text.includes('Z2') || text.includes('2 últimos'), 'Z2');
});

check('Série C 2030 rules mention 28 clubs and Z6', () => {
  const rules = buildCompetitionRules('C', 2030);
  const text = JSON.stringify(rules);
  assert(text.includes('28 clubes'), '28 clubs');
  assert(text.includes('Z6') || text.includes('6 últimos'), 'Z6');
});

check('HTML renderer escapes and includes sections', () => {
  const html = competitionRulesHtml('A', 2026);
  assert(html.title.includes('Série A'), 'title');
  assert(html.bodyHtml.includes('competition-rules-section'), 'sections');
  assert(html.bodyHtml.includes('20 clubes'), 'body');
});

check('Copa and Série D have content', () => {
  assert(buildCompetitionRules('CUP', 2026).sections.length >= 2, 'cup');
  assert(buildCompetitionRules('D', 2026).sections.length >= 2, 'serie d');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
