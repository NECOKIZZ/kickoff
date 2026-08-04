"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PRIVY_ENABLED } from "@/ui/auth/AuthProvider";
import { getDevAddress, setDevAddress, randomDevAddress } from "@/ui/clientApi";

export interface AuthState {
  ready: boolean;
  address: string | null;
  signIn: () => void;
  signOut: () => void;
}

/**
 * One hook, two modes. PRIVY_ENABLED is a build-time constant, so exactly one
 * branch's hooks ever run in a given build — the conditional is safe.
 */
export function useAuth(): AuthState {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return PRIVY_ENABLED ? usePrivyAuth() : useDevAuth();
}

function usePrivyAuth(): AuthState {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const linked = user?.linkedAccounts?.find((a) => a.type === "wallet") as
    | { type: "wallet"; address: string }
    | undefined;
  const address = authenticated ? (user?.wallet?.address ?? linked?.address ?? null) : null;
  return { ready, address, signIn: login, signOut: logout };
}

function useDevAuth(): AuthState {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => setAddress(getDevAddress()), []);
  return {
    ready: true,
    address,
    signIn: () => {
      const a = randomDevAddress();
      setDevAddress(a);
      setAddress(a);
    },
    signOut: () => {
      setDevAddress(null);
      setAddress(null);
    },
  };
}
