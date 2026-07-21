/**
 * Textos humanos para propostas / recusas de mercado.
 */

const REASON_LINES = {
  division_gap: 'o salto entre as séries não fecha o negócio neste momento',
  buyout_below_min: 'só uma oferta bem acima do valor de mercado abriria uma chance rara',
  buyout_rejected: 'nem a oferta elevada convenceu a diretoria a liberar o jogador',
  contract_long: 'o vínculo contratual ainda é longo demais para o clube abrir mão',
  contract_short: 'mesmo com contrato curto, a proposta não convenceu a diretoria',
  pos_thin: 'a posição ficaria descoberta no elenco',
  pos_depth: 'há sobra na posição, mas o valor não agradou',
  roster_thin: 'o elenco está no limite e a saída não foi aprovada',
  good_moment: 'o clube vive bom momento e prefere manter a peça',
  bad_moment: 'mesmo sob pressão, a oferta ficou aquém do esperado',
  rank_strong: 'o status do clube eleva a exigência na negociação',
  rank_weak: 'a diretoria precisa de uma proposta mais sólida',
  star: 'o jogador é considerado peça importante do projeto',
  listed: 'mesmo listado, o clube espera uma proposta mais próxima do pedido',
  injured: 'com o quadro físico atual, a negociação foi adiada',
  manager_pull: 'houve interesse no seu trabalho, mas o valor não fechou',
  offer_too_high: 'o preço pedido ficou acima do que o mercado topa pagar',
  no_buyer: 'nenhum clube apresentou interesse compatível',
  loan_level:
    'agradeço a proposta, mas não quero jogar em divisões inferiores neste momento',
  already_moved:
    'este jogador já se movimentou nesta janela de transferências',
  payroll_pressure: 'a folha do clube interessado não comporta a operação',
  loan_in_limit: 'o limite de empréstimos do interessado já foi atingido',
  loan_out_limit: 'o limite de jogadores cedidos já foi atingido',
  min_roster: 'o elenco não pode ficar abaixo do mínimo',
  seller_min_roster: 'o clube de origem não pode reduzir mais o elenco',
  cannot_afford: 'não há caixa suficiente para concluir',
  market_closed: 'o mercado está fechado no momento',
  window_closed: 'a janela de transferências está fechada',
  rejected: 'a proposta ficou abaixo do mínimo aceito pelo clube',
  counter_offer: 'o clube respondeu com uma contra-proposta de valor',
};

export function transferRejectReasonLine(reason) {
  if (!reason) return null;
  return REASON_LINES[reason] || null;
}

export function transferRejectReasonLines(reasons = []) {
  return (reasons || []).map(transferRejectReasonLine).filter(Boolean);
}

/** Carta curta quando a IA recusa a oferta do usuário. */
export function formatSellerRejectLetter({ clubName, playerName, reasons = [] } = {}) {
  const club = clubName || 'O clube';
  const player = playerName || 'o jogador';
  const lines = transferRejectReasonLines(reasons).slice(0, 2);
  const why = lines.length
    ? ` Motivo: ${lines.join('; ')}.`
    : ' A proposta ficou aquém do que a diretoria considera justo.';
  return `Após avaliar a oferta por ${player}, ${club} comunicou que não avançará na negociação.${why}`;
}

/** Inbox: você recusou proposta recebida. */
export function formatUserRejectOfferLetter({ fromClub, playerName, offerType = 'buy' } = {}) {
  const club = fromClub || 'o clube interessado';
  const player = playerName || 'o jogador';
  if (offerType === 'loan') {
    return `Você declinou o empréstimo de ${player} solicitado por ${club}. A proposta foi encerrada.`;
  }
  return `Você declinou a proposta de ${club} por ${player}. A negociação foi encerrada sem acordo.`;
}

/** Inbox: proposta expirou. */
export function formatOfferExpiredLetter({ fromClub, playerName } = {}) {
  const club = fromClub || 'O clube';
  const player = playerName || 'o jogador';
  return `O prazo da proposta de ${club} por ${player} encerrou sem resposta. A negociação caducou.`;
}

/**
 * Recusa de empréstimo por nível/série — voz do jogador.
 * Agradece, recusa divisões inferiores e deixa a porta aberta.
 */
export function formatLoanLevelPlayerReply({ playerName } = {}) {
  const who = playerName || 'O jogador';
  return `${who}: "Agradeço a proposta, mas não quero jogar em divisões inferiores neste momento. Fico aberto a novas propostas no futuro."`;
}

/** Inbox: proposta nova. `feeLabel` já formatado (ex.: R$ 1,2 mi). */
export function formatIncomingOfferLetter({
  fromClub,
  playerName,
  feeLabel = null,
  offerType = 'buy',
} = {}) {
  const club = fromClub || 'Um clube';
  const player = playerName || 'um jogador';
  if (offerType === 'loan') {
    return `${club} solicita ${player} por empréstimo até o fim da temporada. Avalie com calma — a resposta define o destino do atleta.`;
  }
  if (feeLabel) {
    return `${club} oferece ${feeLabel} por ${player}. A diretoria aguarda sua decisão.`;
  }
  return `${club} apresentou proposta por ${player}. A diretoria aguarda sua decisão.`;
}
