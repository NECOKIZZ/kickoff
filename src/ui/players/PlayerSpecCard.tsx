"use client";

import { fmtUsdc, fmtKickoff, fmtPoints } from "@/ui/clientApi";
import { StateBadge } from "@/ui/markets/StateBadge";
import { cardForPlayer } from "@/ui/players/playerCards";
import type { Snapshot } from "@/ui/markets/useTimeline";

/**
 * Player rail pieces — the card art stands bare (never boxed inside another
 * card), staking slots directly beneath it, then a trimmed details card.
 * Redundancies live elsewhere on the page: gameweek is the top strip, lock
 * state is the badge over the art — neither repeats in the details rows.
 */

interface SpecMarket {
  status: string;
  playerName: string | null;
  kickoffAt: string;
  locksAt: string;
  actualPoints: string | null;
}

/** The designed card art, bare — state badge floating above it. */
export function PlayerCardArt({ market }: { market: SpecMarket }) {
  const m = market;
  const card = cardForPlayer(m.playerName);
  const accent = card?.accent ?? "var(--ui-accent)";

  return (
    <div className="flex flex-col items-center gap-4">
      <StateBadge status={m.status} locksAt={m.locksAt} />
      <div
        style={{
          width: 224,
          height: 314,
          borderRadius: 22,
          overflow: "hidden",
          boxShadow: `0 20px 48px rgba(0,0,0,0.34), 0 0 0 1.5px color-mix(in srgb, ${accent} 40%, transparent), 0 0 40px color-mix(in srgb, ${accent} 28%, transparent)`,
        }}
      >
        {card ? (
          <img
            src={card.img}
            alt={card.name}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "linear-gradient(160deg, #1C1D1A 0%, #111210 60%)",
              border: "1px solid rgba(0,200,5,0.25)",
            }}
          >
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.6rem", fontWeight: 700, color: "#F7F5F0" }}>
              {(m.playerName ?? "?")
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(247,245,240,0.4)",
              }}
            >
              Card drops soon
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Trimmed player details — name, live/final FPL points, the essentials. */
export function PlayerDetailsCard({
  market,
  totalPool,
  entries,
  latestSnapshot,
}: {
  market: SpecMarket;
  totalPool: bigint;
  entries: number;
  latestSnapshot: Snapshot | null;
}) {
  const m = market;
  const settled = m.status === "settled";
  const liveState = m.status === "locked" || m.status === "settling";
  const card = cardForPlayer(m.playerName);

  // FPL points to display: settled = final; live = latest snapshot's running tally.
  const points =
    settled && m.actualPoints !== null
      ? { v: fmtPoints(m.actualPoints), label: "Final FPL points" }
      : liveState && latestSnapshot?.livePoints != null
        ? { v: fmtPoints(latestSnapshot.livePoints), label: `Live FPL points · ${latestSnapshot.matchClock}` }
        : null;

  return (
    <div className="card-diagonal glass px-6 py-5 flex flex-col gap-4">
      {/* Name + points */}
      <div className="text-center">
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.2rem", fontWeight: 700, lineHeight: 1.15 }}>
          {m.playerName ?? "Player"}
        </p>
        {points && (
          <div style={{ marginTop: 6 }}>
            <span
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: "2.1rem",
                fontWeight: 700,
                lineHeight: 1,
                color: settled ? "var(--foreground)" : "var(--ui-accent)",
              }}
            >
              {points.v}
            </span>
            <p
              style={{
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--muted-foreground)",
                marginTop: 4,
              }}
            >
              {points.label}
            </p>
          </div>
        )}
      </div>

      {/* Void note */}
      {m.status === "void" && (
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", textAlign: "center" }}>
          Market voided. All stakes returned.
        </p>
      )}

      {/* The essentials only */}
      <div className="flex flex-col" style={{ borderTop: "1px solid var(--border)" }}>
        {[
          ...(card ? [["Position", card.position] as [string, string]] : []),
          ...(card ? [["Club", card.club] as [string, string]] : []),
          ["Kickoff", fmtKickoff(m.kickoffAt)],
          ["Total pool", fmtUsdc(totalPool, { compact: true })],
          ["Entries", String(entries)],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between py-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
              {k}
            </span>
            <span
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: k === "Total pool" ? "var(--ui-accent)" : "var(--foreground)",
              }}
            >
              {v}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
