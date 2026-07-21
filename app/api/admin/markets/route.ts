import { db, schema } from "@/db";
import { json, jsonError, parseAmount } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { desc } from "drizzle-orm";

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
  if (!Number.isInteger(gamma) || gamma < 1 || gamma > 12) return jsonError("gamma must be an integer 1–12", 400);

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
  if (takeRateBps < 0 || takeRateBps > 3000) return jsonError("takeRateBps out of range (0–3000)", 400);
  if (accumulatorShareBps < 0 || accumulatorShareBps > 10000)
    return jsonError("accumulatorShareBps out of range (0–10000)", 400);
  if (capMultiple < 1 || capMultiple > 1000) return jsonError("capMultiple out of range (1–1000)", 400);

  if (b.kind === "player_points" && typeof b.playerName !== "string")
    return jsonError("playerName required for player_points markets", 400);

  const [row] = await db
    .insert(schema.markets)
    .values({
      kind: b.kind,
      status: "draft",
      title: b.title,
      fixtureId: b.fixtureId == null ? null : Number(b.fixtureId),
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
      escrowAddress: typeof b.escrowAddress === "string" ? b.escrowAddress : null,
    })
    .returning();

  await logAdminEvent("admin", "market.create", row.id, b);
  return json({ market: row }, { status: 201 });
}

/** GET /api/admin/markets — all markets including drafts. */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);
  const rows = await db.select().from(schema.markets).orderBy(desc(schema.markets.createdAt)).limit(500);
  return json({ markets: rows });
}
