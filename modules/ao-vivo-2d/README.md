# AO VIVO 2D — módulo (implementação futura)

> **Status: adiado.** Guardado para uma fase futura. Não integrar no AO VIVO da carreira por agora.

Sandbox visual de partida em 2D (estádio + WorldPitch top-down).  
**Não faz parte do AO VIVO validado da carreira** (`js/engine/match-live*`, `#matchModal`).

| Pasta | Função |
|---|---|
| `frozen/` | Snapshot **validado** (19 Jul 2026). Não alterar — referência para integração futura. |
| `lab/` | Cópia para testes e refinamentos. Pode mudar à vontade. |
| `scripts/` | Testes headless apontando para `lab/` (ou `frozen/` via env). |

## Como testar (Vite em `npm run dev`)

Hub do módulo:

- http://localhost:5080/modules/ao-vivo-2d/

**Validado (frozen)**

- Telão: http://localhost:5080/modules/ao-vivo-2d/frozen/preview.html
- Top-down: http://localhost:5080/modules/ao-vivo-2d/frozen/world-preview.html
- Editor: http://localhost:5080/modules/ao-vivo-2d/frozen/layout-editor.html

**Lab (experimentos)**

- Telão: http://localhost:5080/modules/ao-vivo-2d/lab/preview.html
- Top-down: http://localhost:5080/modules/ao-vivo-2d/lab/world-preview.html
- Editor: http://localhost:5080/modules/ao-vivo-2d/lab/layout-editor.html

## Testes

```bash
npm run test:ao-vivo-2d          # lab
npm run test:ao-vivo-2d:frozen   # snapshot validado
```

## O que NÃO tocar

- `js/engine/match-live.js` e restante do AO VIVO de carreira
- `js/legacy/engine.js` / `#playMatch` / `#matchModal`
- `assets/match-view/` — cópia antiga no assets (não usada para integração futura; fonte = este módulo)

## Integração futura

Ver [INTEGRACAO.md](./INTEGRACAO.md).

## Conteúdo técnico (resumo)

- `field-geometry.js` — calibração UV do estádio (`BALL_KICKOFF`, trapézio)
- `world-pitch.js` — verdade em metros, duty 4-3-3, funções Footure, settle/colisão
- `play-engine.js` — diretor de animação (passe, carry, fade, ballOut)
- `playbook.js` — jogadas (buildup, shot, cross, corner, tackle, counter)
- `match-sim.js` — simulação visual 90' (**≠** `js/engine/match-sim.js`)
- `live-bridge.js` — leitura opcional de localStorage (sem importar o engine)
