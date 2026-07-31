"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtUsdc, fmtKickoff, fmtPoints, untilLock, type MarketSummary } from "@/ui/clientApi";

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
            background: "var(--color-kickoff-green)",
            display: "inline-block",
            flexShrink: 0,
            boxShadow: "0 0 0 2px rgba(0,200,5,0.2)",
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
          color: live ? "var(--color-kickoff-green)" : "var(--muted-foreground)",
        }}
      >
        {children}
      </span>
    </div>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────

function StatusChip({ market }: { market: MarketSummary }) {
  const lock = untilLock(market.locksAt);
  if (market.status === "open") {
    return (
      <div className="flex flex-col items-center gap-1" style={{ minWidth: 64 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-kickoff-green)",
          }}
        >
          Open
        </span>
        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)" }}>
          {lock ? `locks ${lock}` : "locking…"}
        </span>
      </div>
    );
  }
  if (market.status === "locked" || market.status === "settling") {
    return (
      <div className="flex flex-col items-center gap-1" style={{ minWidth: 64 }}>
        <span className="flex items-center gap-1.5">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--color-kickoff-green)",
              boxShadow: "0 0 6px var(--color-kickoff-green)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--color-kickoff-green)",
            }}
          >
            Live
          </span>
        </span>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 64, display: "flex", justifyContent: "center" }}>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
          background: "var(--muted)",
          padding: "4px 10px",
          borderRadius: 6,
        }}
      >
        {market.status === "void" ? "Void" : "FT"}
      </span>
    </div>
  );
}

// ── Score market card — diagonal corners + glass (brand rules) ─────────────────

function ScoreMarketCard({ market }: { market: MarketSummary }) {
  const settled = market.status === "settled" && market.actual;
  return (
    <Link
      href={`/markets/${market.id}`}
      className="card-diagonal glass flex items-center gap-3 px-6 py-[18px] transition-transform duration-150 hover:-translate-y-0.5"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <StatusChip market={market} />

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
            <span style={{ fontSize: "0.9rem", color: "var(--muted-foreground)" }}>–</span>
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
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--color-kickoff-green)" }}>
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

// ── Player perp card — interior is a placeholder until user's Figma cards ──────

function PlayerPerpCard({ market }: { market: MarketSummary }) {
  const settled = market.status === "settled" && market.actual;
  return (
    <Link
      href={`/markets/${market.id}`}
      className="card-diagonal glass flex flex-col gap-3.5 px-6 py-5 transition-transform duration-150 hover:-translate-y-0.5"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="flex items-center gap-3.5">
        {/* Placeholder avatar — final player-card art comes from Figma */}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--color-new-purple), var(--color-kickoff-green))",
            opacity: 0.35,
            flexShrink: 0,
          }}
        />
        <div className="flex-1">
          <p style={{ fontSize: "0.92rem", fontWeight: 700, marginBottom: 2 }}>{market.playerName ?? market.title}</p>
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>{market.title}</p>
        </div>
        <div className="text-right">
          <p
            style={{
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted-foreground)",
              marginBottom: 3,
            }}
          >
            {settled ? "Final" : "Points"}
          </p>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.45rem", fontWeight: 700, lineHeight: 1 }}>
            {settled ? fmtPoints(market.actual!.points ?? null) : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <StatusChip market={market} />
        <div className="text-right">
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1rem", fontWeight: 700, color: "var(--color-kickoff-green)" }}>
            {fmtUsdc(market.totalPool, { compact: true })}
          </span>
          <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginLeft: 6 }}>
            {market.positionCount} entries
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

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
  const open = filtered.filter((m) => m.status === "open");
  const done = filtered.filter((m) => m.status === "settled" || m.status === "void");

  return (
    <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 36, paddingBottom: 80 }}>
      {/* Tab switcher — green underline per brand */}
      <div className="flex items-center gap-1 mb-8 border-b" style={{ borderColor: "var(--border)" }}>
        {(["score", "player"] as const).map((t) => {
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
                borderBottom: isActive ? "2.5px solid var(--color-kickoff-green)" : "2.5px solid transparent",
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
            Markets list when EPL fixtures are confirmed — check back before the weekend.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {live.length > 0 && (
          <section>
            <SectionLabel live>Live Matches</SectionLabel>
            <div className={tab === "score" ? "flex flex-col gap-2" : "grid gap-3.5 sm:grid-cols-2"}>
              {live.map((m) =>
                tab === "score" ? <ScoreMarketCard key={m.id} market={m} /> : <PlayerPerpCard key={m.id} market={m} />,
              )}
            </div>
          </section>
        )}

        {open.length > 0 && (
          <section>
            <SectionLabel>Open for Entries</SectionLabel>
            <div className={tab === "score" ? "flex flex-col gap-2" : "grid gap-3.5 sm:grid-cols-2"}>
              {open.map((m) =>
                tab === "score" ? <ScoreMarketCard key={m.id} market={m} /> : <PlayerPerpCard key={m.id} market={m} />,
              )}
            </div>
          </section>
        )}

        {done.length > 0 && (
          <section>
            <SectionLabel>Settled</SectionLabel>
            <div className={tab === "score" ? "flex flex-col gap-2" : "grid gap-3.5 sm:grid-cols-2"}>
              {done.map((m) =>
                tab === "score" ? <ScoreMarketCard key={m.id} market={m} /> : <PlayerPerpCard key={m.id} market={m} />,
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
