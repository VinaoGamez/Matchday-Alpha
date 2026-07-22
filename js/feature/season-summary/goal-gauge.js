/** Cores / rótulos padrão do anel de meta (fim de temporada + Escritório). */
export const GOAL_GAUGE = {
  exceeded: { score: 100, short: 'Superou', hint: 'Acima do pedido', color: '#b6ff38' },
  met: { score: 78, short: 'Cumpriu', hint: 'No combinado', color: '#63d9ff' },
  near: { score: 48, short: 'Quase', hint: 'Perto da meta', color: '#ffc94f' },
  missed: { score: 22, short: 'Abaixo', hint: 'Abaixo do pedido', color: '#ff8c94' },
};

/**
 * Anel circular Entregue × Pedido.
 * Aceita status fixo (fim de temporada) ou progresso dinâmico `{ score, status, short, hint, color }`.
 */
export function seasonGoalGauge(input = 'met', options = {}) {
  const compact = !!options.compact;
  const office = !!options.office;
  const hideLegend = !!options.hideLegend;
  let status = 'met';
  let score;
  let short;
  let hint;
  let color;

  if (input && typeof input === 'object') {
    status = GOAL_GAUGE[input.status] ? input.status : 'met';
    const fallback = GOAL_GAUGE[status];
    score = Number.isFinite(Number(input.score)) ? Number(input.score) : fallback.score;
    short = input.short || fallback.short;
    hint = input.hint || fallback.hint;
    color = input.color || fallback.color;
  } else {
    status = GOAL_GAUGE[input] ? input : 'met';
    ({ score, short, hint, color } = GOAL_GAUGE[status]);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progress = score / 100;
  const dash = (circumference * progress).toFixed(2);
  const gap = (circumference - circumference * progress).toFixed(2);
  const sizeClass = office ? ' season-goal-gauge--office' : compact ? ' season-goal-gauge--compact' : '';
  const legend = hideLegend
    ? ''
    : office
      ? `<div class="season-goal-gauge-legend season-goal-gauge-legend--side">
      <span><i class="delivered" aria-hidden="true"></i>Entregue</span>
      <span><i class="requested" aria-hidden="true"></i>Pedido</span>
    </div>`
      : compact
        ? `<div class="season-goal-gauge-legend season-goal-gauge-legend--inline">
      <span><i class="delivered" aria-hidden="true"></i>Entregue</span>
      <span><i class="requested" aria-hidden="true"></i>Pedido</span>
    </div>`
        : `<div class="season-goal-gauge-legend">
      <span><i class="delivered" aria-hidden="true"></i>Entregue</span>
      <span><i class="requested" aria-hidden="true"></i>Pedido</span>
    </div>`;

  return `<aside class="season-goal-gauge goal-${status}${sizeClass}" style="--gauge-color:${color};--gauge-score:${score}" aria-label="Desempenho frente à meta: ${hint}">
    <div class="season-goal-gauge-ring">
      <svg viewBox="0 0 88 88" aria-hidden="true" focusable="false">
        <circle class="season-goal-gauge-track" cx="44" cy="44" r="${radius}"/>
        <circle class="season-goal-gauge-progress" cx="44" cy="44" r="${radius}" stroke-dasharray="${dash} ${gap}"/>
        <circle class="season-goal-gauge-target" cx="${44 + radius}" cy="44" r="3.2"/>
      </svg>
      <div class="season-goal-gauge-score">
        <strong>${score}%</strong>
        <span>${short}</span>
      </div>
    </div>
    ${legend}
  </aside>`;
}
