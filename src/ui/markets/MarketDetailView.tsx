"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentBadge } from "@/ui/agents/AgentView";
import {
  api,
  fmtUsdc,
  fmtPoints,
  shortAddr,
  type PoolPosition,
} from "@/ui/clientApi";
import { useAuth } from "@/ui/auth/useAuth";
import { ScoreMarketDetail } from "@/ui/markets/ScoreMarketDetail";
import { pnlOf, pnlRank } from "@/lib/pnlCard";
import { PlayerMarketDetail } from "@/ui/players/PlayerMarketDetail";

export interface MarketDetail {
  market: {
    id: number;
    kind: "scoreline" | "player_points";
    status: string;
    title: string;
    gameweek?: number | null;
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
    escrowAddress?: string | null;
    onChainMarketId?: string | null;
  };
  positions: PoolPosition[];
  settlement: { settleTxHash?: string | null } | null;
}

// ── Pool leaderboard — bottom of every market (lockinpred layout) ──────────────

export function PoolLeaderboard({ detail }: { detail: MarketDetail }) {
  const m = detail.market;
  const rows = useMemo(() => {
    const sorted = [...detail.positions];
    const settled = m.status === "settled";
    // Settled: PnL desc (the PnL card's ranking). Open/live: stake desc.
    sorted.sort((x, y) => {
      if (settled) {
        const px = pnlOf(x);
        const py = pnlOf(y);
        if (px !== py) return py > px ? 1 : -1;
      }
      const sx = BigInt(x.stake);
      const sy = BigInt(y.stake);
      return sy === sx ? 0 : sy > sx ? 1 : -1;
    });
    // Tied PnL shares a rank, same as the card; unsettled pools just count.
    return sorted.map((p, i) => ({ p, rank: settled ? pnlRank(sorted, p) : i + 1 }));
  }, [detail.positions, m.status]);

  const { address } = useAuth();
  const me = address?.toLowerCase() ?? null;

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
            No positions yet. Be the first in the pool.
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
              {rows.map(({ p, rank }, i) => {
                const mine = me && p.address.toLowerCase() === me;
                return (
                  <tr
                    key={`${p.address}-${i}`}
                    style={{
                      borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                      background: mine ? "color-mix(in srgb, var(--ui-accent) 8%, transparent)" : "transparent",
                    }}
                  >
                    <td className="px-5 py-3" style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: rank <= 3 && m.status === "settled" ? "var(--ui-accent)" : "var(--muted-foreground)" }}>
                      {rank}
                    </td>
                    <td className="px-5 py-3" style={{ fontWeight: mine ? 700 : 500 }}>
                      {p.agentName ? (
                        <>
                          {p.agentName} <AgentBadge />
                        </>
                      ) : (
                        shortAddr(p.address)
                      )}
                      {mine && <span style={{ color: "var(--ui-accent)", marginLeft: 6, fontSize: "0.68rem" }}>you</span>}
                    </td>
                    <td className="px-5 py-3" style={{ fontWeight: 600 }}>
                      {m.kind === "scoreline" ? `${p.guessHome}-${p.guessAway}` : fmtPoints(p.guessPoints)}
                    </td>
                    <td className="px-5 py-3">{fmtUsdc(p.stake)}</td>
                    <td className="px-5 py-3">
                      {m.status === "settled" ? (
                        p.isWinner ? (
                          <span style={{ color: "var(--ui-accent)", fontWeight: 700 }}>{fmtUsdc(p.payout)}</span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>-</span>
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

  // Both kinds get redesigned layouts: score = spec rail + stepper + live
  // PnL / concentration switch; player perps = GW strip + card rail + PnL.
  if (m.kind === "scoreline") {
    return <ScoreMarketDetail detail={detail} onPlaced={load} />;
  }
  return <PlayerMarketDetail detail={detail} onPlaced={load} />;
}
