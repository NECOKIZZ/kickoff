"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtUsdc, fmtKickoff, type MarketSummary } from "@/ui/clientApi";
import { StateBadge, StateDot, stateOf, type MarketStateKey } from "@/ui/markets/StateBadge";

/**
 * Gameweek batching for score markets — FPL-style. A horizontal rail of GW
 * chips, each carrying its aggregate state dot; below it, the selected
 * gameweek's matches (live floated to top, then by kickoff).
 */

// Aggregate a gameweek's markets into one dot state: live > open > finished.
function gwState(markets: MarketSummary[]): MarketStateKey {
  const states = markets.map((m) => stateOf(m.status));
  if (states.includes("live")) return "live";
  if (states.includes("open")) return "open";
  return "finished";
}

function ScoreMarketCard({ market }: { market: MarketSummary }) {
  const settled = market.status === "settled" && market.actual;
  return (
    <Link
      href={`/markets/${market.id}`}
      className="card-diagonal glass flex items-center gap-3 px-6 py-[18px] transition-transform duration-150 hover:-translate-y-0.5"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{ minWidth: 86, display: "flex", justifyContent: "center" }}>
        <StateBadge status={market.status} locksAt={market.locksAt} size="sm" />
      </div>

      {/* Home */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <span style={{ fontSize: "0.82rem", fontWeight: 600, textAlign: "center" }}>
          {market.homeTeam ?? "Home"}
        </span>
      </div>

      {/* Score / vs */}
      <div className="flex items-center gap-2.5 px-2">
        {settled ? (
          <>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
              {market.actual!.home}
            </span>
            <span style={{ fontSize: "0.9rem", color: "var(--muted-foreground)" }}>-</span>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
              {market.actual!.away}
            </span>
          </>
        ) : (
          <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--muted-foreground)" }}>vs</span>
        )}
      </div>

      {/* Away */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <span style={{ fontSize: "0.82rem", fontWeight: 600, textAlign: "center" }}>
          {market.awayTeam ?? "Away"}
        </span>
      </div>

      {/* Pool + entries */}
      <div className="flex flex-col items-end gap-0.5" style={{ minWidth: 90 }}>
        <span
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--ui-accent)",
          }}
        >
          {fmtUsdc(market.totalPool, { compact: true })}
        </span>
        <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
          {market.positionCount} {market.positionCount === 1 ? "entry" : "entries"}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>{fmtKickoff(market.kickoffAt)}</span>
      </div>
    </Link>
  );
}

export function GameweekRail({ markets }: { markets: MarketSummary[] }) {
  // Group by gameweek; null gw collects into a trailing "Other" bucket.
  const groups = useMemo(() => {
    const byGw = new Map<number | null, MarketSummary[]>();
    for (const m of markets) {
      const key = m.gameweek ?? null;
      const list = byGw.get(key);
      if (list) list.push(m);
      else byGw.set(key, [m]);
    }
    const numbered = [...byGw.entries()]
      .filter(([gw]) => gw !== null)
      .sort((a, b) => (a[0] as number) - (b[0] as number));
    const other = byGw.get(null);
    const entries: Array<{ gw: number | null; markets: MarketSummary[]; state: MarketStateKey }> = numbered.map(
      ([gw, ms]) => ({ gw, markets: ms, state: gwState(ms) }),
    );
    if (other) entries.push({ gw: null, markets: other, state: gwState(other) });
    return entries;
  }, [markets]);

  // Default: first GW with live matches, else first with open, else the latest.
  const defaultKey = useMemo(() => {
    const live = groups.find((g) => g.state === "live");
    if (live) return live.gw;
    const open = groups.find((g) => g.state === "open");
    if (open) return open.gw;
    return groups.length ? groups[groups.length - 1].gw : null;
  }, [groups]);

  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  const activeKey = selected === undefined ? defaultKey : selected;
  const active = groups.find((g) => g.gw === activeKey) ?? groups[0];

  const sorted = useMemo(() => {
    if (!active) return [];
    return [...active.markets].sort((a, b) => {
      const la = stateOf(a.status) === "live" ? 0 : 1;
      const lb = stateOf(b.status) === "live" ? 0 : 1;
      if (la !== lb) return la - lb;
      return new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime();
    });
  }, [active]);

  if (groups.length === 0) return null;

  return (
    <section>
      {/* GW chip rail */}
      <div
        className="flex gap-2 mb-4 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none" }}
        role="tablist"
        aria-label="Gameweeks"
      >
        {groups.map((g) => {
          const isActive = g.gw === active?.gw;
          return (
            <button
              key={g.gw ?? "other"}
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelected(g.gw)}
              className="card-diagonal-sm cursor-pointer transition-all duration-150"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.78rem",
                fontWeight: 700,
                padding: "9px 16px",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                whiteSpace: "nowrap",
                flexShrink: 0,
                border: isActive
                  ? "1.5px solid var(--ui-accent)"
                  : "1px solid var(--border)",
                background: isActive
                  ? "color-mix(in srgb, var(--ui-accent) 10%, var(--card))"
                  : "var(--card)",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
              }}
            >
              <StateDot state={g.state} />
              {g.gw === null ? "Other" : `GW${g.gw}`}
            </button>
          );
        })}
      </div>

      {/* Selected gameweek's matches */}
      <div className="flex flex-col gap-2">
        {sorted.map((m) => (
          <ScoreMarketCard key={m.id} market={m} />
        ))}
      </div>
    </section>
  );
}
