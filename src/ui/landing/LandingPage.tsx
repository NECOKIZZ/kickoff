"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { NavUnderlineItem } from "@/ui/NavUnderline";

const NAV_LINKS = [
  { label: "How it Works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Docs", href: "#docs" },
];

// ── Navbar — floating glass pill, logo kept tight (brand: don't carry it wide) ──

function Navbar() {
  const [active, setActive] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4">
      <nav
        className="glass flex items-center justify-between w-full max-w-4xl px-4 py-3"
        style={{ borderRadius: 999, overflow: "visible" }}
      >
        {/* Logo — white on the purple hero environment */}
        <span style={{ marginLeft: 8 }} className="shrink-0">
          <Logo variant="white" size={28} />
        </span>

        {/* Nav links — green underline marks the selected item */}
        <div className="hidden sm:flex items-center gap-8" style={{ overflow: "visible" }}>
          {NAV_LINKS.map((l) => (
            <NavUnderlineItem
              key={l.label}
              href={l.href}
              active={active === l.href}
              onClick={() => setActive(l.href)}
            >
              {l.label}
            </NavUnderlineItem>
          ))}
        </div>

        <Button3D color="purple" onClick={() => router.push("/markets")}>
          Kickoff
        </Button3D>
      </nav>
    </div>
  );
}

// ── Hero — purple wash over cream, grid texture, Fraunces headline ─────────────

function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-start overflow-hidden pt-[80px] pb-[192px]"
      style={{ background: "#7b62f6b3" }}
    >
      {/* Background grid texture */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div
        className="relative w-full flex flex-col items-center text-center px-6"
        style={{ zIndex: 2, paddingTop: "6vh" }}
      >
        <p
          style={{
            fontFamily: "'Fraunces', serif",
            color: "var(--muted-foreground)",
            fontSize: "clamp(1.1rem, 2.4vw, 1.9rem)",
            fontWeight: 400,
            fontStyle: "italic",
            lineHeight: 1.2,
            marginBottom: "0.35em",
          }}
        >
          Beat the pack,{" "}
          <span style={{ color: "var(--primary)", fontStyle: "normal", fontWeight: 600 }}>
            Keep the stack.
          </span>
        </p>

        <h1
          className="leading-none"
          style={{
            fontFamily: "'Fraunces', serif",
            color: "var(--foreground)",
            fontSize: "clamp(3.2rem, 8vw, 7.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
          }}
        >
          Proximity Markets.
        </h1>
      </div>
    </section>
  );
}

// ── Accumulator pool — fed live from /api/accumulator ──────────────────────────

function formatPool(microUsdc: string | null): string {
  if (microUsdc === null) return "$0";
  const dollars = Number(BigInt(microUsdc) / 10000n) / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  const frac = dollars % 1 !== 0;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 })}`;
}

function AccumulatorPool() {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/accumulator")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.balance !== undefined) setBalance(d.balance);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000); // keep it live
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section
      style={{
        background: "#000",
        minHeight: 400,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        paddingTop: 0,
        marginTop: -120,
        position: "relative",
        zIndex: 25,
      }}
    >
      <p
        style={{
          fontFamily: "'Fraunces', serif",
          fontSize: "clamp(4rem, 12vw, 9rem)",
          fontWeight: 700,
          color: "#fff",
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {formatPool(balance)}
      </p>
      <p
        style={{
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "clamp(0.85rem, 1.6vw, 1.1rem)",
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "0.6em",
        }}
      >
        in the accumulator pool
      </p>
    </section>
  );
}

// ── Score / Player toggle pill ─────────────────────────────────────────────────

function MarketToggle() {
  const [active, setActive] = useState<"score" | "player">("score");
  const isScore = active === "score";
  const accent = isScore ? "#00C805" : "#7B62F6";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(0,0,0,0.07)",
        borderRadius: 999,
        padding: 4,
        position: "relative",
        border: `1.5px solid ${accent}55`,
        transition: "border-color 0.35s ease",
      }}
    >
      {/* Sliding indicator */}
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: isScore ? 4 : "50%",
          width: "calc(50% - 4px)",
          borderRadius: 999,
          background: accent,
          transition: "left 0.32s cubic-bezier(0.4,0,0.2,1), background 0.32s ease",
          zIndex: 0,
        }}
      />

      {(["score", "player"] as const).map((tab) => {
        const isActive = active === tab;
        const isDark = tab === "score";
        return (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.78rem",
              fontWeight: 700,
              padding: "9px 22px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: isActive ? (isDark ? "#000" : "#fff") : "rgba(0,0,0,0.38)",
              transition: "color 0.32s ease",
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
              position: "relative",
              zIndex: 1,
              minWidth: 120,
              textAlign: "center",
            }}
          >
            {tab === "score" ? "Score Markets" : "Player Perps"}
          </button>
        );
      })}
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function Footer() {
  const cols = [
    { heading: "Product", links: ["Score Markets", "Player Perps", "Accumulator", "Leaderboard"] },
    { heading: "Company", links: ["About", "Blog", "Careers", "Press", "Contact"] },
    { heading: "Legal", links: ["Privacy Policy", "Terms of Service", "Cookie Policy", "Responsible Play"] },
  ];

  return (
    <footer style={{ background: "#000", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-12">
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Logo variant="white" size={24} />
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
              kickoff<span style={{ color: "var(--primary)" }}>.cash</span>
            </span>
          </div>
          <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.8rem", lineHeight: 1.7, color: "rgba(255,255,255,0.3)" }}>
            Proximity markets for football. Rewards for how close you land — not just yes or no.
          </p>
          <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.72rem", color: "rgba(255,255,255,0.18)", marginTop: "1.5rem" }}>
            © 2026 kickoff.cash
          </p>
        </div>
        {cols.map((col) => (
          <div key={col.heading}>
            <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: "1.2rem" }}>
              {col.heading}
            </p>
            <ul className="flex flex-col gap-3">
              {col.links.map((l) => (
                <li key={l}>
                  <a
                    href="#"
                    style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Navbar />
      <div style={{ position: "relative" }}>
        <Hero />
        {/* Players image centred at the hero/black boundary */}
        <img
          src="/brand/hero-players.webp"
          alt="Footballers mid-play"
          style={{
            position: "absolute",
            bottom: 100,
            left: "50%",
            transform: "translateX(-55%)",
            height: 500,
            width: "auto",
            zIndex: 15,
            pointerEvents: "none",
          }}
        />
        {/* Rounded black band easing hero into the pool section */}
        <div
          className="rounded-t-[50px]"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 30%)",
            height: 300,
            width: "100%",
            marginTop: -100,
            position: "relative",
            zIndex: 20,
          }}
        />
      </div>

      <AccumulatorPool />

      {/* Cream section — How it works + market toggle */}
      <div
        className="rounded-t-[50px]"
        style={{ background: "#F7F5F0", height: 90, width: "100%", marginTop: -60, position: "relative", zIndex: 30 }}
      />
      <section
        id="how-it-works"
        style={{ background: "#F7F5F0", minHeight: 600, width: "100%", position: "relative", overflow: "hidden", paddingTop: 28, paddingBottom: 80 }}
      >
        {/* Brand glow orbs */}
        <div style={{ position: "absolute", top: "50%", left: "5%", width: 300, height: 300, borderRadius: "50%", background: "#00C805", filter: "blur(120px)", opacity: 0.38, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "55%", right: "5%", width: 280, height: 280, borderRadius: "50%", background: "#7B62F6", filter: "blur(110px)", opacity: 0.42, pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "5%", left: "40%", width: 260, height: 260, borderRadius: "50%", background: "#00C805", filter: "blur(100px)", opacity: 0.28, pointerEvents: "none" }} />

        <div className="max-w-6xl mx-auto px-6 text-center" style={{ position: "relative", zIndex: 1 }}>
          <h2
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "clamp(2.8rem, 6vw, 5rem)",
              fontWeight: 700,
              color: "#0a0a0a",
              letterSpacing: "-0.03em",
              lineHeight: 1.0,
            }}
          >
            How it works.
          </h2>
        </div>
        <div className="flex justify-center mt-12" style={{ position: "relative", zIndex: 1 }}>
          <MarketToggle />
        </div>
      </section>

      <Footer />
    </div>
  );
}
