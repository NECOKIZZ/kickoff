"use client";

import { Fragment, useMemo } from "react";
import { fmtUsdc, type PoolPosition } from "@/ui/clientApi";

/**
 * Concentration heatmap — where the pool's money sits across scorelines.
 * 5×5 grid with 4+ edge buckets, cell intensity by stake share; your pick
 * outlined in green. Purely derived from positions, so it works in every
 * market state.
 */

const GRID = 5; // 0..3 exact, index 4 = "4+"

const bucket = (n: number) => Math.min(n, GRID - 1);
const bucketLabel = (i: number) => (i === GRID - 1 ? "4+" : String(i));

export function ConcentrationGrid({
  positions,
  myPositionId,
  homeTeam,
  awayTeam,
}: {
  positions: PoolPosition[];
  myPositionId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
}) {
  const { cells, totalPool } = useMemo(() => {
    const cells: bigint[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => 0n));
    let totalPool = 0n;
    for (const p of positions) {
      if (p.guessHome === null || p.guessAway === null) continue;
      const s = BigInt(p.stake);
      cells[bucket(p.guessHome)][bucket(p.guessAway)] += s;
      totalPool += s;
    }
    return { cells, totalPool };
  }, [positions]);

  const mine = useMemo(() => {
    const p = positions.find((q) => q.id === myPositionId);
    return p && p.guessHome !== null && p.guessAway !== null
      ? { h: bucket(p.guessHome), a: bucket(p.guessAway) }
      : null;
  }, [positions, myPositionId]);

  if (positions.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
          No positions yet. The heatmap fills in as the pool builds.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-3">
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          {homeTeam ?? "Home"} ↓ · {awayTeam ?? "Away"} →
        </span>
      </div>

      <div className="grid gap-1.5 mx-auto" style={{ gridTemplateColumns: `28px repeat(${GRID}, 1fr)`, maxWidth: 420 }}>
        <div />
        {Array.from({ length: GRID }, (_, a) => (
          <div key={`h-${a}`} className="text-center" style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted-foreground)" }}>
            {bucketLabel(a)}
          </div>
        ))}
        {Array.from({ length: GRID }, (_, h) => (
          <Fragment key={`row-${h}`}>
            <div className="flex items-center justify-center" style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted-foreground)" }}>
              {bucketLabel(h)}
            </div>
            {Array.from({ length: GRID }, (_, a) => {
              const share = totalPool > 0n ? Number((cells[h][a] * 10_000n) / totalPool) / 10_000 : 0;
              const isMine = mine !== null && mine.h === h && mine.a === a;
              return (
                <div
                  key={`${h}-${a}`}
                  className="aspect-square rounded-lg flex items-center justify-center"
                  style={{
                    border: isMine ? "1.5px solid var(--ui-accent)" : "1px solid var(--border)",
                    background:
                      share > 0
                        ? `color-mix(in srgb, var(--ui-accent) ${Math.round(share * 80)}%, var(--card))`
                        : "var(--card)",
                    boxShadow: isMine ? "0 0 14px rgba(0,200,5,0.35)" : "none",
                    fontSize: "0.66rem",
                    fontWeight: 700,
                    color: share > 0.5 ? "var(--ui-accent-contrast)" : "var(--foreground)",
                  }}
                  title={`${bucketLabel(h)}-${bucketLabel(a)} · ${(share * 100).toFixed(1)}% of pool`}
                >
                  {share >= 0.05 ? `${Math.round(share * 100)}%` : ""}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", textAlign: "center", marginTop: 12 }}>
        {positions.length} {positions.length === 1 ? "position" : "positions"} · {fmtUsdc(totalPool)} pooled
        {mine && " · your pick outlined"}
      </p>
    </div>
  );
}
