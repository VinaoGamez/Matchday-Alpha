import { MODULE_VERSIONS } from '../core/constants.js';

export const MANAGER_RANKING_VERSION = 1;
export const FREE_MANAGER_EXTRA = 55;

const FIRST_NAMES = [
  'Adriano', 'André', 'Carlos', 'Cuca', 'Dorival', 'Eduardo', 'Fernando', 'Gilson',
  'Jair', 'José', 'Lisca', 'Luiz', 'Mano', 'Marcelo', 'Maurício', 'Nestor',
  'Odair', 'Paulo', 'Pedro', 'Rafael', 'Renato', 'Ricardo', 'Roger', 'Sérgio',
  'Thiago', 'Vagner', 'Vanderlei', 'Vítor', 'Abel', 'Luxemburgo',
];
const LAST_NAMES = [
  'Almeida', 'Alves', 'Barbosa', 'Carvalho', 'Costa', 'Ferreira', 'Gomes', 'Lima',
  'Lopes', 'Martins', 'Mendes', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Rodrigues',
  'Santos', 'Silva', 'Souza', 'Teixeira', 'Vieira', 'Nunes', 'Araújo', 'Castro',
  'Moreira', 'Dias', 'Pires', 'Ramos', 'Freitas', 'Monteiro',
];
const STYLES = ['Posse de bola', 'Contra-ataque', 'Pressão alta'];
const MENTALITIES = ['Defensiva', 'Equilibrada', 'Ofensiva'];
const DIVISION_REPUTATION = { A: [78, 94], B: [68, 84], C: [58, 74], D: [48, 66], FREE: [45, 82] };
const DIVISION_PRESTIGE = { A: 12, B: 8, C: 5, D: 2, FREE: 3 };

const mulberry32 = seed => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const roundScore = value => Math.round(Number(value || 0) * 10) / 10;

const hashName = (seed, name) => {
  let hash = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < name.length; index++) {
    hash = Math.imul(hash ^ name.charCodeAt(index), 16777619) >>> 0;
  }
  return hash / 4294967295;
};

const uniqueName = (rng, used) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    if (!used.has(name.toLocaleLowerCase('pt-BR'))) {
      used.add(name.toLocaleLowerCase('pt-BR'));
      return name;
    }
  }
  const fallback = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)} ${int(rng, 1, 99)}`;
  used.add(fallback.toLocaleLowerCase('pt-BR'));
  return fallback;
};

const createManager = ({ id, name, club, reputation, preferredDivision, style, mentality, seasonPoints = 0, titlePoints = 0, titles = [] }) => ({
  id,
  name,
  club: club || null,
  status: club ? 'employed' : 'free',
  reputation: Math.round(reputation),
  preferredDivision: preferredDivision || 'FREE',
  style: style || 'Equilibrada',
  mentality: mentality || 'Equilibrada',
  seasonPoints: roundScore(seasonPoints),
  titlePoints: roundScore(titlePoints),
  titles: Array.isArray(titles) ? titles.slice(-12) : [],
});

const computeBase = (manager, seed = 0) => {
  const prestige = DIVISION_PRESTIGE[manager.preferredDivision] ?? DIVISION_PRESTIGE.FREE;
  const jitter = hashName(seed, manager.name) * 4 - 2;
  return roundScore(manager.reputation * 0.82 + prestige + jitter);
};

/**
 * Pool de técnicos + ranking (espelha Ranking Nacional).
 * Mais técnicos que clubes — livres disponíveis para futuras trocas.
 */
export function createManagerRankingEngine(deps = {}) {
  const { getSeed = () => 1 } = deps;
  let managers = [];

  const byId = id => managers.find(item => item.id === id) || null;
  const byClub = clubName => managers.find(item => item.club === clubName) || null;
  const byName = name => managers.find(item => item.name === name) || null;

  const ensurePool = ({
    clubNames = [],
    clubDivisions = {},
    userClub = null,
    userManagerName = null,
    userDivision = 'A',
    stored = null,
  } = {}) => {
    const seed = getSeed() >>> 0;
    const rng = mulberry32(seed ^ 0x4d414e47);
    const usedNames = new Set();
    const clubs = [...clubNames];
    const targetSize = clubs.length + FREE_MANAGER_EXTRA;

    if (stored?.managers?.length) {
      managers = stored.managers.map(item => createManager({
        ...item,
        club: item.club || null,
        status: item.club ? 'employed' : 'free',
      }));
      managers.forEach(item => usedNames.add(item.name.toLocaleLowerCase('pt-BR')));

      // Garante 1 técnico por clube (carreiras antigas / pool incompleto).
      clubs.forEach((clubName, index) => {
        if (byClub(clubName)) return;
        const division = clubDivisions[clubName] || 'D';
        const range = DIVISION_REPUTATION[division] || DIVISION_REPUTATION.D;
        const isUser = clubName === userClub;
        const name = isUser && userManagerName
          ? userManagerName
          : uniqueName(rng, usedNames);
        if (isUser && userManagerName) usedNames.add(userManagerName.toLocaleLowerCase('pt-BR'));
        managers.push(createManager({
          id: `mgr-${managers.length}-${index}`,
          name,
          club: clubName,
          reputation: isUser ? int(rng, ...range) : int(rng, range[0], range[1]),
          preferredDivision: division,
          style: pick(rng, STYLES),
          mentality: pick(rng, MENTALITIES),
        }));
      });

      while (managers.length < targetSize) {
        const range = DIVISION_REPUTATION.FREE;
        managers.push(createManager({
          id: `mgr-free-${managers.length}`,
          name: uniqueName(rng, usedNames),
          club: null,
          reputation: int(rng, range[0], range[1]),
          preferredDivision: pick(rng, ['B', 'C', 'D', 'D', 'FREE']),
          style: pick(rng, STYLES),
          mentality: pick(rng, MENTALITIES),
        }));
      }
      return managers;
    }

    managers = [];
    clubs.forEach((clubName, index) => {
      const division = clubDivisions[clubName] || 'D';
      const range = DIVISION_REPUTATION[division] || DIVISION_REPUTATION.D;
      const isUser = clubName === userClub;
      let name;
      if (isUser && userManagerName) {
        name = userManagerName;
        usedNames.add(name.toLocaleLowerCase('pt-BR'));
      } else {
        name = uniqueName(rng, usedNames);
      }
      managers.push(createManager({
        id: `mgr-${index}`,
        name,
        club: clubName,
        reputation: int(rng, range[0], range[1]),
        preferredDivision: division,
        style: pick(rng, STYLES),
        mentality: pick(rng, MENTALITIES),
      }));
    });

    const freeCount = Math.max(FREE_MANAGER_EXTRA, targetSize - managers.length);
    for (let index = 0; index < freeCount; index++) {
      const range = DIVISION_REPUTATION.FREE;
      managers.push(createManager({
        id: `mgr-free-${index}`,
        name: uniqueName(rng, usedNames),
        club: null,
        reputation: int(rng, range[0], range[1]),
        preferredDivision: pick(rng, ['A', 'B', 'C', 'D', 'D', 'FREE']),
        style: pick(rng, STYLES),
        mentality: pick(rng, MENTALITIES),
      }));
    }
    return managers;
  };

  const resolveEntry = (manager, { getClubDivision, getClubSeasonPoints } = {}) => {
    if (!manager) return null;
    const seed = getSeed();
    const base = computeBase(manager, seed);
    const employed = !!manager.club;
    const division = employed
      ? (getClubDivision?.(manager.club) || manager.preferredDivision || '—')
      : 'LIVRE';
    const liveSeason = employed && getClubSeasonPoints
      ? roundScore(getClubSeasonPoints(manager.club) || 0)
      : roundScore(manager.seasonPoints || 0);
    const titlePoints = roundScore(manager.titlePoints || 0);
    const total = roundScore(base + liveSeason + titlePoints);
    return {
      ...manager,
      base,
      seasonPoints: liveSeason,
      titlePoints,
      total,
      division,
      clubLabel: employed ? manager.club : 'Livre',
    };
  };

  const currentRanking = helpers => managers
    .map(manager => resolveEntry(manager, helpers))
    .filter(Boolean)
    .sort((a, b) => b.total - a.total
      || b.titlePoints - a.titlePoints
      || b.seasonPoints - a.seasonPoints
      || a.name.localeCompare(b.name, 'pt-BR'));

  const snapshot = () => ({
    formulaVersion: MANAGER_RANKING_VERSION,
    managers: managers.map(manager => ({
      id: manager.id,
      name: manager.name,
      club: manager.club,
      status: manager.club ? 'employed' : 'free',
      reputation: manager.reputation,
      preferredDivision: manager.preferredDivision,
      style: manager.style,
      mentality: manager.mentality,
      seasonPoints: roundScore(manager.seasonPoints),
      titlePoints: roundScore(manager.titlePoints),
      titles: Array.isArray(manager.titles) ? manager.titles.slice(-12) : [],
    })),
  });

  const syncSeasonPointsFromClubs = getClubSeasonPoints => {
    managers.forEach(manager => {
      if (!manager.club) return;
      manager.seasonPoints = roundScore(getClubSeasonPoints?.(manager.club) || 0);
    });
  };

  /** Demite o técnico do clube (vai para o mercado). */
  const sack = clubName => {
    const manager = byClub(clubName);
    if (!manager) return null;
    manager.club = null;
    manager.status = 'free';
    return manager;
  };

  /**
   * Contrata managerId para clubName.
   * Se o clube já tem técnico, ele vai para o mercado.
   */
  const hire = (clubName, managerId) => {
    if (!clubName || !managerId) return null;
    const incoming = byId(managerId);
    if (!incoming) return null;
    const outgoing = byClub(clubName);
    if (outgoing && outgoing.id !== incoming.id) {
      outgoing.club = null;
      outgoing.status = 'free';
    }
    if (incoming.club && incoming.club !== clubName) {
      const previousClub = incoming.club;
      incoming.club = null;
      incoming.status = 'free';
      // Mantém consistência se o hire veio de outro clube.
      if (previousClub && byClub(previousClub)?.id === incoming.id) {
        /* already cleared */
      }
    }
    incoming.club = clubName;
    incoming.status = 'employed';
    return { hired: incoming, replaced: outgoing && outgoing.id !== incoming.id ? outgoing : null };
  };

  /** Coloca o primeiro livre razoável no clube (IA pós-demissão do humano). */
  const hireFreeAgentForClub = (clubName, preferredDivision = 'FREE') => {
    if (byClub(clubName)) return byClub(clubName);
    const free = managers
      .filter(item => !item.club)
      .sort((a, b) => {
        const aFit = a.preferredDivision === preferredDivision ? 1 : 0;
        const bFit = b.preferredDivision === preferredDivision ? 1 : 0;
        return bFit - aFit || b.reputation - a.reputation;
      });
    const pick = free[0];
    if (!pick) return null;
    return hire(clubName, pick.id)?.hired || null;
  };

  return {
    moduleVersion: MODULE_VERSIONS.managerRanking ?? MANAGER_RANKING_VERSION,
    FREE_MANAGER_EXTRA,
    ensurePool,
    getManagers: () => managers,
    byId,
    byClub,
    byName,
    resolveEntry,
    currentRanking,
    snapshot,
    syncSeasonPointsFromClubs,
    sack,
    hire,
    hireFreeAgentForClub,
    computeBase: manager => computeBase(manager, getSeed()),
  };
}
