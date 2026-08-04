"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type MarketSummary } from "@/ui/clientApi";
import { cardForPlayer, type PlayerCard } from "@/ui/players/playerCards";

/**
 * Player Perps deck — coverflow carousel. One card holds the center, sharp
 * and glowing in its club color; neighbours fall away blurred on either
 * side. The FOCUSED card is clickable — it opens the player's market; a
 * blurred card pulls forward first. Arrows/dots use the theme accent
 * (purple on light, green on dark); the glow stays club-colored.
 *
 * Controlled: parent owns `focus` (the deck board's sidebar also steers it).
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const CARD_W = 264; // 1074×1504 art → 0.714 aspect
const CARD_H = 370;

// ── Card face — designed art, or a generated card for unmatched players ───────

function CardFace({
  card,
  playerName,
  focused,
}: {
  card: PlayerCard | null;
  playerName: string;
  focused: boolean;
}) {
  if (card) {
    return (
      <img
        src={card.img}
        alt={card.name}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          userSelect: "none",
        }}
      />
    );
  }
  // Placeholder deck-back for players without designed art yet
  const initials = playerName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "linear-gradient(160deg, #1C1D1A 0%, #111210 60%)",
        border: "1px solid rgba(0,200,5,0.25)",
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, rgba(0,200,5,0.35), rgba(123,98,246,0.35))",
          fontFamily: "'Fraunces', serif",
          fontSize: "2rem",
          fontWeight: 700,
          color: "#F7F5F0",
        }}
      >
        {initials}
      </div>
      <p
        style={{
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: "#F7F5F0",
          textAlign: "center",
          padding: "0 18px",
          letterSpacing: "0.02em",
        }}
      >
        {playerName}
      </p>
      <p
        style={{
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: focused ? "var(--ui-accent)" : "rgba(247,245,240,0.35)",
        }}
      >
        Card drops soon
      </p>
    </div>
  );
}

// ── Custom 3D arrow — theme accent face ────────────────────────────────────────

function ArrowButton({ dir, onClick, disabled }: { dir: "left" | "right"; onClick: () => void; disabled?: boolean }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      aria-label={dir === "left" ? "Previous player" : "Next player"}
      onClick={onClick}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: 54,
        height: 54,
        borderRadius: 16,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        // 3D per brand — accent face, deep-accent ledge
        background: disabled ? "var(--muted)" : "var(--ui-accent)",
        border: `1px solid ${disabled ? "var(--border)" : "var(--ui-accent-deep)"}`,
        boxShadow: disabled
          ? "none"
          : pressed
          ? "0 1px 0 var(--ui-accent-deep), inset 0 1px 2px rgba(0,0,0,0.2)"
          : "0 5px 0 var(--ui-accent-deep), 0 8px 18px color-mix(in srgb, var(--ui-accent) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)",
        transform: pressed ? "translateY(4px)" : "translateY(0)",
        transition: `transform 0.12s ${EASE}, box-shadow 0.12s ${EASE}`,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ transform: dir === "left" ? "scaleX(-1)" : undefined }}>
        <path d="M4 10h11m0 0-4.5-4.5M15 10l-4.5 4.5" stroke="var(--ui-accent-contrast)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// ── Carousel ───────────────────────────────────────────────────────────────────

export function PlayerCardCarousel({
  markets,
  focus,
  onFocusChange,
}: {
  markets: MarketSummary[];
  focus: number;
  onFocusChange: (i: number) => void;
}) {
  const router = useRouter();
  const [dealt, setDealt] = useState(false); // entrance: cards deal out from the center
  const touchX = useRef<number | null>(null);
  const n = markets.length;

  useEffect(() => {
    const t = setTimeout(() => setDealt(true), 60);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback(
    (delta: number) => onFocusChange((focus + delta + n) % n),
    [focus, n, onFocusChange],
  );

  // Arrow keys steer the deck
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (n === 0) return null;
  const focusedMarket = markets[Math.min(focus, n - 1)];
  const focusedCard = cardForPlayer(focusedMarket.playerName);
  const accent = focusedCard?.accent ?? "#00C805";

  return (
    <div
      className="flex flex-col items-center"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Stage */}
      <div
        style={{
          position: "relative",
          height: CARD_H + 70,
          width: "100%",
          maxWidth: 760,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: 1200,
          overflow: "visible",
        }}
      >
        {/* accent glow pooling under the focused card */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 6,
            left: "50%",
            transform: "translateX(-50%)",
            width: CARD_W * 1.25,
            height: 60,
            borderRadius: "50%",
            background: accent,
            filter: "blur(48px)",
            opacity: 0.4,
            transition: `background 0.6s ${EASE}`,
            pointerEvents: "none",
          }}
        />

        {markets.map((m, idx) => {
          // circular offset → [-n/2, n/2] so the deck wraps around
          let off = idx - focus;
          if (off > n / 2) off -= n;
          if (off < -n / 2) off += n;
          const abs = Math.abs(off);
          const visible = abs <= 2;
          const card = cardForPlayer(m.playerName);
          const isFocus = off === 0;
          return (
            <button
              key={m.id}
              aria-label={isFocus ? `Open ${m.playerName ?? m.title}'s market` : m.playerName ?? m.title}
              aria-current={isFocus}
              onClick={() => (isFocus ? router.push(`/markets/${m.id}`) : onFocusChange(idx))}
              className={isFocus ? "ppc-float" : undefined}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: CARD_W,
                height: CARD_H,
                marginLeft: -CARD_W / 2,
                marginTop: -CARD_H / 2 - 14,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                zIndex: 10 - abs,
                pointerEvents: visible ? "auto" : "none",
                transform: dealt
                  ? `translateX(${off * 168}px) translateZ(${-abs * 110}px) rotateY(${off * -9}deg) scale(${1 - abs * 0.14})`
                  : "translateX(0) translateZ(-160px) scale(0.6)",
                opacity: dealt ? (visible ? (abs === 2 ? 0.45 : 1) : 0) : 0,
                filter: isFocus ? "none" : `blur(${Math.min(abs * 5, 10)}px) saturate(0.75) brightness(0.8)`,
                transition: `transform 0.65s ${EASE}, opacity 0.5s ease, filter 0.55s ${EASE}`,
                transformStyle: "preserve-3d",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 26,
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: isFocus
                    ? `0 24px 60px rgba(0,0,0,0.35), 0 0 0 1.5px ${card?.accent ?? "#00C805"}66, 0 0 44px ${card?.accent ?? "#00C805"}55`
                    : "0 14px 34px rgba(0,0,0,0.3)",
                  transition: `box-shadow 0.6s ${EASE}`,
                }}
              >
                <CardFace card={card} playerName={m.playerName ?? m.title} focused={isFocus} />
                {/* shine sweep across the freshly-focused card */}
                {isFocus && <span key={m.id} className="ppc-shine" aria-hidden />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Arrows + dots */}
      <div className="flex items-center gap-6" style={{ marginTop: 6 }}>
        <ArrowButton dir="left" onClick={() => go(-1)} disabled={n < 2} />
        <div className="flex items-center gap-2">
          {markets.map((m, idx) => (
            <button
              key={m.id}
              aria-label={`Go to ${m.playerName ?? m.title}`}
              onClick={() => onFocusChange(idx)}
              style={{
                width: idx === focus ? 22 : 7,
                height: 7,
                borderRadius: 99,
                border: "none",
                cursor: "pointer",
                background: idx === focus ? "var(--ui-accent)" : "var(--border)",
                transition: `all 0.35s ${EASE}`,
                padding: 0,
              }}
            />
          ))}
        </div>
        <ArrowButton dir="right" onClick={() => go(1)} disabled={n < 2} />
      </div>

      <p
        style={{
          marginTop: 10,
          fontFamily: "'Clash Display', sans-serif",
          fontSize: "0.6rem",
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
        }}
      >
        Tap the card to open the market
      </p>
    </div>
  );
}
