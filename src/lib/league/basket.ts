// ETF League basket helpers shared by the keeper, API routes and UI:
// team keys (clone-merging) and the buy-the-basket split.

import { encodeAbiParameters, keccak256, getAddress, type Hex } from "viem";
import { basketWeightsBps } from "@kickoff/engine/league";

/** Weight bucket for clone-merging: 1% = 100 bps. */
export const WEIGHT_BUCKET_BPS = 100;

/**
 * Team key: keccak of the sorted (token, weight rounded to 1%) list. Two
 * baskets with the same stocks and the same weights (to 1%) are one team.
 * `values` are the tokens' USD values at entry (same units for all tokens).
 */
export function teamKeyOf(tokens: string[], values: bigint[]): Hex {
  if (tokens.length !== values.length) throw new Error("teamKeyOf: length mismatch");
  const weights = basketWeightsBps(values);
  const rows = tokens
    .map((t, i) => ({
      token: getAddress(t),
      bucket: BigInt(Math.round(weights[i] / WEIGHT_BUCKET_BPS)),
    }))
    .filter((r) => r.bucket > 0n)
    .sort((a, b) => (a.token.toLowerCase() < b.token.toLowerCase() ? -1 : 1));
  return keccak256(
    encodeAbiParameters(
      [{ type: "address[]" }, { type: "uint256[]" }],
      [rows.map((r) => r.token), rows.map((r) => r.bucket)],
    ),
  );
}

export interface BuyLeg {
  token: string;
  amountIn: bigint; // stablecoin in, base units
  weightBps: number;
}

/**
 * Split a stablecoin amount across the basket by weight. Rounding dust goes
 * to the largest leg so the legs always sum to `total`.
 */
export function splitBuy(tokens: string[], weightsBps: number[], total: bigint): BuyLeg[] {
  if (tokens.length !== weightsBps.length || tokens.length === 0) throw new Error("splitBuy: bad basket");
  const wSum = weightsBps.reduce((s, w) => s + w, 0);
  if (wSum <= 0) throw new Error("splitBuy: zero weights");
  const legs = tokens.map((token, i) => ({
    token,
    weightBps: weightsBps[i],
    amountIn: (total * BigInt(weightsBps[i])) / BigInt(wSum),
  }));
  const dust = total - legs.reduce((s, l) => s + l.amountIn, 0n);
  const iMax = weightsBps.indexOf(Math.max(...weightsBps));
  legs[iMax].amountIn += dust;
  return legs.filter((l) => l.amountIn > 0n);
}

/** Creator fee bounds for basket buys (the Binance API allows 0–5% on EVM). */
export const MAX_CREATOR_BUY_FEE_PCT = 2;
export const DEFAULT_CREATOR_BUY_FEE_PCT = 1;

export function clampCreatorFee(pct: number | undefined): number {
  if (pct === undefined || !Number.isFinite(pct)) return DEFAULT_CREATOR_BUY_FEE_PCT;
  return Math.min(MAX_CREATOR_BUY_FEE_PCT, Math.max(0, Math.round(pct * 100) / 100));
}
