/**
 * Simulação / validação do regulamento disciplinar + badges.
 * Uso: node scripts/discipline-card-sim.mjs
 *
 * Regras (proposta confirmada):
 * - 3 amarelos na mesma competição = 1 jogo suspenso (contador reinicia)
 * - Acúmulo separado por competição
 * - 2º amarelo na partida = vermelho (1 jogo) + o 1º amarelo ainda conta no acúmulo
 * - Vermelho direto: 1–3 jogos conforme gravidade
 * - UI: máx. 2 pips por competição; pré-jogo mostra só a competição do jogo
 */
import {
  YELLOW_SUSPENSION_LIMIT,
  emptyPlayerDiscipline,
  normalizePlayerDiscipline,
  applyDisciplineCard,
  getYellowAccumulation,
  activeSuspensions,
  suspensionGamesForCard,
  directRedSuspensionGames,
  disciplineBadgeCompetitionKeys,
} from '../js/engine/discipline.js';
import { createPlayerCells } from '../js/feature/shared/player-cells.js';
import { clamp } from '../js/ui/dom.js';

let passed = 0;
let failed = 0;
const ok = name => {
  passed += 1;
  console.log(`  OK    ${name}`);
};
const fail = (name, detail) => {
  failed += 1;
  console.log(`  FAIL  ${name} — ${detail}`);
};
const assertEq = (name, actual, expected) => {
  if (actual === expected) ok(`${name} → ${expected}`);
  else fail(name, `expected ${expected}, got ${actual}`);
};

const makePlayer = (name = 'Teste') => ({
  name,
  discipline: emptyPlayerDiscipline(),
});

const countBadge = (html, className) => {
  // Conta tokens de classe exatos (evita `yellow` casar dentro de `yellow-match`).
  const re = new RegExp(`(?:^|[\\s"'])${className}(?=$|[\\s"'])`, 'g');
  return (String(html).match(re) || []).length;
};

const { playerStatusBadges } = createPlayerCells({
  injuryInAcutePhase: () => false,
  injuryInRestrictedPhase: () => false,
  injurySeverityLabel: () => 'Leve',
  YELLOW_SUSPENSION_LIMIT,
  getYellowAccumulation,
  activeSuspensions,
  disciplineBadgeCompetitionKeys,
  competitionLabel: key => key,
  userLeagueDisciplineKey: () => 'LEAGUE:D',
  getFocusCompetitionKey: () => 'LEAGUE:D',
});

console.log('\n=== 1) Acúmulo 3 = suspensão (por competição) ===\n');
{
  const player = makePlayer('Hugo');
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 1 });
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 2 });
  assertEq('após 2 amarelos', getYellowAccumulation(player.discipline, 'LEAGUE:D'), 2);
  assertEq('ainda sem suspensão', activeSuspensions(player.discipline).length, 0);
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 3 });
  assertEq('após 3º: contador zera', getYellowAccumulation(player.discipline, 'LEAGUE:D'), 0);
  assertEq('após 3º: 1 suspensão', activeSuspensions(player.discipline, 'LEAGUE:D').length, 1);
}

console.log('\n=== 2) Acúmulo separado por competição ===\n');
{
  const player = makePlayer('Heitor');
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 1 });
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 2 });
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'COPA', round: 3 });
  assertEq('liga = 2', getYellowAccumulation(player.discipline, 'LEAGUE:D'), 2);
  assertEq('copa = 1', getYellowAccumulation(player.discipline, 'COPA'), 1);
  assertEq('copa não suspende com 1', activeSuspensions(player.discipline, 'COPA').length, 0);
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 4 });
  assertEq('3º na liga suspende só liga', activeSuspensions(player.discipline, 'LEAGUE:D').length, 1);
  assertEq('copa intacta', getYellowAccumulation(player.discipline, 'COPA'), 1);
}

console.log('\n=== 3) Segundo amarelo na partida ===\n');
{
  const player = makePlayer('Enzo');
  applyDisciplineCard(player, { yellow: 1 }, { competitionKey: 'LEAGUE:D', round: 1 });
  applyDisciplineCard(
    player,
    { yellow: 0, dismissal: 'secondYellow' },
    { competitionKey: 'LEAGUE:D', round: 5 },
  );
  assertEq('1º amarelo da partida conta no acúmulo', getYellowAccumulation(player.discipline, 'LEAGUE:D'), 2);
  assertEq('vermelho por 2º amarelo = 1 jogo', activeSuspensions(player.discipline, 'LEAGUE:D')[0]?.gamesRemaining, 1);
  assertEq(
    'motivo second-yellow',
    activeSuspensions(player.discipline, 'LEAGUE:D')[0]?.reason,
    'second-yellow',
  );
}

console.log('\n=== 4) Vermelho direto por gravidade ===\n');
{
  assertEq('leve', directRedSuspensionGames({ threat: 0.5, type: 'falta', zone: 'meio' }), 1);
  assertEq(
    'grave',
    directRedSuspensionGames({ threat: 0.93, type: 'falta contra', zone: 'meio' }),
    2,
  );
  assertEq(
    'violenta',
    directRedSuspensionGames({ threat: 0.96, type: 'falta contra', zone: 'área' }),
    3,
  );
  const player = makePlayer('Rafa');
  applyDisciplineCard(
    player,
    { dismissal: 'direct-severe', redContext: { threat: 0.96, type: 'falta contra', zone: 'área' } },
    { competitionKey: 'LEAGUE:D', round: 6 },
  );
  assertEq('suspensão 3 jogos', suspensionGamesForCard({
    dismissal: 'direct-severe',
    redContext: { threat: 0.96, type: 'falta contra', zone: 'área' },
  }), 3);
  assertEq('gamesRemaining 3', activeSuspensions(player.discipline)[0]?.gamesRemaining, 3);
}

console.log('\n=== 5) Sanitize save legado (3+ amarelos sem suspensão) ===\n');
{
  const dirty = {
    name: 'Legado',
    discipline: {
      yellowByCompetition: { 'LEAGUE:D': 3 },
      suspensions: [],
      redCards: 0,
    },
  };
  dirty.discipline = normalizePlayerDiscipline(dirty.discipline);
  assertEq('sanitize zera amarelos', getYellowAccumulation(dirty.discipline, 'LEAGUE:D'), 0);
  assertEq('sanitize cria suspensão', activeSuspensions(dirty.discipline, 'LEAGUE:D').length, 1);
}

console.log('\n=== 6) Badges UI (pré-jogo / elenco) ===\n');
{
  const player = makePlayer('Hugo Mendes');
  player.discipline.yellowByCompetition = { 'LEAGUE:D': 2, COPA: 1 };

  const prep = playerStatusBadges(player, null, { allCompetitions: false });
  const prepYellows = countBadge(prep, 'player-badge-yellow');
  assertEq('pré-jogo: só competição do foco (liga 2)', prepYellows, 2);

  const squad = playerStatusBadges(player, null, { allCompetitions: true });
  const squadYellows = countBadge(squad, 'player-badge-yellow');
  assertEq('elenco: liga+copa separados (2+1)', squadYellows, 3);
  assertEq('elenco: 2 grupos', countBadge(squad, 'player-yellow-group'), 2);

  const withLive = playerStatusBadges(player, { yellow: 1 }, { allCompetitions: false });
  assertEq('ao vivo: temporada foco + 1 da partida', countBadge(withLive, 'player-badge-yellow'), 3);
  assertEq('ao vivo: 1 pip de partida', countBadge(withLive, 'player-badge-yellow-match'), 1);

  const threeStored = makePlayer('Bug');
  threeStored.discipline = normalizePlayerDiscipline({
    yellowByCompetition: { 'LEAGUE:D': 3 },
    suspensions: [],
    redCards: 0,
  });
  const afterSanitize = playerStatusBadges(threeStored, null, { allCompetitions: false });
  assertEq('nunca mostra 3 pips ativos (vira suspenso)', countBadge(afterSanitize, 'player-badge-yellow'), 0);
  assertEq('mostra badge suspenso', countBadge(afterSanitize, 'player-badge-suspended'), 1);

  // Cap visual: mesmo se dados sujos bypassarem sanitize no objeto cru
  const raw = {
    name: 'Raw',
    discipline: { yellowByCompetition: { 'LEAGUE:D': 5 }, suspensions: [], redCards: 0 },
  };
  const capped = playerStatusBadges(raw, null, { allCompetitions: false });
  const maxPips = YELLOW_SUSPENSION_LIMIT - 1;
  assertEq(`cap visual ≤ ${maxPips}`, clamp(countBadge(capped, 'player-badge-yellow'), 0, 99) <= maxPips, true);
}

console.log('\n=== 7) Monte Carlo: 200 temporadas sintéticas ===\n');
{
  let suspensions = 0;
  let maxStored = 0;
  let crossCompLeak = 0;
  for (let season = 0; season < 200; season++) {
    const player = makePlayer(`S${season}`);
    for (let round = 1; round <= 24; round++) {
      const key = Math.random() < 0.2 ? 'COPA' : 'LEAGUE:D';
      if (Math.random() < 0.18) {
        applyDisciplineCard(player, { yellow: 1 }, { competitionKey: key, round });
      }
      if (Math.random() < 0.01) {
        applyDisciplineCard(player, { dismissal: 'secondYellow' }, { competitionKey: key, round });
      }
      for (const comp of ['LEAGUE:D', 'COPA']) {
        const n = getYellowAccumulation(player.discipline, comp);
        if (n > maxStored) maxStored = n;
        if (n >= YELLOW_SUSPENSION_LIMIT) crossCompLeak += 1;
      }
    }
    suspensions += activeSuspensions(player.discipline).length;
  }
  assertEq('amarelos armazenados nunca ≥ limiar', maxStored < YELLOW_SUSPENSION_LIMIT, true);
  assertEq('sem vazamento ≥3 sem consumir', crossCompLeak, 0);
  if (suspensions > 0) ok(`suspensões geradas no MC (${suspensions})`);
  else fail('suspensões geradas no MC', 'zero suspensões em 200 temporadas');
}

console.log(`\n=== RESULTADO: ${passed} ok, ${failed} falhas ===\n`);
process.exit(failed ? 1 : 0);
