/** Sensibilidade rápida do modelo proposto (Monte Carlo). */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const run = (pWeek, pDead, pRound, samples = 50) => {
  const totals = [];
  for (let s = 0; s < samples; s++) {
    const rng = mulberry32(3000 + s);
    let day = 0;
    const end = 62;
    const deadlineStart = 57;
    let pending = 0;
    let total = 0;
    let dayOfWeek = 0;
    while (day <= end) {
      const inD = day >= deadlineStart;
      if (inD || dayOfWeek === 0) {
        if (pending < 2 && rng() < (inD ? pDead : pWeek)) {
          total += 1;
          pending += 1;
        }
      }
      dayOfWeek += 1;
      if (dayOfWeek >= 7) {
        dayOfWeek = 0;
        if (pending > 0 && rng() < 0.55) pending -= 1;
        if (pending < 2 && rng() < pRound) {
          total += 1;
          pending += 1;
        }
      }
      if (pending > 0 && rng() < 0.18) pending -= 1;
      day += 1;
    }
    totals.push(total);
  }
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  return { avg: Number(avg.toFixed(2)), min: Math.min(...totals), max: Math.max(...totals) };
};

const configs = [
  { name: 'base', pWeek: 0.2, pDead: 0.1, pRound: 0.12 },
  { name: 'alvo-baixo', pWeek: 0.25, pDead: 0.12, pRound: 0.14 },
  { name: 'alvo-meio', pWeek: 0.3, pDead: 0.14, pRound: 0.16 },
  { name: 'alvo-alto', pWeek: 0.35, pDead: 0.16, pRound: 0.2 },
];
for (const c of configs) {
  console.log(c.name, run(c.pWeek, c.pDead, c.pRound), c);
}
