"use client";

import { useMemo } from "react";
import { type PoolPosition } from "@/ui/clientApi";
import { useAuth } from "@/ui/auth/useAuth";
import { GameweekStrip } from "@/ui/players/GameweekStrip";
import { PlayerCardArt, PlayerDetailsCard } from "@/ui/players/PlayerSpecCard";
import { PlayerStakeCard } from "@/ui/players/PlayerStakeCard";
import { LivePnlChart, PnlStatTiles } from "@/ui/markets/LivePnlChart";
import { useTimeline } from "@/ui/markets/useTimeline";
import type { MarketDetail } from "@/ui/markets/MarketDetailView";
import { PoolLeaderboard } from "@/ui/markets/MarketDetailView";
import { pnlOf, pnlRank } from "@/lib/pnlCard";
import { MyPnlCard } from "@/ui/positions/MyPnlCard";

/**
 * Player perp detail — minimal GW strip on top; right rail leads with the
 * bare card art, then STAKING (the first thing after the card — the point
 * of the page), then a trimmed details card. Left column = live PnL with
 * the leaderboard stacked directly beneath (no grid gap when the chart is
 * empty). No concentration grid for perps. DOM order = mobile stacking.
 */

const gainDollars = (s: string) => Number(BigInt(s) / 10_000n) / 100;

export function PlayerMarketDetail({ detail, onPlaced }: { detail: MarketDetail; onPlaced: () => void }) {
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

  // Stat tiles from the latest snapshot (or final results when settled).
  const tiles = useMemo(() => {
    if (settled && myPosition) {
      // Same ranking as the PnL card: by payout − stake, ties share a rank.
      const rank = pnlRank(detail.positions, myPosition);
      const pnl = gainDollars(String(pnlOf(myPosition)));
      return { stake: myPosition.stake, rank, of: detail.positions.length, pnl, final: true };
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

  return (
    <div className="mx-auto px-6 player-detail-grid" style={{ maxWidth: 1140, paddingTop: 28, paddingBottom: 80 }}>
      {/* 1 — Gameweek strip (bare, minimal) */}
      <div style={{ gridArea: "gw" }}>
        <GameweekStrip marketId={m.id} playerName={m.playerName} gameweek={m.gameweek ?? null} />
      </div>

      {/* 2 — Rail: bare card art → staking → trimmed details */}
      <div style={{ gridArea: "rail" }} className="flex flex-col gap-5">
        <PlayerCardArt market={m} />
        <PlayerStakeCard market={m} myPosition={myPosition} onPlaced={onPlaced} />
        <PlayerDetailsCard
          market={m}
          totalPool={totalPool}
          entries={detail.positions.length}
          latestSnapshot={latestSnapshot}
        />
      </div>

      {/* 3 — Main: live PnL with the leaderboard right beneath it */}
      <div style={{ gridArea: "main" }} className="flex flex-col">
        {settled && myPositionId !== null && <MyPnlCard positionId={myPositionId} />}
        <div className="card-diagonal glass px-6 py-6">
          <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600, marginBottom: 20 }}>
            Live PnL
          </h3>
          <LivePnlChart
            snapshots={snapshots}
            myPositionId={myPositionId}
            homeTeam={null}
            awayTeam={null}
            live={live}
            final={settled}
          />
          {tiles && <PnlStatTiles {...tiles} />}
        </div>
        <PoolLeaderboard detail={detail} />
      </div>
    </div>
  );
}
