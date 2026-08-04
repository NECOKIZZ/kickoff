"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/ui/clientApi";

/**
 * Live PnL / rank timeline — the in-match chart on market detail. Replays
 * pnl_snapshots (mark-to-model at every score change). Two views:
 *   PnL  — estimated gain/loss in $ per position over the match clock
 *   Rank — leaderboard position (1 = top, y-axis flipped)
 *
 * Pure SVG, no chart lib. Palette: brand green for "you", purple for the
 * field (validated: ΔE 36.6 CVD-safe pair) — plus direct labels so identity
 * never rides on color alone.
 */

interface SnapshotPosition {
  positionId: number;
  stake: string;
  isWinner: boolean;
  estimatedPayout: string;
  estimatedGain: string;
  rank: number;
}

interface Snapshot {
  id: number;
  matchClock: string;
  scoreHome: number | null;
  scoreAway: number | null;
  positions: SnapshotPosition[];
  at: string;
}

interface Timeline {
  marketId: number;
  kind: "scoreline" | "player_points";
  snapshots: Snapshot[];
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const W = 720;
const H = 260;
const PAD = { top: 18, right: 64, bottom: 30, left: 56 };

const gainDollars = (s: string) => Number(BigInt(s) / 10_000n) / 100;

export function PnlTimeline({
  marketId,
  live,
  positionsById,
}: {
  marketId: number;
  live: boolean;
  /** positionId → short trader label (from the pool list), for tooltips */
  positionsById: Map<number, { label: string; mine: boolean }>;
}) {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [view, setView] = useState<"pnl" | "rank">("pnl");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const snaps = timeline?.snapshots ?? [];

  // Series: one line per position that appears in the snapshots.
  const series = useMemo(() => {
    const ids = new Set<number>();
    snaps.forEach((s) => s.positions.forEach((p) => ids.add(p.positionId)));
    return [...ids].map((pid) => {
      const meta = positionsById.get(pid);
      return {
        pid,
        label: meta?.label ?? `#${pid}`,
        mine: meta?.mine ?? false,
        points: snaps.map((s) => {
          const p = s.positions.find((q) => q.positionId === pid);
          return p ? { gain: gainDollars(p.estimatedGain), rank: p.rank } : null;
        }),
      };
    });
  }, [snaps, positionsById]);

  if (snaps.length < 2) {
    // Not enough ticks for a line — say why instead of an empty box.
    return (
      <section className="mt-8">
        <ChartHeader view={view} onView={setView} disabled />
        <div className="card-diagonal-sm glass px-6 py-10 text-center">
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            {live
              ? "The chart starts drawing at kickoff. Every score change marks everyone to model."
              : "No in-match timeline was captured for this market."}
          </p>
        </div>
      </section>
    );
  }

  // ── Scales ────────────────────────────────────────────────────────────────
  const n = snaps.length;
  const maxRank = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p?.rank ?? 1)));
  const gains = series.flatMap((s) => s.points.map((p) => p?.gain ?? 0));
  const yMin = view === "pnl" ? Math.min(0, ...gains) : 1;
  const yMax = view === "pnl" ? Math.max(1, ...gains) : maxRank;
  const x = (i: number) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => {
    const t = (v - yMin) / (yMax - yMin || 1);
    // rank view: 1 at the top
    const tt = view === "rank" ? t : 1 - t;
    return PAD.top + tt * (H - PAD.top - PAD.bottom);
  };
  const val = (p: { gain: number; rank: number }) => (view === "pnl" ? p.gain : p.rank);

  const pathOf = (pts: Array<{ gain: number; rank: number } | null>) =>
    pts
      .map((p, i) => (p === null ? "" : `${i === 0 || pts[i - 1] === null ? "M" : "L"}${x(i).toFixed(1)},${y(val(p)).toFixed(1)}`))
      .join(" ");

  // y ticks: 4 nice steps
  const ticks =
    view === "pnl"
      ? Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) / 4) * i)
      : Array.from({ length: Math.min(maxRank, 5) }, (_, i) => 1 + Math.round((maxRank - 1) * (i / Math.max(1, Math.min(maxRank, 5) - 1))));

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, i)));
  };

  const hovered = hoverIdx === null ? null : snaps[hoverIdx];
  const mine = series.find((s) => s.mine);
  const field = series.filter((s) => !s.mine);
  const lastIdx = n - 1;

  return (
    <section className="mt-8">
      <ChartHeader view={view} onView={setView} live={live} />

      <div className="card-diagonal-sm glass px-4 pt-4 pb-2" style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "none" }}
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={view === "pnl" ? "Estimated profit and loss over the match" : "Leaderboard rank over the match"}
        >
          {/* grid + y labels — recessive */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text
                x={PAD.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                style={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "'Inter', sans-serif" }}
              >
                {view === "pnl" ? `${t < 0 ? "−" : ""}$${Math.abs(t) >= 100 ? Math.round(Math.abs(t)) : Math.abs(t).toFixed(0)}` : `#${Math.round(t)}`}
              </text>
            </g>
          ))}
          {/* zero line for PnL */}
          {view === "pnl" && yMin < 0 && (
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
          )}

          {/* x labels: match clock at each snapshot (thinned) */}
          {snaps.map((s, i) => {
            const step = Math.ceil(n / 8);
            if (i % step !== 0 && i !== lastIdx) return null;
            return (
              <text
                key={s.id}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                style={{ fontSize: 10, fill: "var(--muted-foreground)", fontFamily: "'Inter', sans-serif" }}
              >
                {s.matchClock}
              </text>
            );
          })}

          {/* field lines — purple, thin */}
          {field.map((s) => (
            <path
              key={s.pid}
              d={pathOf(s.points)}
              fill="none"
              stroke="var(--ui-accent-2)"
              strokeWidth={1.6}
              opacity={0.5}
              style={{ transition: `d 0.4s ${EASE}` }}
            />
          ))}
          {/* your line — green, on top, thicker */}
          {mine && (
            <path
              d={pathOf(mine.points)}
              fill="none"
              stroke="var(--ui-accent)"
              strokeWidth={2.4}
              style={{ transition: `d 0.4s ${EASE}` }}
            />
          )}

          {/* crosshair + hover markers */}
          {hovered && (
            <g>
              <line x1={x(hoverIdx!)} x2={x(hoverIdx!)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.45} />
              {series.map((s) => {
                const p = s.points[hoverIdx!];
                if (!p) return null;
                return (
                  <circle
                    key={s.pid}
                    cx={x(hoverIdx!)}
                    cy={y(val(p))}
                    r={s.mine ? 4.5 : 3}
                    fill={s.mine ? "var(--ui-accent)" : "var(--ui-accent-2)"}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          )}

          {/* direct labels at line ends (≤4 series get names; more → only you) */}
          {series
            .filter((s) => s.mine || series.length <= 4)
            .map((s) => {
              const p = s.points[lastIdx];
              if (!p) return null;
              return (
                <text
                  key={s.pid}
                  x={W - PAD.right + 2}
                  y={y(val(p)) + 3.5}
                  style={{
                    fontSize: 10,
                    fontWeight: s.mine ? 700 : 500,
                    fill: "var(--foreground)",
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {s.mine ? "you" : s.label}
                </text>
              );
            })}
        </svg>

        {/* tooltip */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              left: `${(x(hoverIdx!) / W) * 100}%`,
              top: 8,
              transform: `translateX(${hoverIdx! > n / 2 ? "-105%" : "8px"})`,
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "8px 12px",
              pointerEvents: "none",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              zIndex: 5,
              minWidth: 130,
            }}
          >
            <p style={{ fontSize: "0.68rem", fontWeight: 700, marginBottom: 4 }}>
              {hovered.matchClock}
              {hovered.scoreHome !== null && (
                <span style={{ color: "var(--muted-foreground)", fontWeight: 600, marginLeft: 8 }}>
                  {hovered.scoreHome}-{hovered.scoreAway}
                </span>
              )}
            </p>
            {[...series]
              .sort((a, b) => {
                const pa = a.points[hoverIdx!];
                const pb = b.points[hoverIdx!];
                return (pa && pb ? pa.rank - pb.rank : 0) || (a.mine ? -1 : 1);
              })
              .slice(0, 5)
              .map((s) => {
                const p = s.points[hoverIdx!];
                if (!p) return null;
                return (
                  <p key={s.pid} style={{ fontSize: "0.66rem", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          marginRight: 5,
                          background: s.mine ? "var(--ui-accent)" : "var(--ui-accent-2)",
                        }}
                      />
                      {s.mine ? "you" : s.label}
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {view === "pnl"
                        ? `${p.gain < 0 ? "−" : "+"}$${Math.abs(p.gain).toFixed(2)}`
                        : `#${p.rank}`}
                    </span>
                  </p>
                );
              })}
          </div>
        )}

        {/* legend — always present for ≥2 series */}
        <div className="flex items-center gap-5 px-2 py-2">
          {mine && (
            <span className="flex items-center gap-1.5" style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
              <span style={{ width: 14, height: 2.5, background: "var(--ui-accent)", display: "inline-block", borderRadius: 2 }} />
              your position
            </span>
          )}
          <span className="flex items-center gap-1.5" style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
            <span style={{ width: 14, height: 2.5, background: "var(--ui-accent-2)", opacity: 0.6, display: "inline-block", borderRadius: 2 }} />
            the field
          </span>
          <span style={{ fontSize: "0.64rem", color: "var(--muted-foreground)", marginLeft: "auto" }}>
            mark-to-model, not final until settlement
          </span>
        </div>
      </div>
    </section>
  );
}

function ChartHeader({
  view,
  onView,
  live,
  disabled,
}: {
  view: "pnl" | "rank";
  onView: (v: "pnl" | "rank") => void;
  live?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.15rem", fontWeight: 600 }}>
        Match timeline
        {live && (
          <span className="inline-flex items-center gap-1.5" style={{ marginLeft: 10, verticalAlign: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ui-accent)", boxShadow: "0 0 6px var(--ui-accent)", display: "inline-block" }} />
            <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ui-accent)" }}>
              Live
            </span>
          </span>
        )}
      </h3>
      <div className="flex items-center gap-1" style={{ background: "var(--muted)", borderRadius: 10, padding: 3 }}>
        {(["pnl", "rank"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            disabled={disabled}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.7rem",
              fontWeight: 700,
              padding: "5px 14px",
              borderRadius: 8,
              border: "none",
              cursor: disabled ? "default" : "pointer",
              background: view === v ? "var(--background)" : "transparent",
              color: view === v ? "var(--foreground)" : "var(--muted-foreground)",
              boxShadow: view === v ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.15s ease",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {v === "pnl" ? "PnL" : "Rank"}
          </button>
        ))}
      </div>
    </div>
  );
}
