/**
 * Bilhete da Diretoria no Escritório — tom conforme board, forma e caixa.
 */

const formPoints = form =>
  (form || []).reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

/**
 * @param {object} ctx
 * @param {number} ctx.board
 * @param {number} ctx.finances
 * @param {string[]} [ctx.form] — últimos resultados 'W'|'D'|'L'
 * @param {number} [ctx.position]
 * @param {number} [ctx.played]
 * @param {string} [ctx.goalLabel]
 * @param {boolean} [ctx.wageShortfall]
 * @returns {{ tone: 'ok'|'warn'|'risk'|'neutral', eyebrow: string, body: string }}
 */
export function composeBoardBrief({
  board = 58,
  finances = 60,
  form = [],
  position = null,
  played = 0,
  goalLabel = null,
  wageShortfall = false,
} = {}) {
  const boardValue = Number(board) || 58;
  const financeValue = Number(finances) || 60;
  const recent = (form || []).slice(-5);
  const pts = formPoints(recent);
  const games = recent.length;
  const ppg = games ? pts / games : null;
  const losses = recent.filter(r => r === 'L').length;
  const wins = recent.filter(r => r === 'W').length;

  let tone = 'neutral';
  let body = 'A diretoria acompanha a temporada com atenção profissional.';

  if (!played || games === 0) {
    return {
      tone: 'neutral',
      eyebrow: 'DIRETORIA',
      body: goalLabel
        ? `Projeto definido: ${goalLabel}. A diretoria espera consistência desde as primeiras rodadas.`
        : 'A diretoria aguarda o início da campanha para avaliar o trabalho.',
    };
  }

  if (wageShortfall || (boardValue < 35 && financeValue < 35)) {
    tone = 'risk';
    body =
      'Ambiente crítico. Resultados e finanças estão no vermelho — a diretoria cobra resposta imediata.';
  } else if (boardValue < 40 || (ppg != null && ppg < 0.9 && games >= 3)) {
    tone = 'risk';
    body =
      losses >= 3
        ? 'Sequência preocupante. A diretoria exige melhora imediata nos resultados.'
        : 'O projeto está sob pressão. A diretoria não aceita mais oscilação nesta fase.';
  } else if (boardValue < 50 || financeValue < 40 || (ppg != null && ppg < 1.2 && games >= 3)) {
    tone = 'warn';
    if (financeValue < 40 && boardValue >= 50) {
      body = 'Resultados aceitáveis, mas o caixa preocupa. A diretoria pede gestão mais austera.';
    } else if (wins === 0 && games >= 3) {
      body = 'Sem vitórias no período. A diretoria cobra mais intensidade e foco na meta.';
    } else {
      body = goalLabel
        ? `Desempenho irregular. A meta (${goalLabel}) ainda exige mais consistência.`
        : 'Desempenho irregular. A diretoria pede mais regularidade nas próximas rodadas.';
    }
  } else if (boardValue >= 70 && ppg != null && ppg >= 2) {
    tone = 'ok';
    body =
      position && position <= 8
        ? 'Excelente momento. A diretoria respalda o trabalho e reforça a ambição na tabela.'
        : 'Ótima sequência. A diretoria está satisfeita com a condução do elenco.';
  } else if (boardValue >= 58) {
    tone = 'ok';
    body = goalLabel
      ? `Trabalho alinhado ao projeto (${goalLabel}). A diretoria mantém confiança no comando.`
      : 'Campanha estável. A diretoria acompanha com tranquilidade o andamento.';
  } else {
    tone = 'warn';
    body = 'Momento de transição. A diretoria observa de perto e espera evolução semana a semana.';
  }

  return { tone, eyebrow: 'DIRETORIA', body };
}
