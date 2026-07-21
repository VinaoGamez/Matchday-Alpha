/**
 * Geração de jogadores — modelo Campanha Longa (validado).
 * Plantel genérico 25; OVR baixo por divisão; GOL com attrs de meta.
 */
import { rollSquadAge, rollPotential, POT_CAPS } from './player-development.js';

export const GENERIC_SQUAD_ROLES = [
  'GOL', 'GOL', 'GOL',
  'ZAG', 'ZAG', 'ZAG', 'ZAG',
  'LAT', 'LAT', 'LAT', 'LAT',
  'VOL', 'VOL', 'VOL',
  'MC', 'MC', 'MC',
  'MEI', 'MEI',
  'PE', 'PE',
  'PD', 'PD',
  'ATA', 'ATA', 'ATA',
];

/** Power do clube na geração. */
export const DIVISION_CLUB_POWER = {
  A: [52, 62],
  B: [40, 50],
  C: [28, 38],
  D: [12, 18],
};

/** Clamp de OVR do jogador na geração. */
export const DIVISION_OVR_LIMITS = {
  A: [42, 70],
  B: [32, 58],
  C: [22, 42],
  D: [10, 19],
};

/** Caps de POT — reexport da fonte em player-development. */
export const GENERATION_POT_CAPS = POT_CAPS;

/**
 * Especialista de falta/pênalti (legado: chance por divisão, valor sempre 86–97).
 * Campanha Longa: valor = OVR + bônus, com teto por série.
 */
export const SPECIALIST_CHANCE = {
  A: { freeKick: 0.024, penalty: 0.03 },
  B: { freeKick: 0.017, penalty: 0.022 },
  C: { freeKick: 0.0085, penalty: 0.0115 },
  D: { freeKick: 0.003, penalty: 0.005 },
};

/** Bônus sobre OVR e teto absoluto — D ~28–34 tipicamente, não 96. */
export const SPECIALIST_ROLL = {
  A: { bonus: [16, 24], cap: 90 },
  B: { bonus: [14, 20], cap: 78 },
  C: { bonus: [12, 18], cap: 58 },
  D: { bonus: [10, 16], cap: 36 },
};

const SET_PIECE_ROLES = ['MC', 'MEI', 'PE', 'PD', 'ATA'];

export function rollSpecialistAttr(overall, division = 'A', random = Math.random) {
  const ovr = Math.round(Number(overall) || 50);
  const roll = SPECIALIST_ROLL[division] || SPECIALIST_ROLL.D;
  const [bLo, bHi] = roll.bonus;
  const raw = ovr + int(random, bLo, bHi);
  return clamp(raw, ovr + 8, roll.cap);
}

export function applySetPieceSpecialists(player, division = 'A', random = Math.random) {
  if (!player || !SET_PIECE_ROLES.includes(player.pos)) return player;
  const chance = SPECIALIST_CHANCE[division] || SPECIALIST_CHANCE.D;
  let freeKickSpec = false;
  let penaltySpec = false;
  if (random() < chance.freeKick) {
    player.freeKick = Math.max(Number(player.freeKick) || 0, rollSpecialistAttr(player.overall, division, random));
    freeKickSpec = true;
  }
  if (random() < chance.penalty) {
    player.penaltyTaking = Math.max(
      Number(player.penaltyTaking) || 0,
      rollSpecialistAttr(player.overall, division, random),
    );
    penaltySpec = true;
  }
  if (freeKickSpec && penaltySpec) player.setPieceSpecialist = 'both';
  else if (freeKickSpec) player.setPieceSpecialist = 'freeKick';
  else if (penaltySpec) player.setPieceSpecialist = 'penalty';
  return player;
}

/** Especialista de bola parada (flag na geração). */
export function isSetPieceSpecialist(player) {
  const flag = player?.setPieceSpecialist;
  return flag === 'freeKick' || flag === 'penalty' || flag === 'both' || flag === true;
}

export function isFreeKickSpecialist(player) {
  const flag = player?.setPieceSpecialist;
  return flag === 'freeKick' || flag === 'both' || flag === true || Number(player?.freeKick) > 85;
}

export function isPenaltySpecialist(player) {
  const flag = player?.setPieceSpecialist;
  return flag === 'penalty' || flag === 'both' || flag === true || Number(player?.penaltyTaking) > 85;
}

export function setPieceSpecialistTitle(player) {
  const flag = player?.setPieceSpecialist;
  if (flag === 'both') return 'Especialista em faltas e pênaltis';
  if (flag === 'penalty') return 'Especialista em pênaltis';
  if (flag === 'freeKick' || flag === true) return 'Especialista em faltas';
  return 'Especialista em bola parada';
}

/**
 * Corrige saves antigos (FALTA/PÊNALTI 86–97) para o teto Campanha Longa por série.
 * Determinístico — não re-rola a cada boot.
 * @returns {boolean} true se alterou o jogador
 */
export function sanitizeSetPieceForDivision(player, division = 'D') {
  if (!player || typeof player !== 'object') return false;
  const div = SPECIALIST_ROLL[division] ? division : 'D';
  const { bonus, cap } = SPECIALIST_ROLL[div];
  const [bLo, bHi] = bonus;
  const ovr = Math.round(Number(player.overall) || 50);
  const flag = player.setPieceSpecialist;
  const fkWas =
    flag === 'freeKick' || flag === 'both' || flag === true || Number(player.freeKick) >= 80;
  const penWas =
    flag === 'penalty' || flag === 'both' || flag === true || Number(player.penaltyTaking) >= 80;

  const remap = (raw, wasSpec) => {
    const v = Math.round(Number(raw) || 0);
    if (v <= cap) return v;
    if (wasSpec || v >= 80) {
      const t = v >= 86 ? clamp((v - 86) / 11, 0, 1) : 0.55;
      return clamp(Math.round(ovr + bLo + t * (bHi - bLo)), ovr + 8, cap);
    }
    return Math.min(v, Math.min(cap, Math.max(5, ovr + 5)));
  };

  const nextFk = remap(player.freeKick, fkWas);
  const nextPen = remap(player.penaltyTaking, penWas);
  let nextFlag = flag;
  if (fkWas && penWas) nextFlag = 'both';
  else if (fkWas) nextFlag = 'freeKick';
  else if (penWas) nextFlag = 'penalty';

  let changed = false;
  if (nextFk !== Math.round(Number(player.freeKick) || 0)) {
    player.freeKick = nextFk;
    changed = true;
  }
  if (nextPen !== Math.round(Number(player.penaltyTaking) || 0)) {
    player.penaltyTaking = nextPen;
    changed = true;
  }
  if (nextFlag && nextFlag !== flag) {
    player.setPieceSpecialist = nextFlag;
    changed = true;
  }
  return changed;
}

export const PEAK_PLATEAU = {
  PE: { peakStart: 26, plateau: [4, 8] },
  PD: { peakStart: 26, plateau: [4, 8] },
  LAT: { peakStart: 26, plateau: [4, 8] },
  MC: { peakStart: 27, plateau: [4, 7] },
  MEI: { peakStart: 27, plateau: [4, 7] },
  ATA: { peakStart: 27, plateau: [4, 7] },
  VOL: { peakStart: 27, plateau: [4, 7] },
  ZAG: { peakStart: 28, plateau: [4, 7] },
  GOL: { peakStart: 29, plateau: [5, 7] },
};

const ATTR_KEYS = [
  'dribble', 'speed', 'marking', 'tackling', 'finishing', 'passing', 'heading',
  'positioning', 'penaltySaving', 'reflexes', 'freeKick', 'penaltyTaking', 'playmaking',
];

const OUTFIELD_TRAIT_POOL = [
  ['Fin', 'finishing'],
  ['Pas', 'passing'],
  ['Vel', 'speed'],
  ['Mar', 'marking'],
  ['Des', 'tackling'],
  ['Dri', 'dribble'],
  ['Cab', 'heading'],
  ['Arm', 'playmaking'],
];

const KEEPER_TRAIT_POOL = [
  ['Ref', 'reflexes'],
  ['Pos', 'positioning'],
  ['Def', 'penaltySaving'],
  ['Pas', 'passing'],
  ['Vel', 'speed'],
  ['Arm', 'playmaking'],
];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const int = (random, lo, hi) =>
  lo + Math.floor(random() * (hi - lo + 1));

const rnd = (random, lo, hi) => lo + random() * (hi - lo);

export function traitCodes(player) {
  const pool = player?.pos === 'GOL' ? KEEPER_TRAIT_POOL : OUTFIELD_TRAIT_POOL;
  const scores = pool.map(([code, key]) => [code, Number(player?.[key]) || 0]);
  scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!scores.length) return '—';
  return `${scores[0][0]}/${scores[1]?.[0] || scores[0][0]}`;
}

export function topAttributeKeys(player, count = 3) {
  const pool = player?.pos === 'GOL' ? KEEPER_TRAIT_POOL : OUTFIELD_TRAIT_POOL;
  return [...pool]
    .map(([, key]) => [key, Number(player?.[key]) || 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => key);
}

const generatedOverall = (role, a) => {
  const weighted = {
    GOL:
      a.positioning * 0.32 +
      a.reflexes * 0.36 +
      a.penaltySaving * 0.18 +
      a.passing * 0.06 +
      a.speed * 0.04 +
      a.playmaking * 0.04,
    ZAG:
      a.marking * 0.25 +
      a.tackling * 0.25 +
      a.heading * 0.18 +
      a.speed * 0.1 +
      a.passing * 0.09 +
      a.dribble * 0.04 +
      a.overallBase * 0.09,
    LAT:
      a.speed * 0.22 +
      a.marking * 0.17 +
      a.tackling * 0.17 +
      a.passing * 0.14 +
      a.dribble * 0.13 +
      a.heading * 0.05 +
      a.finishing * 0.04 +
      a.overallBase * 0.08,
    VOL:
      a.tackling * 0.2 +
      a.marking * 0.18 +
      a.passing * 0.18 +
      a.heading * 0.11 +
      a.speed * 0.08 +
      a.dribble * 0.07 +
      a.finishing * 0.05 +
      a.overallBase * 0.13,
    MC:
      a.passing * 0.24 +
      a.dribble * 0.15 +
      a.tackling * 0.12 +
      a.finishing * 0.11 +
      a.speed * 0.1 +
      a.marking * 0.08 +
      a.heading * 0.05 +
      a.overallBase * 0.15,
    MEI:
      a.passing * 0.23 +
      a.dribble * 0.22 +
      a.finishing * 0.16 +
      a.speed * 0.12 +
      a.heading * 0.05 +
      a.marking * 0.03 +
      a.tackling * 0.03 +
      a.overallBase * 0.16,
    PE:
      a.dribble * 0.23 +
      a.speed * 0.22 +
      a.finishing * 0.2 +
      a.passing * 0.13 +
      a.heading * 0.05 +
      a.marking * 0.03 +
      a.tackling * 0.02 +
      a.overallBase * 0.12,
    PD:
      a.dribble * 0.23 +
      a.speed * 0.22 +
      a.finishing * 0.2 +
      a.passing * 0.13 +
      a.heading * 0.05 +
      a.marking * 0.03 +
      a.tackling * 0.02 +
      a.overallBase * 0.12,
    ATA:
      a.finishing * 0.29 +
      a.heading * 0.18 +
      a.speed * 0.16 +
      a.dribble * 0.14 +
      a.passing * 0.07 +
      a.marking * 0.02 +
      a.tackling * 0.02 +
      a.overallBase * 0.12,
  };
  return Math.round(weighted[role] ?? a.overallBase);
};

/**
 * Δ OVR máx. por temporada (modelo auge 27–29 / GOL 29–32).
 * Usado em sims de carreira e, depois, no development.
 */
export function maxSeasonDeltaForAge(age, pos = 'MC') {
  const a = Number(age) || 25;
  const peak = PEAK_PLATEAU[pos] || PEAK_PLATEAU.MC;
  const peakStart = peak.peakStart;
  const plateauYears = peak.plateau[0]; // piso da faixa para o teto de Δ
  const peakEnd = peakStart + plateauYears - 1;

  if (pos === 'GOL') {
    if (a <= 23) return 3;
    if (a <= 27) return 2;
    if (a <= 28) return 1;
    if (a <= peakEnd) return 1;
    if (a <= 34) return 0;
    return -1;
  }
  // B leve: +3 até 22 (antes 21) — jóias fecham o gap até ~90 em 8–10 anos.
  if (a <= 22) return 3;
  if (a <= 25) return 2;
  if (a <= 26) return 1;
  if (a <= peakEnd) return 1;
  if (a <= 32) return 0;
  if (a <= 34) return -1;
  return -2;
}

/**
 * Simula crescimento bruto ano a ano até maxYears (sem minutos/rating).
 */
export function projectCareerOvr(player, maxYears = 10) {
  let ovr = Number(player.overall) || 50;
  const pot = Number(player.potential) || ovr;
  const pos = player.pos || 'MC';
  let age = Number(player.age) || 20;
  const path = [{ year: 0, age, ovr }];
  for (let y = 1; y <= maxYears; y += 1) {
    const delta = maxSeasonDeltaForAge(age, pos);
    if (delta > 0) ovr = Math.min(pot, ovr + delta);
    else if (delta < 0) ovr = Math.max(1, ovr + delta);
    age += 1;
    path.push({ year: y, age, ovr });
  }
  return path;
}

/**
 * @param {object} opts
 * @param {string} opts.role
 * @param {number} opts.index
 * @param {number} opts.clubPower
 * @param {string} [opts.division]
 * @param {() => number} [opts.random]
 * @param {string[]} [opts.firstNames]
 * @param {string[]} [opts.lastNames]
 */
export function generatePlayer({
  role,
  index = 0,
  clubPower,
  division = 'A',
  random = Math.random,
  firstNames = ['João', 'Pedro', 'Lucas', 'Gabriel', 'Rafael'],
  lastNames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima'],
  starterBoost = true,
} = {}) {
  const limits = DIVISION_OVR_LIMITS[division] || DIVISION_OVR_LIMITS.D;
  const age = rollSquadAge(random);
  // Campanha Longa: jovem menos penalizado p/ jóias A chegarem ~90 em 7–10 anos.
  const ageModifier =
    age <= 19 ? -2 : age <= 21 ? -1 : age <= 26 ? 1 : age <= 29 ? 2 : age <= 32 ? 0 : age <= 34 ? -2 : -5;
  const slotBoost = starterBoost ? 1 : -3;
  const overallBase = clamp(
    int(random, clubPower - 6, clubPower + 6) + ageModifier + slotBoost,
    limits[0],
    limits[1],
  );
  const attacking = ['PE', 'PD', 'ATA', 'MEI', 'MC'].includes(role);
  const defensive = ['ZAG', 'LAT', 'VOL'].includes(role);
  const keeper = role === 'GOL';
  // Piso proporcional ao OVR — em Série D evita chuva de "1" nos secundários.
  const attrFloor = Math.max(5, Math.round(overallBase * 0.55));
  const lineFloor = Math.max(5, Math.round(overallBase * 0.4));
  /** delta relativo ao overallBase; gap fraco máx. ~8 (antes −15…−45 → clamp 1). */
  const value = (delta, spread = 5, floor = attrFloor) =>
    clamp(int(random, overallBase + delta - spread, overallBase + delta + spread), floor, 99);

  const first = firstNames[(index + int(random, 0, firstNames.length - 1)) % firstNames.length];
  const last = lastNames[(index * 3 + int(random, 0, lastNames.length - 1)) % lastNames.length];
  const secondLast =
    random() < 0.16
      ? ` ${lastNames[(index * 7 + int(random, 0, lastNames.length - 1)) % lastNames.length]}`
      : '';

  let attributes;
  if (keeper) {
    attributes = {
      overallBase,
      reflexes: value(7, 4),
      positioning: value(5, 4),
      penaltySaving: value(3, 4),
      passing: value(-5, 4),
      speed: value(-6, 4),
      playmaking: value(-7, 4),
      // Linha fraca, mas legível (não 1).
      dribble: value(-10, 3, lineFloor),
      marking: value(-10, 3, lineFloor),
      tackling: value(-10, 3, lineFloor),
      finishing: value(-11, 3, lineFloor),
      heading: value(-8, 3, lineFloor),
    };
    const metaKeys = ['reflexes', 'positioning', 'penaltySaving'];
    const secondaryKeys = ['passing', 'speed', 'playmaking'];
    metaKeys.forEach(key => {
      attributes[key] = Math.max(attributes[key], overallBase + 2);
    });
    // Secundários abaixo da meta, mas acima do piso natural.
    const metaMin = Math.min(...metaKeys.map(k => attributes[k]));
    secondaryKeys.forEach(key => {
      attributes[key] = clamp(Math.min(attributes[key], metaMin - 2), attrFloor, metaMin - 1);
    });
    const signature = metaKeys[int(random, 0, metaKeys.length - 1)];
    attributes[signature] = clamp(attributes[signature] + int(random, 3, 6), attrFloor, 99);
  } else {
    attributes = {
      overallBase,
      dribble: value(attacking ? 3 : -6),
      speed: value(['LAT', 'PE', 'PD', 'ATA'].includes(role) ? 6 : -3),
      marking: value(defensive ? 5 : -7),
      tackling: value(defensive ? 5 : -7),
      finishing: value(attacking ? 5 : -8),
      passing: value(['MC', 'MEI', 'VOL', 'LAT'].includes(role) ? 3 : -4),
      heading: value(['ZAG', 'ATA', 'VOL'].includes(role) ? 3 : -5),
      positioning: 0,
      penaltySaving: 0,
      reflexes: 0,
      playmaking: value(
        ['MC', 'MEI'].includes(role) ? 2 : role === 'VOL' ? -3 : -5,
      ),
    };
    const signatureOptions = {
      ZAG: ['marking', 'tackling', 'heading'],
      LAT: ['speed', 'tackling', 'passing', 'dribble'],
      VOL: ['tackling', 'marking', 'passing'],
      MC: ['passing', 'dribble', 'tackling', 'finishing'],
      MEI: ['passing', 'dribble', 'finishing'],
      PE: ['speed', 'dribble', 'finishing'],
      PD: ['speed', 'dribble', 'finishing'],
      ATA: ['finishing', 'heading', 'speed'],
    }[role];
    const signature = signatureOptions[int(random, 0, signatureOptions.length - 1)];
    attributes[signature] = clamp(attributes[signature] + int(random, 3, 6), attrFloor, 99);
  }

  let overall = clamp(generatedOverall(role, attributes), limits[0], limits[1]);
  let potential = rollPotential(overall, age, division, random);
  const potCap = GENERATION_POT_CAPS[division] || 90;
  potential = clamp(potential, overall, potCap);

  // C — jóia rara (≤19, POT perto do cap): OVR inicial mais alto p/ poder chegar a 90.
  if (age <= 19 && potential >= potCap - 4 && random() < 0.32) {
    const floor = age <= 18 ? 65 : 67;
    const bumped = Math.max(overall, int(random, floor, Math.min(limits[1], floor + 2)));
    overall = clamp(bumped, limits[0], limits[1]);
    potential = clamp(Math.max(potential, overall), overall, potCap);
  }

  const peak = PEAK_PLATEAU[role] || PEAK_PLATEAU.MC;
  const plateauYears = int(random, peak.plateau[0], peak.plateau[1]);

  const heightRanges = {
    GOL: [184, 199],
    ZAG: [180, 196],
    LAT: [168, 187],
    VOL: [174, 191],
    MC: [168, 188],
    MEI: [165, 185],
    PE: [164, 184],
    PD: [164, 184],
    ATA: [174, 194],
  };
  const [hLo, hHi] = heightRanges[role] || [170, 185];
  const height = int(random, hLo, hHi);
  const footDraw = random();
  const preferredFoot =
    footDraw < 0.055
      ? 'Ambidestro'
      : role === 'PE'
        ? footDraw < 0.62
          ? 'Esquerdo'
          : 'Direito'
        : role === 'PD'
          ? footDraw < 0.18
            ? 'Esquerdo'
            : 'Direito'
          : footDraw < 0.18
            ? 'Esquerdo'
            : 'Direito';
  const personalities = [
    'Disciplinado',
    'Determinado',
    'Equilibrado',
    'Líder',
    'Competitivo',
    'Tranquilo',
  ];

  const playmaking = keeper
    ? clamp(attributes.playmaking, 5, 45)
    : clamp(
        attributes.playmaking ||
          (role === 'ZAG' ? Math.min(40, overall - 28) : role === 'VOL' ? overall - 4 : overall - 8),
        5,
        role === 'ZAG' ? 40 : 100,
      );

  const player = {
    name: `${first} ${last}${secondLast}`,
    pos: role,
    age,
    overall,
    potential,
    height,
    preferredFoot,
    personality: personalities[int(random, 0, personalities.length - 1)],
    injuryProneness: clamp(int(random, 5, 25) + (age >= 31 ? int(random, 3, 10) : 0), 5, 38),
    injuryHistory: [],
    workload: {
      minutesLast7Days: 0,
      minutesLast14Days: 0,
      matchesLast14Days: 0,
      consecutiveStarts: 0,
      highIntensityLoad: 0,
      lastMatchRound: 0,
    },
    dribble: attributes.dribble,
    speed: attributes.speed,
    marking: attributes.marking,
    tackling: attributes.tackling,
    finishing: attributes.finishing,
    passing: attributes.passing,
    heading: attributes.heading,
    positioning: attributes.positioning,
    penaltySaving: attributes.penaltySaving,
    reflexes: attributes.reflexes,
    freeKick: Math.min(
      85,
      value(['MC', 'MEI', 'PE', 'PD'].includes(role) ? -6 : -10, 5),
    ),
    penaltyTaking: Math.min(
      85,
      value(['MC', 'MEI', 'PE', 'PD', 'ATA'].includes(role) ? -3 : -8, 5),
    ),
    playmaking,
    fatigue: 100,
    number: 0,
    peakStart: peak.peakStart,
    plateauYears,
  };
  return applySetPieceSpecialists(player, division, random);
}

/** Marca 11 slots aleatórios do plantel como titulares (+1 vs −3). */
export function pickStarterFlags(size, random = Math.random) {
  const flags = Array.from({ length: size }, () => false);
  const order = Array.from({ length: size }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.slice(0, Math.min(11, size)).forEach(i => {
    flags[i] = true;
  });
  return flags;
}

/**
 * Gera elenco genérico de 25 para uma divisão.
 */
export function generateSquad({
  division = 'A',
  clubPower = null,
  random = Math.random,
  firstNames,
  lastNames,
} = {}) {
  const [pLo, pHi] = DIVISION_CLUB_POWER[division] || DIVISION_CLUB_POWER.D;
  const power = clubPower != null ? clubPower : int(random, pLo, pHi);
  const roles = [...GENERIC_SQUAD_ROLES];
  const starterFlags = pickStarterFlags(roles.length, random);
  const roster = roles.map((role, playerIndex) =>
    generatePlayer({
      role,
      index: playerIndex,
      clubPower: power,
      division,
      random,
      firstNames,
      lastNames,
      starterBoost: starterFlags[playerIndex],
    }),
  );
  const byOvr = [...roster].sort((a, b) => b.overall - a.overall);
  const starterSet = new Set(byOvr.slice(0, 11));
  roster.forEach(player => {
    player._isLogicalStarter = starterSet.has(player);
  });
  return { power, roster, division };
}

export { ATTR_KEYS, OUTFIELD_TRAIT_POOL, KEEPER_TRAIT_POOL };
