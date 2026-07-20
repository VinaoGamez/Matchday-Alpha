/**
 * Simulação de validação — geração Campanha Longa.
 * Uso: node scripts/player-generation-sim.mjs [seed] [clubsPerDiv]
 */
import {
  generateSquad,
  GENERIC_SQUAD_ROLES,
  DIVISION_OVR_LIMITS,
  GENERATION_POT_CAPS,
  traitCodes,
  topAttributeKeys,
  projectCareerOvr,
  PEAK_PLATEAU,
} from '../js/engine/player-generation.js';

const SEED = Number(process.argv[2] || 20260717);
const CLUBS = Number(process.argv[3] || 200);
const DIVISIONS = ['A', 'B', 'C', 'D'];
const EXPECTED_COUNTS = GENERIC_SQUAD_ROLES.reduce((acc, pos) => {
  acc[pos] = (acc[pos] || 0) + 1;
  return acc;
}, {});

const mulberry32 = seed => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '0.0');
const mean = arr => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const summarize = values => ({
  n: values.length,
  mean: mean(values).toFixed(1),
  p10: percentile(values, 10).toFixed(0),
  p50: percentile(values, 50).toFixed(0),
  p90: percentile(values, 90).toFixed(0),
  max: Math.max(...values, 0),
  min: Math.min(...values, 99),
});

const random = mulberry32(SEED);
const report = {
  seed: SEED,
  clubsPerDivision: CLUBS,
  template: EXPECTED_COUNTS,
  byDivision: {},
  checks: [],
};

let templateFailures = 0;
let reserveHigherPot = 0;
let reservePotSamples = 0;
const youngACareers = [];
const gkTraitPairs = {};
const gkMetaOk = { pass: 0, fail: 0 };
const outfieldDesOk = { withDes: 0, total: 0 };

for (const division of DIVISIONS) {
  const ovrs = [];
  const pots = [];
  const ages = [];
  const starterOvrs = [];
  const reserveOvrs = [];
  let overCap = 0;
  let underFloor = 0;
  const limits = DIVISION_OVR_LIMITS[division];
  const potCap = GENERATION_POT_CAPS[division];

  for (let c = 0; c < CLUBS; c += 1) {
    const { roster } = generateSquad({ division, random });
    const counts = roster.reduce((acc, p) => {
      acc[p.pos] = (acc[p.pos] || 0) + 1;
      return acc;
    }, {});
    const templateOk =
      roster.length === GENERIC_SQUAD_ROLES.length &&
      Object.keys(EXPECTED_COUNTS).every(pos => counts[pos] === EXPECTED_COUNTS[pos]);
    if (!templateOk) templateFailures += 1;

    const ranked = [...roster].sort((a, b) => b.overall - a.overall);
    const starters = new Set(ranked.slice(0, 11));
    const starterPotMed = percentile(
      ranked.slice(0, 11).map(p => p.potential),
      50,
    );

    roster.forEach(player => {
      ovrs.push(player.overall);
      pots.push(player.potential);
      ages.push(player.age);
      if (player.overall > limits[1] || player.potential > potCap) overCap += 1;
      if (player.overall < limits[0]) underFloor += 1;
      if (starters.has(player)) starterOvrs.push(player.overall);
      else {
        reserveOvrs.push(player.overall);
        reservePotSamples += 1;
        if (player.potential > starterPotMed) reserveHigherPot += 1;
      }

      if (player.pos === 'GOL') {
        const code = traitCodes(player);
        gkTraitPairs[code] = (gkTraitPairs[code] || 0) + 1;
        const top3 = topAttributeKeys(player, 3);
        const meta = ['reflexes', 'positioning', 'penaltySaving'];
        const secondary = ['passing', 'speed', 'playmaking'];
        const metaCount = top3.filter(k => meta.includes(k)).length;
        const secCount = top3.filter(k => secondary.includes(k)).length;
        if (metaCount >= 2 && secCount <= 1) gkMetaOk.pass += 1;
        else gkMetaOk.fail += 1;
      } else {
        outfieldDesOk.total += 1;
        const code = traitCodes(player);
        if (code.includes('Des')) outfieldDesOk.withDes += 1;
      }

      if (division === 'A' && player.age <= 20 && player.potential >= 85) {
        const path = projectCareerOvr(player, 10);
        youngACareers.push({
          pos: player.pos,
          age0: player.age,
          ovr0: player.overall,
          pot: player.potential,
          ovr5: path[5]?.ovr,
          ovr8: path[8]?.ovr,
          ovr10: path[10]?.ovr,
          peak: PEAK_PLATEAU[player.pos]?.peakStart,
        });
      }
    });
  }

  const dOver20 = division === 'D' ? ovrs.filter(o => o >= 20).length : null;
  report.byDivision[division] = {
    ovr: summarize(ovrs),
    pot: summarize(pots),
    age: summarize(ages),
    starterOvr: summarize(starterOvrs),
    reserveOvr: summarize(reserveOvrs),
    limits,
    potCap,
    overCap,
    underFloor,
    dOver20,
    pctStarters56to64:
      division === 'A'
        ? pct(
            starterOvrs.filter(o => o >= 56 && o <= 64).length,
            starterOvrs.length,
          )
        : undefined,
    pctOvr70: division === 'A' ? pct(ovrs.filter(o => o >= 70).length, ovrs.length) : undefined,
  };
}

report.checks = [
  {
    id: 'template_25',
    ok: templateFailures === 0,
    detail: `falhas=${templateFailures} (esperado 0 em ${CLUBS * DIVISIONS.length} elencos)`,
  },
  {
    id: 'serie_d_under_20',
    ok: report.byDivision.D.dOver20 === 0,
    detail: `OVR≥20 na D: ${report.byDivision.D.dOver20}`,
  },
  {
    id: 'ovr_within_limits',
    ok: DIVISIONS.every(d => report.byDivision[d].overCap === 0 && report.byDivision[d].underFloor === 0),
    detail: DIVISIONS.map(d => `${d}: over=${report.byDivision[d].overCap} under=${report.byDivision[d].underFloor}`).join(
      ' | ',
    ),
  },
  {
    id: 'gk_meta_top3',
    ok: gkMetaOk.fail / Math.max(1, gkMetaOk.pass + gkMetaOk.fail) < 0.05,
    detail: `pass=${gkMetaOk.pass} fail=${gkMetaOk.fail} (${pct(gkMetaOk.pass, gkMetaOk.pass + gkMetaOk.fail)}%)`,
  },
  {
    id: 'reserve_can_beat_starter_pot',
    // POT independente: reservas podem superar titulares (~10–25% típico).
    ok: reserveHigherPot / Math.max(1, reservePotSamples) > 0.1,
    detail: `${pct(reserveHigherPot, reservePotSamples)}% reservas com POT > mediana POT dos titulares do clube`,
  },
];

const topGkTraits = Object.entries(gkTraitPairs)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .map(([code, n]) => `${code}:${n}`);

const careerGain5 = mean(youngACareers.map(c => c.ovr5 - c.ovr0));
const careerGain8 = mean(youngACareers.map(c => c.ovr8 - c.ovr0));
const reached90 = youngACareers.filter(c => c.ovr10 >= 90).length;
const reached90Pct = youngACareers.length
  ? reached90 / youngACareers.length
  : 0;
report.checks.push({
  id: 'elite_jewel_to_90',
  // Meta: raro (~5–20% das jóias; fração ínfima do elenco A).
  ok: youngACareers.length >= 30 && reached90Pct >= 0.05 && reached90Pct <= 0.2,
  detail: `${pct(reached90, youngACareers.length)}% jóias A (≤20, POT≥85) com OVR≥90 em 10y (n=${youngACareers.length}, Δy8=${careerGain8.toFixed(1)}, ovr0 mean=${mean(youngACareers.map(c => c.ovr0)).toFixed(1)})`,
});

console.log('=== Player Generation Sim (Campanha Longa) ===');
console.log(`seed=${SEED} clubs/div=${CLUBS} players/div=${CLUBS * 25}`);
console.log('');
console.log('Template esperado:', EXPECTED_COUNTS);
console.log('');
for (const division of DIVISIONS) {
  const row = report.byDivision[division];
  console.log(`--- Série ${division} (limits ${row.limits[0]}–${row.limits[1]}, POT≤${row.potCap}) ---`);
  console.log(
    `OVR  mean=${row.ovr.mean} p10=${row.ovr.p10} p50=${row.ovr.p50} p90=${row.ovr.p90} max=${row.ovr.max} min=${row.ovr.min}`,
  );
  console.log(
    `POT  mean=${row.pot.mean} p50=${row.pot.p50} p90=${row.pot.p90} max=${row.pot.max}`,
  );
  console.log(
    `Age  mean=${row.age.mean} p50=${row.age.p50} | XI mean=${row.starterOvr.mean} | banco mean=${row.reserveOvr.mean}`,
  );
  if (division === 'A') {
    console.log(`XI em 56–64: ${row.pctStarters56to64}% | OVR≥70 (todos): ${row.pctOvr70}%`);
  }
  if (division === 'D') console.log(`OVR≥20: ${row.dOver20}`);
  console.log('');
}
console.log('Caract. GOL (top pares):', topGkTraits.join(', '));
console.log(
  `Outfield com Des no par: ${pct(outfieldDesOk.withDes, outfieldDesOk.total)}% (${outfieldDesOk.withDes}/${outfieldDesOk.total})`,
);
console.log('');
console.log(
  `Jovens A (≤20, POT≥85) n=${youngACareers.length}: ΔOVR médio y5=${careerGain5.toFixed(1)} y8=${careerGain8.toFixed(1)} | ≥90 em 10y: ${reached90} (${pct(reached90, youngACareers.length)}%)`,
);
console.log('');
console.log('CHECKS:');
report.checks.forEach(check => {
  console.log(`  [${check.ok ? 'OK' : 'FAIL'}] ${check.id}: ${check.detail}`);
});
const failed = report.checks.filter(c => !c.ok);
process.exit(failed.length ? 1 : 0);
