import { MODULE_VERSIONS } from '../../core/constants.js';
import { clamp, on, onClick } from '../../ui/dom.js';

const TACTIC_SLIDER_KEYS = ['mentality', 'possession', 'press', 'offsideLine'];
const DEFAULT_USER_TACTICS = { mentality: 50, possession: 50, press: 50, offsideLine: 50 };

import { TACTIC_READOUT as tacticReadout } from './tactical-confrontation.js';

const tacticControls = {
  mentality: [
    ['#mentalitySlider', '#mentalityReadout'],
    ['#pauseMentalitySlider', '#pauseMentalityReadout'],
  ],
  possession: [
    ['#possessionSlider', '#possessionReadout'],
    ['#pausePossessionSlider', '#pausePossessionReadout'],
  ],
  press: [
    ['#pressSlider', '#pressReadout'],
    ['#pausePressSlider', '#pausePressReadout'],
  ],
  offsideLine: [
    ['#offsideLineSlider', '#offsideLineReadout'],
    ['#pauseOffsideLineSlider', '#pauseOffsideLineReadout'],
  ],
};

/**
 * Táticas — formação, sliders, quadro tático e substituições.
 */
export function createTacticsFeature(deps) {
  const {
    $,
    $$,
    playerNameCell,
    getFormations,
    getFormationRoles,
    getFormationNotes,
    getUserClub,
    getClubs,
    getHasCareer,
    getSquad,
    getFormation,
    setFormation,
    getPositionAssignments,
    setPositionAssignments,
    playerUnavailable,
    playerStarterBlocked,
    matchPlayerStat,
    roleAttributeScore,
    lineupForRoles,
    autoSelectUserLineup,
    suggestFormationLineup,
    renderRoster,
    renderStats,
    log,
    getLiveState,
    commitLiveSubstitution,
  } = deps;

  const freshStarterCard = () => ({ yellow: 0, red: false, dismissal: null, injured: false, playThroughRisk: false });

  let tacticalValues = { ...DEFAULT_USER_TACTICS };
  let persistSeason = () => {};
  let pendingFormationSuggestion = null;

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const normalizeTacticSlider = value => {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(Math.round(number), 0, 100) : null;
  };

  const normalizeUserTactics = source => {
    if (!source || typeof source !== 'object') return { ...DEFAULT_USER_TACTICS };
    const next = { ...DEFAULT_USER_TACTICS };
    TACTIC_SLIDER_KEYS.forEach(key => {
      const value = normalizeTacticSlider(source[key]);
      if (value !== null) next[key] = value;
    });
    return next;
  };

  const loadTacticalValues = saved => {
    tacticalValues = normalizeUserTactics(saved);
    syncTactics();
  };

  const getTacticalValues = () => ({ ...tacticalValues });

  const tacticFor = side => {
    if (side === 'home') {
      return {
        formation: getFormation(),
        mentality: tacticalValues.mentality,
        possession: tacticalValues.possession,
        press: tacticalValues.press,
        offsideLine: tacticalValues.offsideLine,
      };
    }
    return deps.tacticForAway(side);
  };

  const syncTactics = () =>
    Object.entries(tacticControls).forEach(([key, controls]) =>
      controls.forEach(([sliderId, readoutId]) => {
        const slider = $(sliderId);
        const readout = $(readoutId);
        if (!slider || !readout) return;
        slider.value = tacticalValues[key];
        slider.style.setProperty('--tactic-value', `${tacticalValues[key]}%`);
        readout.textContent = `${tacticReadout[key](tacticalValues[key])} · ${tacticalValues[key]}%`;
      })
    );

  const starters = () => getSquad().slice(0, 11);

  /** Ordem de leitura por função (defesa → ataque). */
  const POS_SORT_ORDER = { GOL: 0, ZAG: 1, LAT: 2, VOL: 3, MC: 4, MEI: 5, PE: 6, PD: 7, ATA: 8 };
  const posSortKey = role => POS_SORT_ORDER[role] ?? 99;
  const sortPlayersByRole = (players, roleOf = player => player.pos) =>
    [...players].sort(
      (a, b) =>
        posSortKey(roleOf(a)) - posSortKey(roleOf(b)) ||
        (b.overall || 0) - (a.overall || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'),
    );

  const positionMismatch = (player, expectedRole) => {
    if (!expectedRole || player.pos === expectedRole) return 0;
    return 1;
  };

  const boardPlayerLabel = (name, max = 10) => {
    const parts = name.split(' ').filter(Boolean);
    const short = parts.length > 1 ? parts[parts.length - 1] : parts[0] || name;
    return short.length > max ? `${short.slice(0, max - 1)}…` : short;
  };

  const boardPlayerBadges = ({ yellow, injured, atRisk }) => {
    const badges = [];
    if (yellow) badges.push('<em class="board-badge board-badge-yellow" aria-hidden="true"></em>');
    if (injured) badges.push('<em class="board-badge board-badge-injury" aria-hidden="true"></em>');
    else if (atRisk) badges.push('<em class="board-badge board-badge-risk" aria-hidden="true"></em>');
    return badges.join('');
  };

  const ensureBoardLegend = board => {
    if (!board) return;
    let stack = board.closest('.board-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'board-stack';
      board.parentNode?.insertBefore(stack, board);
      stack.appendChild(board);
    }
    const existing = stack.querySelector('.board-legend') || board.querySelector('.board-legend');
    if (existing) {
      if (existing.parentElement !== stack) stack.appendChild(existing);
      existing.querySelectorAll('span').forEach(span => {
        if (span.textContent.trim() === 'Vaga') {
          const dot = span.querySelector('i');
          span.textContent = '';
          if (dot) span.appendChild(dot);
          span.append('Expulso');
        }
      });
      return;
    }
    stack.insertAdjacentHTML(
      'beforeend',
      '<div class="board-legend" aria-hidden="true"><span><i class="board-legend-card board-legend-yellow"></i>Amarelo</span><span><i class="board-legend-dot board-legend-injury"></i>Lesão</span><span><i class="board-legend-dot board-legend-risk"></i>Incômodo</span><span><i class="board-legend-dot board-legend-vacant"></i>Expulso</span></div>'
    );
  };

  const enableBoardRepositioning = (board, selector) => {
    if (!board) return;
    const live = getLiveState();
    const squad = getSquad();
    const draggables = [...board.querySelectorAll(selector)];
    const targets = [...board.querySelectorAll('[data-slot]')];
    draggables.forEach(marker => {
      marker.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', marker.dataset.slot);
        event.dataTransfer.effectAllowed = 'move';
        marker.classList.add('dragging');
      });
      marker.addEventListener('dragend', () =>
        board.querySelectorAll('.drop-target,.dragging').forEach(item => item.classList.remove('drop-target', 'dragging'))
      );
    });
    targets.forEach(marker => {
      marker.addEventListener('dragover', event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        marker.classList.add('drop-target');
      });
      marker.addEventListener('dragleave', () => marker.classList.remove('drop-target'));
      marker.addEventListener('drop', event => {
        event.preventDefault();
        marker.classList.remove('drop-target');
        const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
        const targetIndex = Number(marker.dataset.slot);
        const { cards, matchStarted, positionAssignments, activePreparationTitle } = live;
        if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex === targetIndex || cards?.home?.[sourceIndex]?.red) return;
        const moved = squad[sourceIndex];
        const exchanged = squad[targetIndex];
        const targetWasVacant = !!cards?.home?.[targetIndex]?.red;
        [squad[sourceIndex], squad[targetIndex]] = [exchanged, moved];
        if (cards?.home) [cards.home[sourceIndex], cards.home[targetIndex]] = [cards.home[targetIndex], cards.home[sourceIndex]];
        if (matchStarted) {
          log(
            targetWasVacant
              ? `${moved.name} ocupa a posição de ${positionAssignments[targetIndex]}; a vaga da expulsão passa para ${positionAssignments[sourceIndex]}.`
              : `${moved.name} troca de posição com ${exchanged.name}: ${positionAssignments[targetIndex]} e ${positionAssignments[sourceIndex]}.`,
            'substitution',
            'home',
          );
        }
        renderTacticRoster();
        draw();
        if (matchStarted) {
          renderSubstitutionControls();
          renderStats();
        }
        if (getHasCareer()) persistSeason();
      });
    });
  };

  const setTacticsPitchHighlight = slot => {
    const pitch = $('#pitchPlayers');
    if (!pitch) return;
    pitch.querySelectorAll('.pitch-player').forEach(el => {
      const match = slot != null && Number(el.dataset.slot) === Number(slot);
      el.classList.toggle('sub-highlight', match);
    });
  };

  const renderTacticRoster = () => {
    const squad = getSquad();
    const playerRow = (player, index, starter) =>
      `<div class="tactic-player-row ${playerUnavailable(player) ? 'unavailable' : 'repositionable'}" data-slot="${index}" draggable="${!playerUnavailable(player)}" tabindex="0">${playerNameCell(player.name, player, { prefix: starter ? `${index + 1}. ` : '' })}<span>${player.pos}</span><span>${player.overall}</span><span class="tactic-fatigue"><i><b style="width:${clamp(player.fatigue, 0, 100)}%"></b></i>${Math.round(player.fatigue)}%</span></div>`;
    $('#tacticStarters').innerHTML = squad.slice(0, 11).map((player, index) => playerRow(player, index, true)).join('');
    $('#tacticBench').innerHTML = squad.slice(11).map((player, index) => playerRow(player, index + 11, false)).join('');
    $$('.tactic-player-row.repositionable').forEach(row => {
      row.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', row.dataset.slot);
        event.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
    });
    setTacticsPitchHighlight(null);
  };

  const selectedSubstitutionOutSlot = () => {
    const raw = $('#substitutionOut')?.value;
    if (raw === '' || raw == null) return null;
    const slot = Number(raw);
    return Number.isFinite(slot) ? slot : null;
  };

  /** Camisa 1–99; fallback = posição no campo se o save ainda tiver seed antigo. */
  const boardJerseyNumber = (player, slotIndex) => {
    const n = Number(player?.number);
    if (Number.isFinite(n) && n >= 1 && n <= 99) return n;
    return slotIndex + 1;
  };

  const drawBoard = () => {
    const live = getLiveState();
    const { cards, activePreparationTitle } = live;
    if (!cards) return;
    const formation = getFormation();
    const formations = getFormations();
    const squad = getSquad();
    const highlightSlot = selectedSubstitutionOutSlot();
    const board = $('#pausePitchPlayers')?.closest('.tactical-board');
    ensureBoardLegend(board);
    $('#pausePitchPlayers').innerHTML = formations[formation]
      .map((p, i) => {
        const state = cards.home[i];
        const vacant = state.red;
        const injured = state.injured;
        const atRisk = state.playThroughRisk;
        const displayTop = p[1] === 91 ? 90 : p[1];
        const energy = clamp(squad[i].fatigue, 0, 100);
        const canReposition = !vacant;
        const highlighted = !vacant && highlightSlot === i;
        const label = vacant ? (activePreparationTitle === 'CARTÃO VERMELHO' ? 'EXPULSO' : 'VAGO') : boardPlayerLabel(squad[i].name);
        const title = vacant
          ? 'Arraste um titular para esta vaga'
          : `${squad[i].name}${state.yellow ? ' · Advertido' : ''}${injured ? ' · Lesionado' : atRisk ? ' · Incômodo físico' : ''} · ${Math.round(energy)}% energia`;
        return `<div class="board-player ${vacant ? 'vacant vacancy-target' : ''} ${canReposition ? 'repositionable' : ''} ${highlighted ? 'sub-highlight' : ''}" data-slot="${i}" draggable="${canReposition}" title="${title}" style="left:${p[0]}%;top:${displayTop}%"><i style="--energy:${energy}%"><span>${vacant ? '×' : boardJerseyNumber(squad[i], i)}</span></i>${boardPlayerBadges({ yellow: state.yellow, injured: state.injured, atRisk: state.playThroughRisk })}<small>${label}</small></div>`;
      })
      .join('');
    $$('#pauseFormations button').forEach(b => b.classList.toggle('selected', b.textContent === formation));
    enableBoardRepositioning($('#pausePitchPlayers'), '.board-player.repositionable');
  };

  const draw = () => {
    const formation = getFormation();
    const formations = getFormations();
    const formationNotes = getFormationNotes();
    const squad = getSquad();
    $('#pitchPlayers').innerHTML = formations[formation]
      .map(
        (p, i) =>
          `<div class="pitch-player repositionable" data-slot="${i}" draggable="true" style="left:${p[0]}%;top:${p[1] === 91 ? 90 : p[1]}%"><i style="--energy:${clamp(squad[i].fatigue, 0, 100)}%"><span>${boardJerseyNumber(squad[i], i)}</span></i><small>${squad[i].name}</small></div>`
      )
      .join('');
    $('#formationDescription').textContent = `${formationNotes[formation]} Titulares sugeridos por encaixe, atributos e condição física.`;
    $$('#formations button').forEach(b => b.classList.toggle('selected', b.textContent === formation));
    renderTacticRoster();
    deps.onTacticsChanged?.();
    enableBoardRepositioning($('#pitchPlayers'), '.pitch-player.repositionable');
    if (!$('#pausePanel').classList.contains('hidden')) drawBoard();
  };

  const applyFormationChoice = (nextFormation, { liveDuringMatch = false, withBoard = false } = {}) => {
    const live = getLiveState();
    const formationRoles = getFormationRoles();
    const userClub = getUserClub();
    const clubs = getClubs();
    setFormation(nextFormation);
    const isLive = liveDuringMatch
      ? live.matchStarted && !live.matchFinished && !live.preMatchPreparation
      : live.matchStarted && !live.preMatchPreparation;
    setPositionAssignments([...(formationRoles[nextFormation] || formationRoles['4-3-3'])]);
    clubs[userClub].formation = nextFormation;
    if (isLive) {
      draw();
      if (withBoard) drawBoard();
      renderSubstitutionControls();
      renderStats();
      suggestFormationLineup(nextFormation, live.cards?.home || null);
    } else {
      autoSelectUserLineup(nextFormation, { liveCards: live.cards?.home || null });
      renderRoster();
      draw();
      if (withBoard) {
        drawBoard();
        renderSubstitutionControls();
      }
    }
    if (getHasCareer()) persistSeason();
  };

  const formationGridClick = (event, options) => {
    const button = event.target.closest('button');
    if (!button) return;
    applyFormationChoice(button.textContent, options);
  };

  const suggestTacticPlan = () => {
    const squad = getSquad();
    const formationRoles = getFormationRoles();
    const formations = getFormations();
    const formation = getFormation();
    const eligible = squad.filter(player => !playerUnavailable(player));
    const starterPool = eligible.filter(player => !playerStarterBlocked(player));
    const pool = starterPool.length >= 11 ? starterPool : eligible;
    const scoreFormationFit = form => {
      const roles = formationRoles[form];
      const assignment = lineupForRoles(pool, roles);
      return roles.reduce((sum, _, slot) => {
        const player = assignment.get(slot);
        return sum + (player ? roleAttributeScore(player, roles[slot]) : -50);
      }, 0);
    };
    const bestFormation = Object.keys(formations).sort((a, b) => scoreFormationFit(b) - scoreFormationFit(a))[0] || formation;
    const samplePool = lineupForRoles(pool, formationRoles[bestFormation] || formationRoles['4-3-3']);
    const sampleLineup = [...(formationRoles[bestFormation] || formationRoles['4-3-3'])].map((_, slot) => samplePool.get(slot)).filter(Boolean);
    const avgStat = (players, key) => players.reduce((sum, player) => sum + matchPlayerStat(player, key), 0) / Math.max(1, players.length);
    const avgFatigue = sampleLineup.reduce((sum, player) => sum + player.fatigue, 0) / Math.max(1, sampleLineup.length);
    const passingEdge =
      avgStat(sampleLineup, 'passing') + avgStat(sampleLineup, 'playmaking') - avgStat(sampleLineup, 'finishing') - avgStat(sampleLineup, 'speed') * 0.5;
    const attackEdge =
      avgStat(sampleLineup, 'finishing') +
      avgStat(sampleLineup, 'dribble') +
      avgStat(sampleLineup, 'speed') * 0.5 -
      avgStat(sampleLineup, 'marking') -
      avgStat(sampleLineup, 'tackling');
    const defenseEdge =
      avgStat(sampleLineup, 'marking') +
      avgStat(sampleLineup, 'tackling') -
      avgStat(sampleLineup, 'finishing') -
      avgStat(sampleLineup, 'dribble') * 0.5;
    let mentality = 52;
    let possession = 50;
    let press = 54;
    let offsideLine = 50;
    if (attackEdge > 6) mentality = 66;
    else if (defenseEdge > 6) mentality = 38;
    if (passingEdge > 8) {
      possession = 72;
      press = Math.max(40, press - 6);
    } else if (passingEdge < -6) {
      possession = 32;
      mentality = Math.min(88, mentality + 6);
    }
    if (avgFatigue < 62) {
      press = Math.max(30, press - 10);
      mentality = Math.max(25, mentality - 8);
    }
    if (defenseEdge > attackEdge + 4) offsideLine = 42;
    else if (attackEdge > defenseEdge + 4) offsideLine = 58;
    return {
      formation: bestFormation,
      mentality: clamp(Math.round(mentality), 0, 100),
      possession: clamp(Math.round(possession), 0, 100),
      press: clamp(Math.round(press), 0, 100),
      offsideLine: clamp(Math.round(offsideLine), 0, 100),
    };
  };

  const applyTacticSuggestion = () => {
    const live = getLiveState();
    const formationRoles = getFormationRoles();
    const formationNotes = getFormationNotes();
    const userClub = getUserClub();
    const clubs = getClubs();
    const plan = suggestTacticPlan();
    tacticalValues = { mentality: plan.mentality, possession: plan.possession, press: plan.press, offsideLine: plan.offsideLine };
    syncTactics();
    setFormation(plan.formation);
    setPositionAssignments([...(formationRoles[plan.formation] || formationRoles['4-3-3'])]);
    clubs[userClub].formation = plan.formation;
    const inMatchContext = live.matchStarted && !live.matchFinished;
    const pausePanelOpen = !$('#pausePanel').classList.contains('hidden');
    const isLive = inMatchContext && !live.preMatchPreparation;
    if (isLive && live.cards?.home) {
      autoSelectUserLineup(plan.formation, { restrictToField: true, liveCards: live.cards.home });
      drawBoard();
      renderSubstitutionControls();
      renderStats();
    } else {
      autoSelectUserLineup(plan.formation, { liveCards: live.cards?.home || null });
      if (inMatchContext && pausePanelOpen) {
        drawBoard();
        renderSubstitutionControls();
      }
    }
    renderRoster();
    draw();
    deps.onTacticsChanged?.();
    $('#formationDescription').textContent = `Sugestão aplicada: ${formationNotes[plan.formation]} Escalação e sliders ajustados com base no seu elenco.`;
    if (getHasCareer()) persistSeason();
  };

  const substitutionPlayerRow = (player, attributes, selected, liveState = null) =>
    `<button type="button" class="substitution-player-row ${selected ? 'selected' : ''}" ${attributes} style="display:grid!important;width:100%!important;padding:7px 8px!important;border:0!important;border-top:1px solid #234b55!important;border-radius:0!important;background:${selected ? '#173b48' : '#091820'}!important;color:#edf8f5!important;box-shadow:${selected ? 'inset 3px 0 0 #b6ff38' : 'none'}!important;transform:none!important"><span class="sub-pos">${player.pos}</span><span class="sub-ovr">${player.overall}</span><span class="sub-name">${playerNameCell(player.name, player, { liveState })}</span><span class="sub-fatigue"><i><b style="width:${clamp(player.fatigue, 0, 100)}%"></b></i><em>${Math.round(player.fatigue)}%</em></span></button>`;

  const renderSubstitutionControls = () => {
    const live = getLiveState();
    const squad = getSquad();
    const positionAssignments = getPositionAssignments();
    const { cards, preMatchPreparation, substitutions, substitutedOut, freeSubEdits } = live;
    const outgoing = $('#substitutionOut');
    const incoming = $('#substitutionIn');
    if (!outgoing || !incoming) return;
    const previousOut = outgoing.value;
    const previousIn = incoming.value;
    const lineupUnlocked = !!(preMatchPreparation || freeSubEdits);
    const onField = starters()
      .map((player, index) => ({ player, index }))
      .filter(({ index }) => !cards?.home?.[index]?.red)
      .sort(
        (a, b) =>
          posSortKey(positionAssignments[a.index] || a.player.pos) -
            posSortKey(positionAssignments[b.index] || b.player.pos) ||
          a.index - b.index,
      );
    outgoing.innerHTML =
      `<option value="">Selecione o titular…</option>` +
      onField
        .map(
          ({ player, index }) =>
            `<option value="${index}">${player.name} · ${positionAssignments[index] || player.pos} · OVR ${player.overall}</option>`,
        )
        .join('');
    if (previousOut && [...outgoing.options].some(option => option.value === previousOut)) outgoing.value = previousOut;
    else outgoing.value = '';
    const outSelected = outgoing.value !== '';
    const expectedRole = outSelected
      ? positionAssignments[Number(outgoing.value)] || starters()[Number(outgoing.value)]?.pos
      : null;
    // Lista completa de reservas. Quem já saiu de forma definitiva (substitutedOut) continua bloqueado;
    // durante pré-jogo/pausa as trocas ainda não entram em substitutedOut, então dá para mudar de ideia.
    const availableBench = sortPlayersByRole(
      squad.slice(11).filter(player => !substitutedOut?.has(player.name) && !playerUnavailable(player)),
    );
    incoming.innerHTML = availableBench.length
      ? `<option value="">Selecione o reserva…</option>` +
        availableBench
          .map(
            player =>
              `<option value="${player.name}">${player.name} · ${player.pos} · OVR ${player.overall} · ${Math.round(player.fatigue)}% cansaço</option>`,
          )
          .join('')
      : '<option value="">Sem reservas disponíveis</option>';
    if (previousIn && [...incoming.options].some(option => option.value === previousIn)) incoming.value = previousIn;
    else if (![...incoming.options].some(option => option.value === previousIn)) incoming.value = '';
    const inSelected = !!incoming.value;
    // Pré-jogo: só acumulado da temporada (igual ao Elenco). Em jogo/pausa: + overlay desta partida.
    const liveCardState = index => {
      if (preMatchPreparation) return null;
      const card = cards?.home?.[index];
      if (!card) return null;
      const overlay = {
        yellow: card.yellow ? 1 : 0,
        red: !!card.red,
        injured: !!card.injured,
        playThroughRisk: !!card.playThroughRisk,
      };
      return overlay.yellow || overlay.red || overlay.injured || overlay.playThroughRisk ? overlay : null;
    };
    $('#substitutionOutList').innerHTML = onField
      .map(({ player, index }) =>
        substitutionPlayerRow(
          player,
          `data-substitution-out="${index}"`,
          outSelected && String(index) === outgoing.value,
          liveCardState(index),
        ),
      )
      .join('');
    $('#substitutionInList').innerHTML = availableBench.length
      ? availableBench
          .map(player =>
            substitutionPlayerRow(
              player,
              `data-substitution-in="${squad.indexOf(player)}"`,
              inSelected && player.name === incoming.value,
              null,
            ),
          )
          .join('')
      : '<small class="substitution-empty">Sem reservas disponíveis.</small>';
    $('#substitutionCounter').textContent = `${substitutions || 0}/5`;
    const atSubLimit = !lineupUnlocked && (substitutions || 0) >= 5;
    $('#makeSubstitution').disabled = atSubLimit || !outSelected || !inSelected || !onField.length || !availableBench.length;
    const selectedIncoming = availableBench.find(player => player.name === incoming.value);
    const fit = selectedIncoming && expectedRole ? positionMismatch(selectedIncoming, expectedRole) : 0;
    if (atSubLimit) {
      $('#substitutionHint').textContent = 'Limite de cinco substituições atingido.';
    } else if (!outSelected || !inSelected) {
      $('#substitutionHint').textContent = lineupUnlocked
        ? 'Selecione o titular e o reserva para confirmar. Enquanto a partida não for retomada, você pode mudar de ideia.'
        : 'Selecione o titular e o reserva para confirmar a substituição.';
    } else if (expectedRole === 'GOL' && selectedIncoming?.pos !== 'GOL') {
      $('#substitutionHint').textContent = 'A vaga de goleiro só pode ser preenchida por um goleiro.';
      $('#makeSubstitution').disabled = true;
    } else if (preMatchPreparation || lineupUnlocked) {
      $('#substitutionHint').textContent = `Ajuste de escalação${fit ? ` · ${selectedIncoming?.pos} adaptado para ${expectedRole}` : ''}. Não trava o reserva até retomar a partida.`;
    } else if (fit) {
      $('#substitutionHint').textContent = `Entrará na vaga de ${expectedRole}: adaptação ${fit < 1 ? 'compatível' : 'fora de posição'}, com leve impacto coletivo.`;
    } else {
      $('#substitutionHint').textContent = `Vaga de ${expectedRole}: jogador na posição de origem.`;
    }
    if ($('#pausePitchPlayers') && !$('#pausePanel')?.classList.contains('hidden')) drawBoard();
  };

  const makeSubstitution = () => {
    const live = getLiveState();
    const squad = getSquad();
    const positionAssignments = getPositionAssignments();
    const { cards, matchStarted, preMatchPreparation, substitutions, liveDeferredInjuries, liveMinutesPlayed, freeSubEdits } =
      live;
    const userClub = getUserClub();
    const outRaw = $('#substitutionOut').value;
    const incomingName = $('#substitutionIn').value;
    const outIndex = Number(outRaw);
    const lineupUnlocked = !!(preMatchPreparation || freeSubEdits);
    if (!matchStarted || outRaw === '' || Number.isNaN(outIndex) || !incomingName) return;
    if (!lineupUnlocked && substitutions >= 5) return;
    if (cards.home[outIndex]?.red) return;
    const incomingIndex = squad.findIndex(player => player.name === incomingName);
    if (incomingIndex < 11 || playerUnavailable(squad[incomingIndex])) return;
    const outgoing = squad[outIndex];
    const incoming = squad[incomingIndex];
    const expectedRole = positionAssignments[outIndex];
    if (expectedRole === 'GOL' && incoming.pos !== 'GOL') return;
    const improvised = positionMismatch(incoming, expectedRole) > 0;
    const wasInjured = !!cards.home[outIndex]?.injured;
    const wasAtRisk = !!cards.home[outIndex]?.playThroughRisk;
    if (wasAtRisk) {
      const entry = liveDeferredInjuries.home.find(item => item.name === outgoing.name);
      if (entry) {
        entry.preemptiveSubstitution = true;
        entry.keptPlaying = false;
      }
    }
    liveMinutesPlayed.home.set(incoming.name, liveMinutesPlayed.home.get(incoming.name) ?? 0);
    [squad[outIndex], squad[incomingIndex]] = [incoming, outgoing];
    cards.home[outIndex] = freshStarterCard();
    $('#substitutionOut').value = '';
    $('#substitutionIn').value = '';
    if (lineupUnlocked) {
      // Pré-jogo / pausa: troca livre — reserva volta a ficar apto se mudar de ideia.
      renderRoster();
      renderTacticRoster?.();
      draw();
      drawBoard();
      renderSubstitutionControls();
      if (getHasCareer()) persistSeason();
      return;
    }
    commitLiveSubstitution?.(outgoing.name, { wasInjured, wasAtRisk });
    log(
      `Substituição no ${userClub}: sai ${outgoing.name}, entra ${incoming.name}${improvised ? ` (${incoming.pos} adaptado para ${expectedRole}).` : ''}.`,
      'substitution',
      'home',
    );
    renderRoster();
    renderTacticRoster();
    draw();
    drawBoard();
    renderSubstitutionControls();
    renderStats();
  };

  const closeFormationSuggestion = () => {
    $('#formationSuggestionModal').classList.add('hidden');
    pendingFormationSuggestion = null;
  };

  const injectDom = () => {
    const formations = getFormations();
    $('#formations').innerHTML = Object.keys(formations)
      .map(f => `<button type="button">${f}</button>`)
      .join('');
    $('#pauseFormations').innerHTML = Object.keys(formations)
      .map(f => `<button type="button">${f}</button>`)
      .join('');

    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="formationSuggestionModal" class="modal hidden"><div class="modal-card formation-suggestion-card"><button id="closeFormationSuggestion" class="close" type="button">×</button><label>SUGESTÃO TÁTICA</label><h2>Reorganizar os jogadores?</h2><p id="formationSuggestionText"></p><div id="formationSuggestionMoves" class="formation-suggestion-moves"></div><div class="formation-suggestion-actions"><button id="keepFormationLineup" type="button">MANTER ESCALAÇÃO</button><button id="applyFormationSuggestion" type="button">APLICAR SUGESTÃO</button></div></div></div>`
    );

    const substitutionPanel = $('.substitution-panel');
    if (substitutionPanel?.querySelector('label')) {
      substitutionPanel.querySelector('label').insertAdjacentHTML(
        'afterend',
        '<div class="substitution-pickers"><section class="substitution-picker"><strong>JOGADOR QUE SAI</strong><div class="substitution-player-head"><span>POS.</span><span>OVR</span><span>JOGADOR</span><span>CANSAÇO</span></div><div id="substitutionOutList" class="substitution-player-list"></div></section><section class="substitution-picker"><strong>JOGADOR QUE ENTRA</strong><div class="substitution-player-head"><span>POS.</span><span>OVR</span><span>JOGADOR</span><span>CANSAÇO</span></div><div id="substitutionInList" class="substitution-player-list"></div></section></div>'
      );
      $('#substitutionOut')?.classList.add('substitution-native-select');
      $('#substitutionIn')?.classList.add('substitution-native-select');
    }
  };

  const highlightFromRosterRow = row => {
    if (!row) {
      setTacticsPitchHighlight(null);
      return;
    }
    const slot = Number(row.dataset.slot);
    if (Number.isFinite(slot) && slot >= 0 && slot < 11) setTacticsPitchHighlight(slot);
    else setTacticsPitchHighlight(null);
  };

  const bindHandlers = () => {
    onClick('#formations', event => formationGridClick(event, { liveDuringMatch: true }));
    onClick('#pauseFormations', event => formationGridClick(event, { withBoard: true }));
    Object.entries(tacticControls).forEach(([key, controls]) =>
      controls.forEach(([sliderId]) => {
        on(sliderId, 'input', event => {
          tacticalValues[key] = Number(event.target.value);
          syncTactics();
          deps.onTacticsChanged?.();
          if (getHasCareer()) persistSeason();
        });
      })
    );
    $$('.tactic-suggestion-btn').forEach(button => button.addEventListener('click', applyTacticSuggestion));
    // Destaque na prancheta ao passar/focar no elenco (titulares).
    const rosterRoots = ['#tacticStarters', '#tacticBench']
      .map(sel => $(sel))
      .filter(Boolean);
    rosterRoots.forEach(root => {
      root.addEventListener('mouseover', event => {
        const row = event.target.closest('.tactic-player-row[data-slot]');
        if (!row || !root.contains(row)) return;
        highlightFromRosterRow(row);
      });
      root.addEventListener('mouseout', event => {
        const row = event.target.closest('.tactic-player-row[data-slot]');
        if (!row || !root.contains(row)) return;
        if (row.contains(event.relatedTarget)) return;
        setTacticsPitchHighlight(null);
      });
      root.addEventListener('focusin', event => {
        const row = event.target.closest('.tactic-player-row[data-slot]');
        if (!row || !root.contains(row)) return;
        highlightFromRosterRow(row);
      });
      root.addEventListener('focusout', event => {
        const row = event.target.closest('.tactic-player-row[data-slot]');
        if (!row || !root.contains(row)) return;
        if (row.contains(event.relatedTarget)) return;
        setTacticsPitchHighlight(null);
      });
    });
    onClick('#makeSubstitution', makeSubstitution);
    onClick('#substitutionOutList', event => {
      const row = event.target.closest('[data-substitution-out]');
      if (!row) return;
      const next = row.dataset.substitutionOut;
      $('#substitutionOut').value = $('#substitutionOut').value === next ? '' : next;
      renderSubstitutionControls();
    });
    onClick('#substitutionInList', event => {
      const row = event.target.closest('[data-substitution-in]');
      if (!row) return;
      const player = getSquad()[Number(row.dataset.substitutionIn)];
      if (!player) return;
      $('#substitutionIn').value = $('#substitutionIn').value === player.name ? '' : player.name;
      renderSubstitutionControls();
    });
    on('#substitutionOut', 'change', renderSubstitutionControls);
    on('#substitutionIn', 'change', renderSubstitutionControls);
    onClick('#closeFormationSuggestion', closeFormationSuggestion);
    onClick('#keepFormationLineup', closeFormationSuggestion);
    onClick('#applyFormationSuggestion', () => {
      if (!pendingFormationSuggestion) return;
      autoSelectUserLineup(pendingFormationSuggestion.formation, {
        restrictToField: true,
        liveCards: pendingFormationSuggestion.liveCards,
      });
      closeFormationSuggestion();
      renderRoster();
      draw();
      drawBoard();
      renderSubstitutionControls();
      renderStats();
    });
  };

  const openFormationSuggestion = (targetFormation, liveCards, moves) => {
    pendingFormationSuggestion = { formation: targetFormation, liveCards };
    $('#formationSuggestionText').textContent = moves.length
      ? `A formação ${targetFormation} já foi aplicada. O assistente encontrou ${moves.length} ajuste${moves.length === 1 ? '' : 's'} de posicionamento, mas nenhuma mudança será feita sem sua confirmação.`
      : `A formação ${targetFormation} já foi aplicada e os jogadores atuais apresentam bom encaixe. Você pode manter a organização existente.`;
    $('#formationSuggestionMoves').innerHTML = moves.length
      ? moves.slice(0, 5).map(move => `<span>${move.player.name}<b>${move.role}</b></span>`).join('')
      : '<span>Escalação atual compatível<b>OK</b></span>';
    $('#applyFormationSuggestion').disabled = !moves.length;
    $('#formationSuggestionModal').classList.remove('hidden');
  };

  const init = savedTactics => {
    injectDom();
    loadTacticalValues(savedTactics);
    bindHandlers();
  };

  return {
    moduleVersion: MODULE_VERSIONS.tactics,
    init,
    setPersist,
    loadTacticalValues,
    getTacticalValues,
    tacticFor,
    draw,
    drawBoard,
    renderTacticRoster,
    renderSubstitutionControls,
    makeSubstitution,
    syncTactics,
    applyTacticSuggestion,
    openFormationSuggestion,
    closeFormationSuggestion,
    boardPlayerLabel,
    boardPlayerBadges,
    ensureBoardLegend,
  };
}
