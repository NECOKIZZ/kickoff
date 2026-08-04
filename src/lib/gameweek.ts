// Gameweek resolution — maps a fixture kickoff time onto an FPL gameweek so
// score markets can be batched GW-by-GW on the hub. Server-only (calls
// kickoff-data). Best-effort by design: a null gameweek never blocks anything.

import { listGameweeks } from "@/lib/dataService";

interface CachedGws {
  at: number;
  gws: Array<{ id: number; deadline: number }>;
}

const TTL_MS = 10 * 60 * 1000; // deadlines shift rarely; 10 min is plenty
let cache: CachedGws | null = null;

async function getGameweeks(): Promise<CachedGws["gws"] | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.gws;
  try {
    const res = await listGameweeks();
    const gws = res.data
      .map((g) => ({ id: g.id, deadline: Date.parse(g.deadline_utc) }))
      .filter((g) => Number.isFinite(g.deadline))
      .sort((a, b) => a.deadline - b.deadline);
    if (gws.length === 0) return null;
    cache = { at: Date.now(), gws };
    return gws;
  } catch {
    // kickoff-data down/unconfigured — caller falls back to null gameweek.
    return cache?.gws ?? null;
  }
}

/** The gameweek a fixture belongs to = latest GW whose deadline ≤ kickoff. */
export async function resolveGameweek(kickoffAt: Date): Promise<number | null> {
  const gws = await getGameweeks();
  if (!gws) return null;
  const t = kickoffAt.getTime();
  let match: number | null = null;
  for (const g of gws) {
    if (g.deadline <= t) match = g.id;
    else break;
  }
  return match;
}
