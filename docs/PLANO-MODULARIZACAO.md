# Plano de modularização — Alpha 02

Documento de referência da migração incremental. Ver `CHANGELOG.md` para o que já entrou em cada build.

## Estrutura atual

```
js/
  main.js                 ← entry (index.html)
  site.js                 ← ponte legada
  core/
    constants.js
    event-bus.js
    save.js
  engine/
    injury.js             ← motor de lesões (Fase B)
    fatigue.js             ← motor de fadiga: recuperação, treino, desgaste ao vivo (Fase E)
    match-tuning.js       ← calibração e escalação sim (Fase B)
    match-core.js         ← formações e roundTactic (Fase B)
    match-sim.js          ← simulateRoundMatch (Fase B)
    match-live.js         ← ações ao vivo (Fase B)
    match-availability.js         ← workload/disponibilidade + commit ao vivo (Fase F)
    match-live-away-subs.js       ← banco/janelas/substituição do adversário ao vivo (Fase F)
    match-live-orchestration.js   ← tick/advance/foul, lesões em jogo, pênaltis/shootout (Fase F)
  ui/
    dom.js
    router.js
  feature/
    messages/index.js
    shared/player-cells.js ← inclui fatigueCell (Fase E)
    dashboard/index.js
    calendar-view/index.js
    tactics/index.js
    economy/index.js
    season-summary/index.js
    options/index.js          ← ritmo, opções, nova carreira (Fase E)
    live-day-matches/index.js ← modal "Ao vivo · Rodada" (Fase E)
    match-live-ui/index.js    ← relógio, placar, log, adversário ao vivo (Fase E)
    match-live-session/index.js ← resumo final, ações pós-jogo, abrir/reabrir partida (Fase F)
    tester-hub/index.js       ← guia do tester + feedback (Fase D)
  legacy/
    engine.js             ← ratings, tactics, calendar/season, handlers restantes
```

## Regras

1. **Motores não tocam DOM** — só regras e estado
2. **Features não alteram simulação** — só UI + handlers
3. **Save versionado** — ver `MODULE_VERSIONS` em `constants.js`
4. **CSS por módulo** — engine sem injeção JS (Fase E passo 2); features (tactics, tactical-confrontation, calendar-view, economy, season-summary, player-cells) também sem `createElement('style')` (Fase E passo 4) — CSS extraído para `css/*.css` linkados em `index.html`. Leftovers conhecidos: `tester-hub` (fallback mínimo só se faltar o link `css/tester-hub.css`) e `ui/update-alert.js`/`ui/release-notes-viewer.js` (chrome de UI, fora do escopo de features)

## Fases

| Fase | Escopo | Status |
|------|--------|--------|
| A | Vite, save, dom, router, messages | **Concluída** |
| B | injury, match-tuning, match-core, match-sim, match-live | **Concluída** |
| C | dashboard, tactics, calendar-view, player-cells | **Concluída** |
| D | build testers, guia, feedback | **Concluída** |
| E | economy, season-summary, options, live-day-matches, fatigue, match-live-ui | **Concluída** |
| F | orquestração ao vivo: match-availability, match-live-away-subs, match-live-orchestration, match-live-session | **Concluída** |

### Fase D — nota

- **Build testers:** `npm run build` → `dist/`, servidor hardened `5081`, GitHub Pages (`deploy-testers.yml`).
- **Guia:** `docs/GUIA-TESTER.md` + modal na home/Opções (`feature/tester-hub`).
- **Feedback:** formulário estruturado (copiar relatório ou abrir issue GitHub) +
  `.github/ISSUE_TEMPLATE/tester-feedback.yml`.

### Fase E — nota (concluída)

- **Passo 1:** extraídos `feature/options/index.js` (`createOptionsFeature`) e
  `feature/live-day-matches/index.js` (`createLiveDayMatchesFeature`) de `legacy/engine.js`.
  `MODULE_VERSIONS.options` e `MODULE_VERSIONS.liveDayMatches` em `constants.js`.
- **Passo 2:** CSS do `legacy/engine.js` (e base de options/live-day) movido para
  arquivos em `css/` linkados em `index.html` (ordem preserva o cascade antigo). Zero
  `createElement('style')` restante no engine.
- **Passo 3:** extraídos `engine/fatigue.js` (`createFatigueEngine`) e
  `feature/match-live-ui/index.js` (`createMatchLiveUiFeature`). `fatigueCell` em
  `feature/shared/player-cells.js`. `MODULE_VERSIONS.fatigue` e `MODULE_VERSIONS.matchLiveUi`
  em `constants.js`.
- **Também no escopo E (já extraídos antes/junto):** `feature/economy`, `feature/season-summary`.
- **Passo 4:** CSS injetado via `document.createElement('style')` nas features restantes
  movido para arquivos estáticos: `tactics/index.js` (6 blocos → `css/tactics-ui.css`),
  `tactics/tactical-confrontation.js` → `css/tactical-confrontation.css`,
  `calendar-view/index.js` (fullCalendarCss + matchReportCss → apensado a `css/calendar.css`),
  `economy/index.js` (economyOfficeCss) → `css/economy-office.css`, `season-summary/index.js`
  → `css/season-summary.css`, `shared/player-cells.js` (injectPlayerStatusCss) →
  `css/player-status.css`. Todos os injetores e call sites (inclusive em `legacy/engine.js`)
  foram removidos. Leftovers: `tester-hub` (fallback mínimo condicional) e `ui/update-alert.js`
  / `ui/release-notes-viewer.js` (UI chrome, não features).

### Fase F — nota (concluída)

Orquestração da partida ao vivo extraída de `legacy/engine.js` para quatro módulos novos,
todos factory `create...(deps)` sem DOM direto no motor (callbacks para render/log/clock):

- **`engine/match-availability.js`** (`createMatchAvailability`): `applyMatchWorkload`,
  `applyMatchAvailability`, `serveAvailability`, `commitLiveAvailability`.
- **`engine/match-live-away-subs.js`** (`createAwaySubController`): `awayBenchPlayers`,
  `replaceAwayPlayer`, `maxAwaySubWindows`, `buildLiveAwaySubState`, `makeAwayFatigueSubstitution`.
- **`engine/match-live-orchestration.js`** (`createLiveMatchOrchestration`): `tick`/`advance`/`foul`,
  lesões em jogo (`tryLiveEventInjury`, `escalateLivePlayThroughInjury`,
  `handleLivePlayThroughIncident`, `checkMinuteAggravation`, `enforceLiveRehabLimit`), `applyWear`
  e todo o fluxo de pênaltis/shootout.
- **`feature/match-live-session/index.js`** (`createMatchLiveSessionFeature`): `renderFinalSummary`,
  `showFinalActions`, `exitLiveMatch`, `reopenMatchWindow`, `openPreparation`.

`MODULE_VERSIONS.matchAvailability`, `.matchLiveAwaySubs`, `.matchLiveOrchestration`,
`.matchLiveSession` em `constants.js`. Ratings (`profile`/`opponentForMatch`/`playerFor`/
`actorData`/`tacticalDiscipline`/`liveOverall`) permanecem em `legacy/engine.js` — fortemente
acoplados ao painel tático — e são passados às novas engines como callbacks.

## Comandos

```bash
npm install
npm run dev      # Vite — http://127.0.0.1:5080
npm run build    # Saída em dist/
npm run preview  # Preview da build
```

Sem Node: `INICIAR-JOGO.bat` serve os módulos ES nativamente via Python.

## Exportar build para testers

```bash
npm run build
```

Distribuir a pasta `dist/` ou zipar. Links apontam para `home.html`.

Tester hardened (bundle): http://127.0.0.1:5081/home.html
