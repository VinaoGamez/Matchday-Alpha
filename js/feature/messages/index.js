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

  const renderMessages = () => {
    const list = $('#messagesList');
    if (!list) return;
    const items = filteredMessages();
    list.innerHTML = items.length
      ? items
          .map(
            message => `<article class="message-item ${message.read ? 'read' : 'unread'} message-${message.category}" data-message-id="${message.id}"><header><div><small>${CATEGORY_LABELS[message.category] || message.category.toUpperCase()} · RODADA ${message.round}</small><strong>${message.title}</strong></div><time>${new Date(message.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')}</time></header><p>${message.body}</p>${message.meta?.competition ? `<footer><small>${message.meta.competition}</small></footer>` : ''}</article>`,
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
              `<div class="dashboard-message-row ${message.read ? 'read' : 'unread'}" data-message-id="${message.id}"><small>${CATEGORY_LABELS[message.category] || message.category}</small><strong>${message.title}</strong><span>${message.body}</span></div>`,
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
      markMessageRead(item.dataset.messageId);
    });
    onClick('#dashboardMessagesFeed', event => {
      const item = event.target.closest('[data-message-id]');
      if (item) markMessageRead(item.dataset.messageId);
      openView?.('messages');
    });
    onClick('#openMessagesFromDashboard', () => openView?.('messages'));
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
