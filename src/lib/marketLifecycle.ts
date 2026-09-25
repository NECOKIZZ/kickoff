// Market lifecycle — create / open / void — shared by the admin routes and the
// listing agent, so a market listed by hand and one listed by the agent go
// through exactly the same checks, chain calls and audit trail. `actor` is
// what the audit log records ("admin" | "agent").

import { db, schema } from "@/db";
import { parseAmount } from "@/lib/http";
import { logAdminEvent } from "@/lib/admin";
import { resolveGameweek } from "@/lib/gameweek";
import { getFixture } from "@/lib/dataService";
import { CHAIN_ENABLED, createMarketOnChain, openMarketOnChain, voidOnChain } from "@/lib/chain";
import { sweepAgentPayouts } from "@/lib/agentPlacement";
import { and, eq, ne } from "drizzle-orm";

type Market = typeof schema.markets.$inferSelect;
export type LifecycleResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

/** The live (non-void) market already listed for this fixture, if any. */
export async function activeMarketForFixture(dataFixtureId: string, kind: Market["kind"]): Promise<Market | null> {
  const [m] = await db
    .select()
    .from(schema.markets)
    .where(
      and(
        eq(schema.markets.dataFixtureId, dataFixtureId),
        eq(schema.markets.kind, kind),
        ne(schema.markets.status, "void"),
      ),
    )
    .limit(1);
  return m ?? null;
}

/**
 * Create a market in "draft" (knobs editable until open).
 *
 * Score markets are listed FROM a kickoff-data fixture (`dataFixtureId`):
 * teams, kickoff and gameweek come from the data service, never typed, and a
 * fixture can have only one live score market (409 otherwise; the partial
 * unique index markets_data_fixture_kind_idx is the backstop). Player markets
 * (paused) keep the free-form fields.
 *
 * Body: { kind, dataFixtureId? (scoreline), title?, homeTeam?, awayTeam?,
 *         playerId?, playerName?, kickoffAt?, locksAt?, gameweek?, gamma?,
 *         stakeMode?, minStake?, maxStake?, fixedStake?, takeRateBps?,
 *         accumulatorShareBps?, capMultiple?, escrowAddress? }
 */
export async function createMarket(b: Record<string, unknown>, actor: string): Promise<LifecycleResult<Market>> {
  if (b.kind !== "scoreline" && b.kind !== "player_points")
    return fail(400, "kind must be 'scoreline' or 'player_points'");

  let title = typeof b.title === "string" ? b.title : "";
  let homeTeam = typeof b.homeTeam === "string" ? b.homeTeam : null;
  let awayTeam = typeof b.awayTeam === "string" ? b.awayTeam : null;
  let kickoffAt = typeof b.kickoffAt === "string" ? new Date(b.kickoffAt) : null;
  let dataFixtureId: string | null = null;

  if (b.kind === "scoreline") {
    if (typeof b.dataFixtureId !== "string" || b.dataFixtureId.length === 0)
      return fail(400, "dataFixtureId required: score markets are listed from a kickoff-data fixture");
    dataFixtureId = b.dataFixtureId;
    const existing = await activeMarketForFixture(dataFixtureId, "scoreline");
    if (existing) return fail(409, `fixture already listed as market #${existing.id} (${existing.status})`);

    let fixture;
    try {
      fixture = (await getFixture(dataFixtureId)).data;
    } catch (e) {
      return fail(502, `fixture lookup failed: ${(e as Error).message}`);
    }
    if (fixture.status !== "scheduled") return fail(409, `fixture is '${fixture.status}', only scheduled fixtures can be listed`);
    homeTeam = fixture.home.name;
    awayTeam = fixture.away.name;
    kickoffAt = new Date(fixture.kickoff_utc);
    if (!title) title = `${homeTeam} vs ${awayTeam}`;
  }

  if (title.length === 0) return fail(400, "title required");
  if (!kickoffAt || isNaN(kickoffAt.getTime())) return fail(400, "kickoffAt (ISO datetime) required");
  const locksAt = typeof b.locksAt === "string" ? new Date(b.locksAt) : kickoffAt; // default: lock at kickoff
  if (locksAt.getTime() <= Date.now()) return fail(409, "lock time is already in the past");

  // Knobs — validated here, frozen at open.
  const gamma = b.gamma == null ? 3 : Number(b.gamma);
  if (!Number.isInteger(gamma) || gamma < 1 || gamma > 12) return fail(400, "gamma must be an integer 1-12");

  const stakeMode = b.stakeMode == null ? "variable" : b.stakeMode;
  if (stakeMode !== "variable" && stakeMode !== "fixed") return fail(400, "stakeMode must be 'variable' or 'fixed'");

  const minStake = b.minStake == null ? 1_000_000n : parseAmount(b.minStake);
  const maxStake = b.maxStake == null ? 500_000_000n : parseAmount(b.maxStake);
  const fixedStake = b.fixedStake == null ? null : parseAmount(b.fixedStake);
  if (minStake === null || maxStake === null) return fail(400, "minStake/maxStake must be base-unit amounts");
  if (minStake > maxStake) return fail(400, "minStake cannot exceed maxStake");
  if (stakeMode === "fixed" && (fixedStake === null || fixedStake === 0n))
    return fail(400, "fixed stakeMode requires a positive fixedStake");

  const takeRateBps = b.takeRateBps == null ? 1000 : Number(b.takeRateBps);
  const accumulatorShareBps = b.accumulatorShareBps == null ? 5000 : Number(b.accumulatorShareBps);
  const capMultiple = b.capMultiple == null ? 100 : Number(b.capMultiple);
  if (takeRateBps < 0 || takeRateBps > 3000) return fail(400, "takeRateBps out of range (0-3000)");
  if (accumulatorShareBps < 0 || accumulatorShareBps > 10000) return fail(400, "accumulatorShareBps out of range (0-10000)");
  if (capMultiple < 1 || capMultiple > 1000) return fail(400, "capMultiple out of range (1-1000)");

  if (b.kind === "player_points" && typeof b.playerName !== "string")
    return fail(400, "playerName required for player_points markets");

  // Gameweek: explicit wins; score markets otherwise resolve it from
  // kickoff-data and REQUIRE it (every score market sits in a gameweek).
  let gameweek: number | null = null;
  if (b.gameweek != null) {
    gameweek = Number(b.gameweek);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) return fail(400, "gameweek must be an integer 1-38");
  } else if (b.kind === "scoreline") {
    gameweek = await resolveGameweek(kickoffAt);
    if (gameweek === null) return fail(502, "couldn't resolve the gameweek from kickoff-data, try again shortly");
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
    return fail(502, `on-chain createMarket failed, DB untouched: ${err instanceof Error ? err.message : err}`);
  }

  let row: Market;
  try {
    [row] = await db
      .insert(schema.markets)
      .values({
        kind: b.kind,
        status: "draft",
        title,
        dataFixtureId,
        fixtureId: b.fixtureId == null ? null : Number(b.fixtureId),
        gameweek,
        homeTeam,
        awayTeam,
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
  } catch (e) {
    // Lost a race with a concurrent listing of the same fixture. The on-chain
    // draft left behind is inert: nothing can stake into an unopened market.
    if ((e as { code?: string }).code === "23505") return fail(409, "fixture was just listed by someone else");
    throw e;
  }

  await logAdminEvent(actor, "market.create", row.id, { ...b, dataFixtureId, createTxHash: onChain?.txHash ?? null });
  return { ok: true, value: row };
}

/** draft → open. THE FREEZE POINT: from here the market's knobs are immutable. */
export async function openMarket(marketId: number, actor: string): Promise<LifecycleResult<Market>> {
  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return fail(404, "market not found");
  if (m.status !== "draft") return fail(409, `market is '${m.status}', only drafts can be opened`);
  if (m.stakeMode === "fixed" && m.fixedStake == null) return fail(409, "cannot open: fixed stakeMode without fixedStake");
  if (new Date() >= m.locksAt) return fail(409, "cannot open: locksAt is already in the past");

  // With chain wiring on, every market must be escrow-linked before staking
  // opens — otherwise stakes would have nowhere real to go.
  if (CHAIN_ENABLED && (m.escrowAddress == null || m.onChainMarketId == null))
    return fail(409, "cannot open: market is not linked to the escrow (created before chain wiring?)");

  let openTxHash: string | null = null;
  if (m.escrowAddress && m.onChainMarketId != null) {
    try {
      openTxHash = await openMarketOnChain(m.onChainMarketId);
    } catch (err) {
      return fail(502, `on-chain open failed, DB untouched: ${err instanceof Error ? err.message : err}`);
    }
  }

  const [row] = await db
    .update(schema.markets)
    .set({ status: "open", openedAt: new Date() })
    .where(eq(schema.markets.id, marketId))
    .returning();

  await logAdminEvent(actor, "market.open", marketId, { paramsFrozen: true, openTxHash });
  return { ok: true, value: row };
}

/**
 * Refund-all. Allowed from any pre-settled status (abandoned fixture, bad
 * listing, etc.). Positions get payout = stake; no take, no accumulator.
 */
export async function voidMarket(
  marketId: number,
  reason: string,
  actor: string,
): Promise<LifecycleResult<{ market: Market; settlement: typeof schema.settlements.$inferSelect; refunded: number }>> {
  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m) return fail(404, "market not found");
  if (m.status === "settled" || m.status === "void") return fail(409, `market already '${m.status}'`);

  // On-chain void first (escrow-linked markets only) — same order-of-
  // operations rule as settle: chain failure aborts before the DB writes.
  let settleTxHash: string | null = null;
  if (m.escrowAddress && m.onChainMarketId != null) {
    try {
      settleTxHash = await voidOnChain(m.onChainMarketId, reason);
    } catch (err) {
      return fail(502, `on-chain void failed, DB untouched: ${err instanceof Error ? err.message : err}`);
    }
  }

  const result = await db.transaction(async (tx) => {
    const positions = await tx.select().from(schema.positions).where(eq(schema.positions.marketId, marketId));
    let totalPool = 0n;
    for (const p of positions) {
      totalPool += p.stake;
      await tx
        .update(schema.positions)
        .set({ isWinner: false, gain: 0n, payout: p.stake, capped: false })
        .where(eq(schema.positions.id, p.id));
    }
    const [settlement] = await tx
      .insert(schema.settlements)
      .values({ marketId, voidReason: reason, totalPool, settleTxHash })
      .returning();
    const [market] = await tx
      .update(schema.markets)
      .set({ status: "void", settledAt: new Date() })
      .where(eq(schema.markets.id, marketId))
      .returning();
    return { market, settlement, refunded: positions.length };
  });

  await logAdminEvent(actor, "market.void", marketId, { reason, settleTxHash });
  await sweepAgentPayouts(marketId).catch((err) => console.error("agent refund sweep failed", err));
  return { ok: true, value: result };
}
