"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtKickoff, fmtPoints, fmtUsdc } from "@/ui/clientApi";
import PnlCardModal from "@/ui/positions/PnlCardModal";

interface Row {
  position: {
    id: number;
    marketId: number;
    guessHome: number | null;
    guessAway: number | null;
    guessPoints: string | null;
    stake: string;
    payout: string | null;
  };
  marketTitle: string;
  marketKind: "scoreline" | "player_points";
  marketStatus: string;
  kickoffAt: string;
}

/**
 * The agent's settled picks with PnL and a Card button. The agent trades
 * from its own address, so its positions never show up in the owner's
 * My positions; this is where the owner gets its cards.
 */
export function AgentResults({ walletAddress }: { walletAddress: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [cardFor, setCardFor] = useState<number | null>(null);

  useEffect(() => {
    api<{ positions: Row[] }>(`/api/users/${walletAddress}/positions`)
      .then((d) => setRows(d.positions.filter((r) => r.marketStatus === "settled")))
      .catch(() => setRows([]));
  }, [walletAddress]);

  return (
    <div className="card-diagonal glass px-6 py-5 flex flex-col gap-3">
      <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
        Results
      </span>
      {rows?.length === 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
          No settled picks yet. Each one gets a shareable PnL card here once its match settles.
        </p>
      )}
      {rows?.map((r) => {
        const p = r.position;
        const pnl = BigInt(p.payout ?? "0") - BigInt(p.stake);
        return (
          <div key={p.id} className="flex items-center gap-3" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            <Link href={`/markets/${p.marketId}`} className="flex-1" style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}>
              <p style={{ fontSize: "0.84rem", fontWeight: 600 }}>{r.marketTitle}</p>
              <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                {fmtKickoff(r.kickoffAt)} · picked{" "}
                {r.marketKind === "scoreline" ? `${p.guessHome}-${p.guessAway}` : fmtPoints(p.guessPoints)}
              </p>
            </Link>
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: pnl < 0n ? "var(--destructive)" : "var(--ui-accent)" }}>
              {pnl > 0n ? "+" : pnl < 0n ? "-" : ""}
              {fmtUsdc(pnl < 0n ? -pnl : pnl)}
            </span>
            <button
              onClick={() => setCardFor(p.id)}
              className="cursor-pointer"
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                padding: "5px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "inherit",
              }}
            >
              Card
            </button>
          </div>
        );
      })}
      {cardFor !== null && <PnlCardModal positionId={cardFor} onClose={() => setCardFor(null)} />}
    </div>
  );
}
