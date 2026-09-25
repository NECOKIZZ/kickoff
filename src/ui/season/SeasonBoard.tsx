"use client";

import { useEffect, useState } from "react";
import { api, fmtUsdc, shortAddr, type LeaderboardRow } from "@/ui/clientApi";
import { AgentBadge } from "@/ui/agents/AgentView";
import { useAuth } from "@/ui/auth/useAuth";

interface AccumulatorData {
  season: string;
  balance: string;
  contributions: number;
  rankWeightsBps: number[];
  recentContributions: Array<{ amount: string; market_title: string }>;
}

interface LeaderboardData {
  eligibleTraders: number;
  totalTraders: number;
  leaderboard: LeaderboardRow[];
  params: { minSettledMarkets: number };
}

/**
 * Season page — accumulator pool on top (fed real-time), cumulative
 * full-season leaderboard below it, per the brand instructions.
 */
export default function SeasonBoard() {
  const [acc, setAcc] = useState<AccumulatorData | null>(null);
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<AccumulatorData>("/api/accumulator")
        .then((d) => alive && setAcc(d))
        .catch((e) => alive && setError(e.message));
      api<LeaderboardData>("/api/leaderboard")
        .then((d) => alive && setBoard(d))
        .catch((e) => alive && setError(e.message));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const { address } = useAuth();
  const me = address?.toLowerCase() ?? null;

  return (
    <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 36, paddingBottom: 80 }}>
      {/* Accumulator pool — the season prize, above the board */}
      <section
        className="card-diagonal glass text-center px-8 py-12 mb-10"
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* brand orbs */}
        <div style={{ position: "absolute", top: "-30%", left: "10%", width: 220, height: 220, borderRadius: "50%", background: "var(--ui-accent)", filter: "blur(90px)", opacity: 0.25, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-30%", right: "10%", width: 200, height: 200, borderRadius: "50%", background: "var(--ui-accent-2)", filter: "blur(90px)", opacity: 0.3, pointerEvents: "none" }} />

        <p
          style={{
            fontSize: "0.66rem",
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted-foreground)",
            marginBottom: 12,
            position: "relative",
          }}
        >
          Season {acc?.season ?? "…"} accumulator pool
        </p>
        <p
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(3rem, 8vw, 5.5rem)",
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            position: "relative",
          }}
        >
          {acc ? fmtUsdc(acc.balance, { compact: true }) : "-"}
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: 12, position: "relative" }}>
          5% of every settled pool feeds the accumulator. Top {acc?.rankWeightsBps.length ?? 10} at season end split it
          by rank.
        </p>
      </section>

      {/* Full-season cumulative leaderboard */}
      <section>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.4rem", fontWeight: 600, marginBottom: 4 }}>
          Season leaderboard
        </h2>
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginBottom: 16 }}>
          Ranked by precision (CAR) × volume. {board ? `${board.eligibleTraders} eligible of ${board.totalTraders} traders.` : ""}
        </p>

        {error && (
          <div className="card-diagonal-sm glass px-6 py-4" style={{ color: "var(--destructive)", fontSize: "0.85rem" }}>
            Couldn&apos;t load: {error}
          </div>
        )}

        {board && board.leaderboard.length === 0 && !error && (
          <div className="card-diagonal glass px-8 py-12 text-center">
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600, marginBottom: 8 }}>
              The season board is empty.
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
              Settle at least {board.params.minSettledMarkets} markets to enter the rankings.
            </p>
          </div>
        )}

        {board && board.leaderboard.length > 0 && (
          <div className="card-diagonal-sm glass overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Rank", "Trader", "Markets", "Volume", "CAR", "Score"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3"
                      style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.leaderboard.map((r, i) => {
                  const mine = me && r.address.toLowerCase() === me;
                  const top3 = r.rank <= 3;
                  return (
                    <tr
                      key={r.address}
                      style={{
                        borderBottom: i < board.leaderboard.length - 1 ? "1px solid var(--border)" : "none",
                        background: mine ? "color-mix(in srgb, var(--ui-accent) 8%, transparent)" : "transparent",
                      }}
                    >
                      <td className="px-5 py-3.5" style={{ fontFamily: "'Fraunces', serif", fontSize: "1rem", fontWeight: 700, color: top3 ? "var(--ui-accent)" : "var(--muted-foreground)" }}>
                        {r.rank}
                      </td>
                      <td className="px-5 py-3.5" style={{ fontWeight: mine ? 700 : 500 }}>
                        {r.agent ? (
                          <>
                            {r.agent.name} <AgentBadge />
                            <span style={{ display: "block", fontSize: "0.68rem", color: "var(--muted-foreground)", fontWeight: 400 }}>
                              {r.agent.owner ? `run by ${shortAddr(r.agent.owner)}` : "anonymous owner"}
                            </span>
                          </>
                        ) : (
                          shortAddr(r.address)
                        )}
                        {mine && <span style={{ color: "var(--ui-accent)", marginLeft: 6, fontSize: "0.68rem" }}>you</span>}
                      </td>
                      <td className="px-5 py-3.5">{r.settledMarkets}</td>
                      <td className="px-5 py-3.5">{fmtUsdc(r.volume, { compact: true })}</td>
                      <td className="px-5 py-3.5">{r.car}</td>
                      <td className="px-5 py-3.5" style={{ fontWeight: 700 }}>{r.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
