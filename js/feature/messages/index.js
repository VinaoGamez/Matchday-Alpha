import { MODULE_VERSIONS } from '../../core/constants.js';

const MESSAGE_LIMIT = 200;

/** Categorias que não entram na caixa de entrada geral. */
export const EXCLUDED_INBOX_CATEGORIES = new Set(['match', 'calendar']);

const CATEGORY_LABELS = {
  match: 'Partida',
  medical: 'Médico',
  discipline: 'Disciplina',
  calendar: 'Calendário',
  club: 'Clube',
  competition: 'Competição',
};

const isInboxMessage = message => !EXCLUDED_INBOX_CATEGORIES.has(message?.category);

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
 * @param {Array} [deps.initialMessages]
 * @param {Function} [deps.onPersist]
 * @param {Function} [deps.onPush]
 */
export function createMessagesFeature(deps) {
  const { $, $$, onClick, getHasCareer, getCurrentRound, onPush } = deps;
  const getCareerDateIso = typeof deps.getCareerDateIso === 'function' ? deps.getCareerDateIso : null;

  let careerMessages = Array.isArray(deps.initialMessages)
    ? deps.initialMessages
        .filter(isInboxMessage)
        .map(message => ({ ...message, read: !!message.read }))
    : [];
  let messageCounter = careerMessages.length;
  let messageFilter = 'all';
  let readerIndex = -1;
  let persistSeason = typeof deps.onPersist === 'function' ? deps.onPersist : () => {};

  const setPersist = fn => {
    persistSeason = typeof fn === 'function' ? fn : () => {};
  };

  const getMessages = () => careerMessages;

  const unreadCount = () => careerMessages.filter(message => !message.read).length;

  const filteredMessages = () => {
    const base =
      messageFilter === 'all'
        ? careerMessages
        : careerMessages.filter(message => message.category === messageFilter);
    return base.filter(isInboxMessage);
  };

  const updateMessageBadge = () => {
    const unread = unreadCount();
    const badge = $('#messagesBadge');
    const label = $('#messagesUnreadLabel');
    if (badge) {
      badge.textContent = unread;
      badge.classList.toggle('hidden', !unread);
    }
    if (label) {
      label.textContent = unread
        ? `${unread} não lida${unread === 1 ? '' : 's'}`
        : 'Todas lidas';
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

  const openMessageReader = id => {
    const items = filteredMessages();
    const index = items.findIndex(message => message.id === id);
    if (index < 0) return;
    readerIndex = index;
    const message = items[index];
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
    $('#messageReaderModal')?.classList.remove('hidden');
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
          .map(
            message =>
              `<article class="message-item ${message.read ? 'read' : 'unread'} message-${message.category}" data-message-id="${message.id}"><div class="message-item-main"><small>${CATEGORY_LABELS[message.category] || message.category.toUpperCase()} · RODADA ${message.round}</small><strong>${escapeHtml(message.title)}</strong></div><time>${formatMessageTime(message.at)}</time></article>`,
          )
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
          .map(
            message =>
              `<div class="dashboard-message-row ${message.read ? 'read' : 'unread'}" data-message-id="${message.id}"><small>${CATEGORY_LABELS[message.category] || message.category}</small><strong>${escapeHtml(message.title)}</strong></div>`,
          )
          .join('')
      : '<div class="dashboard-message-empty">As ocorrências da temporada aparecerão aqui.</div>';
  };

  const markMessageRead = id => {
    const message = careerMessages.find(item => item.id === id);
    if (!message || message.read) return;
    message.read = true;
    updateMessageBadge();
    renderMessages();
    renderDashboardMessagesFeed();
    persistSeason();
  };

  const markAllMessagesRead = () => {
    let changed = false;
    careerMessages.forEach(message => {
      if (!message.read) {
        message.read = true;
        changed = true;
      }
    });
    if (changed) {
      updateMessageBadge();
      renderMessages();
      renderDashboardMessagesFeed();
      persistSeason();
    }
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
    setPersist,
    pushMessage,
    renderMessages,
    renderDashboardMessagesFeed,
    updateMessageBadge,
    markMessageRead,
    markAllMessagesRead,
    bindHandlers,
  };
}
