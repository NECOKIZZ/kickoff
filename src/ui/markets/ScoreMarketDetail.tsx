"use client";

import { useMemo, useState } from "react";
import { type PoolPosition } from "@/ui/clientApi";
import { useAuth } from "@/ui/auth/useAuth";
import { MatchSpecCard } from "@/ui/markets/MatchSpecCard";
import { ScoreStakeCard } from "@/ui/markets/ScoreStakeCard";
import { LivePnlChart, PnlStatTiles } from "@/ui/markets/LivePnlChart";
import { ConcentrationGrid } from "@/ui/markets/ConcentrationGrid";
import { useTimeline } from "@/ui/markets/useTimeline";
import type { MarketDetail } from "@/ui/markets/MarketDetailView";
import { PoolLeaderboard } from "@/ui/markets/MarketDetailView";

/**
 * Score market detail — the redesigned layout (user wireframe 2026-08-04):
 * right rail = match specifications + staking; wide left column = live PnL /
 * concentration (pill-switched, one at a time) with the leaderboard beneath.
 * DOM order = mobile stacking order: spec → stake → chart → leaderboard.
 */

const gainDollars = (s: string) => Number(BigInt(s) / 10_000n) / 100;

export function ScoreMarketDetail({ detail, onPlaced }: { detail: MarketDetail; onPlaced: () => void }) {
  const m = detail.market;
  const live = m.status === "locked" || m.status === "settling";
  const settled = m.status === "settled";
  const timeline = useTimeline(m.id, live);
  const snapshots = timeline?.snapshots ?? [];
  const latestSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;

  const totalPool = useMemo(
    () => detail.positions.reduce((s, p) => s + BigInt(p.stake), 0n),
    [detail.positions],
  );

  // Your position (signed-in identity — Privy or dev wallet).
  const { address } = useAuth();
  const myPosition = useMemo<PoolPosition | null>(() => {
    const me = address?.toLowerCase() ?? null;
    if (!me) return null;
    return detail.positions.find((p) => p.address.toLowerCase() === me) ?? null;
  }, [detail.positions, address]);
  const myPositionId = myPosition?.id ?? null;

  // Pill state: PnL when there's a line to draw, else concentration.
  const canChart = myPositionId !== null && snapshots.length >= 2;
  const [viewOverride, setViewOverride] = useState<"pnl" | "grid" | null>(null);
  const view = viewOverride ?? (canChart ? "pnl" : "grid");

  // Stat tiles from the latest snapshot (or final results when settled).
  const tiles = useMemo(() => {
    if (settled && myPosition) {
      const rank =
        [...detail.positions]
          .sort((a, b) => Number(BigInt(b.payout ?? "0") - BigInt(a.payout ?? "0")))
          .findIndex((p) => p.id === myPosition.id) + 1;
      const pnl = myPosition.payout !== null ? gainDollars(String(BigInt(myPosition.payout) - BigInt(myPosition.stake))) : null;
      return { stake: myPosition.stake, rank: rank || null, of: detail.positions.length, pnl, final: true };
    }
    if (myPositionId !== null && latestSnapshot) {
      const p = latestSnapshot.positions.find((q) => q.positionId === myPositionId);
      if (p)
        return {
          stake: p.stake,
          rank: p.rank,
          of: latestSnapshot.positions.length,
          pnl: gainDollars(p.estimatedGain),
          final: false,
        };
    }
    if (myPosition) return { stake: myPosition.stake, rank: null, of: detail.positions.length, pnl: null, final: false };
    return null;
  }, [settled, myPosition, myPositionId, latestSnapshot, detail.positions]);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "'Inter', sans-serif",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "6px 14px",
    borderRadius: 999,
    border: active ? "1.5px solid var(--ui-accent)" : "1px solid var(--border)",
    background: active ? "color-mix(in srgb, var(--ui-accent) 12%, transparent)" : "transparent",
    color: active ? "var(--foreground)" : "var(--muted-foreground)",
    cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div className="mx-auto px-6 score-detail-grid" style={{ maxWidth: 1140, paddingTop: 36, paddingBottom: 80 }}>
      {/* 1 — Match specifications */}
      <div style={{ gridArea: "spec" }}>
        <MatchSpecCard
          market={m}
          totalPool={totalPool}
          entries={detail.positions.length}
          latestSnapshot={latestSnapshot}
        />
      </div>

      {/* 2 — Staking */}
      <div style={{ gridArea: "stake" }}>
        <ScoreStakeCard market={m} myPosition={myPosition} onPlaced={onPlaced} />
      </div>

      {/* 3 — Live PnL ⇄ concentration (one at a time, pill-switched) */}
      <div style={{ gridArea: "chart" }}>
        <div className="card-diagonal glass px-6 py-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600 }}>
              {view === "pnl" ? "Live PnL" : "Pool concentration"}
            </h3>
            <div className="flex gap-1.5">
              <button style={pillStyle(view === "pnl")} onClick={() => setViewOverride("pnl")}>
                Live PnL
              </button>
              <button style={pillStyle(view === "grid")} onClick={() => setViewOverride("grid")}>
                Concentration
              </button>
            </div>
          </div>

          {view === "pnl" ? (
            <>
              <LivePnlChart
                snapshots={snapshots}
                myPositionId={myPositionId}
                homeTeam={m.homeTeam}
                awayTeam={m.awayTeam}
                live={live}
                final={settled}
              />
              {tiles && <PnlStatTiles {...tiles} />}
            </>
          ) : (
            <ConcentrationGrid
              positions={detail.positions}
              myPositionId={myPositionId}
              homeTeam={m.homeTeam}
              awayTeam={m.awayTeam}
            />
          )}
        </div>
      </div>

      {/* 4 — Leaderboard */}
      <div style={{ gridArea: "board" }}>
        <PoolLeaderboard detail={detail} />
      </div>
    </div>
  );
}
