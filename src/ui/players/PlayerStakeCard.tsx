"use client";

import { useCallback, useEffect, useState } from "react";
import { Button3D } from "@/ui/Button3D";
import { useAuth } from "@/ui/auth/useAuth";
import { api, fmtUsdc, fmtPoints, untilLock, type PoolPosition } from "@/ui/clientApi";

/**
 * Player perp staking card — call the FPL points line with a cubic stepper
 * (half-point steps, big Fraunces number) plus the stake slider with the
 * floating value bubble. Same open-pool rule as score markets: NO payout
 * figure anywhere; winner-count line only when the pool has company.
 */

interface StakeMarket {
  id: number;
  status: string;
  locksAt: string;
  playerName: string | null;
  stakeMode: "variable" | "fixed";
  minStake: string;
  maxStake: string;
  fixedStake: string | null;
}

interface Estimate {
  positions: Array<{ isWinner: boolean }>;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MAX_LINE = 30; // FPL single-GW points rarely clear 25 even on a haul

// The points cube: [+] / big line value / [−], half-point steps.
function PointsCube({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const [pop, setPop] = useState(false);
  const bump = (d: number) => {
    onChange(clamp(Math.round((value + d) * 2) / 2, 0, MAX_LINE));
    setPop(true);
  };

  const btnStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 0",
    border: "none",
    background: "transparent",
    color: "var(--muted-foreground)",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 1,
    opacity: disabled ? 0.4 : 1,
  };

  return (
    <div className="flex flex-col items-center gap-2" style={{ width: "100%", maxWidth: 180 }}>
      <span
        style={{
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
        }}
      >
        Points line
      </span>
      <div
        className="card-diagonal-sm w-full flex flex-col items-center"
        style={{
          border: "1px solid var(--border)",
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        <button aria-label="Points +0.5" disabled={disabled} onClick={() => bump(0.5)} style={btnStyle}>
          +
        </button>
        <span
          onTransitionEnd={() => setPop(false)}
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "2.9rem",
            fontWeight: 700,
            lineHeight: 1,
            padding: "6px 0",
            transform: pop ? "scale(1.12)" : "scale(1)",
            transition: "transform 0.14s cubic-bezier(0.22, 1, 0.36, 1)",
            display: "inline-block",
          }}
        >
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </span>
        <button aria-label="Points −0.5" disabled={disabled} onClick={() => bump(-0.5)} style={btnStyle}>
          −
        </button>
      </div>
    </div>
  );
}

export function PlayerStakeCard({
  market,
  myPosition,
  onPlaced,
}: {
  market: StakeMarket;
  myPosition: PoolPosition | null;
  onPlaced: () => void;
}) {
  const m = market;
  const open = m.status === "open" && untilLock(m.locksAt) !== null;
  const fixed = m.stakeMode === "fixed";
  const minD = Number(m.minStake) / 1e6;
  const maxD = Number(m.maxStake) / 1e6;

  const [line, setLine] = useState<number>(
    myPosition?.guessPoints ? Number(myPosition.guessPoints) / 1e6 : 6,
  );
  const [stake, setStake] = useState<number>(
    fixed && m.fixedStake ? Number(m.fixedStake) / 1e6 : myPosition ? Number(myPosition.stake) / 1e6 : minD,
  );
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { address } = useAuth();
  const signedIn = !!address;

  // Live winner-count estimate as the line moves (a count, never a payout).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<Estimate>(`/api/markets/${m.id}/estimate?points=${Math.round(line * 1e6)}`)
      .then((d) => alive && setEstimate(d))
      .catch(() => alive && setEstimate(null));
    return () => {
      alive = false;
    };
  }, [m.id, open, line]);

  const place = useCallback(async () => {
    setMsg(null);
    setPlacing(true);
    try {
      await api(`/api/markets/${m.id}/positions`, {
        method: "POST",
        body: JSON.stringify({
          stake: String(Math.round(stake * 1e6)),
          guessPoints: String(Math.round(line * 1e6)),
        }),
      });
      setMsg({ kind: "ok", text: "Position placed. You can restake to change it until lock." });
      onPlaced();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setPlacing(false);
    }
  }, [m.id, line, stake, onPlaced]);

  // ── Closed: read-only summary ───────────────────────────────────────────────
  if (!open) {
    return (
      <div className="card-diagonal glass px-6 py-6 flex flex-col gap-3">
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.1rem", fontWeight: 600 }}>
          {myPosition ? "Your position" : "Entries closed"}
        </h3>
        {myPosition ? (
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "2.2rem", fontWeight: 700, lineHeight: 1 }}>
              {fmtPoints(myPosition.guessPoints)}
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted-foreground)", marginLeft: 6 }}>pts</span>
            </span>
            <div className="text-right">
              <p style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                Staked
              </p>
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 700, color: "var(--ui-accent)" }}>
                {fmtUsdc(myPosition.stake)}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            This market locked before you entered. Catch this player's next gameweek listing.
          </p>
        )}
      </div>
    );
  }

  // ── Open: points cube + slider ──────────────────────────────────────────────
  const pct = maxD > minD ? ((stake - minD) / (maxD - minD)) * 100 : 0;

  return (
    <div className="card-diagonal glass px-6 py-6 flex flex-col gap-5">
      <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.1rem", fontWeight: 600 }}>
        Your call: {m.playerName ?? "player"}'s FPL points
      </h3>

      <div className="flex justify-center">
        <PointsCube value={line} onChange={setLine} disabled={placing} />
      </div>

      {/* Stake slider + floating bubble */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Stake{fixed && " (fixed)"}
          </span>
        </div>
        <div style={{ position: "relative", paddingTop: 30 }}>
          {/* Floating value bubble tracks the thumb */}
          <span
            style={{
              position: "absolute",
              top: 0,
              left: `clamp(24px, ${pct}%, calc(100% - 24px))`,
              transform: "translateX(-50%)",
              fontFamily: "'Fraunces', serif",
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "var(--ui-accent-contrast)",
              background: "var(--ui-accent)",
              padding: "3px 10px",
              borderRadius: 8,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {fmtUsdc(String(Math.round(stake * 1e6)))}
          </span>
          <input
            type="range"
            min={minD}
            max={maxD}
            step={1}
            value={stake}
            disabled={fixed || placing}
            onChange={(e) => setStake(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--ui-accent)", opacity: fixed ? 0.5 : 1 }}
            aria-label="Stake in USDC"
          />
        </div>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: "0.64rem", color: "var(--muted-foreground)" }}>{fmtUsdc(m.minStake)}</span>
          <input
            type="number"
            min={minD}
            max={maxD}
            step={1}
            value={stake}
            disabled={fixed || placing}
            onChange={(e) => setStake(clamp(Number(e.target.value) || minD, minD, maxD))}
            aria-label="Stake amount"
            style={{
              background: "var(--input-background)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: "0.78rem",
              width: 84,
              textAlign: "right",
              color: "var(--foreground)",
              opacity: fixed ? 0.5 : 1,
            }}
          />
          <span style={{ fontSize: "0.64rem", color: "var(--muted-foreground)" }}>{fmtUsdc(m.maxStake)}</span>
        </div>
      </div>

      <Button3D color="accent" size="lg" disabled={placing || !signedIn} onClick={place}>
        {placing ? "Placing…" : signedIn ? (myPosition ? "Restake" : "Lock it in") : "Sign in to stake"}
      </Button3D>

      {estimate && estimate.positions.length > 1 && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", textAlign: "center" }}>
          {(() => {
            const w = estimate.positions.filter((p) => p.isWinner).length;
            return `If it settled now: ${w} winner${w === 1 ? "" : "s"} share the pool.`;
          })()}
        </p>
      )}

      {msg && (
        <p
          style={{
            fontSize: "0.78rem",
            fontWeight: 600,
            textAlign: "center",
            color: msg.kind === "ok" ? "var(--ui-accent)" : "var(--destructive)",
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
