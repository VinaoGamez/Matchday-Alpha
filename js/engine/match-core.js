/** Bônus táticos por formação — compartilhado entre simulação e partida ao vivo. */
export const FORMATION_PERFORMANCE = {
  '4-3-3': { attack: 2, passing: 1, defense: -0.7 },
  '4-4-2': { attack: 0.5, passing: 0.3, defense: 1 },
  '3-5-2': { attack: 0.8, passing: 1.7, defense: 0.3 },
  '4-2-3-1': { attack: 1.1, passing: 1.8, defense: 0.5 },
  '4-1-4-1': { attack: -0.5, passing: 1, defense: 2.2 },
  '5-3-2': { attack: -1.2, passing: -0.4, defense: 3 },
  '4-3-1-2': { attack: 1.5, passing: 1.2, defense: 0.2 },
  '3-4-3': { attack: 2.4, passing: 0.7, defense: -1.5 },
};

/** Posições compatíveis para substituições improvisadas. */
export const COMPATIBLE_ROLES = {
  GOL: ['GOL'],
  ZAG: ['ZAG', 'LAT', 'VOL'],
  LAT: ['LAT', 'ZAG', 'VOL', 'PE', 'PD'],
  VOL: ['VOL', 'MC', 'ZAG'],
  MC: ['MC', 'VOL', 'MEI', 'PE', 'PD'],
  MEI: ['MEI', 'MC', 'PE', 'PD', 'ATA'],
  PE: ['PE', 'PD', 'MEI', 'MC', 'LAT'],
  PD: ['PD', 'PE', 'MEI', 'MC', 'LAT'],
  ATA: ['ATA', 'PE', 'PD', 'MEI'],
};

export const roundTactic = club => ({
  formation: club.formation,
  mentality: club.mentality === 'Ofensiva' ? 72 : club.mentality === 'Defensiva' ? 28 : 50,
  possession: club.style === 'Posse de bola' ? 76 : club.style === 'Contra-ataque' ? 26 : 50,
  press: club.style === 'Pressão alta' ? 80 : club.mentality === 'Defensiva' ? 38 : 54,
  offsideLine: 50,
});
