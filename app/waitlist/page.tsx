"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button3D } from "@/ui/Button3D";
import { Logo } from "@/ui/Logo";

/**
 * Launch gate page. Two doors in one glass card: join the waitlist (email),
 * or redeem an invite code and go straight in. Purple environment like the
 * landing hero — this page is part of the public "site", not the app.
 */
export default function WaitlistPage() {
  const router = useRouter();

  // Waitlist form
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  // Invite form
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [codeErr, setCodeErr] = useState<string | null>(null);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (joining) return;
    setJoinErr(null);
    setJoining(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setJoinErr(b?.error ?? "something went wrong, try again");
        return;
      }
      setJoined(true);
    } catch {
      setJoinErr("network error, try again");
    } finally {
      setJoining(false);
    }
  }

  async function redeem(e: FormEvent) {
    e.preventDefault();
    if (redeeming) return;
    setCodeErr(null);
    setRedeeming(true);
    try {
      const res = await fetch("/api/invite/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setCodeErr(b?.error ?? "code invalid or already used");
        return;
      }
      window.location.href = "/markets";
    } catch {
      setCodeErr("network error, try again");
    } finally {
      setRedeeming(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.12)",
    color: "#ffffff",
    fontSize: "0.95rem",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "'Clash Display', sans-serif",
    fontSize: "0.62rem",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.7)",
  };

  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "#7b62f6b3" }}
    >
      {/* Background grid texture — same recipe as the landing hero */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Header — logo home link only */}
      <header className="relative flex items-center justify-between px-6 sm:px-10 py-5" style={{ zIndex: 2 }}>
        <Link href="/" aria-label="Kickoff home">
          <Logo variant="white" size={28} />
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/docs"
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.8)",
            }}
          >
            Docs
          </Link>
          <Link
            href="/"
            style={{
              fontFamily: "'Clash Display', sans-serif",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.8)",
            }}
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-16" style={{ zIndex: 2 }}>
        <p
          style={{
            fontFamily: "'Fraunces', serif",
            fontStyle: "italic",
            color: "rgba(255,255,255,0.85)",
            fontSize: "clamp(1rem, 2vw, 1.35rem)",
            marginBottom: 10,
          }}
        >
          the pitch is being marked out
        </p>
        <h1
          className="text-center"
          style={{
            color: "#ffffff",
            fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
            maxWidth: 720,
            marginBottom: 28,
          }}
        >
          Get in before kickoff.
        </h1>
        <p
          className="text-center"
          style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.95rem", maxWidth: 460, marginBottom: 40 }}
        >
          Kickoff is opening in waves. Join the waitlist and we&apos;ll send you an
          invite code. Already have one? You&apos;re thirty seconds from
          your first market.
        </p>

        {/* The glass card — two doors */}
        <div
          className="glass-dark w-full"
          style={{ maxWidth: 460, borderRadius: "24px 4px 24px 4px", padding: "28px 28px 32px" }}
        >
          {joined ? (
            <div className="text-center py-6">
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: "1.4rem", fontWeight: 600, color: "#ffffff", marginBottom: 8 }}>
                You&apos;re on the list.
              </p>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.85rem" }}>
                Watch your inbox. Codes go out in waves as we open up.
              </p>
            </div>
          ) : (
            <form onSubmit={join} className="flex flex-col gap-3">
              <label htmlFor="wl-email" style={labelStyle}>
                Join the waitlist
              </label>
              <input
                id="wl-email"
                type="email"
                required
                placeholder="you@club.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              {joinErr && (
                <p style={{ color: "#ffd7de", fontSize: "0.78rem" }}>{joinErr}</p>
              )}
              <Button3D color="purple" size="lg" type="submit" disabled={joining}>
                {joining ? "Joining…" : "Save my spot"}
              </Button3D>
            </form>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.18)" }} />
            <span style={{ ...labelStyle, letterSpacing: "0.2em" }}>or</span>
            <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.18)" }} />
          </div>

          <form onSubmit={redeem} className="flex flex-col gap-3">
            <label htmlFor="wl-code" style={labelStyle}>
              Have an invite code?
            </label>
            <input
              id="wl-code"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="KICK-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ ...inputStyle, fontFamily: "'Clash Display', sans-serif", letterSpacing: "0.08em" }}
            />
            {codeErr && <p style={{ color: "#ffd7de", fontSize: "0.78rem" }}>{codeErr}</p>}
            <Button3D color="green" size="lg" type="submit" disabled={redeeming}>
              {redeeming ? "Checking…" : "Enter Kickoff"}
            </Button3D>
          </form>
        </div>

        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.72rem", marginTop: 28 }}>
          Testnet season. Play money, real football.
        </p>
      </div>
    </main>
  );
}
