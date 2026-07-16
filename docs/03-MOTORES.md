# 03 — Motores

Referência detalhada dos motores de simulação em `js/site.js`.

---

## 1. RNG (`gameRandom`)

- Seed derivada da carreira.
- Funções: `rnd`, `int`, `pick`, `shuffle`.
- Uso: geração procedural, eventos de partida, sorteios.

---

## 2. Geração de jogadores (`generatedPlayer`)

**Entrada:** posição, faixa de power da divisão, idade.

**Saída:** objeto `Player` com atributos técnicos + `overall` via `generatedOverall(role, attrs)`.

Pesos por posição (exemplos):

| Posição | Atributos dominantes |
|---------|---------------------|
| GOL | reflexes, positioning, penaltySaving |
| ZAG | marking, tackling, heading |
| ATA | finishing, speed, heading |
| MEI | passing, dribble, finishing |

---

## 3. Geração de clubes (`createClub`)

- Nome, divisão, `power`, formação aleatória de `formationsForClubs`.
- Elenco via `generatedSquadRoles(formation)`.
- Especialistas em cobranças conforme `specialistChance[division]`.

---

## 4. Engine de partida

### Constantes (`engineTuning`)

```
foulRiskBase: 0.54
creationBase: 0.47
actionRateBase: 0.60
bookingBase: 0.055
blowoutGapStart: 6
subWindows: [58, 70, 80]
```

### Funções principais

| Função | Papel |
|--------|-------|
| `tick` | Timer da partida ao vivo |
| `advance` | Avança 1 minuto, decide eventos |
| `buildAttack` | Constrói fase ofensiva |
| `shot` | Resolve finalização |
| `engineFoulRisk` | Probabilidade de falta |
| `engineBlowoutDamp` | Amortece goleadas |
| `buildSimLineup` | Escala time para simulação |
| `simulateRoundMatch` | Partida completa sem UI |

### Ritmo (`gamePaceConfig`)

Lido de `futmanager-pace`: `fast` | `standard` | `detailed`.

---

## 5. Motor de rodada

| Função | Papel |
|--------|-------|
| `simulateRoundResults` | Simula todos os jogos da rodada |
| `advanceSeasonRound` | Incrementa rodada, verifica fim |
| `persistSeason` | Salva estado |

Partida do usuário pode ser ao vivo; demais usam `simulateRoundMatch`.

---

## 6. Motor de temporada

| Função | Papel |
|--------|-------|
| `prepareSeasonTransition` | Promoções, rebaixamentos, títulos |
| `finalizeNationalRankingSeason` | Fecha ranking nacional |
| Handler `#startNextSeason` | Inicia novo ano |

---

## 7. Calendário

| Função | Papel |
|--------|-------|
| `fixtureDateFor` | Data interpolada por rodada/divisão |
| `calendarGames` | Map dia → eventos |
| `fixtureDetails` | Metadados do jogo |
| `trainingRules` | Slots de treino (localStorage) |

**Regra Copa:** mínimo 3 datas entre jogos do mesmo clube.

---

## 8. Campeonatos (`nationalCompetitions`)

Por divisão:

- `teams`, `fixtures`, `table`
- Série D: grupos + knockout
- Série B: playoffs no fim

`divisionRules` define clubes, power, promoção/rebaixamento.

---

## 9. Copa do Brasil (`cupCompetition`)

- 9 fases (`cupPhaseDefinitions`)
- Entradas: Série A na 5ª fase, estaduais, especiais
- Ida e volta a partir da 5ª fase
- `shuffleCup` para sorteios

---

## 10. Ranking nacional

- `nationalRankingEntries`
- Pontuação por desempenho competitivo
- Atualizado ao longo da temporada e finalizado no fim do ano

---

## 11. Táticas

- `formations` + `formationRoles`
- `tacticalValues`: press, tempo, width, depth, etc.
- Impacto direto em `engineFoulRisk`, `actionRate`, criação de chances

---

## 12. Médico e lesões

- `injuryCatalog` — tipos de lesão
- `resolvePhysicalIncident` — ocorrência em jogo/treino
- `workloadRisk` + `preventionWorkloadEase`
- `playerUnavailable`, `playerStarterBlocked`, `playerInRestrictedReturn`

---

## 13. Mensagens

- `pushMessage({ category, title, body, date })`
- Cap: 200 mensagens
- Categorias: match, medical, discipline, system, etc.

---

## Documentação completa

Ver [DOCUMENTACAO-COMPLETA.md](./DOCUMENTACAO-COMPLETA.md) seções 4–14.
