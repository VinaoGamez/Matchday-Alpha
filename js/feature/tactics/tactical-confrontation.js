import { clamp } from '../../ui/dom.js';

export const TACTIC_READOUT = {
  mentality: value => (value < 35 ? 'Defensiva' : value > 65 ? 'Ofensiva' : 'Equilibrada'),
  possession: value => (value < 35 ? 'Contra-ataque' : value > 65 ? 'Posse de bola' : 'Misto'),
  press: value => (value < 35 ? 'Baixa' : value > 65 ? 'Alta' : 'Média'),
  offsideLine: value => (value < 35 ? 'Baixa' : value > 65 ? 'Alta' : 'Normal'),
};

let cssInjected = false;

export function injectTacticalConfrontationCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.tactical-confrontation{display:grid;gap:10px;margin:0 0 14px;padding:12px 13px;border:1px solid #28505b;border-radius:7px;background:#0b2029}
.tactical-confrontation>header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.tactical-confrontation>header label{color:#63d9ff;font:700 9px DM Sans;letter-spacing:.65px}
.tactical-confrontation>header small{color:#7fa8b0;font-size:10px}
.tactical-confrontation-row{display:grid;gap:4px}
.tactical-confrontation-row>div{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;color:#9eb6b8}
.tactical-confrontation-row>div b{font:700 11px Barlow Condensed;color:#edf8f5;min-width:28px}
.tactical-confrontation-row>div b.edge{color:#b6ff38}
.tactical-confrontation-track{display:grid;grid-template-columns:1fr 1fr;height:7px;border-radius:99px;overflow:hidden;background:#17313a}
.tactical-confrontation-track i{display:block;height:100%;transition:width .25s ease}
.tactical-confrontation-track i.home{background:linear-gradient(90deg,#24667c,#63d9ff)}
.tactical-confrontation-track i.away{background:linear-gradient(270deg,#1f4935,#b6ff38);justify-self:end}
.tactical-settings{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.tactical-settings span{padding:3px 7px;border:1px solid #315b68;border-radius:99px;color:#9eb6b8;font-size:9px}
.tactical-settings span.user{border-color:#63d9ff55;color:#c8f4ff}
.tactical-impact-final{margin-top:12px;padding-top:12px;border-top:1px solid #28505b}
.tactical-impact-final h4{margin:0 0 8px;color:#b6ff38;font:700 13px Barlow Condensed;letter-spacing:.3px}
.tactical-impact-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;padding:4px 0;font-size:10px;color:#9eb6b8}
.tactical-impact-row strong{color:#edf8f5;font-size:11px}
.timeline p.tactic{color:#63d9ff;font-weight:600}
`;
  document.head.append(style);
}

function confrontationBar({ label, homeValue, awayValue, homeName, awayName }) {
  const home = Math.max(0, Number(homeValue) || 0);
  const away = Math.max(0, Number(awayValue) || 0);
  const total = home + away || 1;
  const homePct = clamp(Math.round((home / total) * 100), 8, 92);
  const awayPct = 100 - homePct;
  const homeEdge = home >= away;
  return `<div class="tactical-confrontation-row">
    <div><b class="${homeEdge ? 'edge' : ''}">${Math.round(home)}</b><span>${label}</span><b class="${!homeEdge ? 'edge' : ''}">${Math.round(away)}</b></div>
    <div class="tactical-confrontation-track" title="${homeName} ${homePct}% · ${awayName} ${awayPct}%">
      <i class="home" style="width:${homePct}%"></i>
      <i class="away" style="width:${awayPct}%"></i>
    </div>
  </div>`;
}

export function tacticalConfrontationMarkup({
  homeLabel,
  awayLabel,
  homeProfile,
  awayProfile,
  homeTactics = null,
  awayTactics = null,
  subtitle = 'Força tática estimada pelo motor',
  showSettings = false,
}) {
  if (!homeProfile || !awayProfile) return '';
  const settings =
    showSettings && homeTactics
      ? `<div class="tactical-settings">
          <span class="user">${TACTIC_READOUT.mentality(homeTactics.mentality)} · ${homeTactics.mentality}%</span>
          <span class="user">${TACTIC_READOUT.possession(homeTactics.possession)} · ${homeTactics.possession}%</span>
          <span class="user">Pressão ${TACTIC_READOUT.press(homeTactics.press)}</span>
          <span class="user">Linha ${TACTIC_READOUT.offsideLine(homeTactics.offsideLine)}</span>
        </div>`
      : '';
  return `<section class="tactical-confrontation" aria-label="Confronto tático">
    <header><label>CONFRONTO TÁTICO</label><small>${subtitle}</small></header>
    ${confrontationBar({ label: 'Ataque', homeValue: homeProfile.attack, awayValue: awayProfile.attack, homeName: homeLabel, awayName: awayLabel })}
    ${confrontationBar({ label: 'Construção / passe', homeValue: homeProfile.passing, awayValue: awayProfile.passing, homeName: homeLabel, awayName: awayLabel })}
    ${confrontationBar({ label: 'Defesa', homeValue: homeProfile.defense, awayValue: awayProfile.defense, homeName: homeLabel, awayName: awayLabel })}
    ${settings}
  </section>`;
}

export function tacticalImpactSummaryMarkup({ planned, actual, homeLabel, awayLabel }) {
  if (!planned || !actual) return '';
  const row = (label, plannedValue, actualValue, suffix = '') =>
    `<div class="tactical-impact-row"><span>${homeLabel} · plano ${plannedValue}${suffix}</span><strong>${label}</strong><span>${awayLabel} · obtido ${actualValue}${suffix}</span></div>`;
  return `<section class="tactical-impact-final">
    <h4>PLANO TÁTICO VS PARTIDA</h4>
    ${row('Posse', `${planned.possession}%`, `${actual.possession}%`)}
    ${row('Passes certos', `${planned.passAccuracy}%`, `${actual.passAccuracy}%`)}
    ${row('Finalizações', planned.shots, actual.shots)}
    ${row('Impedimentos', planned.offsides, actual.offsides)}
    ${row('Faltas', planned.fouls, actual.fouls)}
  </section>`;
}

export function tacticalKickoffMessage(homeTactics) {
  if (!homeTactics) return '';
  return `Plano tático: ${TACTIC_READOUT.mentality(homeTactics.mentality)}, ${TACTIC_READOUT.possession(homeTactics.possession)}, pressão ${TACTIC_READOUT.press(homeTactics.press).toLowerCase()}, linha ${TACTIC_READOUT.offsideLine(homeTactics.offsideLine).toLowerCase()}.`;
}
