/** Bônus táticos por formação — compartilhado entre simulação e partida ao vivo. */
export const FORMATION_PERFORMANCE = {
  '4-3-3': { attack: 3, passing: 1.5, defense: -1 },
  '4-4-2': { attack: 0.8, passing: 0.5, defense: 1.5 },
  '3-5-2': { attack: 1.2, passing: 2.5, defense: 0.5 },
  '4-2-3-1': { attack: 1.7, passing: 2.7, defense: 0.8 },
  '4-1-4-1': { attack: -0.8, passing: 1.5, defense: 3.2 },
  '5-3-2': { attack: -1.8, passing: -0.6, defense: 4.5 },
  '4-3-1-2': { attack: 2.2, passing: 1.8, defense: 0.3 },
  '3-4-3': { attack: 3.6, passing: 1, defense: -2.2 },
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

export const roundTactic = club => {
  const mentality = club.mentality === 'Ofensiva' ? 72 : club.mentality === 'Defensiva' ? 28 : 50;
  const possession = club.style === 'Posse de bola' ? 76 : club.style === 'Contra-ataque' ? 26 : 50;
  const press = club.style === 'Pressão alta' ? 80 : club.mentality === 'Defensiva' ? 38 : 54;
  const defenders = Number(club.formation?.[0]) || 4;
  let offsideLine = 50;
  if (club.mentality === 'Defensiva' || defenders >= 5) offsideLine = 38;
  else if (club.mentality === 'Ofensiva' || club.style === 'Pressão alta') offsideLine = 62;
  else if (club.style === 'Contra-ataque') offsideLine = 44;
  return { formation: club.formation, mentality, possession, press, offsideLine };
};
