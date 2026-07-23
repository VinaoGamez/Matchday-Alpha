/**
 * Metadados e atributos de jogadores de seleção — Copa do Mundo.
 */

import { isoForNationality } from '../lab/card-nation-flags.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromPlayerId(id) {
  let h = 2166136261;
  for (const ch of String(id || 'nt')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function resolveRandom(player, random) {
  if (typeof random === 'function') return random;
  return mulberry32(seedFromPlayerId(player?.id));
}

function hasGeneratedStats(player) {
  if (!player) return false;
  if (player.pos === 'GOL') return Number(player.reflexes) > 0;
  return Number(player.speed) > 0 || Number(player.passing) > 0 || Number(player.dribble) > 0;
}

/** Idade plausível por posição / tier do elenco CMU. */
export function rollNationalTeamPlayerAge(player, random = Math.random) {
  const pos = player?.pos || 'MEI';
  const craque = !!player?.craque;
  const destaque = !!player?.destaque;
  let min = 20;
  let max = 30;
  if (pos === 'GOL') {
    min = 24;
    max = 36;
  } else if (pos === 'ZAG' || pos === 'LAT') {
    min = 22;
    max = 33;
  } else if (pos === 'VOL') {
    min = 21;
    max = 32;
  } else if (pos === 'ATA' || pos === 'PE' || pos === 'PD') {
    min = 19;
    max = 31;
  }
  if (craque) {
    min += 3;
    max += 5;
    max = Math.min(max, 39);
  } else if (destaque) {
    min = Math.max(min, 22);
    max = Math.min(max + 1, 33);
  }
  return min + Math.floor(random() * (max - min + 1));
}

/** Atributos completos a partir do OVR fixo — cards, simulação leve, scout. */
export function rollNationalTeamPlayerAttributes(player, random) {
  if (!player || hasGeneratedStats(player)) return player;

  const rng = resolveRandom(player, random);
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const role = player.pos || 'MEI';
  const overallBase = clamp(Number(player.overall) || Number(player.ovr) || 80, 60, 99);
  const craque = !!player.craque;
  const destaque = !!player.destaque;
  const tierBoost = craque ? 2 : destaque ? 1 : 0;
  const attacking = ['PE', 'PD', 'ATA', 'MEI', 'MC'].includes(role);
  const defensive = ['ZAG', 'LAT', 'VOL'].includes(role);
  const keeper = role === 'GOL';
  const attrFloor = Math.max(5, Math.round(overallBase * 0.55));
  const lineFloor = Math.max(5, Math.round(overallBase * 0.4));
  const value = (delta, spread = 5, floor = attrFloor) =>
    clamp(int(overallBase + delta + tierBoost - spread, overallBase + delta + tierBoost + spread), floor, 99);

  let attributes;
  if (keeper) {
    attributes = {
      reflexes: value(7, 4),
      positioning: value(5, 4),
      penaltySaving: value(3, 4),
      passing: value(-5, 4),
      speed: value(-6, 4),
      playmaking: value(-7, 4),
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
    const metaMin = Math.min(...metaKeys.map(k => attributes[k]));
    secondaryKeys.forEach(key => {
      attributes[key] = clamp(Math.min(attributes[key], metaMin - 2), attrFloor, metaMin - 1);
    });
    const signature = metaKeys[int(0, metaKeys.length - 1)];
    attributes[signature] = clamp(attributes[signature] + int(3, 6), attrFloor, 99);
  } else {
    attributes = {
      dribble: value(attacking ? 3 : -6),
      speed: value(['LAT', 'PE', 'PD', 'ATA'].includes(role) ? 6 : -3),
      marking: value(defensive ? 5 : -7),
      tackling: value(defensive ? 5 : -7),
      finishing: value(attacking ? 5 : -8),
      passing: value(['MC', 'MEI', 'VOL', 'LAT'].includes(role) ? 3 : -4),
      heading: value(['ZAG', 'ATA', 'VOL'].includes(role) ? 3 : -5),
      positioning: value(defensive ? 2 : attacking ? 4 : -2, 4),
      penaltySaving: 0,
      reflexes: 0,
      playmaking: value(['MC', 'MEI'].includes(role) ? 2 : role === 'VOL' ? -3 : -5),
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
    }[role] || ['passing', 'dribble', 'speed'];
    const signature = signatureOptions[int(0, signatureOptions.length - 1)];
    attributes[signature] = clamp(attributes[signature] + int(3, 6), attrFloor, 99);
  }

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
  const footDraw = rng();
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

  const playmaking = keeper
    ? clamp(attributes.playmaking, 5, 45)
    : clamp(
        attributes.playmaking ||
          (role === 'ZAG' ? Math.min(40, overallBase - 28) : role === 'VOL' ? overallBase - 4 : overallBase - 8),
        5,
        role === 'ZAG' ? 40 : 100,
      );

  return {
    ...player,
    overall: overallBase,
    potential: clamp(overallBase + int(0, craque ? 6 : destaque ? 4 : 2), overallBase, 99),
    height: int(hLo, hHi),
    preferredFoot,
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
    playmaking,
    freeKick: clamp(value(['LAT', 'VOL', 'MC', 'MEI', 'PE', 'PD'].includes(role) ? -6 : -10, 5), 5, 85),
    penaltyTaking: clamp(value(['MC', 'MEI', 'PE', 'PD', 'ATA'].includes(role) ? -3 : -8, 5), 5, 85),
    fatigue: player.fatigue ?? 100,
  };
}

/** Aplica nacionalidade da seleção, ISO, idade e atributos ausentes. */
export function enrichNationalTeamPlayer(player, meta, { random } = {}) {
  if (!player || !meta?.name) return player;
  const rng = resolveRandom(player, random);
  const nationality = player.nationality || meta.name;
  const nationalityIso =
    player.nationalityIso || meta.iso || isoForNationality(nationality) || undefined;
  const age =
    Number(player.age) > 0 ? Number(player.age) : rollNationalTeamPlayerAge(player, rng);
  const enriched = {
    ...player,
    nationality,
    nationalityIso,
    age,
    overall: Number(player.overall) || Number(player.ovr) || 80,
    craque: !!player.craque,
    destaque: !!player.destaque,
  };
  return rollNationalTeamPlayerAttributes(enriched, rng);
}
