import { clamp } from '../../ui/dom.js';

/** Campo vazio em tabelas de atributos. */
export const outfield = value => value || '—';

/** Barra de cansaço padrão para tabelas e listagens. */
export const fatigueCell = player =>
  `<span class="table-fatigue"><i><b style="width:${clamp(player.fatigue, 0, 100)}%"></b></i>${Math.round(player.fatigue)}%</span>`;

/**
 * Badges de status (cartões, lesão, suspensão) para células de jogador.
 * @param {object} injuryHelpers — funções do motor de lesões
 */
export function createPlayerCells({
  injuryInAcutePhase,
  injuryInRestrictedPhase,
  injurySeverityLabel,
  YELLOW_SUSPENSION_LIMIT,
  getYellowAccumulation,
  activeSuspensions,
  disciplineBadgeCompetitionKeys,
  competitionLabel,
  userLeagueDisciplineKey,
}) {
  const playerStatusBadges = (player, liveState = null) => {
    const badges = [];
    const limit = YELLOW_SUSPENSION_LIMIT;
    const pushYellow = (count, title) => {
      const total = clamp(Number(count) || 0, 0, limit);
      for (let index = 0; index < total; index++) {
        badges.push(`<i class="player-badge player-badge-yellow" aria-hidden="true" title="${title || 'Cartão amarelo'}"></i>`);
      }
    };
    if (liveState) {
      if (liveState.red) badges.push('<i class="player-badge player-badge-red" aria-hidden="true" title="Cartão vermelho"></i>');
      else if (liveState.yellow) pushYellow(liveState.yellow, 'Cartão amarelo nesta partida');
      if (liveState.injured) badges.push('<i class="player-badge player-badge-injury severe" aria-hidden="true" title="Lesionado"></i>');
      else if (liveState.playThroughRisk) badges.push('<i class="player-badge player-badge-injury mild" aria-hidden="true" title="Incômodo físico"></i>');
    } else {
      const discipline = player.discipline || {};
      const leagueKey = userLeagueDisciplineKey?.() || 'LEAGUE:A';
      const compKeys = disciplineBadgeCompetitionKeys?.(discipline, { leagueKey, includeCup: true }) || [leagueKey];
      compKeys.forEach(key => {
        const count = getYellowAccumulation?.(discipline, key) || 0;
        if (count > 0) pushYellow(count, `${count}/${limit} amarelos · ${competitionLabel?.(key) || key}`);
      });
      const suspensions = activeSuspensions?.(discipline) || [];
      if (suspensions.length) {
        const summary = suspensions
          .map(entry => `${entry.gamesRemaining} jogo${entry.gamesRemaining === 1 ? '' : 's'} · ${competitionLabel?.(entry.competitionKey) || entry.competitionKey}`)
          .join('; ');
        badges.push(`<i class="player-badge player-badge-suspended" aria-hidden="true" title="Suspenso: ${summary}"></i>`);
      }
      // Histórico de vermelho sem suspensão ativa não vira badge — evita parecer elegível/indisponível.
      const injury = player.injury;
      if (injury && (injuryInAcutePhase(injury) || injuryInRestrictedPhase(injury))) {
        const grade = injury.grade ?? (injury.severity === 'Grave' ? 3 : injury.severity === 'Mediana' ? 2 : 1);
        const severity = injury.severity || injurySeverityLabel(grade);
        const tone = grade >= 3 ? 'severe' : grade === 2 ? 'moderate' : 'mild';
        badges.push(`<i class="player-badge player-badge-injury ${tone}" aria-hidden="true" title="Lesão ${severity}"></i>`);
      }
    }
    return badges.length ? `<span class="player-status-badges">${badges.join('')}</span>` : '';
  };

  const playerNameCell = (name, player, { prefix = '', liveState = null } = {}) =>
    `<b class="player-name-cell">${prefix ? `<span class="player-name-prefix">${prefix}</span>` : ''}<span class="player-name-text">${name}</span>${playerStatusBadges(player, liveState)}</b>`;

  return { playerNameCell, playerStatusBadges };
}
