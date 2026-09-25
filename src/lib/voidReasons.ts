// Plain-English void reasons — shared by the admin API and dashboard. Pure,
// no server deps, so the client bundle can import it too.

const ENGINE_VOIDS: Record<string, string> = {
  FewerThanTwo: "fewer than 2 positions, nobody to win against, everyone refunded",
  AllEqualD: "every position was equally close to the result, no winners or losers, everyone refunded",
};

/** Human explanation for a stored void reason (engine code or admin free text). */
export function explainVoid(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ENGINE_VOIDS[reason] ?? reason;
}
