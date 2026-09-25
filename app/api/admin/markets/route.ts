import { db, schema } from "@/db";
import { lockDueMarkets } from "@/lib/markets";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { resolveGameweek } from "@/lib/gameweek";
import { createMarketOnChain } from "@/lib/chain";
import { desc, eq, sql } from "drizzle-orm";

/**
 * POST /api/admin/markets — create a market in "draft" (knobs editable until
 * /open). Testnet control room: the admin lists manually; when EPL starts the
 * listing agent posts to this same endpoint with actor="agent".
 *
 * Body: { kind, title, homeTeam?, awayTeam?, playerId?, playerName?,
 *         fixtureId?, kickoffAt, locksAt?, gamma?, stakeMode?, minStake?,
 *         maxStake?, fixedStake?, takeRateBps?, accumulatorShareBps?,
 *         capMultiple?, escrowAddress? }
 */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  if (b.kind !== "scoreline" && b.kind !== "player_points")
    return jsonError("kind must be 'scoreline' or 'player_points'", 400);
  if (typeof b.title !== "string" || b.title.length === 0) return jsonError("title required", 400);
  const kickoffAt = typeof b.kickoffAt === "string" ? new Date(b.kickoffAt) : null;
  if (!kickoffAt || isNaN(kickoffAt.getTime())) return jsonError("kickoffAt (ISO datetime) required", 400);
  const locksAt = typeof b.locksAt === "string" ? new Date(b.locksAt) : kickoffAt; // default: lock at kickoff

  // Knobs — validated here, frozen at /open.
  const gamma = b.gamma == null ? 3 : Number(b.gamma);
  if (!Number.isInteger(gamma) || gamma < 1 || gamma > 12) return jsonError("gamma must be an integer 1-12", 400);

  const stakeMode = b.stakeMode == null ? "variable" : b.stakeMode;
  if (stakeMode !== "variable" && stakeMode !== "fixed")
    return jsonError("stakeMode must be 'variable' or 'fixed'", 400);

  const minStake = b.minStake == null ? 1_000_000n : parseAmount(b.minStake);
  const maxStake = b.maxStake == null ? 500_000_000n : parseAmount(b.maxStake);
  const fixedStake = b.fixedStake == null ? null : parseAmount(b.fixedStake);
  if (minStake === null || maxStake === null) return jsonError("minStake/maxStake must be base-unit amounts", 400);
  if (minStake > maxStake) return jsonError("minStake cannot exceed maxStake", 400);
  if (stakeMode === "fixed" && (fixedStake === null || fixedStake === 0n))
    return jsonError("fixed stakeMode requires a positive fixedStake", 400);

  const takeRateBps = b.takeRateBps == null ? 1000 : Number(b.takeRateBps);
  const accumulatorShareBps = b.accumulatorShareBps == null ? 5000 : Number(b.accumulatorShareBps);
  const capMultiple = b.capMultiple == null ? 100 : Number(b.capMultiple);
  if (takeRateBps < 0 || takeRateBps > 3000) return jsonError("takeRateBps out of range (0-3000)", 400);
  if (accumulatorShareBps < 0 || accumulatorShareBps > 10000)
    return jsonError("accumulatorShareBps out of range (0-10000)", 400);
  if (capMultiple < 1 || capMultiple > 1000) return jsonError("capMultiple out of range (1-1000)", 400);

  if (b.kind === "player_points" && typeof b.playerName !== "string")
    return jsonError("playerName required for player_points markets", 400);

  // Gameweek: explicit wins; otherwise best-effort resolve from kickoff-data.
  // Resolution failure is never a creation failure — null just means "Other".
  let gameweek: number | null = null;
  if (b.gameweek != null) {
    gameweek = Number(b.gameweek);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38)
      return jsonError("gameweek must be an integer 1-38", 400);
  } else if (b.kind === "scoreline") {
    gameweek = await resolveGameweek(kickoffAt);
  }

  // Chain first (same rule as settle/void): list the market on the escrow in
  // Draft and link it, or fail before touching the DB. Off-chain dev mode
  // (CHAIN_ENABLED false) skips this and keeps any manual linkage.
  let onChain: Awaited<ReturnType<typeof createMarketOnChain>> = null;
  try {
    onChain = await createMarketOnChain({
      kind: b.kind,
      stakeMode,
      gamma,
      takeRateBps,
      accumulatorShareBps,
      capMultiple,
      locksAt,
      minStake,
      maxStake,
      fixedStake,
    });
  } catch (err) {
    return jsonError(`on-chain createMarket failed, DB untouched: ${err instanceof Error ? err.message : err}`, 502);
  }

  const [row] = await db
    .insert(schema.markets)
    .values({
      kind: b.kind,
      status: "draft",
      title: b.title,
      fixtureId: b.fixtureId == null ? null : Number(b.fixtureId),
      gameweek,
      homeTeam: typeof b.homeTeam === "string" ? b.homeTeam : null,
      awayTeam: typeof b.awayTeam === "string" ? b.awayTeam : null,
      playerId: b.playerId == null ? null : Number(b.playerId),
      playerName: typeof b.playerName === "string" ? b.playerName : null,
      kickoffAt,
      locksAt,
      gamma,
      stakeMode,
      minStake,
      maxStake,
      fixedStake,
      takeRateBps,
      accumulatorShareBps,
      capMultiple,
      escrowAddress: onChain ? onChain.escrowAddress : typeof b.escrowAddress === "string" ? b.escrowAddress : null,
      onChainMarketId: onChain
        ? onChain.onChainMarketId
        : b.onChainMarketId == null
          ? null
          : BigInt(b.onChainMarketId as string | number),
    })
    .returning();

  await logAdminEvent("admin", "market.create", row.id, { ...b, createTxHash: onChain?.txHash ?? null });
  return json({ market: row }, { status: 201 });
}

/**
 * GET /api/admin/markets — all markets including drafts, with the numbers
 * that predict a void (position count, distinct guesses) and the stored void
 * reason once settled.
 */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  await lockDueMarkets();
  const rows = await db
    .select({
      m: schema.markets,
      voidReason: schema.settlements.voidReason,
      positionCount: sql<number>`(select count(*) from positions p where p.market_id = ${schema.markets.id})`,
      distinctGuesses: sql<number>`(select count(distinct concat_ws('/', p.guess_home, p.guess_away, p.guess_points)) from positions p where p.market_id = ${schema.markets.id})`,
    })
    .from(schema.markets)
    .leftJoin(schema.settlements, eq(schema.settlements.marketId, schema.markets.id))
    .orderBy(desc(schema.markets.createdAt))
    .limit(500);
  return json({
    markets: rows.map((r) => ({
      ...r.m,
      voidReason: r.voidReason,
      positionCount: Number(r.positionCount),
      distinctGuesses: Number(r.distinctGuesses),
    })),
  });
}
