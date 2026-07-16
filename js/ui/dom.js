export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];

export const on = (target, event, handler, options) => {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return null;
  el.addEventListener(event, handler, options);
  return el;
};

export const onClick = (target, handler) => on(target, 'click', handler);

export const redirectGame = () =>
  location.replace(
    location.pathname.endsWith('/')
      ? 'index.html'
      : location.pathname.split('/').pop() || 'index.html',
  );

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const cleanCareerText = (value, fallback) =>
  String(value || fallback)
    .replace(/[^\p{L}\p{N} .'-]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
