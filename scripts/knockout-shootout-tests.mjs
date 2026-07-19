/**
 * Testes das regras de pênaltis no mata-mata (agregado × jogo).
 * Uso: node scripts/knockout-shootout-tests.mjs
 */
import assert from "node:assert/strict";
import {
  projectedKnockoutNeedsShootout,
  resolveKnockoutTieWinner,
  knockoutTieNeedsPlayedShootout,
  knockoutTieAggregate,
} from "../js/engine/knockout-shootout.js";

function idaVolta(scores) {
  return [
    {
      home: "Maceió",
      away: "Aracaju",
      leg: "IDA",
      tieId: "t1",
      homeGoals: scores.idaHome,
      awayGoals: scores.idaAway,
      completed: true,
      competition: "SÉRIE D ELIMINATÓRIAS",
    },
    {
      home: "Aracaju",
      away: "Maceió",
      leg: "VOLTA",
      tieId: "t1",
      homeGoals: scores.voltaHome,
      awayGoals: scores.voltaAway,
      completed: scores.voltaDone !== false,
      competition: "SÉRIE D ELIMINATÓRIAS",
    },
  ];
}

// Caso do usuário: ida 0-3, volta 5-2 (no mando da volta) → agregado 5-5
{
  const games = idaVolta({ idaHome: 0, idaAway: 3, voltaHome: 2, voltaAway: 5 });
  const agg = knockoutTieAggregate(games);
  assert.equal(agg.get("Maceió"), 5);
  assert.equal(agg.get("Aracaju"), 5);
  const live = games[1];
  const needs = projectedKnockoutNeedsShootout(games, live, {
    homeGoals: 2,
    awayGoals: 5,
  });
  assert.equal(needs, true, "5x5 no agregado deve exigir pênaltis mesmo com volta 2-5");
}

// Volta ainda não jogada: empate no jogo da ida NÃO abre pênaltis
{
  const games = idaVolta({ idaHome: 1, idaAway: 1, voltaHome: null, voltaAway: null, voltaDone: false });
  games[1].homeGoals = null;
  games[1].awayGoals = null;
  games[1].completed = false;
  const needs = projectedKnockoutNeedsShootout(games, games[0], { homeGoals: 1, awayGoals: 1 });
  assert.equal(needs, false, "ida empatada com volta pendente não vai a pênaltis");
}

// Agregado definido sem shootout → precisa jogar
{
  const games = idaVolta({ idaHome: 0, idaAway: 3, voltaHome: 2, voltaAway: 5 });
  assert.equal(knockoutTieNeedsPlayedShootout(games), true);
  games[1].shootoutWinner = "Maceió";
  assert.equal(knockoutTieNeedsPlayedShootout(games), false);
}

// Usuário: allowAutoShootout false → null (não simula)
{
  const games = idaVolta({ idaHome: 0, idaAway: 3, voltaHome: 2, voltaAway: 5 });
  const winner = resolveKnockoutTieWinner(games, {
    pickWinner: (a) => a,
    int: () => 4,
    allowAutoShootout: false,
  });
  assert.equal(winner, null, "não pode simular pênaltis sozinho no confronto do usuário");
}

// CPU: allowAutoShootout true → vencedor + placar gravado
{
  const games = idaVolta({ idaHome: 0, idaAway: 3, voltaHome: 2, voltaAway: 5 });
  const winner = resolveKnockoutTieWinner(games, {
    pickWinner: (a, b) => b,
    int: (a, b) => a,
    allowAutoShootout: true,
  });
  assert.equal(winner, "Aracaju");
  assert.ok(games[1].shootoutWinner);
  assert.ok(games[1].penalties);
}

console.log("ok  knockout-shootout-tests (5 asserts)");
