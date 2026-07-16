# 06 — Interface

## Shell (`index.html`)

Estrutura fixa:

- **Header** — nome do clube, temporada, rodada
- **Sidebar** — navegação `.nav-btn`
- **Main** — container `#view-*` por seção
- **Modais** — injetados por `site.js` no `document.body`

---

## Views

### Dashboard (`#view-dashboard`)

- Próximo adversário e data
- Resumo da tabela
- Atalhos: jogar rodada, scout, mensagens recentes
- Indicadores de lesões/suspensões

### Elenco (`#view-squad`)

- Tabela/lista de jogadores
- Overall, posição, status (lesão, cartão, carga)
- Ações: tratamento, detalhes

### Táticas (`#view-tactics`)

- Seletor de formação (grid de botões)
- Sliders: pressão, ritmo, largura, profundidade, etc.
- Campo com drag-drop dos 11 titulares
- Banco de reservas

### Tabela (`#view-table`)

- Classificação da divisão do usuário
- Destaque na linha do clube gerenciado
- Link para detalhes do campeonato (modal)

### Ranking (`#view-ranking`)

- Ranking nacional de clubes
- Pontuação acumulada na temporada

### Mensagens (`#view-messages`)

- Feed cronológico
- Filtro por categoria
- Limite 200 entradas

### Calendário (`#view-calendar`)

- Visão mensal/semanal de jogos e treinos
- Cores por tipo: liga, copa, treino

---

## Modais (runtime)

| ID / classe | Propósito |
|-------------|-----------|
| Modal nova carreira | Criação de save |
| Modal opções | Ritmo, preferências |
| Modal partida | Simulação ao vivo |
| Modal tratamento | Programas médicos |
| Modal scout | Observação de jogadores |
| Modal campeonato | Detalhes da competição |
| Modal resultados rodada | Placares da rodada |
| Modal transição | Fim de temporada |

Modais usam overlay + `display`/`classList` para show/hide.

---

## Partida ao vivo — UI

Elementos típicos:

- Placar e minuto
- Barra de posse ou momentum (se habilitado)
- Log de narração (scroll)
- Estatísticas: chutes, cartões, substituições
- Botões: velocidade, pular, fechar (após fim)

`bindLiveActions()` após cada atualização do log/placar.

---

## Landing (`home.html`)

- Visual branding
- **Novo Jogo** → `index.html?novo=1`
- **Continuar** → `index.html` (se save existe)
- Estilo: `css/home.css`, lógica: `js/home.js`

---

## Padrões visuais

- Tema escuro/clube (variáveis CSS em `site.css`)
- Tipografia sistema-ui
- Componentes: cards, badges, tabelas responsivas
- Botão primário: gradiente definido em `optionsCss` para `#confirmNewGame`

---

## Acessibilidade e UX

- Textos em pt-BR
- Datas formatadas localmente
- Feedback via `pushMessage` após ações importantes
- Reload limpo via `redirectGame()` evita loops de modal

---

## Cache bust

`index.html` referencia:

```
js/site.js?v=20260715-handlers
```

Altere o query string ao publicar nova versão.
