import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { verifyInviteFromRequest } from "@/lib/inviteGate";
import { validateGuess, validateStake } from "@/lib/markets";
import { CHAIN_ENABLED, verifyStakeTx } from "@/lib/chain";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/markets/:id/positions — place (or update, pre-lock) a position.
 *
 * Body: { stake: string base units, guessHome?, guessAway?, guessPoints?,
 *         stakeTxHash? }
 *
 * Escrow-linked market with chain wiring on: the tUSDC must already be in
 * the escrow. stakeTxHash is REQUIRED, and the recorded stake + guess come
 * from the verified on-chain Staked event, never from the body. Off-chain
 * (dev mode / unlinked market): the body is recorded as before.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);

  // Launch gate: staking requires a redeemed invite (the page redirect alone
  // is bypassable by calling the API directly).
  if ((await verifyInviteFromRequest(req)) === null)
    return jsonError("invite required, join the waitlist at /waitlist", 403);

  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const [m] = await db.select().from(schema.markets).where(eq(schema.markets.id, marketId)).limit(1);
  if (!m || m.status === "draft") return jsonError("market not found", 404);
  if (m.status !== "open") return jsonError("market is not open for staking", 409);
  if (new Date() >= m.locksAt) return jsonError("market is locked (kickoff imminent)", 409);

  const stake = parseAmount(body.stake);
  if (stake === null || stake === 0n) return jsonError("stake must be a positive base-unit amount", 400);

  const stakeErr = validateStake(m, stake);
  if (stakeErr) return jsonError(stakeErr, 400);

  const guessErr = validateGuess(m, body);
  if (guessErr) return jsonError(guessErr, 400);

  const guessPoints = m.kind === "player_points" ? parseAmount(body.guessPoints) : null;
  if (m.kind === "player_points" && guessPoints === null)
    return jsonError("guessPoints must be a fixed-point amount (points × 1e6)", 400);

  const stakeTxHash = typeof body.stakeTxHash === "string" ? body.stakeTxHash : null;

  const [existing] = await db
    .select()
    .from(schema.positions)
    .where(and(eq(schema.positions.marketId, marketId), eq(schema.positions.userId, caller.userId)))
    .limit(1);

  let values = {
    marketId,
    userId: caller.userId,
    guessHome: m.kind === "scoreline" ? (body.guessHome as number) : null,
    guessAway: m.kind === "scoreline" ? (body.guessAway as number) : null,
    guessPoints,
    stake,
    stakeTxHash,
  };

  if (CHAIN_ENABLED && m.escrowAddress && m.onChainMarketId != null) {
    if (!stakeTxHash || !/^0x[0-9a-fA-F]{64}$/.test(stakeTxHash))
      return jsonError("stakeTxHash required: stake tUSDC in the escrow first", 400);
    const [reused] = await db
      .select({ id: schema.positions.id })
      .from(schema.positions)
      .where(eq(schema.positions.stakeTxHash, stakeTxHash))
      .limit(1);
    if (reused) return jsonError("this stake transaction is already recorded", 409);

    const v = await verifyStakeTx(stakeTxHash as `0x${string}`, m.onChainMarketId, caller.address as `0x${string}`);
    if (!v) return jsonError("stakeTxHash does not match a successful escrow stake for this market/address", 400);
    // A restake adds to the on-chain stake (0 in fixed mode) and replaces the guess.
    const onChainStake = v.restake && existing ? existing.stake + v.amount : v.amount;
    values = {
      ...values,
      guessHome: m.kind === "scoreline" ? v.guessA : null,
      guessAway: m.kind === "scoreline" ? v.guessB : null,
      guessPoints: m.kind === "player_points" ? BigInt(v.guessA) : null,
      stake: onChainStake,
    };
  }

  // One position per user per market; re-posting pre-lock updates the guess/stake.
  const [row] = await db
    .insert(schema.positions)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.positions.marketId, schema.positions.userId],
      set: {
        guessHome: values.guessHome,
        guessAway: values.guessAway,
        guessPoints: values.guessPoints,
        stake: values.stake,
        stakeTxHash: values.stakeTxHash,
      },
    })
    .returning();

  return json({ position: row }, { status: 201 });
}

/** GET /api/markets/:id/positions — public list (addresses + guesses + stakes). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) return jsonError("invalid market id", 400);

  const rows = await db
    .select({
      address: schema.users.address,
      guessHome: schema.positions.guessHome,
      guessAway: schema.positions.guessAway,
      guessPoints: schema.positions.guessPoints,
      stake: schema.positions.stake,
      isWinner: schema.positions.isWinner,
      payout: schema.positions.payout,
    })
    .from(schema.positions)
    .innerJoin(schema.users, eq(schema.positions.userId, schema.users.id))
    .where(eq(schema.positions.marketId, marketId));

  return json({ positions: rows });
}
