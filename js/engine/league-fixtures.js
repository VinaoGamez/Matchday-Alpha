/**
 * Calendário pontos corridos (turno + returno) com balanceamento casa/fora.
 * Limita sequências consecutivas de mando de campo (padrão: máx. 2).
 * Returno espelha o turno balanceado (preserva 1 casa + 1 fora por par).
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
 * Round-robin clássico (Berger) + returno espelhado + balanceamento opcional.
 * @param {string[]} clubList
 * @param {{ maxHomeAwayStreak?: number, balanceHomeAway?: boolean, balanceScope?: 'first-leg-only'|'full' }} [options]
 */
export function buildBrazilianLeagueFixtures(clubList, options = {}) {
  const clubs = [...clubList];
  const n = clubs.length;
  if (n < 2 || n % 2 !== 0) return [];

  const maxStreak = options.maxHomeAwayStreak ?? DEFAULT_MAX_HOME_AWAY_STREAK;
  const shouldBalance = options.balanceHomeAway !== false;
  const firstLegOnly = (options.balanceScope || 'first-leg-only') === 'first-leg-only';

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

  let balancedFirstLeg = firstLeg;
  if (shouldBalance) {
    balancedFirstLeg = firstLegOnly
      ? refineFirstLegPairAtomic(
        balanceHomeAwayStreaks(firstLeg, maxStreak),
        clubs,
        maxStreak,
      )
      : balanceHomeAwayStreaks(firstLeg, maxStreak);
  }

  const secondLeg = balancedFirstLeg.map((games, index) =>
    games.map(game => ({
      home: game.away,
      away: game.home,
      round: index + n,
    })),
  );

  if (shouldBalance && !firstLegOnly) {
    return balanceHomeAwayStreaks([...firstLeg, ...secondLeg], maxStreak);
  }

  return [...balancedFirstLeg, ...secondLeg];
}

/** Sequência cronológica de mandos (turno + returno espelhado por índice). */
function chronologicalVenuesForTeam(firstLeg, team) {
  const n = firstLeg.length;
  const first = [];
  for (let r = 0; r < n; r += 1) {
    const game = firstLeg[r]?.find(entry => entry.home === team || entry.away === team);
    if (!game) continue;
    first.push(game.home === team ? 'H' : 'A');
  }
  return [...first, ...first.map(v => (v === 'H' ? 'A' : 'H'))];
}

function maxRunInVenueSequence(seq) {
  let max = 0;
  let run = 0;
  let prev = null;
  for (const v of seq) {
    if (v === prev) run += 1;
    else {
      prev = v;
      run = 1;
    }
    max = Math.max(max, run);
  }
  return max;
}

function worstTeamStreak(firstLeg, teams) {
  let max = 0;
  for (const team of teams) {
    max = Math.max(max, maxRunInVenueSequence(chronologicalVenuesForTeam(firstLeg, team)));
  }
  return max;
}

/** Refina o 1º turno com flips atômicos (turno + returno) para reduzir sequências longas. */
function refineFirstLegPairAtomic(firstLeg, teams, maxStreak) {
  const leg = firstLeg.map(round => round.map(game => ({ ...game })));
  const clubSet = teams?.length ? teams : [...new Set(leg.flatMap(r => r.flatMap(g => [g.home, g.away])))];
  let best = worstTeamStreak(leg, clubSet);
  if (best <= maxStreak) return leg;

  for (let pass = 0; pass < leg.length * leg[0]?.length * 2 && best > maxStreak; pass += 1) {
    let improved = false;
    for (let r = 0; r < leg.length; r += 1) {
      for (let gi = 0; gi < (leg[r]?.length || 0); gi += 1) {
        const game = leg[r][gi];
        const flipped = { ...game, home: game.away, away: game.home };
        leg[r][gi] = flipped;
        const score = worstTeamStreak(leg, clubSet);
        if (score < best) {
          best = score;
          improved = true;
          if (best <= maxStreak) return leg;
        } else {
          leg[r][gi] = game;
        }
      }
    }
    if (!improved) break;
  }
  return leg;
}

/** Cada par joga exatamente 1 casa + 1 fora no turno+returno. */
export function eachPairHasHomeAndAway(fixtures, clubList) {
  for (let i = 0; i < clubList.length; i += 1) {
    for (let j = i + 1; j < clubList.length; j += 1) {
      const a = clubList[i];
      const b = clubList[j];
      let aHome = 0;
      let bHome = 0;
      for (const round of fixtures) {
        if (!Array.isArray(round)) continue;
        for (const game of round) {
          if (!game?.home || !game?.away) continue;
          const isPair = (game.home === a && game.away === b) || (game.home === b && game.away === a);
          if (!isPair) continue;
          if (game.home === a) aHome += 1;
          if (game.home === b) bHome += 1;
        }
      }
      if (aHome !== 1 || bHome !== 1) return false;
    }
  }
  return true;
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
