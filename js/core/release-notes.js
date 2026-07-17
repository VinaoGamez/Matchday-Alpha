/** Notas exibidas no alerta de atualização para testers. */
export const RELEASE_NOTES = [
  {
    version: 'alpha-02-tester-4',
    date: '2026-07-16',
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
