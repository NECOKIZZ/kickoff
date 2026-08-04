"use client";

import { fmtUsdc, fmtKickoff, untilLock } from "@/ui/clientApi";
import { StateBadge } from "@/ui/markets/StateBadge";
import { crestUrl } from "@/ui/markets/clubs";
import type { Snapshot } from "@/ui/markets/useTimeline";

/**
 * Match Specifications — top of the right rail on score market detail.
 * Teams + crests, score (actual when settled, live from latest snapshot,
 * "vs" otherwise), kickoff, pool, entries, lock countdown, market params.
 */

interface SpecMarket {
  status: string;
  homeTeam: string | null;
  awayTeam: string | null;
  gameweek?: number | null;
  kickoffAt: string;
  locksAt: string;
  gamma: number;
  stakeMode: "variable" | "fixed";
  fixedStake: string | null;
  actualHome: number | null;
  actualAway: number | null;
}

function TeamCol({ name }: { name: string }) {
  const crest = crestUrl(name);
  return (
    <div
      className="flex flex-col items-center gap-2 flex-1"
      style={{ minWidth: 0 }}
    >
      {crest && (
        <img
          src={crest}
          alt=""
          width={52}
          height={52}
          style={{ objectFit: "contain" }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <span
        style={{
          fontSize: "0.8rem",
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {name}
      </span>
    </div>
  );
}

export function MatchSpecCard({
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
  const lock = m.status === "open" ? untilLock(m.locksAt) : null;

  // Score to display: settled = final; live = latest snapshot's running score.
  const score =
    settled && m.actualHome !== null
      ? { h: m.actualHome, a: m.actualAway ?? 0, label: "Full time" }
      : liveState && latestSnapshot && latestSnapshot.scoreHome !== null
        ? { h: latestSnapshot.scoreHome, a: latestSnapshot.scoreAway ?? 0, label: latestSnapshot.matchClock }
        : null;

  return (
    <div className="card-diagonal glass px-6 py-6 flex flex-col gap-5">
      {/* State + gameweek */}
      <div className="flex items-center justify-between">
        <StateBadge status={m.status} locksAt={m.locksAt} />
        {m.gameweek != null && (
          <span
            style={{
              fontSize: "0.64rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
            }}
          >
            GW{m.gameweek}
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-start gap-2">
        <TeamCol name={m.homeTeam ?? "Home"} />
        <div className="flex flex-col items-center gap-1 px-1" style={{ paddingTop: 10 }}>
          {score ? (
            <>
              <span
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: "2.4rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  color: settled ? "var(--foreground)" : "var(--ui-accent)",
                }}
              >
                {score.h}-{score.a}
              </span>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                {score.label}
              </span>
            </>
          ) : (
            <span style={{ fontSize: "1rem", fontWeight: 300, color: "var(--muted-foreground)", paddingTop: 8 }}>
              vs
            </span>
          )}
        </div>
        <TeamCol name={m.awayTeam ?? "Away"} />
      </div>

      {/* Void note */}
      {m.status === "void" && (
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", textAlign: "center" }}>
          Market voided. All stakes returned.
        </p>
      )}

      {/* Spec rows */}
      <div className="flex flex-col" style={{ borderTop: "1px solid var(--border)" }}>
        {[
          ["Kickoff", fmtKickoff(m.kickoffAt)],
          ["Total pool", fmtUsdc(totalPool, { compact: true })],
          ["Entries", String(entries)],
          ...(lock ? [["Locks in", lock] as [string, string]] : []),
          [
            "Stakes",
            m.stakeMode === "fixed" ? `fixed ${fmtUsdc(m.fixedStake)}` : "variable",
          ],
          ["Gamma", `γ=${m.gamma}`],
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
