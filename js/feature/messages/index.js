import { MODULE_VERSIONS } from '../../core/constants.js';

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

const escapeHtml = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const bodyToHtml = body =>
  escapeHtml(body)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('<br>');

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
 */
export function createMessagesFeature(deps) {
  const { $, $$, onClick, getHasCareer, getCurrentRound, onPush, onMedicalActionRequired } = deps;
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

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const getMessages = () => careerMessages;

  const getMedicalActionMessages = () => careerMessages.filter(isMedicalActionRequired);

  const unreadCount = () => careerMessages.filter(message => !message.read).length;

  const filteredMessages = () => {
    const base =
      messageFilter === 'all'
        ? careerMessages
        : careerMessages.filter(message => message.category === messageFilter);
    return base.filter(isInboxMessage);
  };

  const updateMessageBadge = () => {
    const medicalAction = getMedicalActionMessages();
    const unread = unreadCount();
    const badge = $('#messagesBadge');
    const label = $('#messagesUnreadLabel');
    const urgent = medicalAction.length > 0;
    const badgeCount = urgent ? medicalAction.length : unread;

    if (badge) {
      badge.textContent = String(badgeCount);
      badge.classList.toggle('hidden', badgeCount === 0);
      badge.classList.toggle('nav-badge--urgent', urgent);
      badge.title = urgent
        ? 'Ação médica pendente'
        : badgeCount
          ? `${badgeCount} mensagem${badgeCount === 1 ? '' : 'ns'} não lida${badgeCount === 1 ? '' : 's'}`
          : '';
    }
    if (label) {
      if (urgent) {
        label.textContent =
          medicalAction.length === 1
            ? '1 ação médica pendente'
            : `${medicalAction.length} ações médicas pendentes`;
      } else {
        label.textContent = unread
          ? `${unread} não lida${unread === 1 ? '' : 's'}`
          : 'Todas lidas';
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
    $('#messageReaderModal')?.classList.add('hidden');
    readerIndex = -1;
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

    if (meta) {
      meta.textContent = `${CATEGORY_LABELS[message.category] || message.category.toUpperCase()} · RODADA ${message.round}${message.meta?.competition ? ` · ${message.meta.competition}` : ''}`;
    }
    if (title) title.textContent = message.title;
    if (time) time.textContent = formatMessageTime(message.at);
    if (body) body.innerHTML = bodyToHtml(message.body);

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
            const urgent = isMedicalActionRequired(message);
            return `<article class="message-item ${message.read ? 'read' : 'unread'} message-${message.category}${urgent ? ' message-action-required' : ''}" data-message-id="${message.id}"><div class="message-item-main"><small>${CATEGORY_LABELS[message.category] || message.category.toUpperCase()} · RODADA ${message.round}${urgent ? ' · AÇÃO' : ''}</small><strong>${escapeHtml(message.title)}</strong></div><time>${formatMessageTime(message.at)}</time></article>`;
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
            const urgent = isMedicalActionRequired(message);
            return `<div class="dashboard-message-row ${message.read ? 'read' : 'unread'}${urgent ? ' message-action-required' : ''}" data-message-id="${message.id}"><small>${CATEGORY_LABELS[message.category] || message.category}${urgent ? ' · AÇÃO' : ''}</small><strong>${escapeHtml(message.title)}</strong></div>`;
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
      if (!message.meta) message.meta = {};
      message.meta.requiresAction = false;
      message.meta.actionResolved = true;
      message.read = true;
      changed += 1;
    });
    if (changed) {
      refreshMessageViews();
      persistSeason();
    }
    return changed;
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
  };

  return {
    moduleVersion: MODULE_VERSIONS.messages,
    getMessages,
    getMedicalActionMessages,
    setPersist,
    pushMessage,
    renderMessages,
    renderDashboardMessagesFeed,
    updateMessageBadge,
    markMessageRead,
    markAllMessagesRead,
    autoMarkStaleMessages,
    resolveActionRequiredMessages,
    openMessageReader,
    openMedicalActionMessage,
    bindHandlers,
  };
}
