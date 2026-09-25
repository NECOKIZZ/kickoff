"use client";

import { createPublicClient, createWalletClient, custom, http, type EIP1193Provider, type Hex } from "viem";
import {
  AGENT_VAULT_ADDRESS,
  ESCROW_ADDRESS,
  MOCKUSDC_ADDRESS,
  agentVaultAbi,
  escrowAbi,
  robinhoodTestnet,
  tusdcAbi,
} from "@/lib/chainConfig";

// Browser-side escrow transactions, signed by the user's own wallet (Privy
// embedded or external). The server never sees a key: it only verifies the
// resulting tx hash.

export const browserClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });

/** True when this market's tUSDC stakes go through the escrow for real. */
export function isOnChainMarket(m: { escrowAddress?: string | null; onChainMarketId?: string | number | null }) {
  return (
    !!ESCROW_ADDRESS &&
    !!MOCKUSDC_ADDRESS &&
    m.onChainMarketId != null &&
    m.escrowAddress?.toLowerCase() === ESCROW_ADDRESS.toLowerCase()
  );
}

export async function tusdcBalance(address: Hex): Promise<bigint> {
  return browserClient.readContract({ address: MOCKUSDC_ADDRESS!, abi: tusdcAbi, functionName: "balanceOf", args: [address] });
}

function walletClient(provider: EIP1193Provider, account: Hex) {
  return createWalletClient({ account, chain: robinhoodTestnet, transport: custom(provider) });
}

/** Plain-English wallet errors (the raw RPC text is useless to a tester). */
export function explainTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient funds/i.test(msg)) return "Your wallet needs a little testnet ETH to pay gas.";
  if (/user rejected|denied/i.test(msg)) return "Transaction cancelled.";
  if (/MarketLocked/.test(msg)) return "This market has locked.";
  if (/StakeOutOfRange/.test(msg)) return "Stake amount isn't allowed for this market.";
  return msg.split("\n")[0].slice(0, 200);
}

async function send(
  provider: EIP1193Provider,
  account: Hex,
  write: (w: ReturnType<typeof walletClient>) => Promise<Hex>,
): Promise<Hex> {
  const hash = await write(walletClient(provider, account));
  const receipt = await browserClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction reverted (${hash})`);
  return hash;
}

/**
 * Put `amount` tUSDC into the escrow for (marketId, guess): approve if the
 * allowance is short, then stake. `amount` 0 = restake that only moves the
 * guess (fixed-stake markets). Returns the stake tx hash for the server.
 */
export async function stakeOnEscrow(
  provider: EIP1193Provider,
  account: Hex,
  a: { onChainMarketId: bigint; guessA: number; guessB: number; amount: bigint },
): Promise<Hex> {
  if (a.amount > 0n) {
    const bal = await tusdcBalance(account);
    if (bal < a.amount) throw new Error(`Not enough tUSDC: you have ${Number(bal) / 1e6}, this needs ${Number(a.amount) / 1e6}.`);
    const allowance = await browserClient.readContract({
      address: MOCKUSDC_ADDRESS!,
      abi: tusdcAbi,
      functionName: "allowance",
      args: [account, ESCROW_ADDRESS!],
    });
    if (allowance < a.amount) {
      await send(provider, account, (w) =>
        w.writeContract({ address: MOCKUSDC_ADDRESS!, abi: tusdcAbi, functionName: "approve", args: [ESCROW_ADDRESS!, a.amount] }),
      );
    }
  }
  return send(provider, account, (w) =>
    w.writeContract({
      address: ESCROW_ADDRESS!,
      abi: escrowAbi,
      functionName: "stake",
      args: [a.onChainMarketId, a.guessA, a.guessB, a.amount],
    }),
  );
}

/** Pull a settled/void payout to the user's wallet. */
export async function claimFromEscrow(provider: EIP1193Provider, account: Hex, onChainMarketId: bigint): Promise<Hex> {
  return send(provider, account, (w) =>
    w.writeContract({ address: ESCROW_ADDRESS!, abi: escrowAbi, functionName: "claim", args: [onChainMarketId] }),
  );
}

/** Testnet faucet: mint tUSDC straight to the caller. */
export async function faucetTusdc(provider: EIP1193Provider, account: Hex, amount: bigint): Promise<Hex> {
  return send(provider, account, (w) =>
    w.writeContract({ address: MOCKUSDC_ADDRESS!, abi: tusdcAbi, functionName: "faucet", args: [amount] }),
  );
}

// ── Agent accounts ─────────────────────────────────────────────────────────

/** Sign the gasless EIP-712 LinkAgent authorization (no transaction). */
export async function signAgentLink(
  provider: EIP1193Provider,
  account: Hex,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typedData: any,
): Promise<Hex> {
  return walletClient(provider, account).signTypedData({ account, ...typedData });
}

function requireVault(): Hex {
  if (!AGENT_VAULT_ADDRESS) throw new Error("Agent vault isn't configured on this deployment.");
  return AGENT_VAULT_ADDRESS;
}

/** Fund the agent: approve the vault if needed, then deposit. */
export async function depositToAgent(provider: EIP1193Provider, account: Hex, agent: Hex, amount: bigint): Promise<Hex> {
  const vault = requireVault();
  const bal = await tusdcBalance(account);
  if (bal < amount) throw new Error(`Not enough tUSDC: you have ${Number(bal) / 1e6}.`);
  const allowance = await browserClient.readContract({
    address: MOCKUSDC_ADDRESS!,
    abi: tusdcAbi,
    functionName: "allowance",
    args: [account, vault],
  });
  if (allowance < amount) {
    await send(provider, account, (w) =>
      w.writeContract({ address: MOCKUSDC_ADDRESS!, abi: tusdcAbi, functionName: "approve", args: [vault, amount] }),
    );
  }
  return send(provider, account, (w) =>
    w.writeContract({ address: vault, abi: agentVaultAbi, functionName: "deposit", args: [agent, amount] }),
  );
}

/** Pull money out of the agent back to the owner's wallet (owner-only on-chain). */
export async function withdrawFromAgent(provider: EIP1193Provider, account: Hex, agent: Hex, amount: bigint): Promise<Hex> {
  const vault = requireVault();
  return send(provider, account, (w) =>
    w.writeContract({ address: vault, abi: agentVaultAbi, functionName: "withdraw", args: [agent, amount] }),
  );
}
