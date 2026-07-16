# 01 — Visão Geral

## O que é o Matchday Football Alpha 01

Simulador de gestão de futebol brasileiro que roda no navegador. O jogador assume um clube em uma das quatro divisões nacionais, gerencia elenco e táticas, disputa campeonatos e a Copa do Brasil.

## Público e objetivo

- Experiência single-player offline (com servidor HTTP local apenas para servir arquivos).
- Foco em realismo brasileiro: Séries A–D, Copa do Brasil, calendário sazonal.

## Como jogar

1. Execute `INICIAR-JOGO.bat`.
2. Abra http://127.0.0.1:5080/home.html
3. **Novo Jogo** → cria carreira | **Continuar** → retoma save.

## Componentes principais

| Componente | Arquivo | Papel |
|------------|---------|-------|
| Landing | `home.html` + `js/home.js` | Entrada, detecção de save |
| Shell do jogo | `index.html` | 7 views + estrutura DOM |
| Motor | `js/site.js` | Simulação, UI, persistência |
| Estilos | `css/*.css` + CSS runtime | Visual e layout |

## Divisões jogáveis

- **Série A** — 20 clubes, 38 rodadas
- **Série B** — 20 clubes, playoffs de acesso
- **Série C** — 20 clubes, acesso direto e rebaixamento
- **Série D** — 96 clubes em grupos, mata-mata

## Tecnologias

- JavaScript ES6+ (sem bundler, sem framework)
- HTML5 + CSS3
- `localStorage` para saves
- Python `http.server` para desenvolvimento local

## Documentação relacionada

- [Arquitetura](./02-ARQUITETURA.md)
- [Motores](./03-MOTORES.md)
- [Documentação completa](./DOCUMENTACAO-COMPLETA.md)
