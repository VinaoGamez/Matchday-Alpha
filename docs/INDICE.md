# Matchday Football Alpha 01 — Índice da Documentação

**Versão:** Alpha 01  
**Data:** Julho 2026  
**Motor principal:** `js/site.js` (~2.421 linhas)

---

## Documentos para exportação

| Arquivo | Conteúdo |
|---------|----------|
| [DOCUMENTACAO-COMPLETA.md](./DOCUMENTACAO-COMPLETA.md) | **Documento único** — análise integral (recomendado para PDF/impressão) |
| [01-VISAO-GERAL.md](./01-VISAO-GERAL.md) | Visão do produto, stack e pontos de entrada |
| [02-ARQUITETURA.md](./02-ARQUITETURA.md) | Estrutura de arquivos, boot, camadas CSS |
| [03-MOTORES.md](./03-MOTORES.md) | Motores de simulação, carreira, calendário, copa, ranking |
| [04-ROTINAS-FLUXOS.md](./04-ROTINAS-FLUXOS.md) | Rotinas de jogo, handlers, ciclo de rodada/temporada |
| [05-MODELOS-DADOS.md](./05-MODELOS-DADOS.md) | localStorage, entidades, persistência |
| [06-INTERFACE.md](./06-INTERFACE.md) | Views, modais, navegação |
| [07-HOSPEDAGEM.md](./07-HOSPEDAGEM.md) | Servidor local, túnel externo, compartilhamento |
| [08-JOGADAS-E-RITMO.md](./08-JOGADAS-E-RITMO.md) | Jogadas ao vivo/simulação, ritmo do relógio e bases numéricas |
| [PLANO-MODULARIZACAO.md](./PLANO-MODULARIZACAO.md) | Migração modular Alpha 02 |

---

## Exportar para PDF

1. Abra `DOCUMENTACAO-COMPLETA.md` no VS Code / Cursor ou em qualquer visualizador Markdown.
2. Use **Markdown PDF**, **Pandoc** ou imprima via navegador (extensão Markdown Preview).
3. Exemplo com Pandoc:
   ```bash
   pandoc docs/DOCUMENTACAO-COMPLETA.md -o Matchday-Football-Documentacao.pdf --toc
   ```

---

## Links rápidos do jogo

- Local: http://127.0.0.1:5080/home.html
- Jogo: http://127.0.0.1:5080/index.html
- Iniciar: `INICIAR-JOGO.bat`
