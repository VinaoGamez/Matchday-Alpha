/**
 * Tática por seleção — formação do 1º jogo de grupos (Copa 2026).
 * Estilo/mentalidade alinhados ao perfil típico de abertura de cada seleção.
 */

export const DEFAULT_NT_FORMATION = '4-3-3';

/** @type {Record<string, { formation: string, style: string, mentality: string, opener?: string }>} */
export const NATIONAL_TEAM_OPENING_TACTICS = Object.freeze({
  MEX: { formation: '4-3-3', style: 'Pressão alta', mentality: 'Ofensiva', opener: 'KOR' },
  KOR: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'MEX' },
  RSA: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'CZE' },
  CZE: { formation: '4-1-4-1', style: 'Posse de bola', mentality: 'Equilibrada', opener: 'RSA' },
  CAN: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'SUI' },
  SUI: { formation: '3-4-3', style: 'Posse de bola', mentality: 'Equilibrada', opener: 'CAN' },
  QAT: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Equilibrada', opener: 'BIH' },
  BIH: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'QAT' },
  BRA: { formation: '4-2-3-1', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'MAR' },
  MAR: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'BRA' },
  SCO: { formation: '3-5-2', style: 'Pressão alta', mentality: 'Equilibrada', opener: 'HAI' },
  HAI: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'SCO' },
  USA: { formation: '4-3-3', style: 'Pressão alta', mentality: 'Ofensiva', opener: 'PAR' },
  PAR: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'USA' },
  AUS: { formation: '4-2-3-1', style: 'Pressão alta', mentality: 'Equilibrada', opener: 'TUR' },
  TUR: { formation: '4-2-3-1', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'AUS' },
  GER: { formation: '4-2-3-1', style: 'Pressão alta', mentality: 'Ofensiva', opener: 'ECU' },
  ECU: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'GER' },
  CIV: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'CUW' },
  CUW: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'CIV' },
  NED: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'JPN' },
  JPN: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'NED' },
  TUN: { formation: '4-3-1-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'SWE' },
  SWE: { formation: '4-4-2', style: 'Pressão alta', mentality: 'Equilibrada', opener: 'TUN' },
  BEL: { formation: '3-4-3', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'IRN' },
  IRN: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'BEL' },
  EGY: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'NZL' },
  NZL: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'EGY' },
  ESP: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'URU' },
  URU: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'ESP' },
  KSA: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'CPV' },
  CPV: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'KSA' },
  FRA: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'SEN' },
  SEN: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'FRA' },
  NOR: { formation: '4-3-3', style: 'Pressão alta', mentality: 'Ofensiva', opener: 'IRQ' },
  IRQ: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'NOR' },
  ARG: { formation: '4-4-2', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'AUT' },
  AUT: { formation: '4-2-3-1', style: 'Posse de bola', mentality: 'Equilibrada', opener: 'ARG' },
  ALG: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'JOR' },
  JOR: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'ALG' },
  POR: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Ofensiva', opener: 'COL' },
  COL: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'POR' },
  UZB: { formation: '4-4-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'COD' },
  COD: { formation: '4-3-3', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'UZB' },
  ENG: { formation: '4-2-3-1', style: 'Pressão alta', mentality: 'Ofensiva', opener: 'CRO' },
  CRO: { formation: '4-3-3', style: 'Posse de bola', mentality: 'Equilibrada', opener: 'ENG' },
  PAN: { formation: '5-3-2', style: 'Contra-ataque', mentality: 'Defensiva', opener: 'GHA' },
  GHA: { formation: '4-2-3-1', style: 'Contra-ataque', mentality: 'Equilibrada', opener: 'PAN' },
});

export function getNationalTeamTactics(code) {
  const key = String(code || '').trim().toUpperCase();
  const row = NATIONAL_TEAM_OPENING_TACTICS[key];
  if (row) return { ...row };
  return {
    formation: DEFAULT_NT_FORMATION,
    style: 'Posse de bola',
    mentality: 'Equilibrada',
  };
}

export function getNationalTeamFormation(code) {
  return getNationalTeamTactics(code).formation || DEFAULT_NT_FORMATION;
}
