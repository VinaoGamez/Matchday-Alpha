import { clamp } from '../../ui/dom.js';

export const TACTIC_READOUT = {
  mentality: value => (value < 35 ? 'Defensiva' : value > 65 ? 'Ofensiva' : 'Equilibrada'),
  possession: value => (value < 35 ? 'Contra-ataque' : value > 65 ? 'Posse de bola' : 'Misto'),
  press: value => (value < 35 ? 'Baixa' : value > 65 ? 'Alta' : 'Média'),
  offsideLine: value => (value < 35 ? 'Baixa' : value > 65 ? 'Alta' : 'Normal'),
};

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

export function tacticalConfrontationMarkup() {
  // Painel oculto — não renderiza em pré-jogo, pausa, táticas nem AO VIVO.
  return '';
}

export function tacticalImpactSummaryMarkup() {
  // Pós-jogo: resumo plano vs partida oculto em todas as telas.
  return '';
}

export function tacticalKickoffMessage(homeTactics) {
  if (!homeTactics) return '';
  return `Plano tático: ${TACTIC_READOUT.mentality(homeTactics.mentality)}, ${TACTIC_READOUT.possession(homeTactics.possession)}, pressão ${TACTIC_READOUT.press(homeTactics.press).toLowerCase()}, linha ${TACTIC_READOUT.offsideLine(homeTactics.offsideLine).toLowerCase()}.`;
}
