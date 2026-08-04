"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type MarketSummary } from "@/ui/clientApi";

/**
 * Gameweek strip — top of player perp detail. Deliberately minimal: just
 * "GW1" with a slim chevron either side stepping through this player's
 * markets across gameweeks (left = past listings). Chevrons fade out at
 * either end of the player's listing history.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function Chevron({ dir, onClick, disabled }: { dir: "left" | "right"; onClick: () => void; disabled: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      aria-label={dir === "left" ? "Previous gameweek market" : "Next gameweek market"}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "none",
        border: "none",
        padding: 10,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--border)" : hover ? "var(--ui-accent)" : "var(--muted-foreground)",
        transform: hover && !disabled ? `translateX(${dir === "left" ? -3 : 3}px)` : "none",
        transition: `color 0.15s, transform 0.2s ${EASE}`,
        display: "flex",
        alignItems: "center",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ transform: dir === "left" ? "scaleX(-1)" : undefined }}>
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function GameweekStrip({
  marketId,
  playerName,
  gameweek,
}: {
  marketId: number;
  playerName: string | null;
  gameweek: number | null;
}) {
  const router = useRouter();
  const [siblings, setSiblings] = useState<MarketSummary[]>([]);

  // This player's markets across gameweeks — the strip's scroll history.
  useEffect(() => {
    if (!playerName) return;
    let alive = true;
    api<{ markets: MarketSummary[] }>(`/api/markets?status=all`)
      .then((d) => {
        if (!alive) return;
        const mine = d.markets
          .filter((m) => m.kind === "player_points" && m.playerName === playerName)
          .sort((a, b) => (a.gameweek ?? 0) - (b.gameweek ?? 0) || a.id - b.id);
        setSiblings(mine);
      })
      .catch(() => alive && setSiblings([]));
    return () => {
      alive = false;
    };
  }, [playerName]);

  const idx = useMemo(() => siblings.findIndex((m) => m.id === marketId), [siblings, marketId]);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <div className="flex items-center justify-center gap-2">
      <Chevron dir="left" disabled={!prev} onClick={() => prev && router.push(`/markets/${prev.id}`)} />
      <span
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: "1.55rem",
          fontWeight: 700,
          lineHeight: 1,
          minWidth: 86,
          textAlign: "center",
        }}
      >
        {gameweek != null ? `GW${gameweek}` : "Special"}
      </span>
      <Chevron dir="right" disabled={!next} onClick={() => next && router.push(`/markets/${next.id}`)} />
    </div>
  );
}
