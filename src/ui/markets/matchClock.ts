"use client";

/**
 * Match-clock → x-position mapping for the live PnL chart. The x-axis is
 * match time KO→FT on a 0–100 scale:
 *   0    = kickoff
 *   0–48 = first half ("N'" up to 45)
 *   48–50 = first-half stoppage ("45+X'")
 *   50   = HT
 *   52–98 = second half (46'–90')
 *   98–100 = second-half stoppage ("90+X'"), FT pinned at 100.
 */

const FIRST_HALF_END = 48;
const HT_X = 50;
const SECOND_HALF_START = 52;
const SECOND_HALF_END = 98;

/** Parse one clock label to an x in [0,100]; null when unparseable. */
export function clockToX(clock: string): number | null {
  const c = clock.trim().toUpperCase();
  if (c === "KO" || c === "0'") return 0;
  if (c === "HT") return HT_X;
  if (c === "FT" || c === "AET") return 100;

  // Optional half prefix ("1H 30'", "2H 60'"), minute, optional stoppage.
  const m = /^(?:(1H|2H)\s+)?(\d+)(?:\+(\d+))?'?$/.exec(c);
  if (!m) return null;
  const half = m[1];
  const min = Number(m[2]);
  const added = m[3] ? Number(m[3]) : 0;

  if (min > 90) return Math.min(100, SECOND_HALF_END + (min - 90) * 0.4);

  // Stoppage-time forms pin to the end-of-half bands.
  if (added > 0) {
    if (min >= 90) return Math.min(100, SECOND_HALF_END + added * 0.4);
    return Math.min(HT_X, FIRST_HALF_END + added * 0.4);
  }

  const secondHalf = half === "2H" || min > 45;
  if (secondHalf)
    return Math.min(SECOND_HALF_END, SECOND_HALF_START + ((min - 45) * (SECOND_HALF_END - SECOND_HALF_START)) / 45);
  return (min * FIRST_HALF_END) / 45;
}

/**
 * Map a snapshot sequence to x positions. Unparseable clocks interpolate
 * between parsed neighbours (or fall back to index-proportional); the result
 * is clamped monotonic non-decreasing so out-of-order labels can't fold the
 * line back on itself.
 */
export function clocksToXs(clocks: string[]): number[] {
  const raw = clocks.map(clockToX);

  // Fill nulls by linear interpolation between nearest parsed neighbours.
  const xs = raw.map((v, i) => {
    if (v !== null) return v;
    let prev = i - 1;
    while (prev >= 0 && raw[prev] === null) prev--;
    let next = i + 1;
    while (next < raw.length && raw[next] === null) next++;
    const pv = prev >= 0 ? raw[prev]! : 0;
    const nv = next < raw.length ? raw[next]! : 100;
    const pi = prev >= 0 ? prev : -1;
    const ni = next < raw.length ? next : raw.length;
    return pv + ((i - pi) / (ni - pi || 1)) * (nv - pv);
  });

  for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1]) xs[i] = xs[i - 1];
  return xs;
}
