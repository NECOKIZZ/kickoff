// Backtest harness (spec §12.2) — replays a COMPLETED fixture through the
// full pipeline: fetch → derive → score → settle a simulated market. Costs
// ~3 requests against the real API (nothing in mock mode) and is the cheap
// way to catch the schema unknowns (risk log #5/#6/#7) before a live match.
//
// Run:  pnpm tsx src/data/backtest.ts [fixtureId]

import { getFixturesByIds, getFixtureEvents, getFixtureLineups, getFixturePlayers, isMockMode } from "./apiFootball";
import { deriveConceded, deriveOwnGoals, scorePlayer, type PlayerScore } from "./scoring";
import { distanceA, distanceB, settle, SCALE, type Position } from "@kickoff/engine";

export interface BacktestReport {
  fixtureId: number;
  finalScore: { home: number; away: number };
  schemaChecks: Array<{ check: string; ok: boolean; note: string }>;
  playerScores: PlayerScore[];
  simulated: {
    scorelineSettlement: ReturnType<typeof settle>;
    playerSettlement: ReturnType<typeof settle>;
  };
}

export async function backtestFixture(fixtureId: number): Promise<BacktestReport> {
  const [fixture] = await getFixturesByIds([fixtureId]);
  if (!fixture) throw new Error(`fixture ${fixtureId} not found`);
  if (fixture.fixture.status.short !== "FT")
    throw new Error(`fixture ${fixtureId} is not finished (${fixture.fixture.status.short})`);

  // Events ride along on the by-id response — reuse them instead of a second
  // /fixtures call (free plan is 100/day AND ~10/min; every request counts).
  const events = fixture.events?.length ? fixture.events : await getFixtureEvents(fixtureId);
  const [lineups, teams] = [await getFixtureLineups(fixtureId), await getFixturePlayers(fixtureId)];

  const schemaChecks: BacktestReport["schemaChecks"] = [];
  const check = (name: string, ok: boolean, note: string) => schemaChecks.push({ check: name, ok, note });

  // --- Risk log #6: substitution rows carry off-player AND on-player? ---
  const subs = events.filter((e) => e.type === "subst");
  const pairedSubs = subs.filter((e) => e.player.id != null && e.assist.id != null);
  check(
    "subst-pairing",
    subs.length === 0 || pairedSubs.length === subs.length,
    `${pairedSubs.length}/${subs.length} substitution events carry both players in one row`,
  );

  // --- Risk log #5: second-yellow card stacking ---
  const allPlayers = teams.flatMap((t) => t.players);
  const secondYellows = allPlayers.filter(
    (p) => p.statistics[0].cards.yellow > 0 && p.statistics[0].cards.red > 0,
  );
  check(
    "second-yellow-stacking",
    true, // informational — records what the data DOES so the rubric decision is grounded
    secondYellows.length > 0
      ? `${secondYellows.map((p) => p.player.name).join(", ")}: yellow+red BOTH set — rubric stacks −1 + −2 = −3`
      : "no second-yellow in this fixture; re-run against one that has it",
  );

  // --- Risk log #7: penalty.commited spelling ---
  const anyPenaltyField = allPlayers.some((p) => "commited" in (p.statistics[0].penalty ?? {}));
  check(
    "penalty-commited-spelling",
    anyPenaltyField,
    anyPenaltyField ? "'commited' (one m) present on payload — mapping correct" : "field missing from payload!",
  );

  // --- Derive + score every player ---
  const conceded = deriveConceded(lineups, events, 90);
  const ownGoals = deriveOwnGoals(events);
  const playerScores = allPlayers
    .map((p) =>
      scorePlayer(p, conceded.concededBy.get(p.player.id) ?? 0, ownGoals.get(p.player.id) ?? 0),
    )
    .sort((a, b) => (b.basePoints > a.basePoints ? 1 : -1));

  // --- Cross-check derived conceded vs the provider's own conceded field ---
  // REAL-KEY FINDING (2026-07-28, fixture 1035104): the provider populates
  // goals.conceded ONLY for goalkeepers — outfield players read 0 even when
  // on the pitch for goals. So the cross-check is GK-only; outfield conceded
  // comes exclusively from our lineup+events derivation.
  let concededMismatches = 0;
  let gksChecked = 0;
  for (const p of allPlayers) {
    const s = p.statistics[0];
    if (s.games.position !== "G" || (s.games.minutes ?? 0) === 0) continue;
    gksChecked++;
    const derived = conceded.concededBy.get(p.player.id) ?? 0;
    if (s.goals.conceded != null && derived !== s.goals.conceded) concededMismatches++;
  }
  check(
    "derived-conceded-vs-provider-gk",
    concededMismatches === 0 && gksChecked > 0,
    concededMismatches === 0
      ? `derived goals-conceded matches provider for all ${gksChecked} keeper(s) (provider fills conceded for GKs only)`
      : `${concededMismatches} GK mismatches — check sub-window logic`,
  );

  // --- Simulated settlements: 5 synthetic traders on each market ---
  const ah = fixture.goals.home ?? 0;
  const aa = fixture.goals.away ?? 0;
  const guessesA: Array<[number, number, number]> = [[ah, aa, 50], [ah + 1, aa, 40], [ah, aa + 1, 30], [aa, ah, 20], [0, 0, 60]];
  const posA: Position[] = guessesA.map(([gh, ga, stake]) => ({
    stake: BigInt(stake) * SCALE,
    d: distanceA(gh, ga, ah, aa),
  }));

  const topPlayer = playerScores[0];
  const actualPts = topPlayer.basePoints;
  const offsets = [0n, 1_000_000n, 2_000_000n, 3_500_000n, 6_000_000n];
  const posB: Position[] = offsets.map((off, i) => ({
    stake: BigInt(20 + i * 10) * SCALE,
    d: distanceB(actualPts + off, actualPts),
  }));

  return {
    fixtureId,
    finalScore: { home: ah, away: aa },
    schemaChecks,
    playerScores,
    simulated: {
      scorelineSettlement: settle(posA),
      playerSettlement: settle(posB),
    },
  };
}

// CLI entry
const isMain = process.argv[1]?.endsWith("backtest.ts");
if (isMain) {
  const fixtureId = Number(process.argv[2] ?? 1399001);
  backtestFixture(fixtureId)
    .then((r) => {
      console.log(`\nBacktest — fixture ${r.fixtureId} (${isMockMode() ? "MOCK" : "LIVE"} data)`);
      console.log(`final score ${r.finalScore.home}-${r.finalScore.away}\n`);
      console.log("schema checks:");
      for (const c of r.schemaChecks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.check}: ${c.note}`);
      console.log("\nplayer scores (base points):");
      for (const p of r.playerScores) {
        console.log(
          `  ${(Number(p.basePoints) / 1e6).toFixed(0).padStart(3)} pts  ${p.playerName} (${p.position})  [${p.breakdown.map((b) => `${b.rule} ${b.points > 0 ? "+" : ""}${b.points}`).join(", ")}]`,
        );
      }
      const sA = r.simulated.scorelineSettlement;
      const sB = r.simulated.playerSettlement;
      console.log(`\nsimulated Market A settlement: void=${sA.void} winners=${sA.outcomes.filter((o) => o.isWinner).length} pool=${Number(sA.totalPool) / 1e6}`);
      console.log(`simulated Market B settlement: void=${sB.void} winners=${sB.outcomes.filter((o) => o.isWinner).length} pool=${Number(sB.totalPool) / 1e6}`);
      const failed = r.schemaChecks.filter((c) => !c.ok);
      if (failed.length > 0) {
        console.error(`\n✗ ${failed.length} schema check(s) failed`);
        process.exit(1);
      }
      console.log("\n✓ backtest complete");
    })
    .catch((e) => {
      console.error("backtest failed:", e.message);
      process.exit(1);
    });
}
