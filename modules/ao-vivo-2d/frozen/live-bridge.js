/**
 * Ponte match-view ↔ saves do jogo (AO VIVO / temporada).
 * Lê localStorage — sem importar o engine.
 */
(function (global) {
  "use strict";

  const SAVE_KEYS = {
    career: "matchday-new-game",
    season: "matchday-season",
    liveMatch: "matchday-live-match",
  };

  /** Mesmas coords % do engine (táticas → pitch). */
  const FORMATIONS = {
    "4-3-3": [[50, 91], [14, 74], [38, 76], [62, 76], [86, 74], [25, 58], [50, 60], [75, 58], [18, 27], [50, 18], [82, 27]],
    "4-4-2": [[50, 91], [14, 74], [38, 76], [62, 76], [86, 74], [16, 56], [38, 58], [62, 58], [84, 56], [38, 25], [62, 25]],
    "3-5-2": [[50, 91], [25, 76], [50, 78], [75, 76], [12, 56], [32, 58], [50, 55], [68, 58], [88, 56], [38, 25], [62, 25]],
    "4-2-3-1": [[50, 91], [14, 74], [38, 76], [62, 76], [86, 74], [35, 59], [65, 59], [18, 40], [50, 42], [82, 40], [50, 19]],
    "4-1-4-1": [[50, 91], [14, 74], [38, 76], [62, 76], [86, 74], [50, 64], [16, 44], [38, 46], [62, 46], [84, 44], [50, 19]],
    "5-3-2": [[50, 91], [10, 74], [30, 77], [50, 78], [70, 77], [90, 74], [27, 57], [50, 59], [73, 57], [38, 25], [62, 25]],
    "4-3-1-2": [[50, 91], [14, 74], [38, 76], [62, 76], [86, 74], [25, 59], [50, 64], [75, 59], [50, 43], [37, 23], [63, 23]],
    "3-4-3": [[50, 91], [26, 76], [50, 78], [74, 76], [15, 57], [39, 58], [61, 58], [85, 57], [18, 27], [50, 18], [82, 27]],
  };

  const FORMATION_ROLES = {
    "4-3-3": ["GOL", "LAT", "ZAG", "ZAG", "LAT", "VOL", "MC", "MC", "PE", "ATA", "PD"],
    "4-4-2": ["GOL", "LAT", "ZAG", "ZAG", "LAT", "PE", "MC", "MC", "PD", "ATA", "ATA"],
    "3-5-2": ["GOL", "ZAG", "ZAG", "ZAG", "LAT", "VOL", "MC", "MEI", "LAT", "ATA", "ATA"],
    "4-2-3-1": ["GOL", "LAT", "ZAG", "ZAG", "LAT", "VOL", "VOL", "PE", "MEI", "PD", "ATA"],
    "4-1-4-1": ["GOL", "LAT", "ZAG", "ZAG", "LAT", "VOL", "PE", "MC", "MC", "PD", "ATA"],
    "5-3-2": ["GOL", "LAT", "ZAG", "ZAG", "ZAG", "LAT", "VOL", "MC", "MC", "ATA", "ATA"],
    "4-3-1-2": ["GOL", "LAT", "ZAG", "ZAG", "LAT", "VOL", "MC", "MC", "MEI", "ATA", "ATA"],
    "3-4-3": ["GOL", "ZAG", "ZAG", "ZAG", "LAT", "MC", "MC", "LAT", "PE", "ATA", "PD"],
  };

  const SPONSOR_LOGO_SLUG = {
    "Tekno Cursos": "tekno-cursos",
    Nubanco: "nubanco",
    Petrobraz: "petrobraz",
    "Magazine Luizão": "magazine-luizao",
    iFome: "ifome",
    BetRegional: "betregional",
    PicPaga: "picpaga",
    Sheinpee: "sheinpee",
    "Amazônia.com": "amazonia-com",
    Googol: "googol",
    Metagol: "metagol",
    "Starbox Coffee": "starbox-coffee",
    Havaianinhas: "havaianinhas",
    Naike: "naike",
    "Pumba Sport": "pumba-sport",
    Perdigol: "perdigol",
    Poweraid: "poweraid",
    Playstação: "playstacao",
    FedExpressão: "fedexpressao",
  };

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clubCrestInitials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  }

  function sponsorLogoSlug(name) {
    return SPONSOR_LOGO_SLUG[name] || null;
  }

  function sponsorIconUrl(name) {
    const slug = sponsorLogoSlug(name);
    if (!slug) return null;
    return `../sponsors/icons/${slug}.png`;
  }

  /** Posição tática % → UV do gramado (câmera lateral). */
  function tacticsToUV(xPct, yPct, side) {
    const x = Number(xPct) || 50;
    const y = Number(yPct) || 50;
    if (side === "away") {
      return { u: y / 100, v: (100 - x) / 100 };
    }
    return { u: (100 - y) / 100, v: x / 100 };
  }

  function roleBucket(pos) {
    const p = String(pos || "").toUpperCase();
    if (p === "GOL") return "GK";
    if (p === "LAT" || p === "ZAG") return "DF";
    if (p === "VOL" || p === "MC" || p === "MEI") return "MF";
    return "FW";
  }

  function formationSlots(formationName, side) {
    const key = FORMATIONS[formationName] ? formationName : "4-3-3";
    const coords = FORMATIONS[key];
    const roles = FORMATION_ROLES[key] || FORMATION_ROLES["4-3-3"];
    return coords.map((xy, i) => {
      const uv = tacticsToUV(xy[0], xy[1], side);
      return {
        slot: i,
        pos: roles[i] || "MC",
        role: roleBucket(roles[i]),
        u: uv.u,
        v: uv.v,
        xPct: xy[0],
        yPct: xy[1],
      };
    });
  }

  function clockLabel(snap) {
    if (!snap) return "0'";
    const minute = Number(snap.minute) || 0;
    if (snap.stoppageActive && Number(snap.stoppageElapsed) > 0) {
      const base = snap.stoppageActive === "first" ? 45 : 90;
      return `${base}+${Math.max(1, Math.floor(Number(snap.stoppageElapsed)))}'`;
    }
    return `${minute}'`;
  }

  /**
   * Empacota estado para o telão.
   * Scoreboard usa lados do calendário (mandante/visitante).
   * No pitch: mandante = esquerda (home), visitante = direita (away).
   */
  function loadMatchViewLiveState() {
    const live = readJson(SAVE_KEYS.liveMatch);
    const season = readJson(SAVE_KEYS.season);
    const career = readJson(SAVE_KEYS.career);

    const userClub =
      season?.userClubName ||
      career?.clubName ||
      career?.foundingClubName ||
      career?.club ||
      career?.userClub ||
      null;

    const sponsors =
      season?.userSponsors ||
      career?.sponsors ||
      null;

    const masterName = sponsors?.master?.name || null;
    const secondaryNames = Array.isArray(sponsors?.secondaries)
      ? sponsors.secondaries.map((s) => s?.name).filter(Boolean)
      : [];

    const sponsorQueue = [masterName, ...secondaryNames].filter(Boolean);
    const sponsorLogos = sponsorQueue
      .map((name) => ({
        name,
        slug: sponsorLogoSlug(name),
        url: sponsorIconUrl(name),
      }))
      .filter((s) => s.url);

    const hasLive = !!(live && live.matchStarted && live.fixture?.home && live.fixture?.away);
    const fixture = hasLive ? live.fixture : null;

    let homeName = fixture?.home || userClub || "Time A";
    let awayName = fixture?.away || "Time B";
    const userAtHome = userClub ? homeName === userClub : true;

    // Engine: user sempre `home`/`away` internos; placar no telão = calendário
    let homeGoals = 0;
    let awayGoals = 0;
    if (hasLive) {
      if (userAtHome) {
        homeGoals = Number(live.home) || 0;
        awayGoals = Number(live.away) || 0;
      } else {
        homeGoals = Number(live.away) || 0;
        awayGoals = Number(live.home) || 0;
      }
    }

    const userFormation =
      (hasLive && live.userFormation) ||
      season?.userFormation ||
      "4-3-3";
    const awayFormation =
      (hasLive && live.awayFormation) ||
      "4-3-3";

    // Formação no gramado: mandante esquerda, visitante direita
    const leftFormationName = userAtHome ? userFormation : awayFormation;
    const rightFormationName = userAtHome ? awayFormation : userFormation;

    return {
      source: hasLive ? "live" : season ? "season" : "fallback",
      hasLive,
      userClub,
      userAtHome,
      homeName,
      awayName,
      homeGoals,
      awayGoals,
      homeInitials: clubCrestInitials(homeName),
      awayInitials: clubCrestInitials(awayName),
      clock: clockLabel(hasLive ? live : null),
      minute: hasLive ? Number(live.minute) || 0 : 0,
      matchFinished: !!(hasLive && live.matchFinished),
      userFormation,
      awayFormation,
      leftSlots: formationSlots(leftFormationName, "home"),
      rightSlots: formationSlots(rightFormationName, "away"),
      leftIsUser: userAtHome,
      rightIsUser: !userAtHome,
      sponsors: {
        master: masterName,
        queue: sponsorQueue,
        logos: sponsorLogos,
      },
      rawLive: hasLive ? live : null,
      rawSeason: season,
    };
  }

  global.MatchViewLiveBridge = {
    SAVE_KEYS,
    FORMATIONS,
    FORMATION_ROLES,
    SPONSOR_LOGO_SLUG,
    readJson,
    clubCrestInitials,
    sponsorLogoSlug,
    sponsorIconUrl,
    tacticsToUV,
    roleBucket,
    formationSlots,
    clockLabel,
    loadMatchViewLiveState,
  };
})(typeof window !== "undefined" ? window : globalThis);
