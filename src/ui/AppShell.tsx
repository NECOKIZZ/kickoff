"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { ThemeToggle, useDarkMode } from "@/ui/ThemeToggle";
import { NavUnderlineItem } from "@/ui/NavUnderline";
import { getDevAddress, setDevAddress, randomDevAddress, shortAddr } from "@/ui/clientApi";

const APP_TABS = [
  { label: "Markets", href: "/markets" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "My Positions", href: "/positions" },
];

/**
 * Dev-mode sign in: mints a throwaway address for the x-dev-address header
 * flow until Privy keys land. The 3D button is the brand-mandated shape.
 */
function SignInButton() {
  const [addr, setAddr] = useState<string | null>(null);
  useEffect(() => setAddr(getDevAddress()), []);

  if (addr) {
    return (
      <button
        onClick={() => {
          setDevAddress(null);
          setAddr(null);
        }}
        title="Signed in (dev wallet) — click to sign out"
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
        {shortAddr(addr)}
      </button>
    );
  }

  return (
    <Button3D
      size="sm"
      color="green"
      onClick={() => {
        const a = randomDevAddress();
        setDevAddress(a);
        setAddr(a);
      }}
    >
      Sign In
    </Button3D>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [dark] = useDarkMode();
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
          className="mx-auto px-6"
          style={{
            maxWidth: 1100,
            height: 58,
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
          }}
        >
          {/* Logo — adapts to environment: green on cream, white on ink */}
          <Link href="/" aria-label="Home" style={{ justifySelf: "start", display: "flex", paddingLeft: 8 }}>
            <Logo variant={dark ? "white" : "green"} size={26} />
          </Link>

          {/* Center tabs — green underline marks selection */}
          <nav className="flex items-center gap-6 h-full">
            {APP_TABS.map((t) => (
              <NavUnderlineItem
                key={t.href}
                active={pathname.startsWith(t.href)}
                onClick={() => router.push(t.href)}
                className="text-[0.84rem] h-full flex items-end pb-[9px]"
              >
                {t.label}
              </NavUnderlineItem>
            ))}
          </nav>

          <div className="flex items-center gap-2.5" style={{ justifySelf: "end" }}>
            <ThemeToggle />
            <SignInButton />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
