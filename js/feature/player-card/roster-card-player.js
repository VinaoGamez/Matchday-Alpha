/**
 * Adapta jogador do elenco/jogo para o renderizador de cards.
 */

import { cardDisplayPos, cardArtForPlayer, resolveCardRoleKey } from '../../engine/player-card-art.js';
import { playerKey } from '../../engine/player-match-stats.js';

export function rosterPlayerToCardPlayer(player, { playerHistory, careerSeason, clubName, clubDivision } = {}) {
  if (!player) return null;

  const key = playerKey(player);
  const bucket = playerHistory?.getPlayer?.(key)?.seasons?.[String(careerSeason)];

  const cardPlayer = {
    ...player,
    pos: cardDisplayPos(player),
    roleKey: resolveCardRoleKey(player),
    nationality: player.nationality || 'Brasil',
    clubName: clubName || player.clubName || player.club || null,
    clubDivision: clubDivision || player.clubDivision || player.division || null,
    cardStats: {
      avgRating: bucket?.avgRating ?? player?.avgRating ?? player?.seasonAvg ?? null,
      clubApps: bucket?.apps ?? 0,
      goals: bucket?.goals ?? 0,
      assists: bucket?.assists ?? 0,
      yellowCards: bucket?.yellow ?? player?.discipline?.yellowCards ?? 0,
      redCards: bucket?.red ?? player?.discipline?.redCards ?? 0,
    },
  };

  cardPlayer._cardArt = cardArtForPlayer(cardPlayer);
  return cardPlayer;
}
