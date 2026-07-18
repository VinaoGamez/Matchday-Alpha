/** Limites e âncoras da variação institucional na temporada. */
export const STATUS_MIN = 28;
export const STATUS_MAX = 98;

/** Neutros por indicador (mean-reversion suave). */
export const NEUTRAL = {
  environment: 62,
  support: 60,
  board: 58,
};

/** Drift legado (fallback). */
export const DRIFT_RATE = 0.003;

/** Ambiente: drift um pouco mais forte para estabilidade realista. */
export const ENVIRONMENT_DRIFT_RATE = 0.008;

/** Torcida: entre Ambiente e o drift antigo — oscila, sem travar. */
export const SUPPORT_DRIFT_RATE = 0.005;

/** Diretoria: volta ao neutro profissional sem apagar crise rápido. */
export const BOARD_DRIFT_RATE = 0.004;

/** Diretoria sente pressão quando Finanças fica abaixo deste limiar. */
export const BOARD_FINANCE_PRESSURE_THRESHOLD = 55;

/** Cobertura de custos (rodadas) abaixo disso também pressiona a mesa. */
export const BOARD_RUNWAY_PRESSURE_ROUNDS = 4;

/** Abaixo disso, vitórias/empates positivos valem menos para a Diretoria. */
export const BOARD_CHEAP_RESULT_FINANCES = 60;

/** Escala dos ganhos de Diretoria com finanças apertadas. */
export const BOARD_CHEAP_RESULT_SCALE = 0.5;

/**
 * Se Diretoria > Finanças + este gap, a mesa sofre puxão negativo por rodada.
 * Evita Diretoria 90% com Saúde financeira ~59%.
 */
export const BOARD_FINANCE_GAP_SOFT_CAP = 20;

/** Empate contextual: |gap| de posições na tabela. */
export const DRAW_POSITION_GAP = 6;
