/** Notas exibidas no alerta de atualização para testers. */
export const RELEASE_NOTES = [
  {
    version: 'alpha-02-tester-11',
    date: '2026-07-17',
    publishedAt: '2026-07-17T14:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Melhorias',
        items: [
          'Motor tático reforçado: sliders de mentalidade, posse, pressão e linha de impedimento passam a impactar posse, finalizações, faltas e impedimentos de forma perceptível.',
          'Simulação de rodada alinhada ao jogo ao vivo — mesma escala de bônus táticos e linha de impedimento variável por estilo do adversário.',
          'Resumo pós-jogo compara plano tático (posse planejada, precisão estimada, finalizações) com o que aconteceu na partida.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-10',
    date: '2026-07-17',
    publishedAt: '2026-07-17T13:10:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Sistema disciplinar reformulado: 3 amarelos acumulados = 1 jogo suspenso, com contador separado por competição.',
          'Vermelho direto com punição de 1 a 3 jogos conforme a gravidade da falta.',
          'Confronto tático visual na pausa, tela de táticas e estatísticas ao vivo (ataque, passe e defesa).',
          'Orçamento fictício do clube no dashboard e premiação de fim de temporada (participação, colocação, título, Copa e acesso).',
        ],
      },
      {
        label: 'Correções',
        items: [
          'Cartões em jogos fora de casa passam a ser registrados corretamente no elenco.',
          'Placar ao vivo e estatísticas seguem mandante × visitante do calendário (seu time destacado em verde).',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Badges e mensagens mostram contador X/3 amarelos por competição.',
          'Timeline registra o plano tático no apito inicial; pós-jogo compara plano vs resultado.',
          'Balanço de temporada exibe detalhamento da premiação creditada.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-9',
    date: '2026-07-16',
    publishedAt: '2026-07-16T23:15:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Ritmo de jogo ULTRA (~8 s por tempo) nas Opções — acima do modo Rápido.',
        ],
      },
      {
        label: 'Correções',
        items: [
          'Botão SAIR ao vivo funciona novamente após o fim da partida.',
          'Placar da Copa do Brasil deixa de exibir pênaltis quando já há vencedor no tempo regulamentar.',
          'Saves antigos são saneados ao carregar — metadados órfãos de shootout removidos.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Card Ambiente do Elenco no dashboard com layout vertical e métricas empilhadas.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-8',
    date: '2026-07-16',
    publishedAt: '2026-07-16T22:41:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Balanço de fim de temporada redesenhado: campeões com troféu e escudo, artilheiros e assistências por liga.',
          'Painel de acessos e rebaixamentos com movimentos entre divisões.',
        ],
      },
      {
        label: 'Correções',
        items: [
          'Botão Iniciar próxima temporada avança de fato para a nova temporada, sem regravar o save antigo.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-7',
    date: '2026-07-16',
    publishedAt: '2026-07-16T22:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Dashboard modularizado: próximo jogo, mini-tabela, últimos resultados e líderes.',
          'Tela de táticas extraída para módulo dedicado: prancheta, escalação, substituições e sugestão tática.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Fase C da modularização concluída — engine legado significativamente mais enxuto.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-6',
    date: '2026-07-16',
    publishedAt: '2026-07-16T22:18:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Calendário extraído para módulo dedicado com agenda mensal e relatórios de partida.',
          'Badges de status do jogador (cartões, lesão, suspensão) compartilhados entre elenco e táticas.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-5',
    date: '2026-07-16',
    publishedAt: '2026-07-16T21:55:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Copa do Brasil não simula mais jogos do usuário sem participação.',
          'Calendário respeita intervalos de descanso entre rodadas.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-4',
    date: '2026-07-16',
    publishedAt: '2026-07-16T21:40:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Slider Linha de Impedimento nas táticas (pré-jogo e pausa ao vivo).',
          'Táticas do usuário persistidas no save da temporada.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Inbox de mensagens reorganizado por categorias (competição, médico, disciplina).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-3',
    date: '2026-07-16',
    publishedAt: '2026-07-16T21:20:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Jogo do dia avança corretamente ao sair da partida ou abrir a classificação.',
          'Expulsão do adversário não pausa mais o jogo.',
        ],
      },
      {
        label: 'Novidades',
        items: [
          'Botão Partidas em Andamento na pausa ao vivo.',
          'Prancheta tática redesenhada com marcadores menores e badges de status.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-2',
    date: '2026-07-16',
    publishedAt: '2026-07-16T20:50:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Jogo do dia avança corretamente ao sair da partida ou abrir a classificação.',
          'Expulsão do adversário não pausa mais o jogo.',
        ],
      },
      {
        label: 'Novidades',
        items: [
          'Botão "Partidas em Andamento" mostra placares parciais da rodada na pausa ao vivo.',
          'Prancheta tática redesenhada: marcadores menores, sobrenomes e badges de status.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Alerta de atualização para testers ao abrir uma versão nova.',
        ],
      },
    ],
  },
];
