/**
 * Seleções nacionais — Copa do Mundo 2026 (48).
 * Escudos = bandeiras (ISO-2 → public/flags/{iso}.png).
 */

/** @type {Record<string, { code: string, name: string, iso: string, fifaRank: number, block: 1|2|3|4, namePool?: string }>} */
export const NATIONAL_TEAMS = Object.freeze({
  FRA: { code: 'FRA', name: 'França', iso: 'fr', fifaRank: 1, block: 1, namePool: 'Europa' },
  ARG: { code: 'ARG', name: 'Argentina', iso: 'ar', fifaRank: 2, block: 1, namePool: 'Argentina' },
  ENG: { code: 'ENG', name: 'Inglaterra', iso: 'eng', fifaRank: 3, block: 1, namePool: 'Europa' },
  BRA: { code: 'BRA', name: 'Brasil', iso: 'br', fifaRank: 6, block: 1, namePool: 'Brasil' },
  POR: { code: 'POR', name: 'Portugal', iso: 'pt', fifaRank: 5, block: 1, namePool: 'Europa' },
  NED: { code: 'NED', name: 'Holanda', iso: 'nl', fifaRank: 7, block: 1, namePool: 'Europa' },
  ESP: { code: 'ESP', name: 'Espanha', iso: 'es', fifaRank: 8, block: 1, namePool: 'Europa' },
  BEL: { code: 'BEL', name: 'Bélgica', iso: 'be', fifaRank: 9, block: 1, namePool: 'Europa' },
  GER: { code: 'GER', name: 'Alemanha', iso: 'de', fifaRank: 10, block: 1, namePool: 'Europa' },
  CRO: { code: 'CRO', name: 'Croácia', iso: 'hr', fifaRank: 11, block: 1, namePool: 'Europa' },
  MAR: { code: 'MAR', name: 'Marrocos', iso: 'ma', fifaRank: 12, block: 1, namePool: 'África' },
  COL: { code: 'COL', name: 'Colômbia', iso: 'co', fifaRank: 13, block: 2, namePool: 'Colombia' },
  URU: { code: 'URU', name: 'Uruguai', iso: 'uy', fifaRank: 14, block: 2, namePool: 'Uruguai' },
  SUI: { code: 'SUI', name: 'Suíça', iso: 'ch', fifaRank: 15, block: 2, namePool: 'Europa' },
  JPN: { code: 'JPN', name: 'Japão', iso: 'jp', fifaRank: 16, block: 2, namePool: 'Ásia' },
  SEN: { code: 'SEN', name: 'Senegal', iso: 'sn', fifaRank: 17, block: 2, namePool: 'África' },
  IRN: { code: 'IRN', name: 'Irã', iso: 'ir', fifaRank: 18, block: 2, namePool: 'Ásia' },
  USA: { code: 'USA', name: 'Estados Unidos', iso: 'us', fifaRank: 19, block: 2, namePool: 'Concacaf' },
  MEX: { code: 'MEX', name: 'México', iso: 'mx', fifaRank: 20, block: 2, namePool: 'Concacaf' },
  ECU: { code: 'ECU', name: 'Equador', iso: 'ec', fifaRank: 21, block: 2, namePool: 'Equador' },
  AUT: { code: 'AUT', name: 'Áustria', iso: 'at', fifaRank: 22, block: 2, namePool: 'Europa' },
  KOR: { code: 'KOR', name: 'Coreia do Sul', iso: 'kr', fifaRank: 23, block: 2, namePool: 'Ásia' },
  AUS: { code: 'AUS', name: 'Austrália', iso: 'au', fifaRank: 24, block: 2, namePool: 'Ásia' },
  NOR: { code: 'NOR', name: 'Noruega', iso: 'no', fifaRank: 25, block: 3, namePool: 'Europa' },
  PAN: { code: 'PAN', name: 'Panamá', iso: 'pa', fifaRank: 26, block: 3, namePool: 'Concacaf' },
  EGY: { code: 'EGY', name: 'Egito', iso: 'eg', fifaRank: 27, block: 3, namePool: 'África' },
  PAR: { code: 'PAR', name: 'Paraguai', iso: 'py', fifaRank: 28, block: 3, namePool: 'Paraguai' },
  CAN: { code: 'CAN', name: 'Canadá', iso: 'ca', fifaRank: 29, block: 3, namePool: 'Concacaf' },
  SWE: { code: 'SWE', name: 'Suécia', iso: 'se', fifaRank: 30, block: 3, namePool: 'Europa' },
  CIV: { code: 'CIV', name: 'Costa do Marfim', iso: 'ci', fifaRank: 31, block: 3, namePool: 'África' },
  TUR: { code: 'TUR', name: 'Turquia', iso: 'tr', fifaRank: 32, block: 3, namePool: 'Europa' },
  RSA: { code: 'RSA', name: 'África do Sul', iso: 'za', fifaRank: 33, block: 3, namePool: 'África' },
  CZE: { code: 'CZE', name: 'Tchéquia', iso: 'cz', fifaRank: 34, block: 3, namePool: 'Europa' },
  SCO: { code: 'SCO', name: 'Escócia', iso: 'sc', fifaRank: 35, block: 3, namePool: 'Europa' },
  CPV: { code: 'CPV', name: 'Cabo Verde', iso: 'cv', fifaRank: 37, block: 4, namePool: 'África' },
  GHA: { code: 'GHA', name: 'Gana', iso: 'gh', fifaRank: 38, block: 4, namePool: 'África' },
  KSA: { code: 'KSA', name: 'Arábia Saudita', iso: 'sa', fifaRank: 39, block: 4, namePool: 'Ásia' },
  ALG: { code: 'ALG', name: 'Argélia', iso: 'dz', fifaRank: 40, block: 4, namePool: 'África' },
  TUN: { code: 'TUN', name: 'Tunísia', iso: 'tn', fifaRank: 41, block: 4, namePool: 'África' },
  IRQ: { code: 'IRQ', name: 'Iraque', iso: 'iq', fifaRank: 42, block: 4, namePool: 'Ásia' },
  COD: { code: 'COD', name: 'RD Congo', iso: 'cd', fifaRank: 43, block: 4, namePool: 'África' },
  UZB: { code: 'UZB', name: 'Uzbequistão', iso: 'uz', fifaRank: 44, block: 4, namePool: 'Ásia' },
  QAT: { code: 'QAT', name: 'Catar', iso: 'qa', fifaRank: 45, block: 4, namePool: 'Ásia' },
  JOR: { code: 'JOR', name: 'Jordânia', iso: 'jo', fifaRank: 46, block: 4, namePool: 'Ásia' },
  BIH: { code: 'BIH', name: 'Bósnia', iso: 'ba', fifaRank: 47, block: 4, namePool: 'Europa' },
  NZL: { code: 'NZL', name: 'Nova Zelândia', iso: 'nz', fifaRank: 48, block: 4, namePool: 'Ásia' },
  CUW: { code: 'CUW', name: 'Curaçao', iso: 'cw', fifaRank: 49, block: 4, namePool: 'Concacaf' },
  HAI: { code: 'HAI', name: 'Haiti', iso: 'ht', fifaRank: 50, block: 4, namePool: 'Concacaf' },
});

const NAME_ALIASES = Object.freeze({
  brasil: 'BRA',
  brazil: 'BRA',
  franca: 'FRA',
  france: 'FRA',
  argentina: 'ARG',
  inglaterra: 'ENG',
  england: 'ENG',
  portugal: 'POR',
  holanda: 'NED',
  netherlands: 'NED',
  espanha: 'ESP',
  spain: 'ESP',
  belgica: 'BEL',
  belgium: 'BEL',
  alemanha: 'GER',
  germany: 'GER',
  croacia: 'CRO',
  croatia: 'CRO',
  marrocos: 'MAR',
  morocco: 'MAR',
  colombia: 'COL',
  uruguai: 'URU',
  uruguay: 'URU',
  suica: 'SUI',
  switzerland: 'SUI',
  japao: 'JPN',
  japan: 'JPN',
  senegal: 'SEN',
  ira: 'IRN',
  iran: 'IRN',
  'estados unidos': 'USA',
  usa: 'USA',
  mexico: 'MEX',
  equador: 'ECU',
  ecuador: 'ECU',
  austria: 'AUT',
  'coreia do sul': 'KOR',
  'south korea': 'KOR',
  australia: 'AUS',
  noruega: 'NOR',
  norway: 'NOR',
  panama: 'PAN',
  egito: 'EGY',
  egypt: 'EGY',
  paraguai: 'PAR',
  paraguay: 'PAR',
  canada: 'CAN',
  suecia: 'SWE',
  sweden: 'SWE',
  'costa do marfim': 'CIV',
  turquia: 'TUR',
  turkey: 'TUR',
  'turquia': 'TUR',
  'africa do sul': 'RSA',
  'south africa': 'RSA',
  tchequia: 'CZE',
  czechia: 'CZE',
  escocia: 'SCO',
  scotland: 'SCO',
  'cabo verde': 'CPV',
  gana: 'GHA',
  ghana: 'GHA',
  'arabia saudita': 'KSA',
  argelia: 'ALG',
  algeria: 'ALG',
  tunisia: 'TUN',
  iraque: 'IRQ',
  iraq: 'IRQ',
  'rd congo': 'COD',
  uzbequistao: 'UZB',
  uzbekistan: 'UZB',
  catar: 'QAT',
  qatar: 'QAT',
  jordania: 'JOR',
  jordan: 'JOR',
  bosnia: 'BIH',
  'nova zelandia': 'NZL',
  curacao: 'CUW',
  haiti: 'HAI',
});

function normKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function nationalTeamByCode(code) {
  const key = String(code || '').trim().toUpperCase();
  return NATIONAL_TEAMS[key] || null;
}

export function resolveNationalTeam(teamKey) {
  if (!teamKey) return null;
  const raw = String(teamKey).trim();
  const upper = raw.toUpperCase();
  if (NATIONAL_TEAMS[upper]) return NATIONAL_TEAMS[upper];
  const alias = NAME_ALIASES[normKey(raw)];
  if (alias) return NATIONAL_TEAMS[alias] || null;
  return null;
}

export function isNationalTeam(teamKey) {
  return !!resolveNationalTeam(teamKey);
}

/** PNG local — mesmo padrão dos cards. */
export function nationalTeamFlagUrl(iso) {
  const isoKey = String(iso || '').trim().toLowerCase();
  if (!/^[a-z]{2,5}$/.test(isoKey)) return null;
  return `./flags/${isoKey}.png`;
}

export function nationalTeamFlagUrlForTeam(teamKey) {
  const team = resolveNationalTeam(teamKey);
  return team ? nationalTeamFlagUrl(team.iso) : null;
}

/** OVR médio do elenco por bloco (Copa comprimida 82–95). */
export function nationalTeamPower(block) {
  const map = { 1: 94, 2: 91, 3: 88, 4: 84 };
  return map[block] || 84;
}

export const NATIONAL_TEAM_CODES = Object.freeze(Object.keys(NATIONAL_TEAMS));
