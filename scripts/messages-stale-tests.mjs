import {
  MESSAGE_STALE_DAYS,
  isActionRequiredMessage,
  isMedicalActionRequired,
  createMessagesFeature,
} from '../js/feature/messages/index.js';

let passed = 0;
let failed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${label}`);
    console.error(`  ${error.message}`);
  }
};

const assert = (cond, message) => {
  if (!cond) throw new Error(message || 'assertion failed');
};

const stubDom = () => {
  const nodes = new Map();
  const el = (id, extras = {}) => {
    const node = {
      id,
      textContent: '',
      title: '',
      classList: {
        _set: new Set(),
        toggle(name, on) {
          if (on) this._set.add(name);
          else this._set.delete(name);
        },
        contains(name) {
          return this._set.has(name);
        },
        add(name) {
          this._set.add(name);
        },
        remove(name) {
          this._set.delete(name);
        },
      },
      className: '',
      innerHTML: '',
      disabled: false,
      ...extras,
    };
    nodes.set(id, node);
    return node;
  };
  el('messagesBadge');
  el('messagesUnreadLabel');
  el('messagesList');
  el('dashboardMessagesFeed');
  el('messageReaderModal', { classList: {
    _set: new Set(['hidden']),
    toggle(name, on) { if (on) this._set.add(name); else this._set.delete(name); },
    contains(name) { return this._set.has(name); },
    add(name) { this._set.add(name); },
    remove(name) { this._set.delete(name); },
  }});
  el('messageReaderMeta');
  el('messageReaderTitle');
  el('messageReaderTime');
  el('messageReaderBody');
  el('messageReaderPrev');
  el('messageReaderNext');
  el('messageReaderTransferActions', { dataset: {} });
  el('messageReaderOfferExpire');
  el('messages', { classList: { contains: () => false, toggle() {}, add() {}, remove() {} } });
  return {
    $(sel) {
      if (sel.startsWith('#')) return nodes.get(sel.slice(1)) || null;
      return null;
    },
    $$: () => [],
    onClick: () => {},
  };
};

check('stale threshold is 14 days', () => {
  assert(MESSAGE_STALE_DAYS === 14, '14 days');
});

check('action helpers', () => {
  assert(isActionRequiredMessage({ meta: { requiresAction: true } }), 'requires action');
  assert(!isActionRequiredMessage({ meta: { requiresAction: true, actionResolved: true } }), 'resolved');
  assert(
    isMedicalActionRequired({
      category: 'medical',
      type: 'treatment-pending',
      meta: { requiresAction: true },
    }),
    'medical action',
  );
  assert(
    !isMedicalActionRequired({
      category: 'club',
      meta: { requiresAction: true },
    }),
    'non-medical action ignored for red badge helper',
  );
});

check('auto-marks unread older than 14 days', () => {
  const { $, $$, onClick } = stubDom();
  const careerDate = new Date(2030, 5, 20, 12);
  const feature = createMessagesFeature({
    $,
    $$,
    onClick,
    getHasCareer: () => true,
    getCurrentRound: () => 5,
    getCareerDate: () => careerDate,
    getCareerDateIso: () => careerDate.toISOString(),
    initialMessages: [
      {
        id: 'old',
        at: new Date(2030, 5, 1, 12).toISOString(),
        round: 1,
        category: 'club',
        type: 'info',
        title: 'Velha',
        body: 'x',
        read: false,
        meta: null,
      },
      {
        id: 'fresh',
        at: new Date(2030, 5, 18, 12).toISOString(),
        round: 4,
        category: 'club',
        type: 'info',
        title: 'Nova',
        body: 'y',
        read: false,
        meta: null,
      },
      {
        id: 'med',
        at: new Date(2030, 4, 1, 12).toISOString(),
        round: 1,
        category: 'medical',
        type: 'treatment-pending',
        title: 'Médica',
        body: 'z',
        read: false,
        meta: { requiresAction: true },
      },
    ],
  });
  const marked = feature.autoMarkStaleMessages();
  assert(marked === 1, `marked=${marked}`);
  const byId = Object.fromEntries(feature.getMessages().map(m => [m.id, m]));
  assert(byId.old.read === true, 'old read');
  assert(byId.fresh.read === false, 'fresh unread');
  assert(byId.med.read === false, 'medical still unread');
  assert(isMedicalActionRequired(byId.med), 'medical still action');
});

check('urgent badge class for medical action', () => {
  const { $, $$, onClick } = stubDom();
  const feature = createMessagesFeature({
    $,
    $$,
    onClick,
    getHasCareer: () => true,
    getCurrentRound: () => 1,
    getCareerDate: () => new Date(2030, 0, 15, 12),
    initialMessages: [
      {
        id: 'med',
        at: new Date(2030, 0, 10, 12).toISOString(),
        round: 1,
        category: 'medical',
        type: 'treatment-pending',
        title: 'Ação',
        body: 'decida',
        read: true,
        meta: { requiresAction: true },
      },
    ],
  });
  feature.updateMessageBadge();
  const badge = $('#messagesBadge');
  assert(badge.classList.contains('nav-badge--urgent'), 'urgent class');
  assert(!badge.classList.contains('hidden'), 'visible');
  assert(badge.textContent === '1', 'count');
});

check('replaceMessage updates offer in place without new row', () => {
  const { $, $$, onClick } = stubDom();
  const feature = createMessagesFeature({
    $,
    $$,
    onClick,
    getHasCareer: () => true,
    getCurrentRound: () => 1,
    getCareerDate: () => new Date(2030, 0, 15, 12),
    getCareerDateIso: () => new Date(2030, 0, 15, 12).toISOString(),
    initialMessages: [
      {
        id: 'offer-1',
        at: new Date(2030, 0, 10, 12).toISOString(),
        round: 1,
        category: 'transfer',
        type: 'incoming-offer',
        title: 'Proposta de compra · Alvo',
        body: 'Clube X oferece.',
        read: false,
        meta: { requiresAction: true, offerId: 'toff-1', competition: 'Mercado' },
      },
    ],
  });
  const before = feature.getMessages().length;
  const replaced = feature.replaceMessage(
    { offerId: 'toff-1' },
    {
      type: 'offer-rejected',
      title: 'Proposta recusada',
      body: 'Você recusou a proposta.',
      resolveAction: true,
      actionResult: 'rejected',
    },
  );
  assert(replaced && replaced.id === 'offer-1', 'same id');
  assert(feature.getMessages().length === before, 'no new message');
  assert(replaced.type === 'offer-rejected', 'type updated');
  assert(!replaced.meta.requiresAction && replaced.meta.actionResolved, 'action cleared');
  assert(feature.getTransferActionMessages().length === 0, 'no pending transfer action');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
