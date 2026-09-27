"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";
import { NavUnderlineItem } from "@/ui/NavUnderline";
import { Reveal, RevealWords } from "@/ui/landing/Reveal";
import { CONTACT_EMAIL } from "@/ui/contact";

const NAV_LINKS = [
  { label: "How it Works", href: "#how-it-works" },
  { label: "Docs", href: "/docs" },
  { label: "Markets", href: "/markets" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Positions", href: "/positions" },
];

// ── Navbar — floating glass pill, logo kept tight (brand: don't carry it wide) ──

function Navbar() {
  const [active, setActive] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [mounted, setMounted] = useState(false); // entrance: drop in from above
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Stay fixed while the hero is on screen; slide away once the visitor has
  // scrolled past it so the pill never blocks section content.
  useEffect(() => {
    const onScroll = () => setHidden(window.scrollY > window.innerHeight * 0.75);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4"
      style={{
        transform: hidden || !mounted ? "translateY(-120%)" : "translateY(0)",
        opacity: hidden || !mounted ? 0 : 1,
        transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease",
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      <nav
        className="glass flex items-center justify-between w-full max-w-4xl px-4 py-3"
        style={{ borderRadius: 999, overflow: "visible" }}
      >
        {/* Logo — white on the purple hero environment */}
        <span style={{ marginLeft: 8 }} className="shrink-0">
          <Logo variant="white" size={28} />
        </span>

        {/* Nav links — white on the purple environment, green underline when selected */}
        <div className="hidden sm:flex items-center gap-8" style={{ overflow: "visible" }}>
          {NAV_LINKS.map((l) => (
            <NavUnderlineItem
              key={l.label}
              href={l.href}
              active={active === l.href}
              onClick={() => setActive(l.href)}
              muted="rgba(255,255,255,0.75)"
              activeColor="#ffffff"
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
      className="hero-landing relative min-h-screen flex flex-col justify-start overflow-hidden pt-[80px] pb-[192px]"
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
        <Reveal duration={1000}>
          <p
            style={{
              fontFamily: "'Fraunces', serif",
              color: "rgba(255,255,255,0.85)",
              fontSize: "clamp(1.1rem, 2.4vw, 1.9rem)",
              fontWeight: 400,
              fontStyle: "italic",
              lineHeight: 1.2,
              marginBottom: "0.35em",
            }}
          >
            Beat the pack,{" "}
            <span style={{ color: "#ffffff", fontStyle: "normal", fontWeight: 600 }}>
              Keep the stack.
            </span>
          </p>
        </Reveal>

        <h1
          className="leading-none"
          style={{
            fontFamily: "'Fraunces', serif",
            color: "#ffffff",
            fontSize: "clamp(3.2rem, 8vw, 7.5rem)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
          }}
        >
          <RevealWords text="Proximity Markets." delay={250} stagger={140} />
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
  const [display, setDisplay] = useState<string | null>(null); // animated dollars

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

  // Count-up: the figure rolls from its previous value to the new one.
  useEffect(() => {
    if (balance === null) return;
    const target = Number(BigInt(balance) / 10000n); // cents
    const from = display === null ? 0 : Number(display);
    if (from === target) {
      setDisplay(String(target));
      return;
    }
    const t0 = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out-quart
      setDisplay(String(Math.round(from + (target - from) * eased)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);

  const shown = display === null ? null : String(BigInt(display) * 10000n);

  return (
    <section
      style={{
        background: "#000",
        minHeight: 500,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        // The rounded band above overlaps this section by 120px. Measured: with
        // 62px bottom padding the $ figure's center lands on the exact midpoint
        // of the full black area (band top → section bottom).
        paddingTop: 0,
        paddingBottom: 62,
        marginTop: -120,
        position: "relative",
        zIndex: 25,
        overflow: "hidden",
      }}
    >
      {/* brand glow behind the figure */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 520, height: 520, borderRadius: "50%", background: "#00C805", filter: "blur(180px)", opacity: 0.1, pointerEvents: "none" }} />

      {/* subtle purple gradient easing the section's bottom edge toward the cream band */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 220,
          background: "linear-gradient(to top, rgba(123,98,246,0.22), transparent)",
          pointerEvents: "none",
        }}
      />

      <div className="max-w-4xl mx-auto px-6 w-full" style={{ position: "relative" }}>
        <Reveal duration={1100}>
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
            {formatPool(shown)}
          </p>
        </Reveal>
        <Reveal delay={200}>
          <p
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "clamp(0.85rem, 1.6vw, 1.1rem)",
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginTop: "0.9em",
              lineHeight: 1.8,
            }}
          >
            in the accumulator pool,{" "}
            <span style={{ color: "var(--color-kickoff-green)" }}>
              shared among the season&rsquo;s top 20 players
            </span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── Score / Player toggle — 3D per brand (buttons are strictly always 3D) ──────
// Theme mapping: Score Markets = purple/white, Player Perps = green/black.

function MarketToggle({
  active,
  onChange,
  dark = false,
}: {
  active: "score" | "player";
  onChange: (t: "score" | "player") => void;
  dark?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 12 }}>
      {(["score", "player"] as const).map((tab) => {
        const isActive = active === tab;
        const isScoreTab = tab === "score";
        const bg = isScoreTab ? "#7B62F6" : "#00C805";
        const shadow = isScoreTab ? "#4e3cb5" : "#008C04";
        const text = isScoreTab ? "#ffffff" : "#111210";
        // Inactive treatment flips with the section theme so it never sinks
        // into the background (ink-on-ink on black was invisible).
        const idleBg = dark ? "rgba(255,255,255,0.08)" : "rgba(17,18,16,0.06)";
        const idleText = dark ? "rgba(255,255,255,0.55)" : "rgba(17,18,16,0.45)";
        const idleBorder = dark ? "1px solid rgba(255,255,255,0.16)" : "1px solid rgba(17,18,16,0.14)";
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            aria-pressed={isActive}
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.82rem",
              fontWeight: 700,
              padding: "11px 26px",
              borderRadius: 14,
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
              minWidth: 150,
              cursor: "pointer",
              transition: "all 0.15s ease",
              // Active = raised 3D in brand color; inactive = pressed flat + muted
              background: isActive ? bg : idleBg,
              color: isActive ? text : idleText,
              border: isActive ? `1px solid ${shadow}` : idleBorder,
              boxShadow: isActive
                ? `0 5px 0 ${shadow}, 0 6px 14px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.25)`
                : "inset 0 2px 4px rgba(0,0,0,0.08)",
              transform: isActive ? "translateY(0)" : "translateY(4px)",
            }}
          >
            {tab === "score" ? "Score Markets" : "Player Perps"}
          </button>
        );
      })}
    </div>
  );
}

// ── How it works — steps per market type, driven by the toggle ─────────────────

const HOW_STEPS: Record<"score" | "player", Array<{ title: string; body: string }>> = {
  score: [
    {
      title: "Pick a scoreline",
      body: "Choose the final score you see coming. 2-1, 0-0, anything. Stake USDC on it before kickoff.",
    },
    {
      title: "Close still pays",
      body: "This isn't yes/no. Payouts scale with how close you land. 2-1 when it ends 2-0 still earns.",
    },
    {
      title: "Split the pool",
      body: "At full time the pool splits by stake × accuracy. Nail it exactly and you take the biggest share.",
    },
  ],
  player: [
    {
      title: "Pick your card",
      body: "",
    },
    {
      title: "Call the line",
      body: "",
    },
    {
      title: "Climb the board",
      body: "",
    },
  ],
};

/** Mini 5×5 grid demo — the proximity mechanic, made touchable. Purple theme (score markets). */
function MiniProximityGrid() {
  const [pick, setPick] = useState<{ h: number; a: number }>({ h: 2, a: 1 });
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(5, 40px)", justifyContent: "center" }}>
        {Array.from({ length: 25 }, (_, i) => {
          const h = Math.floor(i / 5);
          const a = i % 5;
          const isPick = pick.h === h && pick.a === a;
          const dist = Math.max(Math.abs(pick.h - h), Math.abs(pick.a - a));
          const glow = isPick ? 1 : dist === 1 ? 0.4 : dist === 2 ? 0.15 : 0.05;
          return (
            <button
              key={i}
              onClick={() => setPick({ h, a })}
              aria-label={`Score ${h}-${a}`}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: isPick ? "1.5px solid #7B62F6" : "1px solid rgba(17,18,16,0.12)",
                background: isPick
                  ? "#7B62F6"
                  : `rgba(123, 98, 246, ${glow * 0.35})`,
                color: isPick ? "#ffffff" : "rgba(17,18,16,0.65)",
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.66rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isPick ? "0 0 18px rgba(123,98,246,0.45)" : "none",
              }}
            >
              {h}-{a}
            </button>
          );
        })}
      </div>
      <p
        style={{
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "0.75rem",
          color: "rgba(17,18,16,0.45)",
          textAlign: "center",
          marginTop: 14,
        }}
      >
        Tap a score. The glow is your payout, fading with distance.
      </p>
    </div>
  );
}

/** Player-card fan — the designed card art, fanned like a hand of cards. Green theme (player perps). */
function PlayerCardFan() {
  const [hover, setHover] = useState<number | null>(null);
  const cards = [
    { img: "/brand/cards/palmer.webp", name: "Cole Palmer", pos: "AM", line: "6.0", rot: -11, x: -118, y: 20 },
    { img: "/brand/cards/haaland.webp", name: "Erling Haaland", pos: "ST", line: "8.5", rot: 0, x: 0, y: 0 },
    { img: "/brand/cards/szoboszlai.webp", name: "Dominik Szoboszlai", pos: "AM", line: "7.5", rot: 11, x: 118, y: 20 },
  ];
  return (
    <div style={{ position: "relative", height: 380, width: "min(460px, 88vw)" }}>
      {cards.map((c, i) => {
        const lifted = hover === i;
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 206,
              height: 288, // 1074×1504 art aspect
              transform: `translate(calc(-50% + ${c.x}px), calc(-50% + ${lifted ? c.y - 20 : c.y}px)) rotate(${lifted ? c.rot / 2 : c.rot}deg) scale(${lifted ? 1.07 : 1})`,
              borderRadius: 20,
              overflow: "hidden",
              zIndex: lifted ? 3 : i === 1 ? 2 : 1,
              cursor: "pointer",
              boxShadow: lifted
                ? "0 26px 60px rgba(0,0,0,0.45), 0 0 40px rgba(0,200,5,0.3), 0 0 0 1.5px rgba(0,200,5,0.5)"
                : i === 1
                ? "0 18px 44px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,200,5,0.25)"
                : "0 10px 28px rgba(0,0,0,0.3)",
              transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s ease, z-index 0s",
            }}
          >
            <img
              src={c.img}
              alt={c.name}
              draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }}
            />
            {/* points line footer, slides up on hover */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "26px 12px 10px",
                background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 8,
                opacity: lifted ? 1 : 0,
                transform: lifted ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 0.35s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontFamily: "'Clash Display', sans-serif",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {c.pos} · POINTS LINE
              </span>
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 700, color: "#00C805" }}>
                {c.line}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Proximity statement — one bold claim, big type, room to breathe ────────────

function ProximityStatement() {
  return (
    <section
      className="rounded-t-[50px]"
      style={{
        background: "#F7F5F0",
        padding: "clamp(7rem, 16vh, 12rem) 1.5rem",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        // Rounded lip over the how-it-works section — keeps the seam soft even
        // when that section is in black player-perps mode.
        marginTop: -50,
        zIndex: 35,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: "#7B62F6",
          filter: "blur(200px)",
          opacity: 0.12,
          pointerEvents: "none",
        }}
      />
      <div className="max-w-5xl mx-auto" style={{ position: "relative", zIndex: 1 }}>
        <Reveal>
          <p
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#7B62F6",
              marginBottom: "2.2rem",
            }}
          >
            The first proximity market on Robinhood Chain
          </p>
        </Reveal>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(2.6rem, 6.5vw, 5.5rem)",
            fontWeight: 700,
            color: "#111210",
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          <RevealWords text="Closeness matters." stagger={120} />
          <br />
          <span style={{ color: "rgba(17,18,16,0.35)" }}>
            <RevealWords text="Not just yes or no." delay={400} stagger={100} />
          </span>
        </h2>
        <Reveal delay={700}>
          <p
            style={{
              fontFamily: "'Fraunces', serif",
              fontStyle: "italic",
              fontSize: "clamp(1.05rem, 2vw, 1.4rem)",
              color: "rgba(17,18,16,0.55)",
              marginTop: "2.6rem",
              maxWidth: 560,
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.55,
            }}
          >
            Call 2-1 and it ends 2-0? You still get paid. The nearer you land, the bigger your share.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── The deck — all five designed player cards fan out on scroll ────────────────

const DECK_CARDS = [
  { img: "/brand/cards/palmer.webp", name: "Cole Palmer", club: "Chelsea", accent: "#2A4FD9" },
  { img: "/brand/cards/fernandes.webp", name: "Bruno Fernandes", club: "Man United", accent: "#DA291C" },
  { img: "/brand/cards/haaland.webp", name: "Erling Haaland", club: "Man City", accent: "#6CABDD" },
  { img: "/brand/cards/gyokeres.webp", name: "Viktor Gyökeres", club: "Arsenal", accent: "#EF0107" },
  { img: "/brand/cards/szoboszlai.webp", name: "Dominik Szoboszlai", club: "Liverpool", accent: "#C8102E" },
];

function DeckShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
    // No timer failsafe — same reasoning as Reveal.tsx: it would fan the deck
    // out invisibly before the visitor scrolls down to it.
  }, []);

  const mid = (DECK_CARDS.length - 1) / 2; // 2 — the center card

  return (
    <section
      ref={sectionRef}
      className="rounded-t-[50px]"
      style={{
        background: "#000",
        // bottom padding covers the marquee's 50px rounded-lip overlap with
        // clear air under the button (it was clipping at 3rem)
        padding: "7.5rem 1rem 6.5rem",
        position: "relative",
        overflow: "hidden",
        // Rounded lip over the cream statement — same seam language as siblings.
        marginTop: -50,
        zIndex: 36,
      }}
    >
      {/* green table-glow under the hand of cards */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -140,
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 380,
          borderRadius: "50%",
          background: "#00C805",
          filter: "blur(160px)",
          opacity: inView ? 0.14 : 0,
          transition: "opacity 1.4s ease 0.4s",
          pointerEvents: "none",
        }}
      />

      <div className="max-w-6xl mx-auto text-center" style={{ position: "relative", zIndex: 1 }}>
        <Reveal>
          <p
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--color-kickoff-green)",
              marginBottom: "1.6rem",
            }}
          >
            Player Perps
          </p>
        </Reveal>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(2.4rem, 5.5vw, 4.5rem)",
            fontWeight: 700,
            color: "#F7F5F0",
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          <RevealWords text="Pick your player." stagger={110} />
          <br />
          <span style={{ color: "rgba(247,245,240,0.35)" }}>
            <RevealWords text="Call the line." delay={350} stagger={110} />
          </span>
        </h2>
      </div>

      {/* The hand — stacked in the middle, fans out when scrolled into view */}
      <div
        style={{
          position: "relative",
          height: 420,
          marginTop: "3.5rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          zIndex: 1,
        }}
      >
        {DECK_CARDS.map((c, i) => {
          const off = i - mid; // -2..2
          const lifted = hover === i;
          const fan = {
            x: off * 148,
            y: Math.abs(off) * 26,
            rot: off * 7,
          };
          return (
            <div
              key={c.name}
              className="deck-card"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                width: 218,
                height: 305, // 1074×1504 aspect
                marginLeft: -109,
                borderRadius: 20,
                overflow: "hidden",
                transformOrigin: "bottom center",
                zIndex: lifted ? 10 : 5 - Math.abs(off),
                cursor: "pointer",
                transitionDelay: inView ? `${Math.abs(off) * 90}ms` : "0ms",
                transform: inView
                  ? `translateX(${fan.x}px) translateY(${lifted ? fan.y - 34 : fan.y}px) rotate(${lifted ? fan.rot / 2 : fan.rot}deg) scale(${lifted ? 1.07 : 1})`
                  : "translateX(0) translateY(120px) rotate(0deg) scale(0.85)",
                opacity: inView ? 1 : 0,
                boxShadow: lifted
                  ? `0 30px 70px rgba(0,0,0,0.55), 0 0 46px ${c.accent}66, 0 0 0 1.5px ${c.accent}88`
                  : "0 16px 40px rgba(0,0,0,0.45)",
              }}
            >
              <img
                src={c.img}
                alt={`${c.name} player card`}
                loading="lazy"
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }}
              />
              {/* name plate slides up on hover */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "30px 14px 12px",
                  background: "linear-gradient(to top, rgba(0,0,0,0.88), transparent)",
                  textAlign: "center",
                  opacity: lifted ? 1 : 0,
                  transform: lifted ? "translateY(0)" : "translateY(12px)",
                  transition: "opacity 0.3s ease, transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
                  pointerEvents: "none",
                }}
              >
                <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.82rem", fontWeight: 700, color: "#fff", letterSpacing: "0.03em" }}>
                  {c.name}
                </p>
                <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-kickoff-green)", marginTop: 2 }}>
                  {c.club}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Reveal delay={500}>
        <div className="flex flex-col items-center gap-4" style={{ marginTop: "3rem", position: "relative", zIndex: 1 }}>
          <p
            style={{
              fontFamily: "'Fraunces', serif",
              fontStyle: "italic",
              fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
              color: "rgba(247,245,240,0.5)",
              maxWidth: 460,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            A fresh deck drops every matchweek. Call each player&rsquo;s fantasy points. The closer you land, the more you take.
          </p>
          <Button3D color="green" size="lg" onClick={() => (window.location.href = "/markets")}>
            Open the deck
          </Button3D>
        </div>
      </Reveal>
    </section>
  );
}

// ── EPL club marquee — 20 crests on diagonal glass cards, before the footer ────

const MARQUEE_CLUBS: Array<{ slug: string; name: string }> = [
  { slug: "arsenal", name: "Arsenal" },
  { slug: "aston-villa", name: "Aston Villa" },
  { slug: "bournemouth", name: "Bournemouth" },
  { slug: "brentford", name: "Brentford" },
  { slug: "brighton", name: "Brighton" },
  { slug: "burnley", name: "Burnley" },
  { slug: "chelsea", name: "Chelsea" },
  { slug: "crystal-palace", name: "Crystal Palace" },
  { slug: "everton", name: "Everton" },
  { slug: "fulham", name: "Fulham" },
  { slug: "leeds", name: "Leeds" },
  { slug: "liverpool", name: "Liverpool" },
  { slug: "man-city", name: "Man City" },
  { slug: "man-united", name: "Man United" },
  { slug: "newcastle", name: "Newcastle" },
  { slug: "nottingham-forest", name: "Forest" },
  { slug: "sunderland", name: "Sunderland" },
  { slug: "tottenham", name: "Tottenham" },
  { slug: "west-ham", name: "West Ham" },
  { slug: "wolves", name: "Wolves" },
];

function ClubMarquee() {
  const row = (copy: number) => (
    <div key={copy} aria-hidden={copy === 1} style={{ display: "flex", gap: 72, paddingRight: 72, alignItems: "center" }}>
      {MARQUEE_CLUBS.map((club) => (
        <div
          key={`${copy}-${club.slug}`}
          style={{
            width: 72,
            height: 72,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <img
            src={`/brand/clubs/${club.slug}.webp`}
            alt={copy === 0 ? club.name : ""}
            loading="lazy"
            style={{
              width: 64,
              height: 64,
              objectFit: "contain",
              filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.6))",
              opacity: 0.92,
            }}
            onError={(e) => {
              // Crest missing → show the club's initials instead of a broken image
              const img = e.currentTarget;
              img.style.display = "none";
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
          <span
            style={{
              display: "none",
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: "0.06em",
            }}
          >
            {club.name.split(" ").map((w) => w[0]).join("")}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <section
      className="rounded-t-[50px]"
      style={{
        background: "#000",
        padding: "6rem 0 7rem",
        overflow: "hidden",
        position: "relative",
        // Rounded lip overlapping the cream statement — same band language as
        // the other section seams on this page.
        marginTop: -50,
        zIndex: 36,
      }}
    >
      <Reveal>
        <p
          style={{
            fontFamily: "'Clash Display', sans-serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            textAlign: "center",
            marginBottom: "3rem",
          }}
        >
          Every club. Every matchweek.
        </p>
      </Reveal>
      <div style={{ position: "relative" }}>
        {/* edge fades so the loop never shows a hard cut */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 120, background: "linear-gradient(to right, #000, transparent)", zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 120, background: "linear-gradient(to left, #000, transparent)", zIndex: 2, pointerEvents: "none" }} />
        <div className="marquee-track">{[0, 1].map(row)}</div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

function Footer() {
  // Product links go to real pages; Company/Legal pages don't exist yet, so
  // those entries render as plain text instead of dead "#" links.
  const cols: { heading: string; links: { label: string; href?: string; download?: boolean }[] }[] = [
    {
      heading: "Product",
      links: [
        { label: "Score Markets", href: "/markets" },
        { label: "Player Perps", href: "/markets" },
        { label: "Accumulator", href: "/leaderboard" },
        { label: "Leaderboard", href: "/leaderboard" },
      ],
    },
    { heading: "Company", links: [{ label: "About" }, { label: "Blog" }, { label: "Careers" }, { label: "Press" }, { label: "Brand Book", href: "/kickoff_brand_book.pdf", download: true }, { label: "Contact", href: `mailto:${CONTACT_EMAIL}` }] },
    { heading: "Legal", links: [{ label: "Privacy Policy" }, { label: "Terms of Service" }, { label: "Cookie Policy" }, { label: "Responsible Play" }] },
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
            Proximity markets for football. Rewards for how close you land, not just yes or no.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ display: "inline-block", fontFamily: "'Clash Display', sans-serif", fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", marginTop: "1rem", textDecoration: "none" }}
          >
            {CONTACT_EMAIL}
          </a>
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
                <li key={l.label}>
                  {l.href ? (
                    <a
                      href={l.href}
                      {...(l.download ? { download: true } : {})}
                      style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", textDecoration: "none", transition: "color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#fff")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                    >
                      {l.label}
                    </a>
                  ) : (
                    <span
                      style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.85rem", color: "rgba(255,255,255,0.3)", cursor: "default" }}
                      title="Coming soon"
                    >
                      {l.label}
                    </span>
                  )}
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
  const [howTab, setHowTab] = useState<"score" | "player">("score");
  const steps = HOW_STEPS[howTab];
  // Section theme follows the toggle: score = purple on cream, player = green on black
  const isPlayer = howTab === "player";
  const accent = isPlayer ? "#00C805" : "#7B62F6";
  const sectionBg = isPlayer ? "#0A0A0A" : "#F7F5F0";
  const themeSwap = "background 0.6s cubic-bezier(0.22, 1, 0.36, 1), color 0.6s ease";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Navbar />
      <div style={{ position: "relative", overflowX: "clip" }}>
        <Hero />
        {/* Players image centred at the hero/black boundary. bottom compensates
            for the shortened band below so the heads stay halfway down the
            purple hero — don't re-anchor without re-measuring. Height is capped
            by viewport width (115vw keeps the natural 1.855 ratio at roughly
            full-bleed) and maxWidth:none defeats preflight's img max-width:100%,
            which was squishing the picture on narrow screens. The wrapper's
            overflow-x clip swallows the side bleed. */}
        <img
          src="/brand/hero-players.webp"
          alt="Footballers mid-play"
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-55%)",
            height: "min(500px, 115vw)",
            width: "auto",
            maxWidth: "none",
            zIndex: 15,
            pointerEvents: "none",
          }}
        />
        {/* Rounded black band easing hero into the pool section — kept short so
            the accumulator figure owns the black area's visual midpoint */}
        <div
          className="rounded-t-[50px]"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,1) 30%)",
            height: 180,
            width: "100%",
            marginTop: -100,
            position: "relative",
            zIndex: 20,
          }}
        />
      </div>

      <AccumulatorPool />

      {/* Rounded band into How-it-works — follows the section theme */}
      <div
        className="rounded-t-[50px]"
        style={{ background: sectionBg, height: 90, width: "100%", marginTop: -60, position: "relative", zIndex: 30, transition: themeSwap }}
      />
      <section
        id="how-it-works"
        style={{
          background: sectionBg,
          minHeight: 600,
          width: "100%",
          position: "relative",
          overflow: "hidden",
          paddingTop: 52,
          paddingBottom: 150, // +50 for the statement section's rounded lip overlap
          transition: themeSwap,
        }}
      >
        {/* Brand glow orbs — recolor with the active market theme */}
        <div style={{ position: "absolute", top: "50%", left: "5%", width: 300, height: 300, borderRadius: "50%", background: accent, filter: "blur(120px)", opacity: isPlayer ? 0.22 : 0.38, pointerEvents: "none", transition: "background 0.5s ease, opacity 0.5s ease" }} />
        <div style={{ position: "absolute", top: "55%", right: "5%", width: 280, height: 280, borderRadius: "50%", background: accent, filter: "blur(110px)", opacity: isPlayer ? 0.18 : 0.32, pointerEvents: "none", transition: "background 0.5s ease, opacity 0.5s ease" }} />
        <div style={{ position: "absolute", bottom: "5%", left: "40%", width: 260, height: 260, borderRadius: "50%", background: accent, filter: "blur(100px)", opacity: isPlayer ? 0.15 : 0.28, pointerEvents: "none", transition: "background 0.5s ease, opacity 0.5s ease" }} />

        {/* Player-perps mode: the two new half-faces lean in from the section
            edges — Haaland (purple-lit) left, Gyökeres (green-lit) right. */}
        <img
          src="/brand/face-haaland.webp"
          alt=""
          aria-hidden
          className="side-face"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            height: "min(78%, 640px)",
            width: "auto",
            zIndex: 0,
            pointerEvents: "none",
            transform: isPlayer ? "translate(-52%, -50%)" : "translate(-108%, -50%)",
            opacity: isPlayer ? 0.9 : 0,
            transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.15s, opacity 0.7s ease 0.15s",
            filter: "drop-shadow(0 0 70px rgba(123,98,246,0.28))",
            WebkitMaskImage:
              "linear-gradient(to right, black 70%, transparent), linear-gradient(to bottom, black 78%, transparent)",
            maskImage:
              "linear-gradient(to right, black 70%, transparent), linear-gradient(to bottom, black 78%, transparent)",
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        />
        <img
          src="/brand/face-gyokeres.webp"
          alt=""
          aria-hidden
          className="side-face"
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            height: "min(78%, 640px)",
            width: "auto",
            zIndex: 0,
            pointerEvents: "none",
            transform: isPlayer ? "translate(52%, -50%)" : "translate(108%, -50%)",
            opacity: isPlayer ? 0.9 : 0,
            transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.25s, opacity 0.7s ease 0.25s",
            filter: "drop-shadow(0 0 70px rgba(0,200,5,0.25))",
            WebkitMaskImage:
              "linear-gradient(to left, black 70%, transparent), linear-gradient(to bottom, black 78%, transparent)",
            maskImage:
              "linear-gradient(to left, black 70%, transparent), linear-gradient(to bottom, black 78%, transparent)",
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        />

        <div className="max-w-6xl mx-auto px-6 text-center" style={{ position: "relative", zIndex: 1 }}>
          <h2
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "clamp(2.8rem, 6vw, 5rem)",
              fontWeight: 700,
              color: isPlayer ? "#F7F5F0" : "#0a0a0a",
              letterSpacing: "-0.03em",
              lineHeight: 1.0,
              transition: "color 0.6s ease",
            }}
          >
            <RevealWords text="How it works." />
          </h2>
        </div>
        <Reveal delay={150}>
          <div className="flex justify-center mt-12" style={{ position: "relative", zIndex: 1 }}>
            <MarketToggle active={howTab} onChange={setHowTab} dark={isPlayer} />
          </div>
        </Reveal>

        {/* Steps + demo. Score mode: steps beside the proximity grid.
            Player mode: the deck owns the center, numbered phrases beneath. */}
        {howTab === "score" ? (
          <div
            className="max-w-6xl mx-auto px-6 mt-16 grid md:grid-cols-2 gap-14 items-center"
            style={{ position: "relative", zIndex: 1 }}
          >
            <div className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <Reveal key={`${howTab}-${s.title}`} delay={i * 120} from="left">
                  <div className="card-diagonal-sm glass flex items-start gap-5 px-7 py-6">
                    <span
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: "2rem",
                        fontWeight: 700,
                        lineHeight: 1,
                        color: accent,
                        minWidth: "2.2rem",
                      }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <h3
                        style={{
                          fontFamily: "'Fraunces', serif",
                          fontSize: "1.15rem",
                          fontWeight: 600,
                          color: "#111210",
                          marginBottom: 6,
                        }}
                      >
                        {s.title}
                      </h3>
                      <p
                        style={{
                          fontFamily: "'Clash Display', sans-serif",
                          fontSize: "0.9rem",
                          lineHeight: 1.65,
                          color: "rgba(17,18,16,0.55)",
                        }}
                      >
                        {s.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="flex flex-col items-center gap-8">
              <Reveal from="right">
                <MiniProximityGrid />
              </Reveal>
              <Button3D color="purple" size="lg" onClick={() => (window.location.href = "/markets")}>
                Enter the markets
              </Button3D>
            </div>
          </div>
        ) : (
          <div
            className="max-w-5xl mx-auto px-6 mt-14 flex flex-col items-center gap-12"
            style={{ position: "relative", zIndex: 1 }}
          >
            {/* Deck front and center */}
            <Reveal>
              <PlayerCardFan />
            </Reveal>

            {/* Steps: number + one phrase, in a row under the deck */}
            <div className="flex flex-wrap justify-center" style={{ gap: "clamp(2rem, 7vw, 5.5rem)" }}>
              {steps.map((s, i) => (
                <Reveal key={s.title} delay={250 + i * 160}>
                  <div className="flex flex-col items-center gap-3">
                    <span
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontSize: "2.6rem",
                        fontWeight: 700,
                        lineHeight: 1,
                        color: accent,
                        textShadow: "0 0 26px rgba(0,200,5,0.4)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Clash Display', sans-serif",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#F7F5F0",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.title}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={650}>
              <Button3D color="green" size="lg" onClick={() => (window.location.href = "/markets")}>
                Enter the markets
              </Button3D>
            </Reveal>
          </div>
        )}
      </section>

      <ProximityStatement />
      <DeckShowcase />
      <ClubMarquee />
      <Footer />
    </div>
  );
}
