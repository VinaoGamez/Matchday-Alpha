/** Notas exibidas no alerta de atualização para testers. */
export const RELEASE_NOTES = [
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
          'Calendário nacional modularizado: rotinas, relatório de partida e persistência em js/feature/calendar-view.',
          'Células de jogador compartilhadas entre elenco, táticas e calendário (player-cells).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-5',
    date: '2026-07-16',
    publishedAt: '2026-07-16T22:06:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Opções do Jogo: consulte o histórico de atualizações com data, hora e detalhes de cada build.',
          'Modal de consulta no padrão das mensagens, com navegação entre versões anteriores.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-4',
    date: '2026-07-16',
    publishedAt: '2026-07-16T22:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Cansaço mais intenso: titulares terminam partidas visivelmente mais fatigados (~75% em média).',
          'Adversário troca jogadores por cansaço ao vivo (55\', 58\', 70\'…) para rodar elenco e evitar lesões.',
          'Aba TODOS em Partidas em Andamento agrupa jogos por divisão (Série A/B/C, Copa, Série D por grupo).',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Recuperação de cansaço equilibrada: todos os clubes recuperam no calendário, não só o seu time.',
          'Substituições simuladas priorizam reservas mais frescos quando o titular está abaixo de 72%.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-3',
    date: '2026-07-16',
    publishedAt: '2026-07-16T20:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Sidebar fixa: menu lateral sempre visível; só o conteúdo central rola.',
          'Partidas em Andamento abre em TODOS os jogos do dia, com filtros por campeonato e grupos da Série D.',
          'Lista de partidas ao vivo com scroll para ver todos os jogos em andamento.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Home sem bloco de compartilhamento de link — foco em novo jogo e continuar carreira.',
          'Mensagens de cartão amarelo mais claras, sem contagem acumulada na partida.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-2',
    date: '2026-07-16',
    publishedAt: '2026-07-16T17:00:00-03:00',
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
          'Partidas em andamento listam jogos de todas as divisões e da Copa, com filtros por competição.',
          'Prancheta tática redesenhada: marcadores menores, sobrenomes e badges de status.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Hub de mensagens com leitor em modal e navegação entre mensagens.',
          'Alerta de atualização para testers ao abrir uma versão nova.',
        ],
      },
    ],
  },
];
