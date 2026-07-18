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
    tester-hub/index.js       ← guia do tester + feedback (Fase D)
  legacy/
    engine.js             ← orquestrador (~3.000 linhas)
```

## Regras

1. **Motores não tocam DOM** — só regras e estado
2. **Features não alteram simulação** — só UI + handlers
3. **Save versionado** — ver `MODULE_VERSIONS` em `constants.js`
4. **CSS por módulo** — engine sem injeção JS (passo 2); features restantes ainda injetam em alguns casos

## Fases

| Fase | Escopo | Status |
|------|--------|--------|
| A | Vite, save, dom, router, messages | **Concluída** |
| B | injury, match-tuning, match-core, match-sim, match-live | **Concluída** |
| C | dashboard, tactics, calendar-view, player-cells | **Concluída** |
| D | build testers, guia, feedback | **Concluída** |
| E | economy, season-summary, options, live-day-matches, fatigue, match-live-ui | Em andamento |

### Fase D — nota

- **Build testers:** `npm run build` → `dist/`, servidor hardened `5081`, GitHub Pages (`deploy-testers.yml`).
- **Guia:** `docs/GUIA-TESTER.md` + modal na home/Opções (`feature/tester-hub`).
- **Feedback:** formulário estruturado (copiar relatório ou abrir issue GitHub) +
  `.github/ISSUE_TEMPLATE/tester-feedback.yml`.

### Fase E — nota

- **Passo 1 (concluído):** extraídos `feature/options/index.js` (`createOptionsFeature`) e
  `feature/live-day-matches/index.js` (`createLiveDayMatchesFeature`) de `legacy/engine.js`.
  `MODULE_VERSIONS.options` e `MODULE_VERSIONS.liveDayMatches` adicionados em `constants.js`.
- **Passo 2 (concluído):** CSS do `legacy/engine.js` (e base de options/live-day) movido para
  arquivos em `css/` linkados em `index.html` (ordem preserva o cascade antigo). Zero
  `createElement('style')` restante no engine.
- **Passo 3 (concluído):** extraídos `engine/fatigue.js` (`createFatigueEngine` — recuperação
  diária, treino antes/depois de jogo, fadiga pós-jogo de Copa e desgaste por minuto ao vivo via
  `applyMinuteWearToLineup`) e `feature/match-live-ui/index.js` (`createMatchLiveUiFeature` —
  modal do adversário ao vivo, relógio/segundos, `score`/`log`/`renderLiveOpponent` e
  `bindLiveActions`) de `legacy/engine.js`. `fatigueCell` migrou para
  `feature/shared/player-cells.js`. `MODULE_VERSIONS.fatigue` e `MODULE_VERSIONS.matchLiveUi`
  adicionados em `constants.js`. Orquestração (`tick`/`advance`, injeção/pênaltis,
  `#playMatch`/`#resumeMatch`/`#closeMatch`, `applyMatchAvailability`) permanece no engine por
  estar fortemente acoplada ao estado da partida ao vivo.

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
