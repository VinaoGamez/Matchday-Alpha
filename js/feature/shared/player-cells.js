import { clamp } from '../../ui/dom.js';

/** Campo vazio em tabelas de atributos. */
export const outfield = value => value || '—';

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
      } else if (Number(discipline.redCards) > 0) {
        badges.push('<i class="player-badge player-badge-red" aria-hidden="true" title="Histórico de expulsão"></i>');
      }
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

let cssInjected = false;

export function injectPlayerStatusCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const playerStatusCss = document.createElement('style');
  playerStatusCss.textContent =
    '.player-name-cell{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700}.player-name-prefix,.starter-number{color:#63d9ff;font-weight:700;flex-shrink:0}.player-name-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}.player-status-badges{display:inline-flex;align-items:center;gap:3px;flex-shrink:0}.player-badge{display:inline-block;flex:none}.player-badge-yellow{width:7px;height:10px;border-radius:1px;background:linear-gradient(180deg,#ffe866,#ffc933);border:1px solid #a67c00;box-shadow:0 1px 2px #0006}.player-badge-red{width:7px;height:10px;border-radius:1px;background:linear-gradient(180deg,#ff7a7a,#e31b1b);border:1px solid #8b1010;box-shadow:0 1px 2px #0006}.player-badge-suspended{width:10px;height:10px;border-radius:50%;border:1px solid #ff8993;background:#3a1519;box-shadow:inset 0 0 0 1px #ff637044}.player-badge-suspended:after{content:"";display:block;width:8px;height:1.5px;margin:3px auto;background:#ff8993;transform:rotate(-35deg)}.player-badge-injury{width:12px;height:12px;border-radius:50%;position:relative;color:#ffd06b;border:1px solid currentColor;background:#2a2418}.player-badge-injury.moderate{color:#ff9b3d;background:#2a1f14}.player-badge-injury.severe{color:#ff6370;background:#3a1519}.player-badge-injury:before,.player-badge-injury:after{content:"";position:absolute;background:currentColor;border-radius:1px}.player-badge-injury:before{width:6px;height:1.5px;top:50%;left:50%;transform:translate(-50%,-50%)}.player-badge-injury:after{width:1.5px;height:6px;top:50%;left:50%;transform:translate(-50%,-50%)}#squad .player-row>span:first-child .player-name-cell{width:100%}.substitution-player-row .sub-name .player-name-cell{display:inline-flex;max-width:100%;font-size:9px;font-weight:400}.analysis-player .player-name-cell,.live-opponent-player .player-name-cell{display:flex;width:100%}#tactics .tactic-player-row .player-name-cell{width:100%}';
  document.head.append(playerStatusCss);
}
