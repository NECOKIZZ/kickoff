"use client";

import { useWallets } from "@privy-io/react-auth";
import type { EIP1193Provider, Hex } from "viem";
import { PRIVY_ENABLED } from "@/ui/auth/AuthProvider";
import { useAuth } from "@/ui/auth/useAuth";
import { robinhoodTestnet } from "@/lib/chainConfig";

export interface WalletProvider {
  address: Hex | null;
  /** EIP-1193 provider on Robinhood Chain, or throws with a user-facing reason. */
  getProvider: () => Promise<EIP1193Provider>;
}

/**
 * The signed-in user's wallet as an EIP-1193 provider, switched to Robinhood
 * Chain. PRIVY_ENABLED is a build-time constant, so only one branch's hooks
 * ever run in a given build (same pattern as useAuth).
 */
export function useWalletProvider(): WalletProvider {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return PRIVY_ENABLED ? usePrivyWalletProvider() : useDevWalletProvider();
}

function usePrivyWalletProvider(): WalletProvider {
  const { address } = useAuth();
  const { wallets } = useWallets();
  return {
    address: (address as Hex | null) ?? null,
    getProvider: async () => {
      const w = wallets.find((x) => x.address.toLowerCase() === address?.toLowerCase());
      if (!w) throw new Error("Wallet not ready yet, try again in a second.");
      await w.switchChain(robinhoodTestnet.id);
      return (await w.getEthereumProvider()) as EIP1193Provider;
    },
  };
}

function useDevWalletProvider(): WalletProvider {
  const { address } = useAuth();
  return {
    address: (address as Hex | null) ?? null,
    getProvider: async () => {
      throw new Error("On-chain staking needs a real wallet: dev-address mode can't sign.");
    },
  };
}
