import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import {
  distanceA,
  distanceB,
  settle,
  type Position as EnginePosition,
  type PayoutParams,
  type SettleResult,
} from "@kickoff/engine";

export type MarketRow = typeof schema.markets.$inferSelect;
export type PositionRow = typeof schema.positions.$inferSelect;

export function payoutParamsOf(m: MarketRow): PayoutParams {
  return {
    gamma: m.gamma,
    takeRateBps: m.takeRateBps,
    accumulatorShareBps: m.accumulatorShareBps,
    capMultiple: BigInt(m.capMultiple),
  };
}

/** Distance for one position given a (possibly interim) outcome. */
export function positionDistance(
  m: MarketRow,
  p: PositionRow,
  outcome: { home?: number; away?: number; points?: bigint },
): bigint {
  if (m.kind === "scoreline") {
    if (outcome.home == null || outcome.away == null || p.guessHome == null || p.guessAway == null)
      throw new Error("scoreline outcome/guess missing");
    return distanceA(p.guessHome, p.guessAway, outcome.home, outcome.away);
  }
  if (outcome.points == null || p.guessPoints == null) throw new Error("points outcome/guess missing");
  return distanceB(p.guessPoints, outcome.points);
}

/**
 * Run the engine over a market's positions against an outcome.
 * Used by real settlement (admin submits final outcome) AND by the live
 * mark-to-model estimate (interim outcome, result labeled an estimate).
 */
export async function computeSettlement(
  m: MarketRow,
  outcome: { home?: number; away?: number; points?: bigint },
): Promise<{ positions: PositionRow[]; engine: SettleResult }> {
  const rows = await db.select().from(schema.positions).where(eq(schema.positions.marketId, m.id));
  const enginePositions: EnginePosition[] = rows.map((p) => ({
    stake: p.stake,
    d: positionDistance(m, p, outcome),
  }));
  return { positions: rows, engine: settle(enginePositions, payoutParamsOf(m)) };
}

/** Validate a stake amount against the market's knobs. */
export function validateStake(m: MarketRow, stake: bigint): string | null {
  if (m.stakeMode === "fixed") {
    if (m.fixedStake == null) return "market misconfigured: fixed mode without fixedStake";
    if (stake !== m.fixedStake) return `this market has a fixed stake of ${m.fixedStake} base units`;
    return null;
  }
  if (stake < m.minStake) return `stake below market minimum (${m.minStake} base units)`;
  if (stake > m.maxStake) return `stake above market maximum (${m.maxStake} base units)`;
  return null;
}

/** Validate the guess shape for the market kind. */
export function validateGuess(
  m: MarketRow,
  body: { guessHome?: unknown; guessAway?: unknown; guessPoints?: unknown },
): string | null {
  if (m.kind === "scoreline") {
    const gh = body.guessHome;
    const ga = body.guessAway;
    if (!Number.isInteger(gh) || !Number.isInteger(ga)) return "guessHome and guessAway must be integers";
    if ((gh as number) < 0 || (gh as number) > 20 || (ga as number) < 0 || (ga as number) > 20)
      return "guessed goals must be between 0 and 20";
    return null;
  }
  if (body.guessPoints == null) return "guessPoints required for player_points markets";
  return null;
}
