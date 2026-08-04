"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/ui/clientApi";

/**
 * Shared timeline fetch/poll for score market detail — the spec card (live
 * score) and the PnL chart both read the same snapshot stream. Polls every
 * 30 s while the match is live.
 */

export interface SnapshotPosition {
  positionId: number;
  stake: string;
  isWinner: boolean;
  estimatedPayout: string;
  estimatedGain: string;
  rank: number;
}

export interface Snapshot {
  id: number;
  matchClock: string;
  scoreHome: number | null;
  scoreAway: number | null;
  livePoints: string | null; // player_points markets — fixed-point ×1e6
  positions: SnapshotPosition[];
  at: string;
}

export interface Timeline {
  marketId: number;
  kind: "scoreline" | "player_points";
  snapshots: Snapshot[];
}

export function useTimeline(marketId: number, live: boolean): Timeline | null {
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  const load = useCallback(() => {
    api<Timeline>(`/api/markets/${marketId}/timeline`)
      .then(setTimeline)
      .catch(() => setTimeline(null));
  }, [marketId]);

  useEffect(() => {
    load();
    if (!live) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, live]);

  return timeline;
}
