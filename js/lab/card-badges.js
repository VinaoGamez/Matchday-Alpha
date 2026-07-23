/**
 * Badges do verso do card — especialistas e craque.
 * PNGs com fundo transparente em assets/cards/badges/.
 */

import { isPenaltySavingSpecialist } from '../engine/player-generation.js';
import badgeFaltaUrl from '../../assets/cards/badges/card-badge-especialista-falta.png';
import badgePenaltiUrl from '../../assets/cards/badges/card-badge-especialista-penalti.png';
import badgeDefesaPenaltiUrl from '../../assets/cards/badges/card-badge-especialista-defesa-penalti.png';
import badgeEstrelaPrataUrl from '../../assets/cards/badges/card-badge-estrela-prata.png';
import badgeEstrelaDouradaUrl from '../../assets/cards/badges/card-badge-estrela-dourada.png';

export const CARD_BADGE_ASSETS = {
  freeKick: {
    id: 'freeKick',
    label: 'Especialista em Falta',
    short: 'Esp. falta',
    url: badgeFaltaUrl,
  },
  penalty: {
    id: 'penalty',
    label: 'Especialista em Cobrança de Pênaltis',
    short: 'Esp. pênalti',
    url: badgePenaltiUrl,
  },
  penaltySaving: {
    id: 'penaltySaving',
    label: 'Especialista em Defesa de Pênaltis',
    short: 'Esp. def. pênalti',
    url: badgeDefesaPenaltiUrl,
  },
  specialistStar: {
    id: 'specialistStar',
    label: 'Especialista',
    short: 'Estrela prata',
    url: badgeEstrelaPrataUrl,
  },
  craque: {
    id: 'craque',
    label: 'Craque',
    short: 'Estrela dourada',
    url: badgeEstrelaDouradaUrl,
  },
};

/** Um hex por jogador — conforme flag/atributos de bola parada. */
export function resolveSpecialistHexBadge(player) {
  if (!player) return null;
  if (player.pos === 'GOL') {
    return isPenaltySavingSpecialist(player) ? CARD_BADGE_ASSETS.penaltySaving : null;
  }

  const flag = player.setPieceSpecialist;
  const fkVal = Number(player.freeKick) || 0;
  const penVal = Number(player.penaltyTaking) || 0;
  const fk =
    flag === 'freeKick' || flag === 'both' || flag === true || fkVal > 85;
  const pen =
    flag === 'penalty' || flag === 'both' || flag === true || penVal > 85;

  if (flag === 'freeKick') return CARD_BADGE_ASSETS.freeKick;
  if (flag === 'penalty') return CARD_BADGE_ASSETS.penalty;
  if (flag === 'both') {
    return fkVal >= penVal ? CARD_BADGE_ASSETS.freeKick : CARD_BADGE_ASSETS.penalty;
  }
  if (fk && pen) {
    return fkVal >= penVal ? CARD_BADGE_ASSETS.freeKick : CARD_BADGE_ASSETS.penalty;
  }
  if (fk) return CARD_BADGE_ASSETS.freeKick;
  if (pen) return CARD_BADGE_ASSETS.penalty;
  return null;
}
