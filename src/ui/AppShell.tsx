"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { NavUnderlineItem } from "@/ui/NavUnderline";
import { useAuth } from "@/ui/auth/useAuth";
import { shortAddr } from "@/ui/clientApi";
import { WalletChip } from "@/ui/chain/WalletChip";

const APP_TABS = [
  { label: "Markets", href: "/markets" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "My Positions", href: "/positions" },
  { label: "My Agent", href: "/agent" },
];

/**
 * Sign in — Privy when configured (email or wallet, embedded wallet minted on
 * first login), throwaway dev address otherwise. Same 3D button either way.
 */
function SignInButton() {
  const { ready, address, signIn, signOut } = useAuth();

  if (!ready) return null;

  if (address) {
    return (
      <span className="flex items-center gap-3">
        <WalletChip address={address} />
        <button
          onClick={signOut}
          title="Signed in. Click to sign out"
          className="cursor-pointer"
          style={{
            fontFamily: "'Clash Display', sans-serif",
            fontSize: "0.78rem",
            fontWeight: 600,
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--muted)",
            color: "var(--foreground)",
            whiteSpace: "nowrap",
          }}
        >
          {shortAddr(address)}
        </button>
      </span>
    );
  }

  return (
    <Button3D size="sm" color="accent" onClick={signIn}>
      Sign In
    </Button3D>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "color-mix(in srgb, var(--background) 82%, transparent)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          className="mx-auto px-4 sm:px-6 flex flex-wrap items-center sm:grid"
          style={{
            maxWidth: 1100,
            minHeight: 58,
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          {/* Logo — monochrome: black on cream, white on ink */}
          <Link
            href="/"
            aria-label="Home"
            className="order-1"
            style={{ justifySelf: "start", display: "flex", paddingLeft: 8 }}
          >
            <Logo size={26} />
          </Link>

          {/* Center tabs — green underline marks selection. On phones the
              tabs drop to their own row beneath logo/controls. */}
          <nav
            className="order-3 sm:order-2 basis-full sm:basis-auto flex items-center justify-center gap-5 sm:gap-6 overflow-x-auto"
            style={{ minHeight: 40 }}
          >
            {APP_TABS.map((t) => (
              <NavUnderlineItem
                key={t.href}
                active={pathname.startsWith(t.href)}
                onClick={() => router.push(t.href)}
                className="text-[0.8rem] sm:text-[0.84rem] whitespace-nowrap h-full flex items-end pb-[9px]"
              >
                {t.label}
              </NavUnderlineItem>
            ))}
          </nav>

          <div
            className="order-2 sm:order-3 ml-auto sm:ml-0 flex items-center gap-2.5 py-2 sm:py-0"
            style={{ justifySelf: "end" }}
          >
            <ThemeToggle />
            <SignInButton />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
