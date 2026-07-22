/**
 * Calendário pontos corridos (turno + returno) com balanceamento casa/fora.
 * Limita sequências consecutivas de mando de campo (padrão: máx. 2).
 */

export const DEFAULT_MAX_HOME_AWAY_STREAK = 2;

function streakAfter(state, venue) {
  if (!state || state.venue !== venue) return 1;
  return state.count + 1;
}

function commitVenue(state, venue) {
  if (state?.venue === venue) return { venue, count: state.count + 1 };
  return { venue, count: 1 };
}

function scoreAssignment(home, away, flip, teamState) {
  const homeTeam = flip ? away : home;
  const awayTeam = flip ? home : away;
  const homeStreak = streakAfter(teamState[homeTeam], 'home');
  const awayStreak = streakAfter(teamState[awayTeam], 'away');
  return {
    maxStreak: Math.max(homeStreak, awayStreak),
    total: homeStreak + awayStreak,
    homeTeam,
    awayTeam,
  };
}

/**
 * Ajusta mandos jogo a jogo para respeitar o teto de sequências casa/fora.
 * @param {Array<Array<{home:string,away:string,round?:number}>>} fixtures
 * @param {number} maxStreak
 */
export function balanceHomeAwayStreaks(fixtures, maxStreak = DEFAULT_MAX_HOME_AWAY_STREAK) {
  const teamState = {};
  return fixtures.map(roundGames => {
    if (!Array.isArray(roundGames)) return roundGames;
    return roundGames.map(game => {
      if (!game?.home || !game?.away) return game;
      const keep = scoreAssignment(game.home, game.away, false, teamState);
      const flip = scoreAssignment(game.home, game.away, true, teamState);
      const keepOk = keep.maxStreak <= maxStreak;
      const flipOk = flip.maxStreak <= maxStreak;

      let useFlip = false;
      if (keepOk && !flipOk) useFlip = false;
      else if (flipOk && !keepOk) useFlip = true;
      else if (keepOk && flipOk) {
        if (flip.maxStreak !== keep.maxStreak) useFlip = flip.maxStreak < keep.maxStreak;
        else if (flip.total !== keep.total) useFlip = flip.total < keep.total;
        else useFlip = keep.maxStreak >= maxStreak;
      } else {
        useFlip = flip.maxStreak < keep.maxStreak
          || (flip.maxStreak === keep.maxStreak && flip.total < keep.total);
      }

      const chosen = useFlip ? flip : keep;
      teamState[chosen.homeTeam] = commitVenue(teamState[chosen.homeTeam], 'home');
      teamState[chosen.awayTeam] = commitVenue(teamState[chosen.awayTeam], 'away');

      if (useFlip) return { ...game, home: game.away, away: game.home };
      return { ...game };
    });
  });
}

/**
 * Round-robin clássico (Berger) + returno invertido + balanceamento casa/fora.
 * @param {string[]} clubList
 * @param {{ maxHomeAwayStreak?: number }} [options]
 */
export function buildBrazilianLeagueFixtures(clubList, options = {}) {
  const clubs = [...clubList];
  const n = clubs.length;
  if (n < 2 || n % 2 !== 0) return [];

  const maxStreak = options.maxHomeAwayStreak ?? DEFAULT_MAX_HOME_AWAY_STREAK;
  let rotation = [...clubs];
  const firstLeg = [];

  for (let round = 0; round < n - 1; round += 1) {
    const games = [];
    for (let pair = 0; pair < n / 2; pair += 1) {
      let home = rotation[pair];
      let away = rotation[n - 1 - pair];
      if ((round + pair) % 2) [home, away] = [away, home];
      games.push({ home, away, round: round + 1 });
    }
    firstLeg.push(games);
    rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, -1)];
  }

  const secondLeg = firstLeg.map((games, index) =>
    games.map(game => ({
      home: game.away,
      away: game.home,
      round: index + n,
    })),
  );

  return balanceHomeAwayStreaks([...firstLeg, ...secondLeg], maxStreak);
}

/** Maior sequência casa ou fora de um clube no calendário. */
export function maxHomeAwayStreakForTeam(fixtures, team) {
  let max = 0;
  let curVenue = null;
  let cur = 0;

  for (const round of fixtures) {
    if (!Array.isArray(round)) continue;
    const game = round.find(entry => entry.home === team || entry.away === team);
    if (!game) continue;
    const venue = game.home === team ? 'home' : 'away';
    if (venue === curVenue) cur += 1;
    else {
      curVenue = venue;
      cur = 1;
    }
    max = Math.max(max, cur);
  }
  return max;
}

/** Pior sequência entre todos os clubes listados. */
export function maxHomeAwayStreakAllTeams(fixtures, teams) {
  let max = 0;
  for (const team of teams) {
    max = Math.max(max, maxHomeAwayStreakForTeam(fixtures, team));
  }
  return max;
}
