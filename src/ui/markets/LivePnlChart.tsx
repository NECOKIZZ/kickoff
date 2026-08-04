"use client";

import { useMemo, useRef, useState } from "react";
import { fmtUsdc } from "@/ui/clientApi";
import { clubCode } from "@/ui/markets/clubs";
import { clocksToXs } from "@/ui/markets/matchClock";
import type { Snapshot } from "@/ui/markets/useTimeline";

/**
 * Live PnL chart — YOUR position only, if the match ended now. X-axis is
 * match time KO→FT (matchClock mapped through clockToX); goal moments get a
 * vertical dashed marker labelled "12' ARS". Bold green line + soft area
 * fill, dashed breakeven at $0. Pure SVG, no chart lib.
 */

const W = 720;
const H = 250;
const PAD = { top: 34, right: 20, bottom: 26, left: 56 };

const gainDollars = (s: string) => Number(BigInt(s) / 10_000n) / 100;

interface GoalMark {
  x: number; // 0–100 match-time
  label: string; // "12' ARS"
}

export function LivePnlChart({
  snapshots,
  myPositionId,
  homeTeam,
  awayTeam,
  live,
  final = false,
}: {
  snapshots: Snapshot[];
  myPositionId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  live: boolean;
  final?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Your gain series across snapshots (null gaps allowed if you joined late).
  const series = useMemo(() => {
    if (myPositionId === null) return null;
    return snapshots.map((s) => {
      const p = s.positions.find((q) => q.positionId === myPositionId);
      return p ? gainDollars(p.estimatedGain) : null;
    });
  }, [snapshots, myPositionId]);

  const xs = useMemo(() => clocksToXs(snapshots.map((s) => s.matchClock)), [snapshots]);

  // Goal markers: score increased vs the previous snapshot.
  const goals = useMemo<GoalMark[]>(() => {
    const out: GoalMark[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1];
      const cur = snapshots[i];
      if (cur.scoreHome === null || prev.scoreHome === null) continue;
      const dh = (cur.scoreHome ?? 0) - (prev.scoreHome ?? 0);
      const da = (cur.scoreAway ?? 0) - (prev.scoreAway ?? 0);
      if (dh > 0) out.push({ x: xs[i], label: `${cur.matchClock} ${clubCode(homeTeam)}` });
      if (da > 0) out.push({ x: xs[i], label: `${cur.matchClock} ${clubCode(awayTeam)}` });
    }
    return out;
  }, [snapshots, xs, homeTeam, awayTeam]);

  if (!series || snapshots.length < 2) {
    return (
      <div className="px-6 py-10 text-center">
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
          {myPositionId === null
            ? "You're not in this pool. The chart tracks your position once you stake."
            : live
              ? "The chart starts drawing at kickoff. Every score change re-marks the pool."
              : "No in-match timeline was captured for this market."}
        </p>
      </div>
    );
  }

  // ── Scales ──────────────────────────────────────────────────────────────────
  const gains = series.filter((g): g is number => g !== null);
  const yMin = Math.min(0, ...gains);
  const yMax = Math.max(1, ...gains);
  const xTo = (mx: number) => PAD.left + (mx / 100) * (W - PAD.left - PAD.right);
  const yTo = (v: number) => {
    const t = (v - yMin) / (yMax - yMin || 1);
    return H - PAD.bottom - t * (H - PAD.top - PAD.bottom);
  };

  // Line + area paths (skip null gaps).
  const pts = snapshots
    .map((_, i) => (series[i] === null ? null : { x: xTo(xs[i]), y: yTo(series[i]!) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area =
    pts.length > 1
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${yTo(Math.min(0, yMin)).toFixed(1)} L${pts[0].x.toFixed(1)},${yTo(Math.min(0, yMin)).toFixed(1)} Z`
      : "";

  const latest = gains.length ? gains[gains.length - 1] : 0;
  const zeroY = yTo(0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    snapshots.forEach((_, i) => {
      const d = Math.abs(xTo(xs[i]) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  };

  const hover =
    hoverIdx !== null && series[hoverIdx] !== null
      ? { i: hoverIdx, x: xTo(xs[hoverIdx]), y: yTo(series[hoverIdx]!), snap: snapshots[hoverIdx], gain: series[hoverIdx]! }
      : null;

  return (
    <div>
      {/* Headline figure — latest unrealised PnL */}
      <div className="flex items-baseline justify-between px-1 mb-1">
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
          {final ? "How your position moved" : "If the match ended now"}
        </span>
        <span
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: latest >= 0 ? "var(--ui-accent)" : "var(--destructive)",
          }}
        >
          {latest >= 0 ? "+" : "−"}${Math.abs(latest).toFixed(2)}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Your live profit and loss across the match"
      >
        <defs>
          <linearGradient id="pnl-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ui-accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--ui-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Breakeven (stake) dashed line */}
        <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="5 5" />
        <text x={PAD.left - 8} y={zeroY + 3} textAnchor="end" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
          $0
        </text>
        {/* y extremes */}
        <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
          {yMax >= 0 ? "+" : ""}${yMax.toFixed(0)}
        </text>
        {yMin < 0 && (
          <text x={PAD.left - 8} y={H - PAD.bottom + 3} textAnchor="end" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
            −${Math.abs(yMin).toFixed(0)}
          </text>
        )}

        {/* Goal markers */}
        {goals.map((g, i) => (
          <g key={i}>
            <line
              x1={xTo(g.x)}
              y1={PAD.top - 4}
              x2={xTo(g.x)}
              y2={H - PAD.bottom}
              stroke="var(--muted-foreground)"
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.55"
            />
            <text
              x={xTo(g.x)}
              y={PAD.top - 10}
              textAnchor="middle"
              style={{ fontSize: 9.5, fontWeight: 700, fill: "var(--foreground)", letterSpacing: "0.04em" }}
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Area + line */}
        {area && <path d={area} fill="url(#pnl-area)" />}
        <path d={line} fill="none" stroke="var(--ui-accent)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />

        {/* Latest point dot */}
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="var(--ui-accent)" />
        )}

        {/* x-axis labels */}
        <text x={PAD.left} y={H - 8} style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
          KO
        </text>
        <text x={xTo(50)} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
          HT
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" style={{ fontSize: 10, fill: "var(--muted-foreground)" }}>
          FT
        </text>

        {/* Hover crosshair + tooltip */}
        {hover && (
          <g>
            <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={H - PAD.bottom} stroke="var(--foreground)" strokeWidth="0.75" opacity="0.35" />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill="var(--ui-accent)" stroke="var(--background)" strokeWidth="1.5" />
            {(() => {
              const flip = hover.x > W - 150;
              const tx = flip ? hover.x - 10 : hover.x + 10;
              return (
                <g>
                  <rect
                    x={flip ? tx - 128 : tx}
                    y={PAD.top + 2}
                    width="128"
                    height="38"
                    rx="7"
                    fill="var(--card)"
                    stroke="var(--border)"
                  />
                  <text x={flip ? tx - 120 : tx + 8} y={PAD.top + 18} style={{ fontSize: 10.5, fontWeight: 700, fill: "var(--foreground)" }}>
                    {hover.snap.matchClock} · {hover.snap.scoreHome ?? "?"}-{hover.snap.scoreAway ?? "?"}
                  </text>
                  <text
                    x={flip ? tx - 120 : tx + 8}
                    y={PAD.top + 33}
                    style={{ fontSize: 10.5, fontWeight: 700, fill: hover.gain >= 0 ? "var(--ui-accent)" : "var(--destructive)" }}
                  >
                    {hover.gain >= 0 ? "+" : "−"}${Math.abs(hover.gain).toFixed(2)}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      <p style={{ fontSize: "0.66rem", color: "var(--muted-foreground)", marginTop: 6, paddingLeft: 4 }}>
        {final ? "Replay of the in-match mark-to-model. Settled results below." : "Mark-to-model. Nothing is final until settlement."}
      </p>
    </div>
  );
}

/** The three stat tiles below the chart: stake / rank / unrealised PnL. */
export function PnlStatTiles({
  stake,
  rank,
  of,
  pnl,
  final,
}: {
  stake: string | null;
  rank: number | null;
  of: number;
  pnl: number | null;
  final: boolean;
}) {
  const tiles: Array<{ k: string; v: string; color?: string }> = [
    { k: "Your stake", v: stake ? fmtUsdc(stake) : "-" },
    { k: final ? "Final rank" : "Live rank", v: rank ? `${rank} of ${of}` : "-" },
    {
      k: final ? "Realised PnL" : "Unrealised PnL",
      v: pnl === null ? "-" : `${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}`,
      color: pnl === null ? undefined : pnl >= 0 ? "var(--ui-accent)" : "var(--destructive)",
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-2.5 mt-4">
      {tiles.map((t) => (
        <div key={t.k} className="card-diagonal-sm px-4 py-3" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <p style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 5 }}>
            {t.k}
          </p>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, color: t.color ?? "var(--foreground)" }}>
            {t.v}
          </p>
        </div>
      ))}
    </div>
  );
}
