import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { executeSettlement, type SettleOutcome } from "@/lib/settleExecution";
import { computeSettlement, type MarketRow } from "@/lib/markets";
import { explainVoid } from "@/lib/voidReasons";
import { eq } from "drizzle-orm";

function parseOutcome(m: MarketRow, b: Record<string, unknown>): SettleOutcome | string {
  if (m.kind === "scoreline") {
    const home = Number(b.home);
    const away = Number(b.away);
    if (b.home == null || b.away == null || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)
      return "home and away (non-negative integers) required";
    return { home, away };
  }
  const points = parseAmount(b.points);
  if (points === null) return "points (fixed-point ×1e6 string) required";
  return { points };
}

/**
 * GET /api/admin/markets/:id/settle?home=2&away=1 (or ?points=7500000) —
 * dry run. Runs the engine against the proposed outcome WITHOUT writing
 * anything, so the dashboard can warn "this will void" before the admin
 * commits. Same engine call as the real settle.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return jsonError("market not found", 404);

  const q = Object.fromEntries(new URL(req.url).searchParams);
  const outcome = parseOutcome(m, q);
  if (typeof outcome === "string") return jsonError(outcome, 400);

  const { positions, engine } = await computeSettlement(m, outcome);
  const guesses = new Set(positions.map((p) => (m.kind === "scoreline" ? `${p.guessHome}-${p.guessAway}` : `${p.guessPoints}`)));
  return json({
    positionCount: positions.length,
    distinctGuesses: guesses.size,
    void: engine.void,
    voidExplanation: explainVoid(engine.void),
    winners: engine.outcomes.filter((o) => o.isWinner).length,
    coalitionMode: engine.coalitionMode,
    totalPool: engine.totalPool,
  });
}

/**
 * POST /api/admin/markets/:id/settle — submit the outcome and settle.
 *
 * Body (scoreline):     { home: 2, away: 1 }
 * Body (player_points): { points: "7500000" }  (fixed-point ×1e6)
 *
 * Testnet phase: the admin is the oracle. Settlement execution (engine run,
 * on-chain-first ordering, atomic DB write, audit log) lives in
 * settleExecution.ts, shared byte-identically with the kickoff-data webhook
 * receiver. Engine voids (N<=1, all-equal-D) settle as void with full
 * refunds — same rules the escrow contract enforces on-chain.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const { id } = await ctx.params;
  const marketId = Number(id);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return jsonError("market not found", 404);

  const outcome = parseOutcome(m, b);
  if (typeof outcome === "string") return jsonError(outcome, 400);

  const r = await executeSettlement(m, outcome, "admin");
  if (!r.ok) return jsonError(r.error!, r.status);

  const engine = r.engine!;
  return json({
    market: r.market,
    settlement: r.settlement,
    engine: {
      void: engine.void,
      voidExplanation: explainVoid(engine.void),
      medianD: engine.medianD,
      coalitionMode: engine.coalitionMode,
      losersStakeSum: engine.losersStakeSum,
      dividendPool: engine.dividendPool,
      accumulatorContribution: engine.accumulatorContribution,
      platformCut: engine.platformCut,
      totalPool: engine.totalPool,
      outcomes: engine.outcomes,
    },
  });
}
