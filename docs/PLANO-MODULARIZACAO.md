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
    match-tuning.js       ← calibração e escalação sim (Fase B)
    match-core.js         ← formações e roundTactic (Fase B)
    match-sim.js          ← simulateRoundMatch (Fase B)
    match-live.js         ← ações ao vivo (Fase B)
  ui/
    dom.js
    router.js
  feature/
    messages/index.js
    shared/player-cells.js
    dashboard/index.js
    calendar-view/index.js
    tactics/index.js
  legacy/
    engine.js             ← orquestrador (~3.000 linhas)
```

## Regras

1. **Motores não tocam DOM** — só regras e estado
2. **Features não alteram simulação** — só UI + handlers
3. **Save versionado** — ver `MODULE_VERSIONS` em `constants.js`
4. **CSS por módulo** — evitar injeção JS (próxima fase)

## Fases

| Fase | Escopo | Status |
|------|--------|--------|
| A | Vite, save, dom, router, messages | **Concluída** |
| B | injury, match-tuning, match-core, match-sim, match-live | **Concluída** |
| C | dashboard, tactics, calendar-view, player-cells | **Concluída** |
| D | build testers, guia, feedback | Pendente |

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
