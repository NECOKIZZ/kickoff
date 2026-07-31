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
            color: "rgba(255,255,255,0.85)",
            fontSize: "clamp(1.1rem, 2.4vw, 1.9rem)",
            fontWeight: 400,
            fontStyle: "italic",
            lineHeight: 1.2,
            marginBottom: "0.35em",
          }}
        >
          Beat the pack,{" "}
          <span style={{ color: "var(--color-kickoff-green)", fontStyle: "normal", fontWeight: 600 }}>
            Keep the stack.
          </span>
        </p>

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
  const [contributions, setContributions] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/accumulator")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.balance !== undefined) {
            setBalance(d.balance);
            setContributions(d.contributions ?? null);
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000); // keep it live
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const stats = [
    { value: "5%", label: "of every settled pool feeds it" },
    { value: "Top 10", label: "on the season board split it" },
    { value: contributions === null ? "—" : String(contributions), label: "contributions so far" },
  ];

  return (
    <section
      style={{
        background: "#000",
        minHeight: 560,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        paddingTop: 160,
        paddingBottom: 90,
        marginTop: -120,
        position: "relative",
        zIndex: 25,
        overflow: "hidden",
      }}
    >
      {/* brand glow behind the figure */}
      <div style={{ position: "absolute", top: "45%", left: "50%", transform: "translate(-50%,-50%)", width: 520, height: 520, borderRadius: "50%", background: "#00C805", filter: "blur(180px)", opacity: 0.1, pointerEvents: "none" }} />

      <div className="max-w-4xl mx-auto px-6 w-full" style={{ position: "relative" }}>
        <p
          style={{
            fontFamily: "'Clash Display', sans-serif",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--color-kickoff-green)",
            marginBottom: "1.4rem",
          }}
        >
          Season 2026–27
        </p>
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

        {/* Stat tiles */}
        <div className="grid sm:grid-cols-3 gap-3 mt-14">
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "20px 4px 20px 4px",
                padding: "22px 18px",
              }}
            >
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.7rem", fontWeight: 700, color: "var(--color-kickoff-green)", lineHeight: 1 }}>
                {s.value}
              </p>
              <p style={{ fontFamily: "'Clash Display', sans-serif", fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.5 }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Score / Player toggle — 3D per brand (buttons are strictly always 3D) ──────

function MarketToggle({
  active,
  onChange,
}: {
  active: "score" | "player";
  onChange: (t: "score" | "player") => void;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 12 }}>
      {(["score", "player"] as const).map((tab) => {
        const isActive = active === tab;
        const isScoreTab = tab === "score";
        const bg = isScoreTab ? "#00C805" : "#7B62F6";
        const shadow = isScoreTab ? "#008C04" : "#4e3cb5";
        const text = isScoreTab ? "#111210" : "#ffffff";
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
              background: isActive ? bg : "rgba(17,18,16,0.06)",
              color: isActive ? text : "rgba(17,18,16,0.45)",
              border: isActive ? `1px solid ${shadow}` : "1px solid rgba(17,18,16,0.14)",
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
      body: "Choose the final score you see coming — 2–1, 0–0, anything. Stake USDC on it before kickoff.",
    },
    {
      title: "Close still pays",
      body: "This isn't yes/no. Payouts scale with how close you land — 2–1 when it ends 2–0 still earns.",
    },
    {
      title: "Split the pool",
      body: "At full time the pool splits by stake × accuracy. Nail it exactly and you take the biggest share.",
    },
  ],
  player: [
    {
      title: "Call the points line",
      body: "Predict a player's fantasy points for the matchweek — goals, assists, cards, the lot.",
    },
    {
      title: "Distance decides",
      body: "The nearer your call to the player's real score, the bigger your cut. No over/under coin-flip.",
    },
    {
      title: "Climb the season board",
      body: "Every settled market feeds your precision rating — and the accumulator pool waiting at season's end.",
    },
  ],
};

/** Mini 5×5 grid demo — the proximity mechanic, made touchable. */
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
              aria-label={`Score ${h}–${a}`}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: isPick ? "1.5px solid #00C805" : "1px solid rgba(17,18,16,0.12)",
                background: isPick
                  ? "#00C805"
                  : `rgba(0, 200, 5, ${glow * 0.35})`,
                color: isPick ? "#111210" : "rgba(17,18,16,0.65)",
                fontFamily: "'Inter', sans-serif",
                fontSize: "0.66rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: isPick ? "0 0 18px rgba(0,200,5,0.4)" : "none",
              }}
            >
              {h}–{a}
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
        Tap a score — the glow is your payout, fading with distance.
      </p>
    </div>
  );
}

/** Placeholder player-card fan — interiors get replaced by the designed cards. */
function PlayerCardFan() {
  const cards = [
    { pos: "ST", line: "8.5", rot: -8, x: -70, accent: "#00C805" },
    { pos: "AM", line: "6.0", rot: 0, x: 0, accent: "#7B62F6" },
    { pos: "RW", line: "7.5", rot: 8, x: 70, accent: "#00C805" },
  ];
  return (
    <div style={{ position: "relative", height: 320, width: 320 }}>
      {cards.map((c, i) => (
        <div
          key={i}
          className="glass"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 180,
            height: 250,
            transform: `translate(calc(-50% + ${c.x}px), -50%) rotate(${c.rot}deg)`,
            borderRadius: "26px 6px 26px 6px",
            background: "rgba(255,255,255,0.5)",
            border: `1px solid ${c.accent}33`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            zIndex: i === 1 ? 2 : 1,
            boxShadow: i === 1 ? `0 18px 44px rgba(0,0,0,0.14), 0 0 0 1px ${c.accent}22` : "0 10px 28px rgba(0,0,0,0.1)",
          }}
        >
          {/* silhouette placeholder */}
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${c.accent}44, rgba(17,18,16,0.12))`,
            }}
          />
          <div style={{ width: 90, height: 10, borderRadius: 99, background: "rgba(17,18,16,0.12)" }} />
          <div style={{ width: 60, height: 8, borderRadius: 99, background: "rgba(17,18,16,0.08)" }} />
          <div className="flex items-center gap-2 mt-1">
            <span
              style={{
                fontFamily: "'Clash Display', sans-serif",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "rgba(17,18,16,0.4)",
              }}
            >
              {c.pos}
            </span>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 700, color: c.accent }}>
              {c.line}
            </span>
          </div>
        </div>
      ))}
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
  const [howTab, setHowTab] = useState<"score" | "player">("score");
  const steps = HOW_STEPS[howTab];
  const accent = howTab === "score" ? "#00C805" : "#7B62F6";

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
          <MarketToggle active={howTab} onChange={setHowTab} />
        </div>

        {/* Steps + interactive proximity demo */}
        <div
          className="max-w-6xl mx-auto px-6 mt-16 grid md:grid-cols-2 gap-14 items-center"
          style={{ position: "relative", zIndex: 1 }}
        >
          <div className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <div
                key={`${howTab}-${s.title}`}
                className="card-diagonal-sm glass flex items-start gap-5 px-7 py-6"
              >
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
            ))}
          </div>

          <div className="flex flex-col items-center gap-8">
            {howTab === "score" ? (
              <MiniProximityGrid />
            ) : (
              <div className="flex flex-col items-center">
                <PlayerCardFan />
                <p
                  style={{
                    fontFamily: "'Clash Display', sans-serif",
                    fontSize: "0.75rem",
                    color: "rgba(17,18,16,0.45)",
                    textAlign: "center",
                    marginTop: 6,
                    maxWidth: 300,
                    lineHeight: 1.6,
                  }}
                >
                  Every matchweek drops a fresh deck of player cards — pick yours, call the line.
                </p>
              </div>
            )}
            <Button3D color={howTab === "score" ? "green" : "purple"} size="lg" onClick={() => (window.location.href = "/markets")}>
              Enter the markets
            </Button3D>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
