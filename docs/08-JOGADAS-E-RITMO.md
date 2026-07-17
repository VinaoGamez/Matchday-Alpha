# 08 — Jogadas e ritmo de partida

**Produto:** Matchday Football Alpha  
**Escopo:** como nascem as jogadas, o ritmo do relógio e em que cada decisão se baseia  
**Código principal:** `js/legacy/engine.js`, `js/engine/match-live.js`, `js/engine/match-sim.js`, `js/engine/match-tuning.js`, `js/engine/match-core.js`

---

## 1. Ideia central

O Matchday **não sorteia só o placar**. Cada posse relevante vira uma jogada em três fases:

1. **Construção** — circulação e criação  
2. **Duelo** — criador/atacante vs marcador  
3. **Desfecho** — chute, escanteio, falta, desarme ou impedimento  

Atributos, tática, cansaço, mando de campo e contexto do clube **enviesam** as chances; a aleatoriedade resolve o duelo.

---

## 2. Ritmo real do tempo (Opções)

O **Ritmo de Jogo** (`futmanager-pace` / Opções) controla apenas a **velocidade do relógio ao vivo**. Não altera as regras das jogadas.

| Ritmo | Intervalo entre ticks (`ms`) | Tempo contínuo aproximado (2 tempos) |
|-------|------------------------------|--------------------------------------|
| Ultra | 250 | ~16 s |
| Rápido | 500 | ~30 s |
| Padrão | 750 | ~50 s |
| Detalhado | 1150 | ~70 s |

**O que para o relógio**

- Pré-jogo  
- Pausa técnica (até 3)  
- Intervalo (45')  
- Cartão vermelho / lesão / alerta médico (painéis de preparação)  
- Pênalti com escolha de cobrador  
- Shootout (mata-mata empatado)

O ritmo só afeta o jogo **correndo**. Pausas e decisões do treinador ficam sob controle do jogador.

**Definição no código:** `gamePaceConfig` em `js/legacy/engine.js`.

---

## 3. Loop ao vivo (tick → minuto → jogada)

A cada tick do `setInterval`:

1. **`applyWear`** — cansaço dos titulares  
2. **`advance`** — avança minutos e gera a jogada  

### 3.1 Cansaço

- Base: ~**0,28** de fadiga por minuto em campo (`fatigueMinuteWear`)  
- Idade aumenta o desgaste (≥27 / ≥30 / ≥33)  
- Multiplicador institucional `wear` (finanças + ambiente do clube)  
- Limite médico / “jogar no sofrimento” podem forçar substituição  

### 3.2 Avanço de minutos

- Soma **1 a 3** minutos de partida por tick (aleatório)  
- Em ~30–45 ticks cobre os 90'  

### 3.3 Marcos fixos

| Minuto | Evento |
|--------|--------|
| 45' | Intervalo — abre preparação |
| 90' | Fim do regulamento; shootout se mata-mata empatado |

### 3.4 Ordem dentro de um avanço

1. Recalcula **ratings do momento** (`liveOverall`)  
2. Dissipa um pouco o **momentum**  
3. Recalcula **posse-alvo** e mistura com a posse atual  
4. Escolhe o time da bola (sorte proporcional à posse)  
5. Gera **passes** dos dois lados (`addPasses`)  
6. Chance rara de **pênalti** (~1,2% por tick, máx. 1 por lado)  
7. Chama **`buildAttack`** (construção → duelo → desfecho)  
8. Atualiza estatísticas na UI  

---

## 4. Em que a posse se baseia

A posse não é sorte puro. A cada avanço o motor calcula um **alvo** e suaviza:

```
posse ≈ 78% posse_atual + 22% alvo
```

(com âncora leve no volume de passes quando há amostra suficiente)

### Fatores do alvo (`structuralControl`)

| Fator | Papel |
|-------|--------|
| Passe e overall do momento | Força estrutural |
| Slider Posse / Pressão / Mentalidade | Estilo |
| Momentum | Sequências e gols |
| Precisão e volume de passe recentes | Forma no jogo |
| Vermelhos | Desequilíbrio numérico |
| **Mando real do calendário** | +2,2 casa / −2,2 fora |

**Faixa típica:** ~36–64%. Com expulsão pode abrir para ~30–70%.

Quem ataca no tick: probabilidade ≈ fatia de posse (ex.: 58% de posse → ~58% de chance de ser o time da bola).

**Nota:** no AO VIVO, `home` interno do motor = clube do usuário; o bônus de mando segue o calendário (casa/fora de verdade), não esse rótulo interno.

---

## 5. Anatomia de uma jogada

### 5.1 Passes (`addPasses`)

- Volume ≈ minutos avançados × (7–10) × fatia de posse  
- Precisão depende de passe/criação vs defesa, tática de posse/pressão e momentum  
- Boa circulação empurra a posse; imprecisão puxa contra  

### 5.2 Construção (`creation`)

Chance base: **`ENGINE_TUNING.creationBase = 0.47`** (faixa ~0,22–0,88).

Peso típico do duelo:

- Criador: passe ×0,46 + playmaking ×0,34  
- Atacante: drible ×0,12 + velocidade ×0,08  
- Defensor: marcação ×0,45 + desarme ×0,45  
- Time: (passe atacante − defesa rival)  
- Momentum dos times  
- Nos primeiros 15': **openingBoost** se um time for bem superior no overall  

**Se falha a construção**

- Falta (risco ~0,44–0,80 — sobe com pressão e mismatch drible/velocidade vs marcação), **ou**  
- Desarme limpo  

**Se passa**

- Conta como **boa construção**  
- Pode ainda sofrer falta “progressiva” antes do desfecho  
- Depois vai ao sorteio de desfecho  

### 5.3 Desfecho (AO VIVO, após boa construção)

| Probabilidade aproximada | Resultado |
|--------------------------|-----------|
| ~53% | Chute (gol / defesa / fora) |
| ~20% | Escanteio (58% vira cabeçada) |
| ~20% | Falta perto da área |
| restante | Impedimento (sobe com linha alta) ou neutralização |

Implementação: `buildAttack` em `js/engine/match-live.js`.

---

## 6. Finalização e gol

### 6.1 No alvo?

Compara finalização (ou cabeceio / freeKick) com posicionamento do goleiro, mais ataque vs defesa do time.

### 6.2 Gol?

Chance derivada de um **xG implícito**:

- finalização + ataque − reflexos − defesa + overall  
- ruído aleatório pequeno  
- convertida em probabilidade condicional “dado no alvo”

### 6.3 Amortecimento de goleada (`blowoutDamp`)

Se o overall atacante − defensor > **6**, a chance de gol é multiplicada por um fator que cai até ~**0,78**, evitando placares absurdos só por gap de elenco.

### 6.4 Cobranças especiais

| Tipo | Base |
|------|------|
| Pênalti | ~56–94% (cobrança vs defesa de pênalti; especialista >85 ganha bônus) |
| Falta direta | Só especialista (freeKick > 85) tem boa taxa; demais costumam cruzar/afastar |
| Escanteio | Cabeceio vs defesa aérea |

### 6.5 Quem aparece na jogada

Sorte **ponderada** por atributo + posição:

- Passe → MC / MEI / PE / PD / VOL / LAT  
- Chute → ATA / PE / PD / MC  
- Desarme/falta → ZAG / LAT / VOL / MC  
- Amarelo reduz a chance de o jogador ir no bote (cautela)  

---

## 7. Tática — o que cada controle empurra

| Controle | Efeito principal |
|----------|------------------|
| Mentalidade | ↑ ataque / ↓ defesa nos ratings; atrás no placar → mais faltas |
| Posse | ↑ passe e controle; ↓ verticalidade no ataque |
| Pressão | ↑ duelos e faltas; leve ajuda na posse |
| Linha de impedimento | Linha alta → mais offsides; ↓ um pouco a defesa estrutural |
| Formação | Bônus fixos (`FORMATION_PERFORMANCE` em `match-core.js`) |

Exemplos de formação: 4-3-3 favorece ataque; 5-3-2 favorece defesa; 4-1-4-1 equilibra com bloco baixo.

Adversário na **simulação de rodada** ainda adapta no placar:

- **chasing** (58'+ atrás)  
- **all-in** (75'+ atrás)  
- **protecting** (68'+ na frente)  

---

## 8. Contexto além do 11 em campo

### 8.1 Institucional (`clubInstitutionalContext`)

Ambiente, torcida, diretoria e finanças geram modificadores de:

- overall / ataque / passe / defesa  
- disciplina (tendência a cartão)  
- `wear` (desgaste) e `recovery` (recuperação entre dias)  

### 8.2 Fator do dia (`contextFactor`)

Sequência, posição na tabela, mando + ruído pequeno (~0,975–1,038).

### 8.3 Overall ao vivo (`liveOverall`)

Overall base ajustado por:

- fadiga média do time  
- vermelhos (−6,5 cada)  
- momentum  
- forma de passe e ataques bons  
- no empate, quem domina volume ofensivo ganha empurrão temporário  

Nada disso escolhe o placar sozinho — só **enviesa** duelos e posse.

---

## 9. Disciplina, lesões e substituições

### 9.1 Faltas e cartões

- Falta nasce do duelo / progressão / zona final  
- Cartão depende de gravidade, zona, pressão tática e histórico do jogador  
- Teto disciplinar ~**5** eventos oficiais na partida  
- Segundo amarelo / vermelho direto abrem painel (usuário) ou resolvem na sim  

### 9.2 Lesões

Podem surgir em contato (desarme, falta, chute, escanteio):

- desconforto  
- “jogar no sofrimento” (risco de agravamento)  
- lesão que força substituição  

### 9.3 Substituições

- Usuário: painel de pausa / intervalo / vermelho / lesão  
- CPU / sim: janelas 55, 58, 70, 78, 82 (+ 72/78 se atrás)  
- Limite ~5 trocas; janelas extras se perseguindo o resultado  
- Prioridade sobe com fadiga &lt; **72** (`FATIGUE_SUB_THRESHOLD`)  

---

## 10. AO VIVO vs simulação de rodada

| | AO VIVO (seu jogo) | Rodada (`simulateRoundMatch`) |
|--|--------------------|-------------------------------|
| Arquivos | `engine.js` + `match-live.js` | `match-sim.js` |
| Tempo | Ticks com pausas | Loop `for (minute = 1…90)` |
| Ação por minuto | Sempre 1 construção por tick (após passes) | Gate `actionRate` ~0,56–0,76 — muitos minutos “pulam” |
| Decisões | Pause, tática, subs, cobrador | Automáticas |
| Táticas user | Sliders em tempo real | Snapshot / `roundTactic` |
| Output | Timeline + placar | Pacote `{goals, data, events, injuries…}` |

### Ritmo da simulação (`actionRate`)

- Base **0,60** (mín. 0,56 / máx. 0,76)  
- Sobe um pouco se o jogo está 0–0 depois dos 30'  
- Sobe um pouco se há perseguição após os 60'  
- Resultado: ~24–40% dos minutos sem jogada ofensiva relevante (só desgaste/posse/passes)  

A lógica de **criação / desfecho** é a mesma família do AO VIVO; muda o ritmo e quem decide.

---

## 11. Parâmetros calibrados (`ENGINE_TUNING`)

Arquivo: `js/engine/match-tuning.js`

| Parâmetro | Valor | Uso |
|-----------|-------|-----|
| `creationBase` | 0,47 | Chance base de boa construção |
| `actionRateBase` | 0,60 | Densidade de jogadas na sim |
| `actionRateMin` / `Max` | 0,56 / 0,76 | Faixa da densidade |
| `foulRiskBase` | 0,54 | Base de falta no duelo |
| `progressiveFoulBase` | 0,26 | Falta após boa construção |
| `bookingBase` | 0,055 | Base de cartão |
| `blowoutGapStart` | 6 | Início do amortecimento de gol |
| `blowoutDampMin` | 0,78 | Piso do amortecimento |
| `subWindows` | 55, 58, 70, 78, 82 | Janelas de substituição CPU |

---

## 12. Frase-resumo

> O Matchday avança o relógio em blocos de 1–3 minutos; a posse (força + tática + mando + momento) escolhe quem ataca; cada ataque é um duelo de atributos com chance base ~47% de virar boa jogada; o desfecho vira chute, escanteio, falta ou impedimento. O **ritmo das Opções** só define quão rápido você assiste a esse ciclo na tela — as pausas e decisões continuam com o treinador.

---

## 13. Referência rápida de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `js/legacy/engine.js` | Tick, advance, posse ao vivo, faltas UI, pausas, pênaltis |
| `js/engine/match-live.js` | Passes, chute, `buildAttack` ao vivo |
| `js/engine/match-sim.js` | 90' da rodada sem UI |
| `js/engine/match-tuning.js` | Constantes calibradas, fadiga, faltas, blowout |
| `js/engine/match-core.js` | Formações e `roundTactic` da CPU |
