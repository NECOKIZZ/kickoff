// Pure validation of a managed agent's model output. The model's JSON is
// untrusted (it was steered by a user-written soul.md): nothing it returns is
// executed, and only picks that survive these checks reach placement.

import { z } from "zod";

/** Output schema the model is constrained to (structured outputs). */
export const PicksSchema = z.object({
  picks: z.array(
    z.object({
      market_id: z.number().int(),
      home: z.number().int(),
      away: z.number().int(),
      why: z.string(), // one short line, stored in the run log for the owner
    }),
  ),
});
export type ModelPicks = z.infer<typeof PicksSchema>;

export interface ValidPick {
  marketId: number;
  home: number;
  away: number;
  why: string;
}

export interface RejectedPick {
  raw: unknown;
  reason: string;
}

const MAX_GOALS = 20;
const MAX_WHY = 200;

/**
 * Keep only picks for markets we actually offered, with sane integer scores,
 * at most one per market (first wins). Anything else is dropped with a reason.
 */
export function validatePicks(
  output: unknown,
  offeredMarketIds: ReadonlySet<number>,
): { valid: ValidPick[]; rejected: RejectedPick[] } {
  const parsed = PicksSchema.safeParse(output);
  if (!parsed.success) return { valid: [], rejected: [{ raw: output, reason: "output did not match the schema" }] };

  const valid: ValidPick[] = [];
  const rejected: RejectedPick[] = [];
  const seen = new Set<number>();
  for (const p of parsed.data.picks) {
    if (!offeredMarketIds.has(p.market_id)) rejected.push({ raw: p, reason: "market was not offered" });
    else if (seen.has(p.market_id)) rejected.push({ raw: p, reason: "duplicate pick for market" });
    else if (p.home < 0 || p.away < 0 || p.home > MAX_GOALS || p.away > MAX_GOALS)
      rejected.push({ raw: p, reason: `score out of range 0-${MAX_GOALS}` });
    else {
      seen.add(p.market_id);
      valid.push({ marketId: p.market_id, home: p.home, away: p.away, why: p.why.slice(0, MAX_WHY) });
    }
  }
  return { valid, rejected };
}
