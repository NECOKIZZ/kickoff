"use client";

import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { MOCKUSDC_ADDRESS } from "@/lib/chainConfig";
import { api, fmtUsdc } from "@/ui/clientApi";
import { tusdcBalance } from "@/ui/chain/escrowTx";

/**
 * Header chip: the wallet's tUSDC balance, plus a one-click testnet top-up
 * (gas ETH + tUSDC, paid by the server wallet) when it's running low.
 * Renders nothing unless tUSDC is configured and someone is signed in.
 */
export function WalletChip({ address }: { address: string }) {
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

  if (!MOCKUSDC_ADDRESS || bal === null) return null;
  const low = bal < 20_000_000n; // under two $10 tickets

  return (
    <span className="flex items-center gap-2" title={note ?? "Testnet USDC in your wallet"}>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
        {fmtUsdc(bal.toString()).replace(/^\$/, "")} tUSDC
      </span>
      {low && (
        <button
          onClick={topUp}
          disabled={busy}
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
          {busy ? "Topping up…" : note ? "Top-up failed" : "Get test funds"}
        </button>
      )}
    </span>
  );
}
