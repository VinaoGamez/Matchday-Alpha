import { MODULE_VERSIONS } from '../../core/constants.js';
import { defaultClubCrestInitials } from '../../ui/club-label.js';

const MESSAGE_LIMIT = 200;
/** Mensagens não lidas com esta idade (dias de calendário) são marcadas como lidas. */
export const MESSAGE_STALE_DAYS = 14;

/** Categorias que não entram na caixa de entrada geral. */
export const EXCLUDED_INBOX_CATEGORIES = new Set(['match', 'calendar']);

const CATEGORY_LABELS = {
  match: 'Partida',
  medical: 'Médico',
  discipline: 'Disciplina',
  calendar: 'Calendário',
  club: 'Clube',
  competition: 'Competição',
  transfer: 'Transferência',
};

const isInboxMessage = message => !EXCLUDED_INBOX_CATEGORIES.has(message?.category);

const MS_PER_DAY = 86400000;

/** Mensagem que ainda exige decisão do usuário (não auto-arquivar). */
export const isActionRequiredMessage = message =>
  !!message && !!message.meta?.requiresAction && !message.meta?.actionResolved;

/** Ação médica pendente — badge vermelho + abertura automática. */
export const isMedicalActionRequired = message =>
  isActionRequiredMessage(message) &&
  (message.category === 'medical' || message.type === 'treatment-pending');

/** Proposta de transferência pendente. */
export const isTransferActionRequired = message =>
  isActionRequiredMessage(message) &&
  (message.category === 'transfer' || message.type === 'incoming-offer');

/** Mensagem de proposta (pendente ou já respondida) — usa o layout novo do leitor. */
export const isIncomingOfferMessage = message => {
  if (!message) return false;
  if (message.type === 'incoming-offer') return true;
  if (message.meta?.offerId) return true;
  if (message.meta?.offerType === 'buy' || message.meta?.offerType === 'loan') return true;
  return /proposta de (compra|empr[eé]stimo)/i.test(message.title || '');
};

const resolveOfferFromClub = message => {
  if (message?.meta?.fromClub) return String(message.meta.fromClub);
  const body = String(message?.body || '');
  const match = body.match(/^(.+?)\s+(oferece|quer)\b/i);
  return match?.[1]?.trim() || '';
};

const messageAgeDays = (message, careerDate) => {
  if (!message?.at || !careerDate) return 0;
  const at = new Date(message.at);
  if (Number.isNaN(at.getTime())) return 0;
  return (careerDate.getTime() - at.getTime()) / MS_PER_DAY;
};

const formatMessageTime = at =>
  new Date(at)
    .toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');

const formatMessageDate = at => {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

const formatMessageDateShort = at => {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

const stripOfferUrgencyLines = body =>
  String(body || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/expira na rodada/i.test(line) && !/responda com urgência/i.test(line))
    .join('\n');

const isLoanOfferMessage = message =>
  message?.meta?.offerType === 'loan' || /empr[eé]stimo/i.test(message?.title || '');

const transferOfferReaderTitle = message =>
  isLoanOfferMessage(message) ? 'PROPOSTA DE EMPRÉSTIMO' : 'PROPOSTA DE COMPRA';

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const bodyToHtml = body =>
  String(body || '')
    .split('\n')
    .map(line => escapeHtml(line.trim()))
    .join('<br>');

const MONTH_ABBR_TO_NUM = {
  JAN: '01',
  FEV: '02',
  MAR: '03',
  ABR: '04',
  MAI: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SET: '09',
  OUT: '10',
  NOV: '11',
  DEZ: '12',
};

const isMatchdayMessage = message =>
  message?.type === 'matchday' || /^jogo do dia\b/i.test(message?.title || '');

const isMatchResultMessage = message =>
  message?.type === 'match-result' || /^resultado da partida\b/i.test(message?.title || '');

const isDisciplineDigestMessage = message =>
  message?.category === 'discipline' || /^disciplina\b/i.test(message?.title || '');

/** Pré-jogo, resultado e disciplina: cabeçalho curto "Brasileirão D" / "Rodada X". */
const usesCompetitionShortMeta = message =>
  isMatchdayMessage(message) || isMatchResultMessage(message) || isDisciplineDigestMessage(message);

/** Cabeçalho curto: "Brasileirão D" / "Rodada 4" (também reformata saves antigos). */
const competitionShortReaderMeta = message => {
  const short = message?.meta?.competition;
  const roundLabel = message?.meta?.roundLabel;
  if (short && roundLabel && !/^disciplina$/i.test(String(short)) && !/·/.test(String(short))) {
    return { competition: String(short), roundLabel: String(roundLabel) };
  }
  const raw = String(message?.meta?.competition || '');
  const body = String(message?.body || '');
  const serie =
    raw.match(/S[ée]rie\s*([A-D])/i)?.[1] ||
    raw.match(/Brasileir[aã]o\s+([A-D])\b/i)?.[1] ||
    body.match(/Brasileir[aã]o\s+S[ée]rie\s*([A-D])/i)?.[1] ||
    body.match(/\bno\s+Brasileir[aã]o\s+S[ée]rie\s*([A-D])/i)?.[1];
  const roundNum = raw.match(/Rodada\s*(\d+)/i)?.[1] || message?.round;
  if (serie) {
    return {
      competition: `Brasileirão ${serie.toUpperCase()}`,
      roundLabel: `Rodada ${roundNum}`,
    };
  }
  if (/copa/i.test(raw) || /copa do brasil/i.test(body)) {
    const parts = raw
      .split('·')
      .map(part => part.trim())
      .filter(Boolean);
    return {
      competition: 'Copa do Brasil',
      roundLabel: parts.slice(1).join(' · ') || `Rodada ${message?.round ?? '—'}`,
    };
  }
  return {
    competition: short && !/^disciplina$/i.test(String(short)) ? String(short) : 'Competição',
    roundLabel: roundLabel || `Rodada ${message?.round ?? '—'}`,
  };
};

/** Corpo pré-jogo: data XX/XX + linha em branco antes dos destaques. */
const formatMatchdayBody = body => {
  let text = String(body || '').trim();
  text = text.replace(
    /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i,
    (_, day, month) => {
      const dd = String(day).padStart(2, '0');
      const mm = MONTH_ABBR_TO_NUM[month.toUpperCase()] || '01';
      return `${dd}/${mm}`;
    },
  );
  text = text.replace(
    /\.\s*(?:Brasileir[aã]o[^.\n]*|Copa do Brasil[^.\n]*|S[ée]rie D[^.\n]*)\./i,
    '.',
  );
  text = text.replace(/\s*Destaques do advers[aá]rio\s*:/i, '\n\nDestaques do adversário:');
  return text;
};

/**
 * Hub de mensagens — UI + estado isolados do motor legado.
 * @param {object} deps
 * @param {Function} deps.$
 * @param {Function} deps.$$
 * @param {Function} deps.onClick
 * @param {Function} deps.getHasCareer
 * @param {Function} deps.getCurrentRound
 * @param {Function} [deps.getCareerDateIso]
 * @param {Function} [deps.getCareerDate]
 * @param {Array} [deps.initialMessages]
 * @param {Function} [deps.onPersist]
 * @param {Function} [deps.onPush]
 * @param {Function} [deps.onMedicalActionRequired]
 * @param {Function} [deps.onTransferActionRequired]
 * @param {Function} [deps.onTransferOfferRespond]
 */
export function createMessagesFeature(deps) {
  const {
    $,
    $$,
    onClick,
    getHasCareer,
    getCurrentRound,
    onPush,
    onMedicalActionRequired,
    onTransferActionRequired,
    onTransferOfferRespond,
  } = deps;
  const getCareerDateIso = typeof deps.getCareerDateIso === 'function' ? deps.getCareerDateIso : null;
  const getCareerDate =
    typeof deps.getCareerDate === 'function'
      ? deps.getCareerDate
      : () => (getCareerDateIso ? new Date(getCareerDateIso()) : new Date());

  let careerMessages = Array.isArray(deps.initialMessages)
    ? deps.initialMessages
        .filter(isInboxMessage)
        .map(message => ({
          ...message,
          read: !!message.read,
          meta: message.meta ? { ...message.meta } : null,
        }))
    : [];
  let messageCounter = careerMessages.length;
  let messageFilter = 'all';
  let readerIndex = -1;
  let persistSeason = typeof deps.onPersist === 'function' ? deps.onPersist : () => {};
  /** Fila de propostas de transferência a apresentar na tela (avanço de janela). */
  let transferActionQueue = [];
  let transferActionQueueActive = false;
  let onTransferActionQueueEmpty = null;

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const getMessages = () => careerMessages;

  const getMedicalActionMessages = () => careerMessages.filter(isMedicalActionRequired);
  const getActionRequiredMessages = () => careerMessages.filter(isActionRequiredMessage);
  const getTransferActionMessages = () => careerMessages.filter(isTransferActionRequired);

  const unreadCount = () => careerMessages.filter(message => !message.read).length;

  const filteredMessages = () => {
    const base =
      messageFilter === 'all'
        ? careerMessages
        : careerMessages.filter(message => message.category === messageFilter);
    return base.filter(isInboxMessage);
  };

  const updateMessageBadge = () => {
    const actionRequired = getActionRequiredMessages();
    const medicalAction = getMedicalActionMessages();
    const transferAction = getTransferActionMessages();
    const unread = unreadCount();
    const badge = $('#messagesBadge');
    const label = $('#messagesUnreadLabel');
    const urgent = actionRequired.length > 0;
    const badgeCount = urgent ? actionRequired.length : unread;

    if (badge) {
      badge.textContent = String(badgeCount);
      badge.classList.toggle('hidden', badgeCount === 0);
      badge.classList.toggle('nav-badge--urgent', urgent);
      badge.title = urgent
        ? medicalAction.length && transferAction.length
          ? 'Ações pendentes (médico / transferências)'
          : medicalAction.length
            ? 'Ação médica pendente'
            : 'Proposta de transferência pendente'
        : badgeCount
          ? `${badgeCount} mensagem${badgeCount === 1 ? '' : 'ns'} não lida${badgeCount === 1 ? '' : 's'}`
          : '';
    }
    if (label) {
      if (urgent) {
        label.textContent =
          actionRequired.length === 1
            ? medicalAction.length
              ? '1 ação médica pendente'
              : '1 proposta de transferência pendente'
            : `${actionRequired.length} ações pendentes`;
      } else {
        label.textContent = unread
          ? `${unread} não lida${unread === 1 ? '' : 's'}`
          : 'Todas lidas';
      }
    }
  };

  const syncTransferOfferActions = message => {
    const actions = $('#messageReaderTransferActions');
    if (!actions) return;
    const show =
      isTransferActionRequired(message) &&
      !!message?.meta?.offerId &&
      typeof onTransferOfferRespond === 'function';
    actions.classList.toggle('hidden', !show);
    actions.dataset.offerId = show ? message.meta.offerId : '';
    const expire = $('#messageReaderOfferExpire');
    if (expire) {
      if (show && message.meta?.expiresRound) {
        expire.innerHTML = `<span>Expira na rodada ${escapeHtml(message.meta.expiresRound)}.</span><span>Responda com urgência.</span>`;
      } else {
        expire.textContent = '';
      }
    }
  };

  const updateReaderNav = () => {
    const items = filteredMessages();
    const prev = $('#messageReaderPrev');
    const next = $('#messageReaderNext');
    if (prev) prev.disabled = readerIndex <= 0;
    if (next) next.disabled = readerIndex >= items.length - 1;
  };

  const closeMessageReader = () => {
    const closedId =
      readerIndex >= 0 ? filteredMessages()[readerIndex]?.id || null : null;
    $('#messageReaderModal')?.classList.add('hidden');
    $('.message-reader-head')?.classList.remove('is-transfer-offer', 'is-reader-grid');
    readerIndex = -1;
    syncTransferOfferActions(null);
    if (!transferActionQueueActive) return;
    transferActionQueue = transferActionQueue.filter(id => {
      if (id === closedId) return false;
      const message = careerMessages.find(item => item.id === id);
      return isTransferActionRequired(message);
    });
    if (transferActionQueue.length) {
      queueMicrotask(() => openMessageReader(transferActionQueue[0]));
      return;
    }
    transferActionQueueActive = false;
    const onEmpty = onTransferActionQueueEmpty;
    onTransferActionQueueEmpty = null;
    if (typeof onEmpty === 'function') queueMicrotask(() => onEmpty());
  };

  const refreshMessageViews = () => {
    updateMessageBadge();
    renderMessages();
    renderDashboardMessagesFeed();
  };

  const markMessageRead = id => {
    const message = careerMessages.find(item => item.id === id);
    if (!message || message.read) return;
    message.read = true;
    refreshMessageViews();
    persistSeason();
  };

  const openMessageReader = id => {
    const items = filteredMessages();
    const index = items.findIndex(message => message.id === id);
    if (index < 0) return false;
    readerIndex = index;
    const message = items[index];
    // Mensagem médica com ação permanece "pendente" no badge até a decisão;
    // ainda assim marcamos como lida na caixa para não inflar o contador verde.
    markMessageRead(message.id);

    const meta = $('#messageReaderMeta');
    const title = $('#messageReaderTitle');
    const time = $('#messageReaderTime');
    const body = $('#messageReaderBody');

    const offerMessage = isIncomingOfferMessage(message);
    const matchdayMessage = isMatchdayMessage(message);
    const competitionShortMeta = usesCompetitionShortMeta(message);
    const head = $('.message-reader-head');
    head?.classList.add('is-reader-grid');
    head?.classList.toggle('is-transfer-offer', !!offerMessage);
    if (meta) {
      if (offerMessage) {
        const competition = message.meta?.competition || 'Mercado';
        meta.innerHTML = `<span>RODADA ${escapeHtml(message.round)}</span><span>${escapeHtml(competition)}</span>`;
      } else if (competitionShortMeta) {
        const shortMeta = competitionShortReaderMeta(message);
        meta.innerHTML = `<span>${escapeHtml(shortMeta.competition)}</span><span>${escapeHtml(shortMeta.roundLabel)}</span>`;
      } else {
        const category = CATEGORY_LABELS[message.category] || String(message.category || 'CLUBE').toUpperCase();
        const secondary = message.meta?.competition
          ? String(message.meta.competition)
          : `RODADA ${message.round}`;
        meta.innerHTML = message.meta?.competition
          ? `<span>${escapeHtml(category)}</span><span>RODADA ${escapeHtml(message.round)} · ${escapeHtml(secondary)}</span>`
          : `<span>${escapeHtml(category)}</span><span>RODADA ${escapeHtml(message.round)}</span>`;
      }
    }
    if (title) {
      // Título especial só enquanto a proposta ainda exige resposta.
      // Após aceitar/recusar, mostra o resultado (ex.: "Proposta recusada").
      const pendingOffer = offerMessage && isTransferActionRequired(message);
      if (pendingOffer && isLoanOfferMessage(message)) {
        title.classList.add('is-loan-title');
        title.innerHTML = '<span>PROPOSTA DE</span><span>EMPRÉSTIMO</span>';
      } else if (pendingOffer) {
        title.classList.remove('is-loan-title');
        title.textContent = transferOfferReaderTitle(message);
      } else if (matchdayMessage) {
        title.classList.remove('is-loan-title');
        title.textContent = 'JOGO DO DIA';
      } else if (isDisciplineDigestMessage(message)) {
        title.classList.remove('is-loan-title');
        title.textContent = 'DISCIPLINA';
      } else {
        title.classList.remove('is-loan-title');
        title.textContent = message.title;
      }
    }
    if (time) {
      time.textContent = formatMessageDateShort(message.at);
    }
    if (body) {
      if (offerMessage) {
        const fromClub = resolveOfferFromClub(message);
        let offerText = stripOfferUrgencyLines(message.body);
        if (fromClub && offerText.startsWith(fromClub)) {
          offerText = offerText.slice(fromClub.length).replace(/^\s+/, '');
        }
        const crest = defaultClubCrestInitials(fromClub);
        body.innerHTML = fromClub
          ? `<div class="message-reader-offer-panel">
              <i class="message-reader-offer-crest" aria-hidden="true">${escapeHtml(crest)}</i>
              <div class="message-reader-offer-main">
                <div class="message-reader-offer-team">
                  <strong class="club-link" data-club="${escapeHtml(fromClub)}" role="button" tabindex="0">${escapeHtml(fromClub)}</strong>
                  <button type="button" class="message-reader-ver-time" data-club="${escapeHtml(fromClub)}">Ver Time</button>
                </div>
                <p>${bodyToHtml(offerText)}</p>
              </div>
            </div>`
          : bodyToHtml(offerText);
      } else if (matchdayMessage) {
        body.innerHTML = bodyToHtml(formatMatchdayBody(message.body));
      } else {
        body.innerHTML = bodyToHtml(message.body);
      }
    }
    syncTransferOfferActions(message);

    updateReaderNav();
    updateMessageBadge();
    $('#messageReaderModal')?.classList.remove('hidden');
    return true;
  };

  const stepMessageReader = step => {
    const items = filteredMessages();
    const nextIndex = readerIndex + step;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    openMessageReader(items[nextIndex].id);
  };

  const renderMessages = () => {
    const list = $('#messagesList');
    if (!list) return;
    const items = filteredMessages();
    list.innerHTML = items.length
      ? items
          .map(message => {
            const urgent = isActionRequiredMessage(message);
            const listTitle =
              urgent && message.meta?.playerName
                ? `${message.title} · ${message.meta.playerName}`
                : isMatchdayMessage(message)
                  ? 'JOGO DO DIA'
                  : isDisciplineDigestMessage(message)
                    ? 'DISCIPLINA'
                    : message.title;
            return `<article class="message-item ${message.read ? 'read' : 'unread'} message-${message.category}${urgent ? ' message-action-required' : ''}" data-message-id="${message.id}"><div class="message-item-main"><small>${CATEGORY_LABELS[message.category] || message.category.toUpperCase()} · RODADA ${message.round}${urgent ? ' · AÇÃO' : ''}</small><strong>${escapeHtml(listTitle)}</strong></div><time>${formatMessageTime(message.at)}</time></article>`;
          })
          .join('')
      : `<div class="messages-empty">Nenhuma ocorrência registrada${messageFilter === 'all' ? ' ainda' : ` na categoria ${CATEGORY_LABELS[messageFilter] || messageFilter}`}.</div>`;
    updateMessageBadge();
  };

  const renderDashboardMessagesFeed = () => {
    const feed = $('#dashboardMessagesFeed');
    if (!feed) return;
    const recent = careerMessages.filter(isInboxMessage).slice(0, 3);
    feed.innerHTML = recent.length
      ? recent
          .map(message => {
            const urgent = isActionRequiredMessage(message);
            const feedTitle = isMatchdayMessage(message)
              ? 'JOGO DO DIA'
              : isDisciplineDigestMessage(message)
                ? 'DISCIPLINA'
                : message.title;
            return `<div class="dashboard-message-row ${message.read ? 'read' : 'unread'}${urgent ? ' message-action-required' : ''}" data-message-id="${message.id}"><small>${CATEGORY_LABELS[message.category] || message.category}${urgent ? ' · AÇÃO' : ''}</small><strong>${escapeHtml(feedTitle)}</strong></div>`;
          })
          .join('')
      : '<div class="dashboard-message-empty">As ocorrências da temporada aparecerão aqui.</div>';
  };

  const markAllMessagesRead = () => {
    let changed = false;
    careerMessages.forEach(message => {
      if (!message.read && !isActionRequiredMessage(message)) {
        message.read = true;
        changed = true;
      }
    });
    if (changed) {
      refreshMessageViews();
      persistSeason();
    }
  };

  /**
   * Marca como lidas mensagens com mais de 2 semanas no calendário da carreira,
   * exceto as que ainda exigem ação do usuário.
   * @returns {number} quantidade marcada
   */
  const autoMarkStaleMessages = () => {
    const careerDate = getCareerDate();
    if (!(careerDate instanceof Date) || Number.isNaN(careerDate.getTime())) return 0;
    let changed = 0;
    careerMessages.forEach(message => {
      if (message.read || isActionRequiredMessage(message)) return;
      if (messageAgeDays(message, careerDate) < MESSAGE_STALE_DAYS) return;
      message.read = true;
      changed += 1;
    });
    if (changed) {
      refreshMessageViews();
      persistSeason();
    }
    return changed;
  };

  /** Conclui pendência de ação (ex.: tratamento médico definido). */
  const resolveActionRequiredMessages = (match = {}) => {
    let changed = 0;
    careerMessages.forEach(message => {
      if (!isActionRequiredMessage(message)) return;
      if (match.category && message.category !== match.category) return;
      if (match.type && message.type !== match.type) return;
      if (match.offerId && message.meta?.offerId !== match.offerId) return;
      if (match.messageId && message.id !== match.messageId) return;
      if (!message.meta) message.meta = {};
      message.meta.requiresAction = false;
      message.meta.actionResolved = true;
      message.read = true;
      changed += 1;
    });
    if (changed) {
      refreshMessageViews();
      persistSeason();
      syncTransferOfferActions(
        readerIndex >= 0 ? filteredMessages()[readerIndex] : null,
      );
    }
    return changed;
  };

  const resolveMessageById = messageId => {
    if (!messageId) return 0;
    return resolveActionRequiredMessages({ messageId });
  };

  const findMessage = matcher => {
    if (!matcher) return null;
    if (typeof matcher === 'string') {
      return careerMessages.find(item => item.id === matcher) || null;
    }
    return (
      careerMessages.find(item => {
        if (matcher.messageId && item.id === matcher.messageId) return true;
        if (matcher.offerId && item.meta?.offerId === matcher.offerId) return true;
        return false;
      }) || null
    );
  };

  /**
   * Atualiza uma mensagem existente (ex.: resposta a proposta) sem criar outra.
   * @param {string|{offerId?:string,messageId?:string}} matcher
   * @param {object} patch
   */
  const replaceMessage = (matcher, patch = {}) => {
    const message = findMessage(matcher);
    if (!message) return null;
    if (patch.title != null) message.title = patch.title;
    if (patch.body != null) message.body = patch.body;
    if (patch.type != null) message.type = patch.type;
    if (patch.category != null) message.category = patch.category;
    if (patch.round != null) message.round = patch.round;
    if (patch.meta && typeof patch.meta === 'object') {
      message.meta = { ...(message.meta || {}), ...patch.meta };
    }
    if (patch.resolveAction) {
      if (!message.meta) message.meta = {};
      message.meta.requiresAction = false;
      message.meta.actionResolved = true;
      if (patch.actionResult != null) message.meta.actionResult = patch.actionResult;
    }
    message.read = patch.read !== undefined ? !!patch.read : true;
    if (patch.touchAt !== false) {
      message.at = getCareerDateIso?.() || new Date().toISOString();
    }
    // Mantém a mensagem no topo da caixa após a resposta.
    const idx = careerMessages.indexOf(message);
    if (idx > 0) {
      careerMessages.splice(idx, 1);
      careerMessages.unshift(message);
    }
    refreshMessageViews();
    persistSeason();
    if (readerIndex >= 0) {
      const openId = filteredMessages()[readerIndex]?.id;
      if (openId === message.id) {
        // Reabre com o renderer completo (título de resultado, sem botões de oferta).
        openMessageReader(message.id);
      }
    }
    return message;
  };

  /**
   * Abre propostas pendentes em sequência (fecha/responde → próxima).
   * Usado no avanço da janela para não perder oportunidades só na caixa.
   */
  const presentTransferActionMessages = ({
    onlyIds = null,
    onQueueEmpty = null,
  } = {}) => {
    const pending = getTransferActionMessages().filter(
      message => !onlyIds || onlyIds.includes(message.id),
    );
    if (!pending.length) {
      if (typeof onQueueEmpty === 'function') onQueueEmpty();
      return false;
    }
    transferActionQueue = pending.map(message => message.id);
    transferActionQueueActive = true;
    onTransferActionQueueEmpty =
      typeof onQueueEmpty === 'function' ? onQueueEmpty : null;
    return openMessageReader(transferActionQueue[0]);
  };

  /** Abre o leitor na primeira mensagem médica com ação pendente. */
  const openMedicalActionMessage = () => {
    const pending = getMedicalActionMessages()[0];
    if (!pending) return false;
    if (messageFilter !== 'all' && messageFilter !== 'medical') {
      messageFilter = 'all';
      $$('#messageFilters [data-message-filter]').forEach(item =>
        item.classList.toggle('active', item.dataset.messageFilter === 'all'),
      );
    }
    return openMessageReader(pending.id);
  };

  const pushMessage = ({
    category = 'club',
    type = 'info',
    title,
    body,
    round = getCurrentRound(),
    meta = null,
    read = false,
  } = {}) => {
    if (!getHasCareer() || !title || !body) return null;
    if (EXCLUDED_INBOX_CATEGORIES.has(category)) return null;
    const message = {
      id: `msg-${Date.now()}-${++messageCounter}`,
      at: getCareerDateIso?.() || new Date().toISOString(),
      round,
      category,
      type,
      title,
      body,
      read,
      meta: meta ? { ...meta } : null,
    };
    careerMessages.unshift(message);
    if (careerMessages.length > MESSAGE_LIMIT) careerMessages.length = MESSAGE_LIMIT;
    updateMessageBadge();
    renderDashboardMessagesFeed();
    if ($('#messages')?.classList.contains('active')) renderMessages();
    persistSeason();
    onPush?.(message);
    if (isMedicalActionRequired(message)) onMedicalActionRequired?.(message);
    if (isTransferActionRequired(message)) onTransferActionRequired?.(message);
    return message;
  };

  const bindHandlers = ({ openView } = {}) => {
    onClick('#messageFilters', event => {
      const button = event.target.closest('[data-message-filter]');
      if (!button) return;
      messageFilter = button.dataset.messageFilter;
      $$('#messageFilters [data-message-filter]').forEach(item =>
        item.classList.toggle('active', item === button),
      );
      renderMessages();
    });
    onClick('#markAllMessagesRead', markAllMessagesRead);
    onClick('#messagesList', event => {
      const item = event.target.closest('[data-message-id]');
      if (!item) return;
      openMessageReader(item.dataset.messageId);
    });
    onClick('#dashboardMessagesFeed', event => {
      const item = event.target.closest('[data-message-id]');
      if (item) openMessageReader(item.dataset.messageId);
      else openView?.('messages');
    });
    onClick('#openMessagesFromDashboard', () => openView?.('messages'));
    onClick('#closeMessageReader', closeMessageReader);
    onClick('#messageReaderClose', closeMessageReader);
    onClick('#messageReaderPrev', () => stepMessageReader(-1));
    onClick('#messageReaderNext', () => stepMessageReader(1));
    onClick('#messageReaderModal', event => {
      if (event.target.id === 'messageReaderModal') closeMessageReader();
    });
    onClick('#messageReaderOfferAccept', () => {
      const offerId = $('#messageReaderTransferActions')?.dataset?.offerId;
      if (!offerId || typeof onTransferOfferRespond !== 'function') return;
      onTransferOfferRespond({ offerId, accept: true });
    });
    onClick('#messageReaderOfferReject', () => {
      const offerId = $('#messageReaderTransferActions')?.dataset?.offerId;
      if (!offerId || typeof onTransferOfferRespond !== 'function') return;
      onTransferOfferRespond({ offerId, accept: false });
    });
  };

  return {
    moduleVersion: MODULE_VERSIONS.messages,
    getMessages,
    getMedicalActionMessages,
    getTransferActionMessages,
    getActionRequiredMessages,
    setPersist,
    pushMessage,
    replaceMessage,
    findMessage,
    presentTransferActionMessages,
    renderMessages,
    renderDashboardMessagesFeed,
    updateMessageBadge,
    markMessageRead,
    markAllMessagesRead,
    autoMarkStaleMessages,
    resolveActionRequiredMessages,
    resolveMessageById,
    openMessageReader,
    closeMessageReader,
    openMedicalActionMessage,
    bindHandlers,
  };
}
