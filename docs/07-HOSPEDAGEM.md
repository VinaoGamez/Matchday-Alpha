# 07 — Hospedagem e Distribuição

## Requisitos

| Item | Versão mínima |
|------|---------------|
| Python | 3.x (no PATH) |
| Navegador | Chrome, Firefox ou Edge (recente) |
| SO | Windows (scripts `.bat`), ou qualquer OS com Python |

---

## Iniciar servidor local

### Windows

Duplo clique em `INICIAR-JOGO.bat` ou:

```bat
cd "Matchday Football Alpha01"
python -m http.server 5080
```

### macOS / Linux

```bash
cd "Matchday Football Alpha01"
python3 -m http.server 5080
```

### URLs

| Página | URL |
|--------|-----|
| Home | http://127.0.0.1:5080/home.html |
| Jogo | http://127.0.0.1:5080/index.html |

---

## Rede local (LAN)

1. Descubra o IP da máquina (`ipconfig` no Windows).
2. Compartilhe: `http://192.168.x.x:5080/home.html`
3. Firewall deve permitir entrada na porta 5080.

---

## Acesso externo (internet)

`INICIAR-LINK-EXTERNO.bat` executa `scripts/start-tunnel.ps1`:

- Cria túnel Cloudflare temporário
- URL pública muda a cada sessão
- Adequado para demos; não para produção permanente

**Pré-requisitos:** `cloudflared` instalado e configurado.

---

## Distribuir o jogo

1. Compacte a pasta do projeto (zip).
2. Destinatário extrai e roda `INICIAR-JOGO.bat`.
3. Saves ficam no navegador local do destinatário (não viajam com o zip).

### Transferir save

Backup das chaves `localStorage` (ver [05-MODELOS-DADOS.md](./05-MODELOS-DADOS.md)).

---

## Exportar documentação

### Para PDF

**Pandoc:**

```bash
pandoc docs/DOCUMENTACAO-COMPLETA.md -o Matchday-Documentacao.pdf --toc -V lang=pt-BR
```

**VS Code / Cursor:**

- Extensão "Markdown PDF"
- Abrir `docs/DOCUMENTACAO-COMPLETA.md` → Export PDF

**Navegador:**

- Abrir preview Markdown → Imprimir → Salvar como PDF

### Para Word / HTML

```bash
pandoc docs/DOCUMENTACAO-COMPLETA.md -o Matchday-Documentacao.docx
pandoc docs/DOCUMENTACAO-COMPLETA.md -o Matchday-Documentacao.html --standalone --toc
```

---

## Estrutura da documentação exportável

```
docs/
├── INDICE.md
├── DOCUMENTACAO-COMPLETA.md   ← documento único
├── 01-VISAO-GERAL.md
├── 02-ARQUITETURA.md
├── 03-MOTORES.md
├── 04-ROTINAS-FLUXOS.md
├── 05-MODELOS-DADOS.md
├── 06-INTERFACE.md
└── 07-HOSPEDAGEM.md
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Porta 5080 em uso | Encerre processo Python anterior ou mude a porta no `.bat` |
| Página em branco | Verifique console (F12); confirme `site.js` carregou |
| Save não aparece | Mesmo navegador/perfil; localStorage não limpo |
| Modal não fecha | Atualize para versão com `redirectGame()` |
| CORS / file:// | Use sempre o servidor HTTP, não abra HTML direto |

---

## Segurança

- Não há autenticação nem dados sensíveis no servidor.
- Túnel externo expõe arquivos estáticos — use apenas temporariamente.
- Não commitar credenciais em scripts de túnel.
