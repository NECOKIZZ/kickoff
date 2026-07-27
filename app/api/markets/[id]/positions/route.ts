import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { validateGuess, validateStake } from "@/lib/markets";
import { verifyStakeTx } from "@/lib/chain";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/markets/:id/positions — place (or update, pre-lock) a position.
 *
 * Body: { stake: string base units, guessHome?, guessAway?, guessPoints?,
 *         stakeTxHash? }  — stakeTxHash links the on-chain escrow deposit;
 * optional until the escrow contract is deployed, required after.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);

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

  // When the market is escrow-linked and chain wiring is on, a provided
  // stakeTxHash must actually be a successful Staked(marketId, trader) tx on
  // the escrow. Absent hash is still allowed in the testnet phase (dev-mode
  // header flow has no wallet); verifyStakeTx returns null when wiring is off.
  if (stakeTxHash && m.escrowAddress && m.onChainMarketId != null) {
    const ok = await verifyStakeTx(
      stakeTxHash as `0x${string}`,
      m.onChainMarketId,
      caller.address as `0x${string}`,
    );
    if (ok === false) return jsonError("stakeTxHash does not match a successful escrow stake for this market/address", 400);
  }

  const values = {
    marketId,
    userId: caller.userId,
    guessHome: m.kind === "scoreline" ? (body.guessHome as number) : null,
    guessAway: m.kind === "scoreline" ? (body.guessAway as number) : null,
    guessPoints,
    stake,
    stakeTxHash,
  };

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
