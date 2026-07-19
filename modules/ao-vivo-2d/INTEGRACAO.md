# Integração futura no AO VIVO da carreira

Este módulo é **apresentação 2D**. O motor de partida validado continua narrativo/tick em `js/engine/`.

## Fronteira

```
Carreira (validado)          AO VIVO 2D (este módulo)
─────────────────────        ─────────────────────────
match-live*.js               world-pitch.js (metros)
match-sim.js (rodada CPU)    match-sim.js (só visual)
#matchModal / logs           preview.html / tokens
```

Não renomear nem fundir os dois `match-sim.js` sem prefixo (`MatchViewMatchSim` vs engine).

## Passos sugeridos (quando for a hora)

1. Tratar `frozen/` como baseline aprovada; portar só o que estiver estável do `lab/`.
2. Expor uma API fina no engine: eventos `{ kind, attackSide, ballXY, outcome }` — o 2D só coreografa.
3. Montar o telão numa rota/modal **nova** (ex.: `#matchView2d`), sem substituir o AO VIVO atual até QA.
4. Reutilizar `live-bridge.js` apenas como leitura de placar/times do save — sem escrever no engine.
5. Build: incluir `modules/ao-vivo-2d/frozen/**` (ou o subset final) no Vite; paths relativos já são self-contained.

## Critérios de pronto (checklist)

- [ ] Separação mínima em tela (px) e em metros (WorldPitch tests verdes)
- [ ] Bola parte de jogador; saídas de campo completas; fades entre jogadas
- [ ] Soft-reset = mid-block com mescla (não kickoff muro)
- [ ] GK na pequena área; sem DF colado no goleiro
- [ ] Sem imports cruzados com `js/engine/match-live*`

## Snapshot

- Data do freeze: **2026-07-19**
- Origem: cópia de `assets/match-view/` após refinamentos de posicionamento (duty/Footure), bola, fade e anti-aglomeração
