/**
 * Notas exibidas no alerta de atualização para testers.
 * Estilo: linguagem simples, só o que o jogador precisa saber.
 * Evitar detalhes técnicos, números de calibração e jargão de motor.
 */
export const RELEASE_NOTES = [
  {
    version: 'Alpha V.1.60',
    date: '2026-07-22',
    publishedAt: '2026-07-22T01:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Calendário · mandos',
        items: [
          'Novas carreiras alternam casa e fora — no máximo 2 jogos seguidos no mesmo mando.',
          'Próximos Jogos e Calendário refletem a rotina mais equilibrada.',
        ],
      },
      {
        label: 'Diretoria · risco de emprego',
        items: [
          'Avisos de demissão aparecem em popup na tela, além da caixa de Mensagens.',
          'Campanha acima da meta protege o cargo quando finanças ou diretoria estão no vermelho.',
          'Colapso total (diretoria + finanças no piso) ou falência ainda encerram o ciclo.',
        ],
      },
      {
        label: 'Partida ao vivo',
        items: [
          'Cabeçalho reorganizado: AO VIVO no topo; fase do campeonato e estádio abaixo do badge.',
        ],
      },
      {
        label: 'Painel · próxima partida',
        items: [
          'Fase da competição e contexto na tabela (ex.: posição no grupo) ao lado dos clubes.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.55',
    date: '2026-07-21',
    publishedAt: '2026-07-21T21:25:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Estádio · capacidade',
        items: [
          'Teto de lotação alinhado ao modelo por setores — expansão máxima realista por série.',
          'Painel do estádio mostra capacidade atual e teto (ex.: 32.000 / 46.000).',
        ],
      },
      {
        label: 'Metas de temporada',
        items: [
          'Balanço de fim de temporada lista as metas complementares com ✓/◐/✗.',
          'No Escritório, a meta principal também exibe o resultado final após a avaliação.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.50',
    date: '2026-07-21',
    publishedAt: '2026-07-21T20:55:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Escritório · metas de temporada',
        items: [
          'Card de orçamento reorganizado: meta principal no anel e bloco Metas de temporada.',
          'Três metas complementares (torneio, economia, estrutura) com progresso ao vivo.',
          'No fim da temporada: avaliação com ✓/◐/✗, mensagem na caixa de entrada e impacto na diretoria.',
        ],
      },
      {
        label: 'Empréstimo bancário',
        items: [
          'Simulação só aparece após OK; confirmação com CONFIRMAR / NEGAR.',
          'Popup de informações e teto de crédito em valor exato (ex.: R$ 1.075.000).',
          'Se digitar acima do teto, ajusta ao máximo automaticamente.',
          'Avisos de validação em popup efêmero — não vão para Mensagens.',
        ],
      },
      {
        label: 'Mercado · empréstimo de jogador',
        items: [
          'O salário do emprestado entra integralmente na folha do clube que está usando o jogador.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.49',
    date: '2026-07-21',
    publishedAt: '2026-07-21T19:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Estádio · visual por divisão',
        items: [
          'Ilustração da arena muda conforme a Série (A, B, C ou D) — cada divisão tem escala visual própria.',
          'O badge mostra o tier e a série do clube (ex.: TIER 4/8 · Série D).',
        ],
      },
      {
        label: 'Empréstimo bancário',
        items: [
          'Financiamento por parcelas: escolha 12x, 24x, 36x ou 48x na contratação — mais parcelas, taxa maior.',
          'A taxa fica travada no contrato; o Escritório mostra como ela foi calculada (série, saúde do clube, prazo).',
          'Juros saem do caixa automaticamente; a parcela do principal você paga no Escritório.',
          'Em atraso, a parcela mostra encargos (juros + multa). Saves antigos migram para 24x.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.48',
    date: '2026-07-21',
    publishedAt: '2026-07-21T17:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Estádio',
        items: [
          'A arena agora evolui por setores — Popular, Arquibancada, Cadeiras, Camarotes e VIP — cada um com preço e lotação próprios.',
          'Novos jogos começam com estádio menor; investir na estrutura destrava setores e expande a bilheteria.',
          'Ilustração do estádio na aba Estádio muda conforme você investe (8 níveis visuais).',
          'Saves antigos migram automaticamente para o novo modelo de setores.',
        ],
      },
      {
        label: 'Naming do estádio',
        items: [
          'Na Série A ou B, com estrutura e investimentos suficientes, você pode fechar parceiro de naming — receita por rodada nacional.',
          'O nome do estádio continua o seu; o patrocinador aparece como parceiro. Na crise financeira, a receita cai ou zera.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.43',
    date: '2026-07-21',
    publishedAt: '2026-07-21T14:55:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Clima do clube',
        items: [
          'Com atrasos ou caixa no vermelho, a torcida esfria e o vestiário fica mais tenso.',
          'Ao sair da crise, há um alívio leve por algumas rodadas.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.38',
    date: '2026-07-21',
    publishedAt: '2026-07-21T13:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Mercado',
        items: [
          'Antes de comprar ou emprestar, o jogo mostra se a folha vai ficar apertada — você ainda pode seguir, mas fica avisado.',
          'Em crise grave, as contratações podem ser bloqueadas até as finanças melhorarem (vendas e adiantamento de TV continuam liberados).',
          'Clubes de série menor agora podem tentar contratar de séries superiores com ofertas bem altas — a chance é baixa e não é garantia.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.33',
    date: '2026-07-20',
    publishedAt: '2026-07-21T00:45:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Empréstimo e falência',
        items: [
          'Sistema de empréstimos adicionado — agora você pode pedir empréstimos.',
          'Sistema de falência adicionado — existe chance de colapso financeiro e de você ser demitido por isso.',
        ],
      },
      {
        label: 'Adiantamento de TV',
        items: [
          'Sistema de adiantamento de cota de TV adicionado — agora, para ganhar respiro orçamentário, você pode pedir adiantamento da cota de TV.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.32',
    date: '2026-07-20',
    publishedAt: '2026-07-21T00:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Adiantamento de TV',
        items: [
          'Sistema de adiantamento de cota de TV adicionado.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.31',
    date: '2026-07-20',
    publishedAt: '2026-07-20T23:25:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Empréstimo e falência',
        items: [
          'Sistema de empréstimos adicionado — agora você pode pedir empréstimos.',
          'Sistema de falência adicionado — existe chance de colapso financeiro e de você ser demitido por isso.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.26',
    date: '2026-07-20',
    publishedAt: '2026-07-20T20:50:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Economia',
        items: [
          'Cheque especial dinâmico: taxa sobe com saúde, rombo e rodadas seguidas no vermelho.',
          'Ficar no negativo ~5–6 rodadas pressiona forte Finanças e Diretoria (risco de demissão com campanha ruim).',
          '1–2 rodadas no vermelho ainda são recuperáveis; sair do negativo zera o contador.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.25',
    date: '2026-07-20',
    publishedAt: '2026-07-20T05:05:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Mercado',
        items: [
          'Na busca de jogadores, clicar no nome do clube abre a análise do time.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.20',
    date: '2026-07-20',
    publishedAt: '2026-07-20T05:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Elenco',
        items: ['Tag EMPR. de jogador emprestado agora em laranja.'],
      },
    ],
  },
  {
    version: 'Alpha V.1.15',
    date: '2026-07-20',
    publishedAt: '2026-07-20T04:55:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Elenco',
        items: [
          'Após pulsos de evolução, o Overall no Elenco mostra ↑ verde, ↓ vermelho ou − laranja (estável).',
          'A marcação permanece por 3 semanas no calendário do jogo.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.10',
    date: '2026-07-20',
    publishedAt: '2026-07-20T04:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Elenco / Prancheta',
        items: [
          'Hover na lista de titulares/reservas destaca o jogador na prancheta (scout, adversário ao vivo e táticas).',
          'Jogadores emprestados mostram a tag EMPR. ao lado do nome no elenco e listagens.',
        ],
      },
      {
        label: 'Mercado',
        items: [
          'Recusar proposta de empréstimo agora atualiza a mensagem para “Proposta recusada” e mantém o leitor aberto.',
          'Falha ao pedir empréstimo no mercado gera mensagem na caixa de entrada.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.05',
    date: '2026-07-20',
    publishedAt: '2026-07-20T03:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Calendário / Save',
        items: [
          'Save da temporada bem mais leve: fadiga/disponibilidade esparsas, sem duplicar o AO VIVO, históricos compactos.',
          'Avanço do calendário não faz mais reschedule pesado em loop (menos travadas na UI).',
          'Se a cota do navegador estourar, o jogo corta históricos extras e tenta gravar de novo.',
        ],
      },
    ],
  },
  {
    version: 'Alpha V.1.00',
    date: '2026-07-20',
    publishedAt: '2026-07-20T03:15:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Versão',
        items: [
          'Nova nomenclatura das atualizações: Alpha V.1.00 (próximas sobem de 0.05 em 0.05).',
        ],
      },
      {
        label: 'Mercado',
        items: [
          'Mercado de transferências ativo também no GitHub Pages (não só no build local).',
          'Funil de propostas da IA calibrado: ~4 por janela, pico de 2 pendentes, expiração em 4 dias.',
        ],
      },
      {
        label: 'Temporada e UI',
        items: [
          'Corrigidos crashes da simulação idle e do balanço/próxima temporada (Série D).',
          'Calendário alinhado ao dia de carreira; pós-jogo com AVANÇAR e CLASSIFICAÇÃO sem consumir a rodada.',
          'Tabelas no visual MatchDay; limpeza mais agressiva quando a cota do localStorage estoura.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-35',
    date: '2026-07-20',
    publishedAt: '2026-07-20T03:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Temporada idle',
        items: [
          'Corrigido crash ao simular o restante da temporada e no balanço/próxima temporada (Série D promoted).',
          'Simulação idle mais resistente a fixtures/Copa incompletos e clubes ausentes.',
          'Calendário não deixa jogos da Copa atrás do dia de carreira; Dia de Jogo reconhece partidas atrasadas.',
        ],
      },
      {
        label: 'Pós-jogo e tabelas',
        items: [
          'AVANÇAR no pós-jogo; CLASSIFICAÇÃO não consome a rodada (dá para reabrir PÓS-JOGO).',
          'Tabelas do campeonato no visual MatchDay (azul); zonas de acesso e linha do seu clube em verde.',
        ],
      },
      {
        label: 'Save',
        items: [
          'Quota do localStorage: limpeza mais agressiva do histórico de jogadores quando a cota estoura.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-34',
    date: '2026-07-20',
    publishedAt: '2026-07-20T01:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Mercado',
        items: [
          'Propostas da IA ao seu elenco bem menos frequentes (~4 por janela, pico de 2 pendentes).',
          'Funil interesse → chance → no máximo 1 oferta por tick; 1 tick/semana (diário só no deadline).',
          'Propostas expiram em 4 dias; recusa gera cooldown de 10 dias no mesmo jogador.',
          'No GitHub Pages o mercado continua desligado; no build local de testers segue ativo.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-33',
    date: '2026-07-20',
    publishedAt: '2026-07-20T01:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Motor de partida',
        items: [
          'Calibração v4c: média de gols mais próxima do Brasileirão e bem menos goleadas extremas (8×0).',
          'Novo freio por placar: quem já lidera por 2+ gols perde conversão nas finalizações.',
          'Ao vivo alinhado à simulação (menos boost artificial de ataque no chute).',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-32',
    date: '2026-07-20',
    publishedAt: '2026-07-20T00:30:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Central',
        items: [
          'Cabeçalho vira informativo em ticker contínuo (próximo jogo, rodada, mercado e vendas).',
          'Orçamento do clube com ícone de moedas e destaque visual.',
          'Após fechar a janela de transferências, o botão Avançar Semana continua no Dashboard.',
          'Card da próxima partida com escudos e nomes maiores; nomes de clubes abrem o scout.',
        ],
      },
      {
        label: 'Mercado',
        items: [
          'No GitHub Pages o mercado permanece desligado; no build local de testers continua ativo.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-31',
    date: '2026-07-20',
    publishedAt: '2026-07-20T00:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Elenco / Evolução',
        items: [
          'Motor de evolução em 4 pulsos na temporada (notas, minutos e titularidade); idade +1 no ano novo.',
          'Tabela do Elenco destaca os 3 melhores atributos de cada jogador.',
          'Geração: jovens abaixo de 19 mais raros; jóias com potencial mais alto.',
        ],
      },
      {
        label: 'Pênaltis',
        items: [
          'Disputa não trava mais na morte súbita: a lista de cobradores reinicia até haver vencedor.',
          'Goleiro também pode bater pênalti.',
        ],
      },
    ],
  },
  {
    version: 'alpha-02-tester-30',
    date: '2026-07-19',
    publishedAt: '2026-07-19T18:00:00-03:00',
    title: 'Matchday Football foi atualizado',
    topics: [
      {
        label: 'Central',
        items: [
          'PÓS-JOGO só aparece depois de fechar o resumo da partida recém-jogada; some ao SAIR.',
          'Com o pós-jogo pendente, JOGAR PARTIDA fica oculto (mesmo fluxo do PÓS-JOGO).',
        ],
      },
    ],
  },
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
