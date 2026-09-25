"use client";

import type { ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { robinhoodTestnet } from "@/lib/chainConfig";

/** Build-time flag — NEXT_PUBLIC_ vars are inlined, so this is stable. */
export const PRIVY_ENABLED = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/**
 * Mounts PrivyProvider only when an app id is configured; otherwise the app
 * runs in dev-wallet mode (x-dev-address header) exactly as before, so the
 * moment keys land in env this flips on with zero code changes.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_ENABLED) return <>{children}</>;
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Stakes are real tUSDC on Robinhood Chain: wallets start there.
        defaultChain: robinhoodTestnet,
        supportedChains: [robinhoodTestnet],
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        appearance: {
          theme: "light",
          accentColor: "#7B62F6",
          logo: "/brand/logo-black.svg",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
