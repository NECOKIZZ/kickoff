/**
 * PnL share card — the view model behind /api/positions/:id/card.
 *
 * Pure (no DB, no rendering) so the numbers on the image are unit-testable.
 * PnL is payout − stake: the engine's payout already includes the returned
 * stake for winners, and losers get 0. Rank is by PnL across every position
 * in the market (1 = best), with tied PnL sharing the higher rank.
 */

export interface PnlCardInput {
  kind: "scoreline" | "player_points";
  homeTeam: string | null;
  awayTeam: string | null;
  playerName: string | null;
  actualHome: number | null;
  actualAway: number | null;
  actualPoints: bigint | null;
  position: {
    id: number;
    guessHome: number | null;
    guessAway: number | null;
    guessPoints: bigint | null;
    stake: bigint;
    payout: bigint | null;
  };
  /** Every position in the market, this one included. */
  field: { id: number; stake: bigint; payout: bigint | null }[];
}

export interface PnlCardView {
  tone: "win" | "loss";
  /** "+" | "-" | "" — drawn separately from the serif amount, like the design. */
  sign: "+" | "-" | "";
  /** "$190", "$2.50" — no sign. */
  amount: string;
  headline: string;
  home: string | null;
  away: string | null;
  result: string;
  prediction: string;
  rank: number;
  of: number;
}

type Amount = bigint | string;
type Priced = { stake: Amount; payout: Amount | null };

/** Settled PnL in base units: payout − stake (a null payout counts as 0). */
export const pnlOf = (p: Priced) => BigInt(p.payout ?? 0n) - BigInt(p.stake);

/**
 * Rank by PnL within a market (1 = best); tied PnL shares the higher rank.
 * The one ranking used by the card, the market page tiles and pool table.
 */
export function pnlRank(field: Priced[], mine: Priced): number {
  const m = pnlOf(mine);
  return 1 + field.filter((p) => pnlOf(p) > m).length;
}

/** Whole dollars stay clean ($190); fractional amounts show cents ($2.50). */
export function fmtCardUsd(micro: bigint): string {
  const abs = micro < 0n ? -micro : micro;
  const dollars = Number(abs) / 1e6;
  const frac = abs % 1_000_000n !== 0n;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: frac ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const fmtPts = (fp: bigint | null) =>
  fp === null ? "—" : (Number(fp) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

const score = (h: number | null, a: number | null) => (h === null || a === null ? "—" : `${h} - ${a}`);

/** 3-letter code: known clubs use their FPL-style code, others the first letters. */
export function teamCode(name: string | null, known: (n: string) => string | null): string {
  if (!name) return "—";
  return known(name) ?? (name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "—");
}

export function buildPnlCardView(
  input: PnlCardInput,
  codeFor: (teamName: string) => string | null,
): PnlCardView {
  const mine = pnlOf(input.position);
  const rank = pnlRank(input.field, input.position);
  const scoreline = input.kind === "scoreline";

  return {
    tone: mine < 0n ? "loss" : "win",
    sign: mine > 0n ? "+" : mine < 0n ? "-" : "",
    amount: fmtCardUsd(mine),
    headline: scoreline
      ? `${teamCode(input.homeTeam, codeFor)}/${teamCode(input.awayTeam, codeFor)}`
      : (input.playerName ?? "Player").toUpperCase(),
    home: input.homeTeam,
    away: input.awayTeam,
    result: scoreline ? score(input.actualHome, input.actualAway) : fmtPts(input.actualPoints),
    prediction: scoreline
      ? score(input.position.guessHome, input.position.guessAway)
      : fmtPts(input.position.guessPoints),
    rank,
    of: Math.max(input.field.length, 1),
  };
}
