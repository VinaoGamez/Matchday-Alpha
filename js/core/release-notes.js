/** Notas exibidas no alerta de atualização para testers. */
export const RELEASE_NOTES = [
  {
    version: 'alpha-02-tester-29',
    date: '2026-07-19',
    publishedAt: '2026-07-19T17:45:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Central',
        items: [
          'Botão PÓS-JOGO entre JOGAR PARTIDA e DIA DE JOGO para reabrir o resumo depois de fechar a janela.',
          'O × no pós-jogo só fecha a tela; SAIR continua avançando a rodada.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-28',
    date: '2026-07-19',
    publishedAt: '2026-07-19T17:35:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Relatório / NOTAS',
        items: [
          'Gol contra deixa de aparecer no time adversário quando há homônimos — bola vermelha só no autor do GC.',
          'Ícones de gol, assistência, cartões e substituições ficam amarrados ao lado correto da ficha.',
        ],
      },
      {
        label: 'Campeonatos',
        items: [
          'Botão REGRAS com o regulamento da competição aberta.',
          'Série C segue o calendário CBF (tamanho e zonas de acesso/rebaixamento sem inflar o grupo).',
        ],
      },
      {
        label: 'Mensagens / Análise',
        items: [
          'Mensagens antigas (14 dias) saem do contador, exceto as que pedem ação.',
          'Aviso médico urgente com destaque vermelho na navegação.',
          'Análise do clube: escudo, chips de estilo e coluna MÉDIA do histórico.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-27',
    date: '2026-07-19',
    publishedAt: '2026-07-19T15:15:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Escritório',
        items: [
          'META DE TEMPORADA ganha anel de desempenho ao lado do texto (mesmo visual do balanço de fim de temporada).',
          'O % é uma projeção do momento: posição/fase, ritmo de pontos e últimos resultados — vermelho abaixo, amarelo no ritmo, verde no alvo.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-26',
    date: '2026-07-19',
    publishedAt: '2026-07-19T14:50:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Mata-mata',
        items: [
          'Empate no agregado (ida+volta) abre disputa de pênaltis ao vivo — não resolve mais sozinho nos bastidores.',
          'Pênaltis só avançam a fase depois da disputa jogada no seu confronto; jogos só-CPU ainda podem decidir no automático.',
        ],
      },
      {
        label: 'Elenco / táticas',
        items: [
          'Ajustes de UI no painel tático e na página de campeonatos.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-25',
    date: '2026-07-19',
    publishedAt: '2026-07-19T00:45:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'AO VIVO',
        items: [
          'Pênalti contra: comparativo cobrador × goleiro; cobrança só após o botão ASSISTIR (tempo para ler).',
          'Acréscimos passam a seguir interrupções reais: sem cartão/substituição no 2º tempo, o quadro fica em 2–3\' (não mais 7\' por sorte).',
          'Gol contra no Volume: bola vermelha com detalhes brancos no lado do time que sofreu.',
          'Substituições no Volume: setas verde/vermelha no lado do time que fez a troca.',
          'Disputa de pênaltis no mata-mata: cobranças da IA também com comparativo e animação; título repetido removido.',
        ],
      },
      {
        label: 'Campeonatos',
        items: [
          'Todas as competições vira dropdown na página (sem modal); setas para grupos da Série D e fases da Copa/mata-mata.',
          'Com mata-mata da D ativo, alterne Grupos ↔ Mata-mata no modal e na página Campeonatos.',
          'Zonas de acesso/rebaixamento nas tabelas A/B/C; escudos e badges de divisão nos confrontos.',
        ],
      },
      {
        label: 'Temporada',
        items: [
          'Medidor gráfico no balanço: desempenho entregue vs meta pedida pela diretoria.',
          'Preview seguro: Opções → PREVIEW META (ou ?preview=season-goal) — não altera a carreira.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-24',
    date: '2026-07-18',
    publishedAt: '2026-07-19T00:15:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'AO VIVO',
        items: [
          'Acréscimos recalibrados: 1º ~1–3\', 2º ~3–5\' (7\' raro). Em mata-mata ou nas 2 últimas rodadas da liga, o 2º pode chegar a 8–10\' — extremamente raro.',
          'Badge de suspensão só aparece no torneio da partida (não vaza de Copa/liga cruzada). Elenco continua mostrando todas.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-23',
    date: '2026-07-18',
    publishedAt: '2026-07-18T23:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Economia',
        items: [
          'Prêmios de liga/Copa e receitas de TV/patrocínio/ingresso recalibrados — campanha boa paga bem sem inflar o caixa multi-ano.',
        ],
      },
      {
        label: 'AO VIVO',
        items: [
          'Volume de Jogo acompanha os acréscimos: linha e marcadores em 45+N / 90+N não colam mais no 90\'.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-22',
    date: '2026-07-18',
    publishedAt: '2026-07-18T22:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Motor de partida',
        items: [
          'Gol contra volta a ocorrer no AO VIVO e na simulação da IA (marcado como GC / gol contra).',
          'Acréscimos no fim de cada tempo: relógio 45+N / 90+N, anunciados pelo árbitro conforme faltas, cartões e substituições.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-21',
    date: '2026-07-18',
    publishedAt: '2026-07-18T21:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Integridade da partida',
        items: [
          'Recarregar a página no meio do jogo retoma o mesmo confronto — não dá mais para recomeçar e pescar resultado.',
          'Escalação e formação da tela Táticas passam a valer no pré-jogo e são salvas entre sessões.',
        ],
      },
      {
        label: 'Interface',
        items: [
          'Selo do campeonato (troféu + nome) na Central, no pré-jogo/AO VIVO e no relatório da partida.',
          'Volume de Jogo com curvas mais fluidas e marcadores de cartão/lesão.',
          'Escolha de cobrador de pênalti mais limpa (Overall + chance estimada).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-20',
    date: '2026-07-18',
    publishedAt: '2026-07-18T18:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'AO VIVO',
        items: [
          'Gráfico Volume de Jogo com marcadores de gol e artilheiros sob o placar.',
          'Timeline só com ocorrências importantes e escudo do time em cada evento.',
          'Ajuste tático na pausa fica recolhido por padrão (botão AJUSTE TÁTICO).',
        ],
      },
      {
        label: 'Economia e clube',
        items: [
          'Escolha de patrocínios (Master + 3 Secundários) no Novo Jogo e a cada temporada.',
          'Nome do estádio no Novo Jogo; rename só via Name Rights no Escritório.',
          'Metas da diretoria, status do clube e risco de demissão do técnico.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-19',
    date: '2026-07-17',
    publishedAt: '2026-07-17T21:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Testers',
        items: [
          'Guia do tester e envio de feedback na home e em Opções (copiar relatório ou abrir issue no GitHub).',
          'Deep links: home.html#guia e home.html#feedback.',
          'Arrasto de posições na prancheta volta a funcionar na build hardened (5081 / Pages).',
        ],
      },
      {
        label: 'Economia',
        items: [
          'Premiação da Série D e da Copa do Brasil por fase avançada (não usa mais a posição do grupo como ranking nacional).',
        ],
      },
      {
        label: 'Arquitetura',
        items: [
          'CSS do motor legado extraído para arquivos estáticos; módulos de fadiga e UI da partida ao vivo.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-18',
    date: '2026-07-17',
    publishedAt: '2026-07-17T20:20:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Estabilidade',
        items: [
          'Uso de memória e save do navegador otimizados: históricos compactos, artilharia magra e proteção contra cota do localStorage.',
          'Fechar o jogo ao vivo pausa o relógio (evita vazamento de timer em segundo plano).',
          'Histórico de lesões e títulos do ranking passam a ter teto por carreira longa.',
        ],
      },
      {
        label: 'Interface',
        items: [
          'Logos de patrocínio reenquadrados; valores do Escritório em destaque.',
          'Badge de Mensagens maior; tabelas da Central realinhadas.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-17',
    date: '2026-07-17',
    publishedAt: '2026-07-17T18:45:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Sidebar: Treinamento, Transferências e Categoria de Base abaixo de Estádio.',
          'Planejamento semanal de treinos moveu para a área Treinamento (atalho no Calendário).',
          'Transferências e Categoria de Base aparecem como Em Breve.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-16',
    date: '2026-07-17',
    publishedAt: '2026-07-17T17:35:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Bilheteria só credita em jogos em casa; trava reforçada no motor e na mensagem de resultado.',
          'VER ADVERSÁRIO AO VIVO volta a mostrar a formação no gramado (helpers táticos exportados).',
          'AO VIVO: estádio no formato Nome (CASA/FORA) · público · %; badges de lesão/cartão maiores no elenco.',
        ],
      },
      {
        label: 'Interface',
        items: [
          'CONFRONTO TÁTICO e PLANO TÁTICO VS PARTIDA ocultos (pré-jogo, pausa e pós-jogo).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-15',
    date: '2026-07-17',
    publishedAt: '2026-07-17T17:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Lotação do estádio no dia do jogo varia com Ambiente, torcida, preço do ingresso e fase (mata-mata agudo enche mais).',
          'AO VIVO mostra público/capacidade e % de lotação; bilheteria em casa entra no fluxo de caixa.',
          'Mensagem única RESULTADO DA PARTIDA com placar, público e bilheteria (sem alerta separado de bilheteria).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-14',
    date: '2026-07-17',
    publishedAt: '2026-07-17T16:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Posse AO VIVO recalibrada: mando segue o calendário (casa/fora), faixa mais realista e alinhada aos passes.',
          'Corrige extremos irreais (ex.: 62%–38% constantes) mantendo o efeito das táticas perceptível.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-13',
    date: '2026-07-17',
    publishedAt: '2026-07-17T16:20:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Correções',
        items: [
          'Posse de bola AO VIVO deixa de ficar travada em 50%–50%, principalmente em jogos fora de casa.',
          'Estatísticas salvas de Copa/mata-mata passam a respeitar mandante × visitante do calendário.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-12',
    date: '2026-07-17',
    publishedAt: '2026-07-17T15:50:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Novidades',
        items: [
          'Nova seção Escritório: orçamento, investimentos médicos e movimentos de caixa.',
          'Nova aba Estádio: gramado, expansão de capacidade e preços de ingresso (Nacional e Copas).',
          'Bilheteria creditada após jogos em casa — preço alto reduz ocupação; preço baixo enche mais o estádio.',
          'Patrocínio no Escritório: 1 Master + 3 secundários sorteados sem repetição, com valor por divisão.',
        ],
      },
      {
        label: 'Melhorias',
        items: [
          'Premiação de fim de temporada passa pelo módulo econômico (crédito com histórico).',
          'Saves antigos sem orçamento/estádio recebem valores iniciais da divisão automaticamente.',
        ],
      },
    ],
  },
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
