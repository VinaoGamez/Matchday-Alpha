import { clamp } from '../../ui/dom.js';
import { resolvePlayerId } from '../../engine/player-identity.js';
import { isPenaltySavingSpecialist, isSetPieceSpecialist, setPieceSpecialistTitle, isCraque, isDestaque } from '../../engine/player-generation.js';

/** Campo vazio em tabelas de atributos. */
export const outfield = value => value || '—';

/** Barra de cansaço padrão para tabelas e listagens. */
export const fatigueCell = player => {
  const fatigue = Number.isFinite(Number(player?.fatigue)) ? Number(player.fatigue) : 100;
  return `<span class="table-fatigue"><i><b style="width:${clamp(fatigue, 0, 100)}%"></b></i>${Math.round(fatigue)}%</span>`;
};

const hasMatchOverlay = liveState =>
  !!liveState &&
  !!(liveState.red || liveState.yellow || liveState.injured || liveState.playThroughRisk);

/**
 * Badges de status (cartões, lesão, suspensão) para células de jogador.
 * Temporada = acumulado por competição.
 * Pré-jogo / pausa: só a competição do jogo (foco).
 * Elenco: todas as competições com grupos separados.
 * liveState acrescenta cartão/lesão desta partida — não esconde o histórico do foco.
 */
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function formatInjuryReturnDate(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  return `${day} ${month}`;
}

function projectInjuryReturnDate(injury, careerDate, injuryInRestrictedPhase) {
  if (!injury || !careerDate) return null;
  const base = new Date(careerDate);
  base.setHours(12, 0, 0, 0);
  if (injuryInRestrictedPhase?.(injury)) {
    const rtp = injury.returnToPlay;
    const daysLeft = Math.max(0, (rtp?.daysUntilFullFitness ?? 0) - (rtp?.daysCompleted ?? 0));
    if (daysLeft <= 0) return null;
    const projected = new Date(base);
    projected.setDate(projected.getDate() + daysLeft);
    return projected;
  }
  const days = Number(injury.daysRemaining) || 0;
  if (days <= 0) return null;
  const projected = new Date(base);
  projected.setDate(projected.getDate() + days);
  return projected;
}

export function createPlayerCells({
  injuryInAcutePhase,
  injuryInRestrictedPhase,
  injurySeverityLabel,
  injuryAvailabilityLabel,
  getCareerCalendarDate,
  YELLOW_SUSPENSION_LIMIT,
  getYellowAccumulation,
  activeSuspensions,
  disciplineBadgeCompetitionKeys,
  competitionLabel,
  userLeagueDisciplineKey,
  getFocusCompetitionKey,
}) {
  // 3 amarelos = suspensão; pip ativo máx. = 2.
  const maxActiveYellowPips = Math.max(0, (YELLOW_SUSPENSION_LIMIT || 3) - 1);

  const focusKey = () =>
    (typeof getFocusCompetitionKey === 'function' && getFocusCompetitionKey()) ||
    userLeagueDisciplineKey?.() ||
    'LEAGUE:A';

  const yellowPips = (count, title) =>
    Array.from({ length: clamp(Number(count) || 0, 0, maxActiveYellowPips) }, () =>
      `<i class="player-badge player-badge-yellow" aria-hidden="true" title="${title}"></i>`,
    ).join('');

  const seasonYellowHtml = (player, { allCompetitions = false } = {}) => {
    const discipline = player?.discipline || {};
    const leagueKey = userLeagueDisciplineKey?.() || 'LEAGUE:A';
    const preferred = focusKey();
    const compKeys = disciplineBadgeCompetitionKeys?.(discipline, { leagueKey, includeCup: true }) || [];
    const ordered = [
      ...compKeys.filter(key => key === preferred),
      ...compKeys.filter(key => key !== preferred),
    ];
    const visible = allCompetitions
      ? ordered
      : ordered.filter(key => key === preferred).length
        ? ordered.filter(key => key === preferred)
        : ordered.slice(0, 1);
    return visible
      .map(key => {
        const count = getYellowAccumulation?.(discipline, key) || 0;
        if (count <= 0) return '';
        const label = competitionLabel?.(key) || key;
        const title = `${Math.min(count, maxActiveYellowPips)}/${YELLOW_SUSPENSION_LIMIT} amarelos · ${label}`;
        return `<span class="player-yellow-group" title="${title}">${yellowPips(count, title)}</span>`;
      })
      .join('');
  };

  const playerStatusBadges = (player, liveState = null, options = {}) => {
    const { allCompetitions = false } = options;
    const parts = [];
    const seasonYellows = seasonYellowHtml(player, { allCompetitions });
    if (seasonYellows) parts.push(seasonYellows);

    const discipline = player?.discipline || {};
    // Igual aos amarelos: no jogo/preparação só a competição em foco; elenco pode ver todas.
    const suspensions = allCompetitions
      ? activeSuspensions?.(discipline) || []
      : activeSuspensions?.(discipline, focusKey()) || [];
    if (suspensions.length) {
      const summary = suspensions
        .map(
          entry =>
            `${entry.gamesRemaining} jogo${entry.gamesRemaining === 1 ? '' : 's'} · ${competitionLabel?.(entry.competitionKey) || entry.competitionKey}`,
        )
        .join('; ');
      parts.push(
        `<i class="player-badge player-badge-suspended" aria-hidden="true" title="Suspenso: ${summary}"></i>`,
      );
    }

    const injury = player?.injury;
    if (injury && (injuryInAcutePhase(injury) || injuryInRestrictedPhase(injury))) {
      const grade = injury.grade ?? (injury.severity === 'Grave' ? 3 : injury.severity === 'Mediana' ? 2 : 1);
      const severity = injury.severity || injurySeverityLabel(grade);
      const tone = grade >= 3 ? 'severe' : grade === 2 ? 'moderate' : 'mild';
      const legend = buildInjuryLegend(injury);
      parts.push(
        `<i class="player-badge player-badge-injury ${tone}" aria-hidden="true" title="${escapeAttr(legend || `Lesão ${severity}`)}"></i>`,
      );
    }

    if (hasMatchOverlay(liveState)) {
      if (liveState.red) {
        parts.push('<i class="player-badge player-badge-red" aria-hidden="true" title="Vermelho nesta partida"></i>');
      } else if (liveState.yellow) {
        const title = 'Amarelo nesta partida';
        // Na partida: no máx. 1 pip de overlay (já advertido hoje).
        parts.push(
          `<i class="player-badge player-badge-yellow player-badge-yellow-match" aria-hidden="true" title="${title}"></i>`,
        );
      }
      if (liveState.injured) {
        parts.push(
          '<i class="player-badge player-badge-injury severe" aria-hidden="true" title="Lesionado nesta partida"></i>',
        );
      } else if (liveState.playThroughRisk) {
        parts.push(
          '<i class="player-badge player-badge-injury mild" aria-hidden="true" title="Incômodo físico nesta partida"></i>',
        );
      }
    }

    // Empréstimo fica em linha própria (playerLoanLine) — não compete com o nome.
    return parts.length ? `<span class="player-status-badges">${parts.join('')}</span>` : '';
  };

  const buildInjuryLegend = injury => {
    if (!injury) return '';
    const name = String(injury.name || '').trim();
    const label = name && !/^les[aã]o (leve|mediana|grave)$/i.test(name)
      ? name
      : injuryAvailabilityLabel?.(injury) || name || 'Lesão';
    const careerDate = getCareerCalendarDate?.();
    const returnDate = projectInjuryReturnDate(injury, careerDate, injuryInRestrictedPhase);
    const returnText = returnDate
      ? formatInjuryReturnDate(returnDate)
      : injury.daysRemaining
        ? `${injury.daysRemaining} ${injury.daysRemaining === 1 ? 'dia' : 'dias'}`
        : '';
    return returnText ? `${label} · volta ${returnText}` : label;
  };

  /** Legenda de lesão — linha abaixo do nome (Elenco / Táticas). */
  const playerInjuryLine = player => {
    const injury = player?.injury;
    if (!injury || (!injuryInAcutePhase(injury) && !injuryInRestrictedPhase(injury))) return '';
    const legend = buildInjuryLegend(injury);
    if (!legend) return '';
    return `<span class="player-injury-line"><small class="player-injury-tag" title="${escapeAttr(legend)}">${legend}</small></span>`;
  };

  /** Tags EMPR. + clube — só Elenco (showLoan). Linha abaixo do nome. */
  const playerLoanLine = player => {
    if (!player?.onLoan) return '';
    const from = player.loanFrom ? ` de ${player.loanFrom}` : '';
    const club = player.loanFrom
      ? `<small class="player-loan-tag player-loan-tag-club" title="Clube de origem">${player.loanFrom}</small>`
      : '';
    return `<span class="player-loan-line"><small class="player-loan-tag" title="Emprestado${from} até o fim da temporada">EMPR.</small>${club}</span>`;
  };

  const playerStarBadge = player => {
    if (isCraque(player)) {
      const title = 'Craque · estrela dourada';
      return `<span class="player-specialist-star player-specialist-star--gold" title="${title}" aria-label="${title}">★</span>`;
    }
    if (isDestaque(player)) {
      const title = 'Destaque · estrela prata';
      return `<span class="player-specialist-star player-specialist-star--silver" title="${title}" aria-label="${title}">★</span>`;
    }
    if (isSetPieceSpecialist(player)) {
      const title = setPieceSpecialistTitle(player);
      return `<span class="player-specialist-star" title="${title}" aria-label="${title}">★</span>`;
    }
    if (isPenaltySavingSpecialist(player)) {
      const title = 'Especialista em defesa de pênaltis';
      return `<span class="player-specialist-star" title="${title}" aria-label="${title}">★</span>`;
    }
    return '';
  };

  const playerNameCell = (
    name,
    player,
    { prefix = '', liveState = null, allCompetitions = false, showLoan = false, openCard = false, clubName = '' } = {},
  ) => {
    const loanLine = showLoan ? playerLoanLine(player) : '';
    const injuryLine = playerInjuryLine(player);
    const badges = playerStatusBadges(player, liveState, { allCompetitions, showLoan: false });
    const playerId = resolvePlayerId(player) || '';
    const cellMods = [loanLine && 'has-loan', injuryLine && 'has-injury'].filter(Boolean).join(' ');
    const cardAttrs =
      openCard && playerId
        ? ` role="button" tabindex="0" class="player-name-text is-card-trigger" data-open-player-card data-player-id="${escapeAttr(playerId)}"${clubName ? ` data-player-club="${escapeAttr(clubName)}"` : ''}`
        : ' class="player-name-text"';
    return `<b class="player-name-cell${cellMods ? ` ${cellMods}` : ''}"><span class="player-name-line">${prefix ? `<span class="player-name-prefix">${prefix}</span>` : ''}<span${cardAttrs}>${name}</span>${playerStarBadge(player)}${badges}</span>${injuryLine}${loanLine}</b>`;
  };

  return { playerNameCell, playerStatusBadges, playerInjuryLine };
}
