# 02 — Arquitetura

## Padrão arquitetural

**Monolito cliente** — uma IIFE em `js/site.js` concentra estado, lógica e apresentação. Não há separação formal em módulos ES; o acoplamento é por convenção de blocos dentro do arquivo.

## Camadas

```
┌─────────────────────────────────────────┐
│  Apresentação (HTML + render* + modais) │
├─────────────────────────────────────────┤
│  Handlers (on, onClick, bindLiveActions)│
├─────────────────────────────────────────┤
│  Motores (match, round, season, cup)    │
├─────────────────────────────────────────┤
│  Geração (RNG, players, clubs, fixtures)│
├─────────────────────────────────────────┤
│  Persistência (localStorage hydrate/save) │
└─────────────────────────────────────────┘
```

## Fluxo de arquivos

### `home.html` → `js/home.js`

- Verifica `localStorage` por save válido.
- Botões redirecionam para `index.html` ou `index.html?novo=1`.

### `index.html` → `js/site.js`

- Carrega views vazias (containers).
- `site.js` preenche conteúdo via `innerHTML` e listeners.
- CSS adicional injetado: `optionsCss`, estilos de modais.

## Estado global (dentro da IIFE)

Variáveis let/const mutáveis incluem:

- `clubs` — mapa nome → clube
- `careerSeason` — ano da temporada
- `userClub`, `userDivision` — clube do jogador
- `messages` — feed de notificações
- `calendarGames` — `Map` de eventos por data
- `cupCompetition` — fases da Copa
- `nationalCompetitions` — ligas A/B/C/D
- `nationalRankingEntries` — ranking anual

## Boot sequence

1. `hydrateSaves()` — lê `matchday-new-game` e `matchday-season`
2. Valida versão e integridade
3. Se sem carreira → gate (modal ou redirect)
4. Restaura datas (`new Date(iso)`)
5. Inicializa copa/calendário se necessário
6. `renderCurrentView()` + registro de handlers
7. Pronto para interação

## CSS

| Arquivo | Escopo |
|---------|--------|
| `layout.css` | Grid, sidebar, header |
| `site.css` | Componentes gerais |
| `championship.css` | Tabelas e competições |
| `calendar.css` | Agenda |
| `home.css` | Landing |
| Inline em `index.html` | Overrides pontuais |
| `optionsCss` em `site.js` | Modal opções, botões |

## Decisões de design

- **Sem build:** deploy = copiar pasta.
- **Sem API:** facilita alpha local; limita multiplayer/sync.
- **innerHTML:** rápido para protótipo; exige rebind de handlers em áreas dinâmicas.

## Documentação relacionada

- [Motores](./03-MOTORES.md)
- [Rotinas e fluxos](./04-ROTINAS-FLUXOS.md)
