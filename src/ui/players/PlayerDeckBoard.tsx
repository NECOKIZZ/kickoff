"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtUsdc, untilLock, type MarketSummary } from "@/ui/clientApi";
import { cardForPlayer } from "@/ui/players/playerCards";
import { PlayerCardCarousel } from "@/ui/players/PlayerCardCarousel";

/**
 * Player deck board — the card-selection screen, built to sit in ONE desktop
 * viewport: search rail on the LEFT (find a player when the deck gets deep),
 * the carousel center-stage, and a slim details strip beneath it instead of
 * a tall info card. One deck slot per PLAYER (a player with GW1+GW2 listings
 * appears once — the slot fronts their most relevant market: live first,
 * then next open, then latest settled).
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Fold for search — "gyokeres" matches "Gyökeres". */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** One market per player: live > soonest-locking open > latest settled. */
function dedupeByPlayer(markets: MarketSummary[]): MarketSummary[] {
  const byPlayer = new Map<string, MarketSummary[]>();
  for (const m of markets) {
    const key = fold(m.playerName ?? m.title);
    byPlayer.set(key, [...(byPlayer.get(key) ?? []), m]);
  }
  const rank = (m: MarketSummary) =>
    m.status === "locked" || m.status === "settling" ? 0 : m.status === "open" ? 1 : 2;
  return [...byPlayer.values()].map((list) =>
    [...list].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 1
          ? new Date(a.locksAt).getTime() - new Date(b.locksAt).getTime() // open: soonest lock first
          : new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime()), // settled: latest first
    )[0],
  );
}

function statusLine(m: MarketSummary): { text: string; live: boolean } {
  if (m.status === "locked" || m.status === "settling") return { text: "Live now", live: true };
  if (m.status === "open") {
    const lock = untilLock(m.locksAt);
    return { text: lock ? `Open, locks ${lock}` : "Open", live: false };
  }
  return { text: m.status === "void" ? "Voided" : "Settled", live: false };
}

export function PlayerDeckBoard({ markets }: { markets: MarketSummary[] }) {
  const deck = useMemo(() => dedupeByPlayer(markets), [markets]);
  const [focus, setFocus] = useState(0);
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return deck.map((_, i) => i);
    return deck
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => fold(m.playerName ?? m.title).includes(q))
      .map(({ i }) => i);
  }, [deck, query]);

  if (deck.length === 0) return null;
  const focused = deck[Math.min(focus, deck.length - 1)];
  const status = statusLine(focused);

  return (
    <div className="deck-board">
      {/* ── Search rail (left, never below) ──────────────────────────────────── */}
      <aside className="deck-rail card-diagonal glass flex flex-col" style={{ padding: "18px 0 8px" }}>
        <div style={{ padding: "0 18px 12px" }}>
          <p
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
              marginBottom: 10,
            }}
          >
            Find a player
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names…"
            aria-label="Search players"
            style={{
              width: "100%",
              background: "var(--input-background)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: "0.82rem",
              color: "var(--foreground)",
              outline: "none",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--ui-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        {/* Player list — clicking pulls that card to the deck's center */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {hits.length === 0 && (
            <p style={{ padding: "14px 18px", fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
              No player matches “{query}”.
            </p>
          )}
          {hits.map((i) => {
            const m = deck[i];
            const card = cardForPlayer(m.playerName);
            const s = statusLine(m);
            const active = i === focus;
            return (
              <button
                key={m.id}
                onClick={() => setFocus(i)}
                className="w-full text-left"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "9px 18px",
                  background: active ? "color-mix(in srgb, var(--ui-accent) 10%, transparent)" : "transparent",
                  border: "none",
                  borderLeft: active ? "3px solid var(--ui-accent)" : "3px solid transparent",
                  cursor: "pointer",
                  transition: `background 0.15s, border-color 0.15s`,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 42,
                    borderRadius: 6,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: "linear-gradient(160deg, #1C1D1A, #111210)",
                    boxShadow: active ? `0 0 0 1.5px ${card?.accent ?? "var(--ui-accent)"}88` : "none",
                  }}
                >
                  {card && (
                    <img src={card.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.8rem",
                      fontWeight: active ? 700 : 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {m.playerName ?? m.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.64rem",
                      fontWeight: 600,
                      color: s.live ? "var(--ui-accent)" : "var(--muted-foreground)",
                    }}
                  >
                    {s.text}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Stage: carousel + slim details strip ─────────────────────────────── */}
      <div className="deck-stage flex flex-col items-center" style={{ minWidth: 0 }}>
        <PlayerCardCarousel markets={deck} focus={focus} onFocusChange={setFocus} />

        {/* Slim strip — everything else lives on the market page itself */}
        <div
          key={focused.id}
          className="ppc-info card-diagonal-sm glass flex items-center justify-between flex-wrap"
          style={{ marginTop: 14, width: "100%", maxWidth: 640, padding: "12px 22px", gap: 12 }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.1 }}>
              {focused.playerName ?? focused.title}
            </p>
            <p style={{ fontSize: "0.68rem", fontWeight: 600, color: status.live ? "var(--ui-accent)" : "var(--muted-foreground)" }}>
              {status.live && (
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--ui-accent)",
                    boxShadow: "0 0 6px var(--ui-accent)",
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                />
              )}
              {status.text}
              {focused.gameweek != null && ` · GW${focused.gameweek}`}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <span style={{ whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.05rem", fontWeight: 700, color: "var(--ui-accent)" }}>
                {fmtUsdc(focused.totalPool, { compact: true })}
              </span>
              <span style={{ fontSize: "0.66rem", color: "var(--muted-foreground)", marginLeft: 5 }}>pool</span>
            </span>
            <span style={{ fontSize: "0.74rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
              {focused.positionCount} {focused.positionCount === 1 ? "entry" : "entries"}
            </span>
            <Link
              href={`/markets/${focused.id}`}
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                padding: "8px 18px",
                borderRadius: 11,
                textDecoration: "none",
                whiteSpace: "nowrap",
                // 3D per brand — accent face
                background: "var(--ui-accent)",
                color: "var(--ui-accent-contrast)",
                border: "1px solid var(--ui-accent-deep)",
                boxShadow: "0 4px 0 var(--ui-accent-deep), 0 6px 14px color-mix(in srgb, var(--ui-accent) 25%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)",
                display: "inline-block",
                transition: `transform 0.1s ${EASE}, box-shadow 0.1s ${EASE}`,
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "translateY(3px)";
                e.currentTarget.style.boxShadow = "0 1px 0 var(--ui-accent-deep)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow =
                  "0 4px 0 var(--ui-accent-deep), 0 6px 14px color-mix(in srgb, var(--ui-accent) 25%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)";
              }}
            >
              {focused.status === "open" ? "Call the line" : "View market"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
