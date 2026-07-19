/**
 * Textos oficiais (espelho CBF 2026+) exibidos no botão REGRAS da seção Campeonatos.
 */

import {
  SERIE_D_CLUBS,
  SERIE_D_PROMOTIONS,
  serieCClubsForSeason,
  serieCRelegationSlots,
} from './serie-c-calendar.js';

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const section = (heading, items) => ({ heading, items: items.filter(Boolean) });

/** @param {number|string} season */
export function buildCompetitionRules(competitionId, season) {
  const year = Number(season) || 2026;
  const id = String(competitionId || 'A').toUpperCase();

  if (id === 'CUP') {
    return {
      kicker: `COPA DO BRASIL · ${year}`,
      title: 'Regulamento da Copa do Brasil',
      sections: [
        section('Formato', [
          '126 clubes em 9 fases, com sorteios progressivos.',
          '1ª à 4ª fase em jogo único; da 5ª fase à semifinal em ida e volta; final em jogo único.',
        ]),
        section('Entradas', [
          'Série A entra apenas na 5ª fase (20 clubes).',
          'Demais divisões e convidados entram nas fases iniciais conforme o chaveamento.',
        ]),
        section('Classificação', [
          'No mata-mata, avança quem vencer o confronto (agregado quando houver ida e volta).',
          'Empate no agregado: decisão nos pênaltis.',
        ]),
      ],
    };
  }

  if (id === 'D') {
    return {
      kicker: `BRASILEIRÃO SÉRIE D · ${year}`,
      title: 'Regulamento da Série D',
      sections: [
        section('Formato', [
          `${SERIE_D_CLUBS} clubes em 16 grupos de 6.`,
          'Fase de grupos: 10 rodadas (todos contra todos no grupo).',
          'Os 4 primeiros de cada grupo avançam ao mata-mata (64 clubes).',
        ]),
        section('Mata-mata', [
          'Confrontos em ida e volta até a final.',
          'Nas quartas, os 4 vencedores já garantem acesso; há ainda semifinal e repescagem pelos 2 acessos restantes.',
        ]),
        section('Acesso', [
          `${SERIE_D_PROMOTIONS} clubes sobem para a Série C na temporada seguinte.`,
          'Não há rebaixamento a partir da Série D.',
        ]),
      ],
    };
  }

  if (id === 'C') {
    const clubs = serieCClubsForSeason(year);
    const relegated = serieCRelegationSlots(year);
    const nextClubs = serieCClubsForSeason(year + 1);
    const expansionNote =
      clubs < 28
        ? `Transição CBF: esta temporada tem ${clubs} clubes; na próxima a Série C passa a ${nextClubs} (só ${relegated} rebaixados e ${SERIE_D_PROMOTIONS} acessos da Série D).`
        : `Formato estável CBF a partir de 2028: ${clubs} clubes, ${relegated} rebaixados e ${SERIE_D_PROMOTIONS} acessos da Série D.`;

    return {
      kicker: `BRASILEIRÃO SÉRIE C · ${year}`,
      title: 'Regulamento da Série C',
      sections: [
        section('Formato', [
          `${clubs} clubes em pontos corridos (turno e returno).`,
          expansionNote,
        ]),
        section('Acesso à Série B', [
          'G4: os 4 primeiros conquistam o acesso à Série B.',
        ]),
        section('Rebaixamento à Série D', [
          `Z${relegated}: os ${relegated} últimos são rebaixados à Série D.`,
          `A Série D promove ${SERIE_D_PROMOTIONS} clubes para a Série C.`,
        ]),
      ],
    };
  }

  if (id === 'B') {
    return {
      kicker: `BRASILEIRÃO SÉRIE B · ${year}`,
      title: 'Regulamento da Série B',
      sections: [
        section('Formato', [
          '20 clubes em pontos corridos (turno e returno · 38 rodadas).',
        ]),
        section('Acesso à Série A', [
          '1º e 2º sobem direto.',
          '3º ao 6º disputam playoffs de acesso (mais 2 vagas).',
          'Total: 4 acessos à Série A.',
        ]),
        section('Rebaixamento à Série C', [
          'Z4: os 4 últimos são rebaixados à Série C.',
        ]),
      ],
    };
  }

  // Série A (default)
  return {
    kicker: `BRASILEIRÃO SÉRIE A · ${year}`,
    title: 'Regulamento da Série A',
    sections: [
      section('Formato', [
        '20 clubes em pontos corridos (turno e returno · 38 rodadas).',
      ]),
      section('Título', [
        'O 1º colocado é o campeão brasileiro da Série A.',
      ]),
      section('Rebaixamento à Série B', [
        'Z4: os 4 últimos são rebaixados à Série B.',
      ]),
    ],
  };
}

export function competitionRulesHtml(competitionId, season) {
  const rules = buildCompetitionRules(competitionId, season);
  const sections = rules.sections
    .map(
      block =>
        `<section class="competition-rules-section"><h3>${escapeHtml(block.heading)}</h3><ul>${block.items
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('')}</ul></section>`,
    )
    .join('');
  return {
    kicker: rules.kicker,
    title: rules.title,
    bodyHtml: sections,
  };
}
