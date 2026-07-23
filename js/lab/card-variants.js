/**

 * API unificada de variantes PNG por função do card.

 */



import * as goleiro from './card-goleiro-variants.js';
import * as lateral from './card-lateral-variants.js';
import * as mei from './card-mei-variants.js';
import * as zagueiro from './card-zagueiro-variants.js';
import * as ponta from './card-ponta-variants.js';
import * as volante from './card-volante-variants.js';
import * as atacante from './card-atacante-variants.js';
import * as mc from './card-mc-variants.js';

export const CARD_LAB_ROLES = [
  { key: 'goleiro', label: 'GOL', pos: 'GOL', sampleName: 'Lucas Costa', title: 'Goleiro' },
  { key: 'lateral', label: 'LAT', pos: 'LAT', sampleName: 'Rafael Mendes', title: 'Lateral' },
  { key: 'mei', label: 'MEI', pos: 'MEI', sampleName: 'Thiago Alves', title: 'Meia' },
  { key: 'mc', label: 'MC', pos: 'MC', sampleName: 'Thiago Nunes', title: 'Meio-campo' },
  { key: 'zagueiro', label: 'ZAG', pos: 'ZAG', sampleName: 'Bruno Ferreira', title: 'Zagueiro' },
  { key: 'ponta', label: 'PON', pos: 'PON', sampleName: 'Diego Rocha', title: 'Ponta' },
  { key: 'volante', label: 'VOL', pos: 'VOL', sampleName: 'Carlos Andrade', title: 'Volante' },
  { key: 'atacante', label: 'ATA', pos: 'ATA', sampleName: 'Felipe Santos', title: 'Atacante' },
];



const APIS = {

  goleiro: {

    variants: goleiro.GOLEIRO_CARD_VARIANTS,

    visibleVariants: goleiro.visibleGoleiroVariants,

    loadVariantId: goleiro.loadGoleiroVariantId,

    saveVariantId: goleiro.saveGoleiroVariantId,

    artForId: goleiro.goleiroArtForId,

    deleteVariant: goleiro.deleteGoleiroVariant,

    restoreAll: goleiro.restoreAllGoleiroVariants,

    loadDeletedIds: goleiro.loadDeletedGoleiroVariantIds,

    roleLabel: 'goleiro',

  },

  lateral: {

    variants: lateral.LATERAL_CARD_VARIANTS,

    visibleVariants: lateral.visibleLateralVariants,

    loadVariantId: lateral.loadLateralVariantId,

    saveVariantId: lateral.saveLateralVariantId,

    artForId: lateral.lateralArtForId,

    deleteVariant: lateral.deleteLateralVariant,

    restoreAll: lateral.restoreAllLateralVariants,

    loadDeletedIds: lateral.loadDeletedLateralVariantIds,

    roleLabel: 'lateral',

  },

  mei: {

    variants: mei.MEI_CARD_VARIANTS,

    visibleVariants: mei.visibleMeiVariants,

    loadVariantId: mei.loadMeiVariantId,

    saveVariantId: mei.saveMeiVariantId,

    artForId: mei.meiArtForId,

    deleteVariant: mei.deleteMeiVariant,

    restoreAll: mei.restoreAllMeiVariants,

    loadDeletedIds: mei.loadDeletedMeiVariantIds,

    roleLabel: 'meia',
  },
  zagueiro: {
    variants: zagueiro.ZAGUEIRO_CARD_VARIANTS,
    visibleVariants: zagueiro.visibleZagueiroVariants,
    loadVariantId: zagueiro.loadZagueiroVariantId,
    saveVariantId: zagueiro.saveZagueiroVariantId,
    artForId: zagueiro.zagueiroArtForId,
    deleteVariant: zagueiro.deleteZagueiroVariant,
    restoreAll: zagueiro.restoreAllZagueiroVariants,
    loadDeletedIds: zagueiro.loadDeletedZagueiroVariantIds,
    roleLabel: 'zagueiro',
  },
  ponta: {
    variants: ponta.PONTA_CARD_VARIANTS,
    visibleVariants: ponta.visiblePontaVariants,
    loadVariantId: ponta.loadPontaVariantId,
    saveVariantId: ponta.savePontaVariantId,
    artForId: ponta.pontaArtForId,
    deleteVariant: ponta.deletePontaVariant,
    restoreAll: ponta.restoreAllPontaVariants,
    loadDeletedIds: ponta.loadDeletedPontaVariantIds,
    roleLabel: 'ponta',
  },
  volante: {
    variants: volante.VOLANTE_CARD_VARIANTS,
    visibleVariants: volante.visibleVolanteVariants,
    loadVariantId: volante.loadVolanteVariantId,
    saveVariantId: volante.saveVolanteVariantId,
    artForId: volante.volanteArtForId,
    deleteVariant: volante.deleteVolanteVariant,
    restoreAll: volante.restoreAllVolanteVariants,
    loadDeletedIds: volante.loadDeletedVolanteVariantIds,
    roleLabel: 'volante',
  },
  atacante: {
    variants: atacante.ATACANTE_CARD_VARIANTS,
    visibleVariants: atacante.visibleAtacanteVariants,
    loadVariantId: atacante.loadAtacanteVariantId,
    saveVariantId: atacante.saveAtacanteVariantId,
    artForId: atacante.atacanteArtForId,
    deleteVariant: atacante.deleteAtacanteVariant,
    restoreAll: atacante.restoreAllAtacanteVariants,
    loadDeletedIds: atacante.loadDeletedAtacanteVariantIds,
    roleLabel: 'atacante',
  },
  mc: {
    variants: mc.MC_CARD_VARIANTS,
    visibleVariants: mc.visibleMcVariants,
    loadVariantId: mc.loadMcVariantId,
    saveVariantId: mc.saveMcVariantId,
    artForId: mc.mcArtForId,
    deleteVariant: mc.deleteMcVariant,
    restoreAll: mc.restoreAllMcVariants,
    loadDeletedIds: mc.loadDeletedMcVariantIds,
    roleLabel: 'mc',
  },
};



export function cardVariantApi(roleKey = 'goleiro') {

  return APIS[roleKey] || APIS.goleiro;

}



export function parseCardLabRole(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (key === 'pd' || key === 'pe') return 'ponta';
  return APIS[key] ? key : 'goleiro';
}



export function cardLabRoleFromUrl() {

  try {

    return parseCardLabRole(new URLSearchParams(window.location.search).get('role'));

  } catch {

    return 'goleiro';

  }

}



export function cardLabUrl(roleKey) {

  const file = window.location.pathname.split('/').pop() || 'card-preview.html';

  return `${file}?role=${encodeURIComponent(roleKey)}`;

}



export function saveCardLabRole(roleKey) {

  try {

    localStorage.setItem('matchday-card-lab-role', parseCardLabRole(roleKey));

  } catch {

    /* ignore */

  }

}



export function loadCardLabRole() {

  try {

    const fromUrl = new URLSearchParams(window.location.search).get('role');

    if (fromUrl) return parseCardLabRole(fromUrl);

    const saved = localStorage.getItem('matchday-card-lab-role');

    if (saved) return parseCardLabRole(saved);

  } catch {

    /* ignore */

  }

  return 'goleiro';

}



const SAMPLES = {

  lateral: {

    name: 'Rafael Mendes',

    pos: 'LAT',

    roleKey: 'lateral',

    overall: 79,

    potential: 85,

    age: 23,

    nationality: 'Brasil',

    preferredFoot: 'Direito',

    speed: 84,

    passing: 76,

    playmaking: 70,

    tackling: 78,

    marking: 75,

    dribble: 72,

    finishing: 58,

    heading: 62,

    freeKick: 45,

    penaltyTaking: 38,

    positioning: 74,

    cardStats: {

      avgRating: 7.1,

      clubApps: 31,

      goals: 2,

      assists: 5,

      yellowCards: 4,

      redCards: 0,

    },

  },

  mei: {
    name: 'Thiago Alves',
    pos: 'MEI',
    roleKey: 'mei',
    overall: 81,
    potential: 87,
    age: 25,
    nationality: 'Brasil',
    preferredFoot: 'Esquerdo',
    passing: 84,
    playmaking: 82,
    dribble: 80,
    speed: 74,
    finishing: 72,
    freeKick: 68,
    tackling: 58,
    marking: 55,
    heading: 52,
    penaltyTaking: 62,
    positioning: 76,
    cardStats: {
      avgRating: 7.3,
      clubApps: 34,
      goals: 8,
      assists: 11,
      yellowCards: 3,
      redCards: 0,
    },
  },
  zagueiro: {
    name: 'Bruno Ferreira',
    pos: 'ZAG',
    roleKey: 'zagueiro',
    overall: 80,
    potential: 84,
    age: 27,
    nationality: 'Brasil',
    preferredFoot: 'Direito',
    marking: 84,
    tackling: 82,
    heading: 86,
    passing: 68,
    speed: 62,
    dribble: 48,
    finishing: 42,
    playmaking: 55,
    freeKick: 35,
    penaltyTaking: 28,
    positioning: 83,
    cardStats: {
      avgRating: 7.2,
      clubApps: 36,
      goals: 3,
      assists: 1,
      yellowCards: 5,
      redCards: 0,
    },
  },
  ponta: {
    name: 'Diego Rocha',
    pos: 'PON',
    roleKey: 'ponta',
    overall: 78,
    potential: 86,
    age: 22,
    nationality: 'Brasil',
    preferredFoot: 'Direito',
    speed: 88,
    dribble: 82,
    finishing: 74,
    passing: 70,
    playmaking: 68,
    tackling: 42,
    marking: 38,
    heading: 55,
    freeKick: 58,
    penaltyTaking: 52,
    positioning: 72,
    cardStats: {
      avgRating: 7.0,
      clubApps: 29,
      goals: 6,
      assists: 7,
      yellowCards: 2,
      redCards: 0,
    },
  },
  volante: {
    name: 'Carlos Andrade',
    pos: 'VOL',
    roleKey: 'volante',
    overall: 79,
    potential: 83,
    age: 25,
    nationality: 'Brasil',
    preferredFoot: 'Direito',
    tackling: 82,
    marking: 78,
    passing: 76,
    playmaking: 72,
    speed: 70,
    heading: 68,
    dribble: 62,
    finishing: 48,
    freeKick: 42,
    penaltyTaking: 35,
    positioning: 80,
    cardStats: {
      avgRating: 7.1,
      clubApps: 33,
      goals: 4,
      assists: 6,
      yellowCards: 6,
      redCards: 0,
    },
  },
  atacante: {
    name: 'Felipe Santos',
    pos: 'ATA',
    roleKey: 'atacante',
    overall: 82,
    potential: 88,
    age: 25,
    nationality: 'Brasil',
    preferredFoot: 'Direito',
    finishing: 86,
    speed: 78,
    positioning: 84,
    dribble: 74,
    heading: 72,
    passing: 68,
    playmaking: 65,
    freeKick: 62,
    penaltyTaking: 80,
    marking: 32,
    tackling: 28,
    cardStats: {
      avgRating: 7.3,
      clubApps: 31,
      goals: 18,
      assists: 4,
      yellowCards: 3,
      redCards: 0,
    },
  },
  mc: {
    name: 'Thiago Nunes',
    pos: 'MC',
    roleKey: 'mc',
    overall: 79,
    potential: 84,
    age: 25,
    nationality: 'Brasil',
    preferredFoot: 'Direito',
    passing: 84,
    playmaking: 89,
    tackling: 58,
    speed: 75,
    dribble: 77,
    finishing: 72,
    marking: 61,
    heading: 55,
    freeKick: 89,
    penaltyTaking: 74,
    positioning: 78,
    cardStats: {
      avgRating: 7.2,
      clubApps: 38,
      goals: 6,
      assists: 9,
      yellowCards: 4,
      redCards: 0,
    },
  },
  goleiro: {

    name: 'Lucas Costa',

    pos: 'GOL',

    roleKey: 'goleiro',

    overall: 82,

    potential: 88,

    age: 24,

    nationality: 'Brasil',

    preferredFoot: 'Direito',

    reflexes: 85,

    positioning: 80,

    penaltySaving: 78,

    passing: 72,

    speed: 68,

    playmaking: 65,

    dribble: 42,

    marking: 38,

    tackling: 40,

    finishing: 35,

    heading: 55,

    freeKick: 28,

    penaltyTaking: 22,

    cardStats: {

      avgRating: 7.4,

      clubApps: 28,

      goals: 0,

      assists: 1,

      yellowCards: 2,

      redCards: 0,

    },

  },

};



const LAB_CLUB_PREVIEW = {
  clubName: 'Fluminense',
  clubDivision: 'A',
};



export function buildCardSample(roleKey) {
  const base = SAMPLES[roleKey] || SAMPLES.goleiro;
  return { ...base, ...LAB_CLUB_PREVIEW };
}



export function cardLabRoleTitle(roleKey) {

  const role = CARD_LAB_ROLES.find(r => r.key === roleKey) || CARD_LAB_ROLES[0];

  return role.title;

}


