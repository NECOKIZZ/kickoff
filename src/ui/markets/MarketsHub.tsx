"use client";

import { useEffect, useState } from "react";
import { api, type MarketSummary } from "@/ui/clientApi";
import { PlayerDeckBoard } from "@/ui/players/PlayerDeckBoard";
import { GameweekRail } from "@/ui/markets/GameweekRail";

// ── Section label ──────────────────────────────────────────────────────────────

function SectionLabel({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {live && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "var(--ui-accent)",
            display: "inline-block",
            flexShrink: 0,
            boxShadow: "0 0 0 2px color-mix(in srgb, var(--ui-accent) 20%, transparent)",
          }}
        />
      )}
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.66rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: live ? "var(--ui-accent)" : "var(--muted-foreground)",
        }}
      >
        {children}
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

/** Player Perps are paused while score markets are perfected; set
 *  NEXT_PUBLIC_PLAYER_PERPS=1 (and redeploy) to bring the tab back. */
const PLAYER_PERPS_ENABLED = process.env.NEXT_PUBLIC_PLAYER_PERPS === "1";

export default function MarketsHub() {
  const [tab, setTab] = useState<"score" | "player">("score");
  const [markets, setMarkets] = useState<MarketSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ markets: MarketSummary[] }>("/api/markets?status=all")
      .then((d) => alive && setMarkets(d.markets))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const kind = tab === "score" ? "scoreline" : "player_points";
  const filtered = (markets ?? []).filter((m) => m.kind === kind);
  const live = filtered.filter((m) => m.status === "locked" || m.status === "settling");

  return (
    // Player tab spreads into the wide margins the score list doesn't need —
    // the deck board (rail + stage) is built to fill one desktop viewport.
    <div className="mx-auto px-4 sm:px-6 pt-5 sm:pt-7" style={{ maxWidth: tab === "player" ? 1180 : 860, paddingBottom: 60 }}>
      {/* Tab switcher — accent underline per brand (purple light / green dark) */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
        {(PLAYER_PERPS_ENABLED ? (["score", "player"] as const) : (["score"] as const)).map((t) => {
          const isActive = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="cursor-pointer"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.84rem",
                fontWeight: 600,
                padding: "10px 22px",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2.5px solid var(--ui-accent)" : "2.5px solid transparent",
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                transition: "color 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
                marginBottom: -1,
              }}
            >
              {t === "score" ? "Score Markets" : "Player Perps"}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="card-diagonal-sm glass px-6 py-4 mb-6" style={{ color: "var(--destructive)", fontSize: "0.85rem" }}>
          Couldn&apos;t load markets: {error}. Refresh to try again.
        </div>
      )}

      {markets === null && !error && (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-diagonal glass" style={{ height: 84, opacity: 0.5 }} />
          ))}
        </div>
      )}

      {markets !== null && filtered.length === 0 && (
        <div className="card-diagonal glass px-8 py-12 text-center">
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600, marginBottom: 8 }}>
            No {tab === "score" ? "score markets" : "player perps"} yet.
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Markets list when EPL fixtures are confirmed. Check back before the weekend.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Player perps: ONE deck slot per player (live front, then open, then
            settled) — search rail beside the stage, all in one viewport. */}
        {tab === "player" && filtered.length > 0 && (
          <section>
            <SectionLabel live={live.length > 0}>
              {live.length > 0 ? "This Matchweek's Deck: Live" : "This Matchweek's Deck"}
            </SectionLabel>
            <PlayerDeckBoard markets={filtered} />
          </section>
        )}

        {tab === "score" && filtered.length > 0 && (
          /* Score markets batch by FPL gameweek — GW chips, then that week's
             matches (live floated to top). Settled matches stay in their GW. */
          <GameweekRail markets={filtered} />
        )}
      </div>
    </div>
  );
}
