"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button3D } from "@/ui/Button3D";
import {
  api,
  fmtUsdc,
  fmtPoints,
  fmtKickoff,
  untilLock,
  shortAddr,
  getDevAddress,
  type MarketSummary,
  type PoolPosition,
} from "@/ui/clientApi";

interface MarketDetail {
  market: {
    id: number;
    kind: "scoreline" | "player_points";
    status: string;
    title: string;
    homeTeam: string | null;
    awayTeam: string | null;
    playerName: string | null;
    kickoffAt: string;
    locksAt: string;
    gamma: number;
    stakeMode: "variable" | "fixed";
    minStake: string;
    maxStake: string;
    fixedStake: string | null;
    takeRateBps: number;
    capMultiple: number;
    actualHome: number | null;
    actualAway: number | null;
    actualPoints: string | null;
  };
  positions: PoolPosition[];
  settlement: { settleTxHash?: string | null } | null;
}

interface Estimate {
  winners: number;
  losers: number;
  positions: Array<{ address: string; isWinner: boolean; payout: string }>;
}

const GRID = 5; // 0–4 visible; higher scores entered manually

// ── Scoreline picker — 5×5 grid, glow scales with proximity to the pick ───────

function ScoreGrid({
  picked,
  onPick,
  disabled,
}: {
  picked: { home: number; away: number } | null;
  onPick: (h: number, a: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `28px repeat(${GRID}, 1fr)`, maxWidth: 380 }}
      >
        {/* corner + away header */}
        <div />
        {Array.from({ length: GRID }, (_, a) => (
          <div
            key={`h-${a}`}
            className="text-center"
            style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted-foreground)" }}
          >
            {a}
          </div>
        ))}
        {Array.from({ length: GRID }, (_, h) => (
          <Fragment key={`row-${h}`}>
            <div
              className="flex items-center justify-center"
              style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted-foreground)" }}
            >
              {h}
            </div>
            {Array.from({ length: GRID }, (_, a) => {
              const isPicked = picked?.home === h && picked?.away === a;
              // Chebyshev-ish distance drives the proximity glow
              const dist = picked ? Math.max(Math.abs(picked.home - h), Math.abs(picked.away - a)) : null;
              const glow =
                dist === null ? 0 : dist === 0 ? 1 : dist === 1 ? 0.35 : dist === 2 ? 0.15 : 0;
              return (
                <button
                  key={`${h}-${a}`}
                  disabled={disabled}
                  onClick={() => onPick(h, a)}
                  className="aspect-square rounded-lg transition-all duration-150"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    border: isPicked
                      ? "1.5px solid var(--color-kickoff-green)"
                      : "1px solid var(--border)",
                    background: isPicked
                      ? "var(--color-kickoff-green)"
                      : glow > 0
                        ? `color-mix(in srgb, var(--color-kickoff-green) ${glow * 30}%, var(--card))`
                        : "var(--card)",
                    color: isPicked ? "#111210" : "var(--foreground)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    boxShadow: isPicked ? "0 0 16px rgba(0,200,5,0.35)" : "none",
                  }}
                >
                  {h}–{a}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: 8 }}>
        Reward scales with how close your scoreline lands — not just an exact hit.
      </p>
    </div>
  );
}

// ── Stake panel ────────────────────────────────────────────────────────────────

function StakePanel({ detail, onPlaced }: { detail: MarketDetail; onPlaced: () => void }) {
  const m = detail.market;
  const [picked, setPicked] = useState<{ home: number; away: number } | null>(null);
  const [points, setPoints] = useState<string>("");
  const [stake, setStake] = useState<string>(
    m.stakeMode === "fixed" && m.fixedStake ? String(Number(m.fixedStake) / 1e6) : "10",
  );
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const open = m.status === "open" && untilLock(m.locksAt) !== null;
  const signedIn = typeof window !== "undefined" && !!getDevAddress();

  // Live estimate as the pick changes
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const q =
      m.kind === "scoreline"
        ? picked
          ? `home=${picked.home}&away=${picked.away}`
          : null
        : points
          ? `points=${Math.round(Number(points) * 1e6)}`
          : null;
    if (!q) {
      setEstimate(null);
      return;
    }
    api<Estimate>(`/api/markets/${m.id}/estimate?${q}`)
      .then((d) => alive && setEstimate(d))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [m.id, m.kind, open, picked, points]);

  const place = useCallback(async () => {
    setMsg(null);
    setPlacing(true);
    try {
      const stakeMicro = String(Math.round(Number(stake) * 1e6));
      const body: Record<string, unknown> = { stake: stakeMicro };
      if (m.kind === "scoreline") {
        if (!picked) throw new Error("pick a scoreline first");
        body.guessHome = picked.home;
        body.guessAway = picked.away;
      } else {
        if (!points) throw new Error("enter a points line first");
        body.guessPoints = String(Math.round(Number(points) * 1e6));
      }
      await api(`/api/markets/${m.id}/positions`, { method: "POST", body: JSON.stringify(body) });
      setMsg({ kind: "ok", text: "Position placed. You can restake to change it until lock." });
      onPlaced();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setPlacing(false);
    }
  }, [m.id, m.kind, picked, points, stake, onPlaced]);

  if (!open) return null;

  return (
    <div className="card-diagonal glass px-7 py-6 flex flex-col gap-5">
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600 }}>
        {m.kind === "scoreline" ? "Pick the final score" : "Call the points line"}
      </h3>

      {m.kind === "scoreline" ? (
        <ScoreGrid picked={picked} onPick={(h, a) => setPicked({ home: h, away: a })} disabled={placing} />
      ) : (
        <label className="flex flex-col gap-1.5" style={{ maxWidth: 220 }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)" }}>
            {m.playerName ?? "Player"} — points
          </span>
          <input
            type="number"
            step="0.5"
            min="0"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="e.g. 7.5"
            style={{
              background: "var(--input-background)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: "0.9rem",
              color: "var(--foreground)",
            }}
          />
        </label>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)" }}>
            Stake (USDC)
            {m.stakeMode === "fixed" && " — fixed for this market"}
          </span>
          <input
            type="number"
            min={Number(m.minStake) / 1e6}
            max={Number(m.maxStake) / 1e6}
            step="1"
            value={stake}
            disabled={m.stakeMode === "fixed"}
            onChange={(e) => setStake(e.target.value)}
            style={{
              background: "var(--input-background)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: "0.9rem",
              width: 140,
              color: "var(--foreground)",
              opacity: m.stakeMode === "fixed" ? 0.6 : 1,
            }}
          />
          <span style={{ fontSize: "0.64rem", color: "var(--muted-foreground)" }}>
            min {fmtUsdc(m.minStake)} · max {fmtUsdc(m.maxStake)}
          </span>
        </label>

        <Button3D color="green" size="lg" disabled={placing || !signedIn} onClick={place}>
          {placing ? "Placing…" : signedIn ? "Lock it in" : "Sign in to stake"}
        </Button3D>
      </div>

      {estimate && (
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
          If it settled now: {estimate.winners} winner{estimate.winners === 1 ? "" : "s"} share the pool.
        </p>
      )}

      {msg && (
        <p
          style={{
            fontSize: "0.8rem",
            fontWeight: 600,
            color: msg.kind === "ok" ? "var(--color-kickoff-green)" : "var(--destructive)",
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ── Pool leaderboard — bottom of every market (lockinpred layout) ──────────────

function PoolLeaderboard({ detail }: { detail: MarketDetail }) {
  const m = detail.market;
  const rows = useMemo(() => {
    const sorted = [...detail.positions];
    // Settled: payout desc. Open/live: stake desc.
    sorted.sort((x, y) => {
      const px = x.payout ? BigInt(x.payout) : -1n;
      const py = y.payout ? BigInt(y.payout) : -1n;
      if (px !== py) return py > px ? 1 : -1;
      return BigInt(y.stake) > BigInt(x.stake) ? 1 : -1;
    });
    return sorted;
  }, [detail.positions]);

  const me = typeof window !== "undefined" ? getDevAddress()?.toLowerCase() : null;

  return (
    <section className="mt-8">
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600, marginBottom: 14 }}>
        Pool participants
        <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--muted-foreground)", marginLeft: 10 }}>
          {rows.length} {rows.length === 1 ? "position" : "positions"}
        </span>
      </h3>

      {rows.length === 0 ? (
        <div className="card-diagonal-sm glass px-6 py-8 text-center">
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            No positions yet — be the first in the pool.
          </p>
        </div>
      ) : (
        <div className="card-diagonal-sm glass overflow-hidden">
          <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Trader", "Pick", "Stake", m.status === "settled" ? "Payout" : "Status"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3"
                    style={{
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const mine = me && p.address.toLowerCase() === me;
                return (
                  <tr
                    key={`${p.address}-${i}`}
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                      background: mine ? "color-mix(in srgb, var(--color-kickoff-green) 8%, transparent)" : "transparent",
                    }}
                  >
                    <td className="px-5 py-3" style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: i < 3 && m.status === "settled" ? "var(--color-kickoff-green)" : "var(--muted-foreground)" }}>
                      {i + 1}
                    </td>
                    <td className="px-5 py-3" style={{ fontWeight: mine ? 700 : 500 }}>
                      {shortAddr(p.address)}
                      {mine && <span style={{ color: "var(--color-kickoff-green)", marginLeft: 6, fontSize: "0.68rem" }}>you</span>}
                    </td>
                    <td className="px-5 py-3" style={{ fontWeight: 600 }}>
                      {m.kind === "scoreline" ? `${p.guessHome}–${p.guessAway}` : fmtPoints(p.guessPoints)}
                    </td>
                    <td className="px-5 py-3">{fmtUsdc(p.stake)}</td>
                    <td className="px-5 py-3">
                      {m.status === "settled" ? (
                        p.isWinner ? (
                          <span style={{ color: "var(--color-kickoff-green)", fontWeight: 700 }}>{fmtUsdc(p.payout)}</span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        )
                      ) : (
                        <span style={{ color: "var(--muted-foreground)", fontSize: "0.72rem" }}>in pool</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function MarketDetailView({ marketId }: { marketId: number }) {
  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<MarketDetail>(`/api/markets/${marketId}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [marketId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return (
      <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 48 }}>
        <div className="card-diagonal glass px-8 py-10 text-center">
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", marginBottom: 6 }}>Market not found.</p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto px-6 flex flex-col gap-3" style={{ maxWidth: 860, paddingTop: 36 }}>
        <div className="card-diagonal glass" style={{ height: 120, opacity: 0.5 }} />
        <div className="card-diagonal glass" style={{ height: 320, opacity: 0.5 }} />
      </div>
    );
  }

  const m = detail.market;
  const settled = m.status === "settled";
  const totalPool = detail.positions.reduce((s, p) => s + BigInt(p.stake), 0n);

  return (
    <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 36, paddingBottom: 80 }}>
      {/* Header card */}
      <div className="card-diagonal glass px-7 py-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p
              style={{
                fontSize: "0.64rem",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: m.status === "open" ? "var(--color-kickoff-green)" : "var(--muted-foreground)",
                marginBottom: 8,
              }}
            >
              {m.status === "open"
                ? `Open — locks ${untilLock(m.locksAt) ?? "soon"}`
                : m.status === "locked" || m.status === "settling"
                  ? "Live — locked"
                  : m.status === "void"
                    ? "Voided — stakes returned"
                    : "Settled"}
            </p>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(1.5rem, 3.5vw, 2.2rem)", fontWeight: 700, lineHeight: 1.1 }}>
              {m.kind === "scoreline" && m.homeTeam ? (
                <>
                  {m.homeTeam}
                  {settled ? (
                    <span style={{ color: "var(--color-kickoff-green)", padding: "0 0.35em" }}>
                      {m.actualHome}–{m.actualAway}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)", padding: "0 0.35em", fontWeight: 300 }}>vs</span>
                  )}
                  {m.awayTeam}
                </>
              ) : (
                m.title
              )}
            </h1>
            {m.kind === "player_points" && settled && (
              <p style={{ fontSize: "0.95rem", marginTop: 6 }}>
                Final: <strong>{fmtPoints(m.actualPoints)}</strong> pts
              </p>
            )}
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 8 }}>
              Kickoff {fmtKickoff(m.kickoffAt)} · γ={m.gamma} ·{" "}
              {m.stakeMode === "fixed" ? `fixed stake ${fmtUsdc(m.fixedStake)}` : "variable stakes"}
            </p>
          </div>
          <div className="text-right">
            <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 4 }}>
              Total pool
            </p>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "2rem", fontWeight: 700, color: "var(--color-kickoff-green)", lineHeight: 1 }}>
              {fmtUsdc(totalPool, { compact: true })}
            </p>
          </div>
        </div>
      </div>

      <StakePanel detail={detail} onPlaced={load} />
      <PoolLeaderboard detail={detail} />
    </div>
  );
}
