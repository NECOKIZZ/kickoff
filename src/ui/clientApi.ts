"use client";

/**
 * Client-side API helpers + shared types for the app pages.
 * Amounts are micro-USDC strings (×1e6) end-to-end; format at the edge only.
 */

export interface MarketParams {
  gamma: number;
  stakeMode: "variable" | "fixed";
  minStake: string;
  maxStake: string;
  fixedStake: string | null;
  takeRateBps: number;
  capMultiple: number;
}

export interface MarketSummary {
  id: number;
  kind: "scoreline" | "player_points";
  status: "open" | "locked" | "settling" | "settled" | "void";
  title: string;
  homeTeam: string | null;
  awayTeam: string | null;
  playerName: string | null;
  kickoffAt: string;
  locksAt: string;
  params: MarketParams;
  escrowAddress: string | null;
  chainId: number | null;
  positionCount: number;
  totalPool: string;
  actual: { home?: number | null; away?: number | null; points?: string | null } | null;
}

export interface PoolPosition {
  id?: number;
  address: string;
  guessHome: number | null;
  guessAway: number | null;
  guessPoints: string | null;
  stake: string;
  isWinner: boolean | null;
  distanceD?: string | null;
  payout: string | null;
  capped?: boolean;
}

export interface LeaderboardRow {
  address: string;
  settledMarkets: number;
  volume: string;
  car: number;
  volumeMultiplier: number;
  score: number;
  rank: number;
}

const DEV_ADDRESS_KEY = "kickoff-dev-address";

export function getDevAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEV_ADDRESS_KEY);
}

export function setDevAddress(addr: string | null) {
  if (addr) localStorage.setItem(DEV_ADDRESS_KEY, addr);
  else localStorage.removeItem(DEV_ADDRESS_KEY);
}

/** Random throwaway dev wallet address (dev-mode auth uses the raw header). */
export function randomDevAddress(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const dev = getDevAddress();
  if (dev) headers.set("x-dev-address", dev);
  if (init?.body) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return body as T;
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** micro-USDC string → "$1,234.56" (compact above 10k). */
export function fmtUsdc(micro: string | bigint | null | undefined, opts?: { compact?: boolean }): string {
  if (micro === null || micro === undefined) return "—";
  const n = typeof micro === "bigint" ? micro : BigInt(micro);
  const dollars = Number(n) / 1e6;
  if (opts?.compact && dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (opts?.compact && dollars >= 10_000) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  // Whole dollars stay clean ($90); fractional amounts always show cents ($2.50)
  const frac = dollars % 1 !== 0;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Fixed-point ×1e6 points → "7.5". */
export function fmtPoints(fp: string | null | undefined): string {
  if (fp === null || fp === undefined) return "—";
  return (Number(BigInt(fp)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Time until lock, humanized; null if past. */
export function untilLock(locksAt: string): string | null {
  const ms = new Date(locksAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
}
