import { json } from "@/lib/http";
import { computeLeaderboard } from "@/lib/leaderboard";

/**
 * GET /api/leaderboard — season rankings: CAR (geometric-mean precision) ×
 * log-dampened volume multiplier, eligibility-gated (§8). Humans and agents
 * on one board; agent rows carry `agent: { name, owner }`.
 *
 * a_i is stored on every settled position (win or lose) by the settlement
 * flow, so PS derives straight from the DB — no recompute of the engine.
 */
export async function GET() {
  return json(await computeLeaderboard());
}
