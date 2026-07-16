# 05 — Modelos de Dados

## localStorage

### `matchday-new-game` (v4)

Save principal da carreira.

```typescript
interface CareerSave {
  version: 4
  seed: number
  careerSeason: number          // ex: 2026
  managerName: string
  userClub: string
  userDivision: 'A' | 'B' | 'C' | 'D'
  clubs: Record<string, Club>
  messages: Message[]
  nationalRanking?: RankingEntry[]
  createdAt: string             // ISO
}
```

### `matchday-season`

Estado volátil da temporada em curso.

```typescript
interface SeasonSave {
  round: number
  competitions: CompetitionState[]
  cupCompetition: CupState
  nationalRanking?: RankingEntry[]
  // tabelas, jogos disputados, etc.
}
```

### `matchday-training-rules`

```typescript
interface TrainingRules {
  before: TrainingSlotConfig
  after: TrainingSlotConfig
  free: TrainingSlotConfig
}
```

### `futmanager-pace`

String: `'fast'` | `'standard'` | `'detailed'`

### `matchday-live-match` (legado)

Removido ao criar nova carreira. Não usar.

---

## Entidade: Club

```typescript
interface Club {
  name: string
  division: 'A' | 'B' | 'C' | 'D'
  power: number               // 56–84 típico
  formation: string           // ex: '4-3-3'
  roster: Player[]
  position?: number             // posição na tabela
  points?: number
  played?: number
  won?: number
  drawn?: number
  lost?: number
  gf?: number
  ga?: number
  preventionProgram?: number    // 0–3
  treatmentProgram?: number
  groupId?: number              // Série D
}
```

---

## Entidade: Player

```typescript
interface Player {
  name: string
  role: 'GOL'|'ZAG'|'LAT'|'VOL'|'MC'|'MEI'|'PE'|'PD'|'ATA'
  age: number
  overall: number

  // Atributos técnicos
  finishing: number
  passing: number
  dribble: number
  speed: number
  marking: number
  tackling: number
  heading: number
  positioning: number
  reflexes: number
  penaltySaving: number
  overallBase: number

  // Estado
  starter: boolean
  workload: 'low' | 'medium' | 'high'
  injury: { type: string; daysLeft: number } | null
  suspension: { gamesLeft: number } | null
  restrictedReturn?: boolean

  // Especialistas
  freeKick?: boolean
  penalty?: boolean
}
```

---

## Entidade: Message

```typescript
interface Message {
  id?: number
  category: 'match'|'medical'|'discipline'|'system'|'transfer'|string
  title: string
  body: string
  date: string | Date
  read?: boolean
}
```

---

## Entidade: Fixture (liga)

```typescript
interface Fixture {
  round: number
  home: string
  away: string
  homeGoals?: number
  awayGoals?: number
  played: boolean
  date: Date
}
```

---

## Entidade: CupFixture

```typescript
interface CupFixture {
  gameNumber: number
  home: string
  away: string
  homeGoals: number | null
  awayGoals: number | null
  date: Date
  twoLegged: boolean
  leg?: 1 | 2
  aggregateHome?: number
  aggregateAway?: number
}
```

---

## Entidade: CupCompetition

```typescript
interface CupCompetition {
  currentPhase: number
  champion: string | null
  stages: Array<{
    name: string
    fixtures: CupFixture[]
  }>
}
```

---

## Calendário (`calendarGames`)

```typescript
// Map<string, CalendarEvent[]>
// chave: timestamp do dia (meia-noite)

interface CalendarEvent {
  type: 'league' | 'cup' | 'training'
  label: string
  club?: string
  opponent?: string
  isHome?: boolean
  date: Date
}
```

---

## Persistência — funções

| Função | Grava |
|--------|-------|
| `persistCareer` | `matchday-new-game` |
| `persistSeason` | `matchday-season` |
| `hydrateSaves` | Lê ambos + training + pace |

**Serialização de datas:** `Date` → ISO string no save → `new Date()` no hydrate.

---

## Validação

- `version !== 4` → save inválido
- JSON corrompido → tratado como sem carreira
- Clubes/jogadores faltantes → fallback ou regeração conforme contexto

---

## Backup manual

No DevTools do navegador:

```javascript
// Exportar
copy(localStorage.getItem('matchday-new-game'))
copy(localStorage.getItem('matchday-season'))

// Importar
localStorage.setItem('matchday-new-game', '...')
localStorage.setItem('matchday-season', '...')
```
