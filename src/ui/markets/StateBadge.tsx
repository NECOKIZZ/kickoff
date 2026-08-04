"use client";

import { untilLock } from "@/ui/clientApi";

/**
 * The one source of truth for market state display. Three user-facing states:
 *   OPEN (accepting stakes) · LIVE (locked, match underway) · FT / VOID (done).
 * Used on GW chips, hub match cards and the market detail spec card.
 */

export type MarketStateKey = "open" | "live" | "finished" | "void";

export function stateOf(status: string): MarketStateKey {
  if (status === "open") return "open";
  if (status === "locked" || status === "settling") return "live";
  if (status === "void") return "void";
  return "finished";
}

export function StateBadge({
  status,
  locksAt,
  size = "md",
}: {
  status: string;
  locksAt?: string;
  size?: "sm" | "md";
}) {
  const state = stateOf(status);
  const sm = size === "sm";
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: sm ? 5 : 6,
    fontSize: sm ? "0.58rem" : "0.64rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    borderRadius: 999,
    padding: sm ? "3px 8px" : "4px 11px",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };

  if (state === "open") {
    const lock = locksAt ? untilLock(locksAt) : null;
    return (
      <span
        style={{
          ...base,
          color: "var(--ui-accent)",
          border: "1px solid color-mix(in srgb, var(--ui-accent) 45%, transparent)",
          background: "color-mix(in srgb, var(--ui-accent) 9%, transparent)",
        }}
      >
        Open{lock && !sm ? ` · locks ${lock}` : ""}
      </span>
    );
  }

  if (state === "live") {
    return (
      <span
        style={{
          ...base,
          color: "var(--ui-accent)",
          border: "1px solid color-mix(in srgb, var(--ui-accent) 55%, transparent)",
          background: "color-mix(in srgb, var(--ui-accent) 14%, transparent)",
        }}
      >
        <span
          style={{
            width: sm ? 6 : 7,
            height: sm ? 6 : 7,
            borderRadius: "50%",
            background: "var(--ui-accent)",
            boxShadow: "0 0 8px var(--ui-accent)",
          }}
        />
        Live
      </span>
    );
  }

  return (
    <span
      style={{
        ...base,
        color: "var(--muted-foreground)",
        border: "1px solid var(--border)",
        background: "var(--muted)",
      }}
    >
      {state === "void" ? "Void" : "FT"}
    </span>
  );
}

/** Tiny colored dot for GW chips — aggregate state of a gameweek's markets. */
export function StateDot({ state }: { state: MarketStateKey }) {
  const color =
    state === "live" || state === "open" ? "var(--ui-accent)" : "var(--muted-foreground)";
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        display: "inline-block",
        background: color,
        boxShadow: state === "live" ? "0 0 6px var(--ui-accent)" : "none",
        opacity: state === "finished" || state === "void" ? 0.5 : 1,
      }}
    />
  );
}
