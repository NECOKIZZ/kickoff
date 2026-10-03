"use client";

import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { MOCKUSDC_ADDRESS } from "@/lib/chainConfig";
import { api, fmtUsdc, shortAddr } from "@/ui/clientApi";
import { tusdcBalance } from "@/ui/chain/escrowTx";

/**
 * Header account chip: the wallet's tUSDC balance and short address in one
 * pill (click to sign out), plus a one-click testnet top-up (gas ETH + tUSDC,
 * paid by the server wallet) when it's running low. On phones the balance
 * stacks above the address inside the pill so the header stays one tidy row.
 */
export function WalletChip({ address, onSignOut }: { address: string; onSignOut: () => void }) {
  const [bal, setBal] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    tusdcBalance(address as Hex)
      .then(setBal)
      .catch(() => setBal(null));
  }, [address]);

  useEffect(() => {
    if (!MOCKUSDC_ADDRESS) return;
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const topUp = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      await api("/api/faucet", { method: "POST" });
      refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const balance = MOCKUSDC_ADDRESS && bal !== null ? `${fmtUsdc(bal.toString()).replace(/^\$/, "")} tUSDC` : null;
  const low = bal !== null && bal < 20_000_000n; // under two $10 tickets

  return (
    <span className="flex items-center gap-2">
      {balance && (
        <span
          className="hidden sm:inline"
          title="Testnet USDC in your wallet"
          style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
        >
          {balance}
        </span>
      )}
      {MOCKUSDC_ADDRESS && low && (
        <button
          onClick={topUp}
          disabled={busy}
          title={note ?? "Claim free testnet USDC"}
          className="cursor-pointer"
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--ui-accent)",
            background: "transparent",
            color: note ? "var(--destructive)" : "var(--ui-accent)",
            opacity: busy ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Topping up…" : note ? "Retry" : <>Get<span className="hidden sm:inline"> test</span> funds</>}
        </button>
      )}
      <button
        onClick={onSignOut}
        title="Signed in. Click to sign out"
        className="cursor-pointer flex flex-col items-end sm:block"
        style={{
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "0.78rem",
          fontWeight: 600,
          lineHeight: 1.2,
          padding: "6px 12px",
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--muted)",
          color: "var(--foreground)",
          whiteSpace: "nowrap",
        }}
      >
        {balance && (
          <span className="sm:hidden" style={{ fontFamily: "'Inter', sans-serif", fontSize: "0.72rem" }}>
            {balance}
          </span>
        )}
        <span className="text-[0.66rem] text-(--muted-foreground) sm:text-[0.78rem] sm:text-(--foreground)">
          {shortAddr(address)}
        </span>
      </button>
    </span>
  );
}
