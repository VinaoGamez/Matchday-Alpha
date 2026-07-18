# Changelog — Matchday Football

## alpha-02-tester-1 (Jul 2026)

### Arquitetura (Fase B)
- `js/engine/injury.js` — catálogo, risco, reabilitação, disponibilidade
- `js/engine/match-tuning.js` — `ENGINE_TUNING`, foul/blowout, `buildSimLineup`
- `js/engine/match-core.js` — formações, papéis compatíveis, `roundTactic`
- `js/engine/match-sim.js` — `simulateRoundMatch` (90 min da rodada)
- `js/engine/match-live.js` — `addPasses`, `shot`, `buildAttack` (partida ao vivo)
- UI de tratamento, tick/advance/foul e lesões ao vivo permanecem em `legacy/engine.js`
- Fase B do motor concluída; próximo: features (Fase C)

### Arquitetura (Fase A)
- Estrutura modular com ES modules e Vite
- Entry point: `js/main.js`
- Motor legado isolado em `js/legacy/engine.js`
- Módulos extraídos:
  - `js/core/constants.js` — versão, chaves de save, feature flags
  - `js/core/event-bus.js` — pub/sub entre setores
  - `js/core/save.js` — leitura/gravação localStorage
  - `js/ui/dom.js` — helpers DOM e navegação
  - `js/ui/router.js` — navegação entre views
  - `js/feature/messages/` — hub de mensagens isolado
- `js/site.js` mantido como ponte de compatibilidade

### Correções
- Boot sem save: guard em `serieDGroups` quando não há carreira
- Export `injurySeverityLabel` faltando no destructuring do motor de lesões

### Para testers
- Fluxo congelado: Novo Jogo → Central → Táticas → Partida → Mensagens
- Build: `npm run build` → pasta `dist/`
- Dev local: `npm run dev` (porta 5080) ou `INICIAR-JOGO.bat` (Python)

### Próximo
- CSS residual ainda injetado em algumas features (tactics, calendar, economy…)
- Refresh CHANGELOG por build de tester

## alpha-02-tester-19 (Jul 2026)

### Fase D (testers)
- Guia do tester + feedback na home e em Opções (`js/feature/tester-hub`)
- Template de issue GitHub e `docs/GUIA-TESTER.md`
- Build/distribuição já existentes (dist, 5081, Pages)

### Economia
- Premiação Série D e Copa do Brasil por fase avançada

### Arquitetura (Fase E parcial)
- CSS do engine em arquivos estáticos; `fatigue.js` + `match-live-ui`
