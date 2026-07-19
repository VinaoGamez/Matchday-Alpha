/**
 * Ficha por jogador + nota estilo Brasfoot (1.0–10.0, passo 0.5).
 * Passes são estimados (rateio do total do time) — o sim não rastreia por jogador.
 */

const ROLE_PASS_WEIGHT = {
  GOL: 0.55,
  ZAG: 0.85,
  LAT: 1.05,
  VOL: 1.15,
  MEI: 1.25,
  ATA: 0.95,
  CA: 0.9,
};

const normalizeRole = player => {
  const raw = String(player?.pos || player?.role || '').toUpperCase();
  if (raw === 'GOL' || raw.startsWith('G')) return 'GOL';
  if (raw.includes('ZAG') || raw === 'Z') return 'ZAG';
  if (raw.includes('LAT') || raw === 'L' || raw === 'LE' || raw === 'LD') return 'LAT';
  if (raw.includes('VOL') || raw === 'VOL') return 'VOL';
  if (raw.includes('MEI') || raw === 'M' || raw === 'MC' || raw === 'MD' || raw === 'ME') return 'MEI';
  if (raw.includes('ATA') || raw === 'A' || raw === 'SA' || raw === 'PE' || raw === 'PD') return 'ATA';
  return 'MEI';
};

export function slugPlayerName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'player';
}

/**
 * Chave estável: preferência `playerId`; fallback legado slug(nome)#idade.
 */
export function playerKey(playerOrName, age = null) {
  if (playerOrName && typeof playerOrName === 'object') {
    if (playerOrName.playerId) return String(playerOrName.playerId);
    return `${slugPlayerName(playerOrName.name)}#${Number(playerOrName.age) || 0}`;
  }
  return `${slugPlayerName(playerOrName)}#${Number(age) || 0}`;
}

const roundHalf = value => Math.round(Number(value) * 2) / 2;

export function clampMatchRating(value) {
  return Math.max(1, Math.min(10, roundHalf(value)));
}

function sideResultDelta(homeGoals, awayGoals, side) {
  const hg = Number(homeGoals) || 0;
  const ag = Number(awayGoals) || 0;
  const won = side === 'home' ? hg > ag : ag > hg;
  const drew = hg === ag;
  if (won) return 0.4;
  if (drew) return 0.15;
  return -0.35;
}

function countByName(list, field = 'name') {
  const map = new Map();
  (list || []).forEach(item => {
    const name = item?.[field];
    if (!name) return;
    map.set(name, (map.get(name) || 0) + 1);
  });
  return map;
}

function assistsByName(goals) {
  const map = new Map();
  (goals || []).forEach(goal => {
    if (!goal?.assist || goal.type === 'own') return;
    map.set(goal.assist, (map.get(goal.assist) || 0) + 1);
  });
  return map;
}

function goalsForPlayer(goals, playerName) {
  return (goals || []).filter(goal => goal?.name === playerName && goal.type !== 'own').length;
}

/**
 * Gol contra é gravado no array do time que se beneficia.
 * Para a ficha do jogador, contar só no lado adversário (quem sofreu/desviou).
 */
function ownGoalsForPlayer(opponentGoals, playerName) {
  return (opponentGoals || []).filter(goal => goal?.name === playerName && goal.type === 'own').length;
}

/**
 * Distribui passes do time por minutos × peso de posição.
 */
export function estimatePlayerPasses(workloadSide, rosterByName, teamPasses) {
  const total = Math.max(0, Number(teamPasses) || 0);
  const entries = (workloadSide || []).filter(entry => (Number(entry.minutes) || 0) > 0);
  if (!entries.length || total <= 0) {
    return new Map(entries.map(entry => [entry.name, 0]));
  }
  let weightSum = 0;
  const weights = entries.map(entry => {
    const player = rosterByName.get(entry.name);
    const role = normalizeRole(player);
    const w = (Number(entry.minutes) || 0) * (ROLE_PASS_WEIGHT[role] || 1);
    weightSum += w;
    return { name: entry.name, w };
  });
  const out = new Map();
  weights.forEach(({ name, w }) => {
    out.set(name, weightSum > 0 ? Math.round((total * w) / weightSum) : 0);
  });
  return out;
}

/**
 * Nota individual a partir da ficha parcial.
 */
export function computeMatchRating(sheet, ctx = {}) {
  const minutes = Math.max(0, Number(sheet.minutes) || 0);
  if (minutes <= 0) return null;

  const role = sheet.role || 'MEI';
  const minuteFactor = Math.min(1, minutes / 90);
  let rating = 6.0;

  rating += (Number(ctx.resultDelta) || 0) * (0.55 + 0.45 * minuteFactor);

  const goals = Number(sheet.goals) || 0;
  const assists = Number(sheet.assists) || 0;
  const ownGoals = Number(sheet.ownGoals) || 0;
  const goalWeight = role === 'GOL' || role === 'ZAG' ? 1.1 : role === 'ATA' ? 0.75 : 0.85;
  const assistWeight = role === 'MEI' || role === 'VOL' ? 0.55 : 0.45;
  rating += goals * goalWeight;
  rating += assists * assistWeight;
  rating -= ownGoals * 0.8;

  if (sheet.yellow) rating -= 0.3;
  if (sheet.red) rating -= 1.5;

  if (sheet.started) rating += 0.1;
  else rating -= 0.15 * (1 - minuteFactor);

  if (role === 'GOL') {
    const saves = Number(ctx.keeperSavesShare) || 0;
    rating += Math.min(1.2, saves * 0.12);
    const goalsAgainst = Number(ctx.goalsAgainst) || 0;
    rating -= Math.min(1.2, goalsAgainst * 0.25);
  }

  // Participação em posse/passes (estimado)
  const passes = Number(sheet.passesEst) || 0;
  if (passes >= 40) rating += 0.3;
  else if (passes >= 25) rating += 0.15;
  else if (minutes >= 60 && passes < 10 && role !== 'GOL') rating -= 0.15;

  return clampMatchRating(rating);
}

/**
 * Monta fichas dos dois lados a partir do objeto de jogo completo (sim ou live).
 * @param {object} game
 * @param {{ getClub?: (name:string)=>object|null }} [deps]
 */
export function buildMatchPlayerSheets(game, deps = {}) {
  if (!game?.home || !game?.away) return { home: [], away: [], meta: null };

  const getClub = typeof deps.getClub === 'function' ? deps.getClub : () => null;
  const sides = ['home', 'away'];
  const sheets = { home: [], away: [] };

  sides.forEach(side => {
    const clubName = game[side];
    const club = getClub(clubName);
    const rosterByName = new Map((club?.roster || []).map(player => [player.name, player]));
    const workload = game.workload?.[side] || [];
    const discipline = game.discipline?.[side] || [];
    const sideGoals = game.goals?.[side] || [];
    const oppSide = side === 'home' ? 'away' : 'home';
    const oppGoals = Number(side === 'home' ? game.awayGoals : game.homeGoals) || 0;
    const teamPasses =
      Number(game.data?.[side === 'home' ? 'homePasses' : 'awayPasses']) ||
      Number(game.data?.[`${side}Passes`]) ||
      0;
    const keeperSaves =
      Number(game.data?.[side === 'home' ? 'homeKeeperSaves' : 'awayKeeperSaves']) ||
      Number(game.data?.[side === 'home' ? 'homeSaved' : 'awaySaved']) ||
      0;

    const assistMap = assistsByName(sideGoals);
    const cardByName = new Map();
    discipline.forEach(entry => {
      cardByName.set(entry.name, {
        yellow: !!entry.yellow && !entry.dismissal,
        red: !!entry.dismissal || Number(entry.red) > 0,
      });
    });

    const passMap = estimatePlayerPasses(workload, rosterByName, teamPasses);
    const resultDelta = sideResultDelta(game.homeGoals, game.awayGoals, side);
    const gkNames = workload.filter(entry => normalizeRole(rosterByName.get(entry.name)) === 'GOL');
    const gkShare = gkNames.length ? keeperSaves / gkNames.length : 0;

    // Se não houver workload, sintetiza a partir de gols/cartões (fallback frágil).
    // Ignora type:'own' — o nome no gol contra é do adversário, não deste lado.
    let entries = workload.filter(entry => (Number(entry.minutes) || 0) > 0);
    if (!entries.length) {
      const names = new Set([
        ...sideGoals.filter(goal => goal?.type !== 'own').map(goal => goal.name).filter(Boolean),
        ...discipline.map(entry => entry.name).filter(Boolean),
        ...(club?.roster || []).slice(0, 11).map(player => player.name),
      ]);
      entries = [...names].map(name => ({
        name,
        minutes: 90,
        started: true,
      }));
    }

    const opponentGoalList = game.goals?.[oppSide] || [];

    sheets[side] = entries.map(entry => {
      const player = rosterByName.get(entry.name) || { name: entry.name, pos: 'MEI', age: 0 };
      const role = normalizeRole(player);
      const cards = cardByName.get(entry.name) || { yellow: false, red: false };
      const sheet = {
        key: playerKey(player),
        name: entry.name,
        club: clubName,
        side,
        role,
        pos: player.pos || role,
        age: Number(player.age) || 0,
        minutes: Math.round(Number(entry.minutes) || 0),
        started: !!entry.started,
        goals: goalsForPlayer(sideGoals, entry.name),
        ownGoals: ownGoalsForPlayer(opponentGoalList, entry.name),
        assists: assistMap.get(entry.name) || 0,
        yellow: cards.yellow,
        red: cards.red,
        passesEst: passMap.get(entry.name) || 0,
      };
      sheet.rating = computeMatchRating(sheet, {
        resultDelta,
        keeperSavesShare: role === 'GOL' ? gkShare : 0,
        goalsAgainst: role === 'GOL' ? oppGoals : 0,
      });
      return sheet;
    });
  });

  return {
    home: sheets.home,
    away: sheets.away,
    meta: {
      home: game.home,
      away: game.away,
      homeGoals: Number(game.homeGoals) || 0,
      awayGoals: Number(game.awayGoals) || 0,
    },
  };
}

export function formatMatchRating(rating) {
  if (rating == null || !Number.isFinite(Number(rating))) return '—';
  return Number(rating).toFixed(1);
}
