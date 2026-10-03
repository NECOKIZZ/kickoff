"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { ThemeToggle } from "@/ui/ThemeToggle";
import { NavUnderlineItem } from "@/ui/NavUnderline";
import { useAuth } from "@/ui/auth/useAuth";
import { WalletChip } from "@/ui/chain/WalletChip";
import { CONTACT_EMAIL } from "@/ui/contact";
import { GettingStarted, GuideButton } from "@/ui/onboarding/GettingStarted";

// `short` is the phone label: four tabs have to fit one row at 360px.
const APP_TABS = [
  { label: "Markets", short: "Markets", href: "/markets" },
  { label: "Leaderboard", short: "Leaderboard", href: "/leaderboard" },
  { label: "My Positions", short: "Positions", href: "/positions" },
  { label: "My Agent", short: "Agent", href: "/agent" },
];

/**
 * Sign in — Privy when configured (email or wallet, embedded wallet minted on
 * first login), throwaway dev address otherwise. Same 3D button either way.
 */
function SignInButton() {
  const { ready, address, signIn, signOut } = useAuth();

  if (!ready) return null;

  if (address) return <WalletChip address={address} onSignOut={signOut} />;

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
            className="order-1 pl-0 sm:pl-2"
            style={{ justifySelf: "start", display: "flex" }}
          >
            <Logo size={26} />
          </Link>

          {/* Center tabs — green underline marks selection. On phones the
              tabs drop to their own row beneath logo/controls. */}
          <nav
            className="order-3 sm:order-2 basis-full sm:basis-auto flex items-center justify-between sm:justify-center gap-4 sm:gap-6 overflow-x-auto"
            style={{ minHeight: 40 }}
          >
            {APP_TABS.map((t) => (
              <NavUnderlineItem
                key={t.href}
                active={pathname.startsWith(t.href)}
                onClick={() => router.push(t.href)}
                className="text-[0.8rem] sm:text-[0.84rem] whitespace-nowrap h-full flex items-end pb-[9px]"
              >
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </NavUnderlineItem>
            ))}
          </nav>

          <div
            className="order-2 sm:order-3 ml-auto sm:ml-0 flex items-center gap-1.5 sm:gap-2.5 py-2 sm:py-0"
            style={{ justifySelf: "end" }}
          >
            <GuideButton />
            <ThemeToggle />
            <SignInButton />
          </div>
        </div>
      </header>

      {children}

      <GettingStarted />

      <footer
        className="mx-auto px-4 sm:px-6 py-8 text-center"
        style={{ maxWidth: 1100, borderTop: "1px solid var(--border)", marginTop: 48, fontSize: "0.8rem", color: "var(--muted-foreground)" }}
      >
        Found a bug or have feedback? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {CONTACT_EMAIL}
        </a>
      </footer>
    </div>
  );
}
