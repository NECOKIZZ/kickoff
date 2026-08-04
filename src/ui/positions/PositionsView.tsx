"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtUsdc, fmtPoints, fmtKickoff } from "@/ui/clientApi";
import { useAuth } from "@/ui/auth/useAuth";

interface UserPositionRow {
  position: {
    id: number;
    marketId: number;
    guessHome: number | null;
    guessAway: number | null;
    guessPoints: string | null;
    stake: string;
    isWinner: boolean | null;
    payout: string | null;
  };
  marketTitle: string;
  marketKind: "scoreline" | "player_points";
  marketStatus: string;
  kickoffAt: string;
}

export default function PositionsView() {
  const { address: addr } = useAuth();
  const [rows, setRows] = useState<UserPositionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!addr) return;
    api<{ positions: UserPositionRow[] }>(`/api/users/${addr}/positions`)
      .then((d) => setRows(d.positions))
      .catch((e) => setError(e.message));
  }, [addr]);

  if (!addr) {
    return (
      <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 48 }}>
        <div className="card-diagonal glass px-8 py-12 text-center">
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600, marginBottom: 8 }}>
            Sign in to see your positions.
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Use the Sign In button in the top right.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto px-6" style={{ maxWidth: 860, paddingTop: 36, paddingBottom: 80 }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.6rem", fontWeight: 600, marginBottom: 20 }}>
        My positions
      </h1>

      {error && (
        <div className="card-diagonal-sm glass px-6 py-4" style={{ color: "var(--destructive)", fontSize: "0.85rem" }}>
          Couldn&apos;t load positions: {error}
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="card-diagonal glass px-8 py-12 text-center">
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600, marginBottom: 8 }}>
            No positions yet.
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            <Link href="/markets" style={{ color: "var(--ui-accent)", fontWeight: 600 }}>
              Browse the markets
            </Link>{" "}
            and lock in your first scoreline.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {(rows ?? []).map((r) => {
          const p = r.position;
          const settled = r.marketStatus === "settled";
          return (
            <Link
              key={p.id}
              href={`/markets/${p.marketId}`}
              className="card-diagonal glass flex items-center gap-4 px-6 py-4 transition-transform duration-150 hover:-translate-y-0.5"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="flex-1">
                <p style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 3 }}>{r.marketTitle}</p>
                <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                  {fmtKickoff(r.kickoffAt)} · {r.marketStatus}
                </p>
              </div>
              <div className="text-center px-3">
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 2 }}>
                  Pick
                </p>
                <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.1rem", fontWeight: 700 }}>
                  {r.marketKind === "scoreline" ? `${p.guessHome}-${p.guessAway}` : fmtPoints(p.guessPoints)}
                </p>
              </div>
              <div className="text-center px-3">
                <p style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 2 }}>
                  Stake
                </p>
                <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{fmtUsdc(p.stake)}</p>
              </div>
              <div className="text-right" style={{ minWidth: 80 }}>
                {settled ? (
                  p.isWinner ? (
                    <span style={{ color: "var(--ui-accent)", fontWeight: 700 }}>{fmtUsdc(p.payout)}</span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)", fontSize: "0.8rem" }}>No payout</span>
                  )
                ) : (
                  <span style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                    {r.marketStatus === "open" ? "open" : "pending"}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
