/**
 * Gera data/world-cup-2026-squads.json — 48 seleções × 26 jogadores.
 * Uso: node scripts/generate-world-cup-squads.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NATIONAL_TEAMS, nationalTeamPower } from '../js/engine/national-teams.js';
import { rollPlayerName, dedupeRosterNames } from '../js/engine/player-names.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'public', 'data', 'world-cup-2026-squads.json');

/** Eco-nomes craque (24) — chave = código seleção. */
const CRAQUE_ROSTER = {
  ARG: [{ name: 'Leonel Messi', pos: 'ATA' }, { name: 'Enzo Fernandes', pos: 'MEI' }],
  POR: [{ name: 'Cristovão Rinaldo', pos: 'ATA' }, { name: 'Bernardo Sylva', pos: 'MEI' }],
  FRA: [
    { name: 'Kylian Mbappo', pos: 'ATA' },
    { name: 'Michel Olisse', pos: 'PE' },
    { name: 'Osmar Dembélé', pos: 'PD' },
  ],
  NOR: [{ name: 'Erling Ralland', pos: 'ATA' }],
  BRA: [{ name: 'Neimar', pos: 'ATA' }, { name: 'Vinicius Júnior', pos: 'PE' }],
  CRO: [{ name: 'Luca Modritch', pos: 'MEI' }],
  ENG: [{ name: 'Harry Kaine', pos: 'ATA' }, { name: 'Jude Bellinga', pos: 'MEI' }],
  BEL: [{ name: 'Kevin de Bruno', pos: 'MEI' }],
  EGY: [{ name: 'Mohamed Sala', pos: 'PE' }],
  KOR: [{ name: 'Sun Heung-min', pos: 'PE' }],
  ESP: [
    { name: 'Rodrygo Hernández', pos: 'VOL' },
    { name: 'Lamin Yamal', pos: 'PD' },
  ],
  GER: [{ name: 'Florian Virtz', pos: 'MEI' }],
  NED: [{ name: 'Virgil Van Dyk', pos: 'ZAG' }],
  COL: [{ name: 'Luz Dias', pos: 'PE' }],
  URU: [{ name: 'Frederico Valverde', pos: 'MEI' }],
  SEN: [{ name: 'Sódio Mané', pos: 'PE' }],
  MAR: [{ name: 'Assaf Hakimi', pos: 'LAT' }],
};

/** Destaques prata — array de nomes fixos ou contagem numérica. */
const DESTAQUE_NAMES = {
  BRA: ['Rafinha', 'Marquinhos'],
  RSA: 2,
  GER: 2,
  KSA: 2,
  ALG: 2,
  ARG: 2,
  AUS: 1,
  AUT: 2,
  BEL: 2,
  BIH: 2,
  CPV: 2,
  CAN: 2,
  QAT: 2,
  COL: 1,
  CIV: 3,
  CRO: 2,
  CUW: 2,
  EGY: 1,
  ECU: 2,
  SCO: 1,
  ESP: 1,
  USA: 2,
  GHA: 3,
  HAI: 2,
  NED: 3,
  ENG: 1,
  IRQ: 2,
  JPN: 2,
  JOR: 1,
  MAR: 2,
  MEX: 1,
  NZL: 1,
  NOR: 2,
  PAN: 1,
  PAR: 1,
  POR: 2,
  KOR: 1,
  COD: 2,
  IRN: 1,
  SEN: 3,
  SWE: 2,
  SUI: 3,
  CZE: 1,
  TUR: 2,
  URU: 2,
  UZB: 2,
};

const SQUAD_POSITIONS = [
  'GOL', 'GOL', 'GOL',
  'ZAG', 'ZAG', 'ZAG', 'ZAG',
  'LAT', 'LAT',
  'VOL',
  'MEI', 'MEI', 'MEI', 'MEI',
  'PE', 'PD',
  'ATA', 'ATA', 'ATA', 'ATA', 'ATA', 'ATA', 'ATA',
  'MEI', 'ZAG', 'LAT',
];

const mulberry32 = seed => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

function ovrForPlayer({ teamPower, pos, craque, destaque, rng }) {
  let base = teamPower;
  if (pos === 'GOL') base -= 1;
  if (pos === 'ZAG' || pos === 'LAT') base -= 2;
  if (pos === 'ATA' || pos === 'PE' || pos === 'PD') base += 1;
  if (craque) return clamp(base + 3 + rng() * 4, 88, 95);
  if (destaque) return clamp(base + 1 + rng() * 3, 82, 93);
  const spread = pos === 'GOL' ? 4 : 6;
  return clamp(base - 3 + rng() * spread, 78, 92);
}

function destaqueSlotCount(code) {
  const entry = DESTAQUE_NAMES[code];
  if (Array.isArray(entry)) return entry.length;
  if (typeof entry === 'number') return entry;
  return 0;
}

function buildTeamSquad(code, meta) {
  const rng = mulberry32(meta.fifaRank * 997 + code.charCodeAt(0) * 13);
  const teamPower = nationalTeamPower(meta.block);
  const pool = meta.namePool || 'Brasil';
  const craques = [...(CRAQUE_ROSTER[code] || [])];
  const destaqueFixed = Array.isArray(DESTAQUE_NAMES[code]) ? [...DESTAQUE_NAMES[code]] : [];
  let destaqueSlots = destaqueSlotCount(code) - destaqueFixed.length;

  const players = SQUAD_POSITIONS.map((pos, index) => {
    let name;
    let craque = false;
    let destaque = false;

    const craqueIdx = craques.findIndex(c => !c.used && (!c.pos || c.pos === pos));
    if (craqueIdx >= 0) {
      const c = craques[craqueIdx];
      c.used = true;
      name = c.name;
      craque = true;
    } else if (destaqueFixed.length) {
      name = destaqueFixed.shift();
      destaque = true;
    } else if (destaqueSlots > 0) {
      destaqueSlots -= 1;
      destaque = true;
      name = rollPlayerName({ nationality: pool, index: index + meta.fifaRank, random: rng });
    } else {
      name = rollPlayerName({ nationality: pool, index: index + meta.fifaRank * 3, random: rng });
    }

    const player = {
      id: `wc26-${code.toLowerCase()}-${String(index + 1).padStart(2, '0')}`,
      name,
      pos,
      ovr: ovrForPlayer({ teamPower, pos, craque, destaque, rng }),
      nationalTeamOnly: true,
    };
    if (craque) player.craque = true;
    if (destaque) player.destaque = true;
    return player;
  });

  dedupeRosterNames(players);
  return players;
}

const teams = {};
for (const [code, meta] of Object.entries(NATIONAL_TEAMS)) {
  teams[code] = {
    code,
    name: meta.name,
    iso: meta.iso,
    fifaRank: meta.fifaRank,
    block: meta.block,
    teamPower: nationalTeamPower(meta.block),
    players: buildTeamSquad(code, meta),
  };
}

const payload = {
  version: '2026-1',
  tournament: 'Copa do Mundo 2026',
  squadSize: 26,
  squadsFrozen: true,
  squadsSourceEdition: 2026,
  squadsPolicy: 'Elenco fixo — força e sorteio vêm do ranking final da edição anterior.',
  teams,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const playerCount = Object.values(teams).reduce((n, t) => n + t.players.length, 0);
const craqueCount = Object.values(teams).reduce(
  (n, t) => n + t.players.filter(p => p.craque).length,
  0,
);
const destaqueCountTotal = Object.values(teams).reduce(
  (n, t) => n + t.players.filter(p => p.destaque).length,
  0,
);

console.log(`Wrote ${outPath}`);
console.log(`Teams: ${Object.keys(teams).length}, Players: ${playerCount}`);
console.log(`Craques: ${craqueCount}, Destaques: ${destaqueCountTotal}`);
