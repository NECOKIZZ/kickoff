import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * The site-wide link preview (og:image / twitter:image): the landing hero in
 * 1200×630. Purple grid, "Beat the pack, Keep the stack.", "Proximity
 * Markets." and the three players rising out of a black band.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "Kickoff: Proximity Markets. Beat the pack, keep the stack.";

const ASSETS = path.join(process.cwd(), "src/assets");

// Landing hero is #7b62f6 at 70% over cream; flattened here (no alpha in og).
const HERO_BG = "#A08EF4";

export async function renderOgImage(): Promise<ImageResponse> {
  const [italic, bold, clash, players] = await Promise.all([
    readFile(path.join(ASSETS, "og/Fraunces-Italic.woff")),
    readFile(path.join(ASSETS, "og/Fraunces-Bold.woff")),
    readFile(path.join(ASSETS, "pnl-card/fonts/ClashDisplay-Semibold.ttf")),
    readFile(path.join(ASSETS, "og/hero-players.png")),
  ]);
  const playersSrc = `data:image/png;base64,${players.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          background: HERO_BG,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          overflow: "hidden",
        }}
      >
        {/* Top bar: logo + wordmark, domain */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "36px 48px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 500 502">
              <circle cx="400" cy="100" r="100" fill="white" />
              <path d="M150 0L500 502H327.5L150 251.5V500H0V0H150Z" fill="white" />
            </svg>
            <span style={{ fontFamily: "Clash", fontSize: 32, color: "white", letterSpacing: "-0.01em" }}>Kickoff</span>
          </div>
          <span style={{ fontFamily: "Clash", fontSize: 24, color: "rgba(255,255,255,0.85)" }}>kickoff.cash</span>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 14 }}>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontStyle: "italic", fontSize: 40, color: "rgba(255,255,255,0.88)" }}>
            Beat the pack,&nbsp;
            <span style={{ fontStyle: "normal", fontWeight: 700, color: "white" }}>Keep the stack.</span>
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 700,
              fontSize: 104,
              lineHeight: 1,
              letterSpacing: "-0.025em",
              color: "white",
              marginTop: 6,
            }}
          >
            Proximity Markets.
          </div>
        </div>

        {/* Players, centred like the landing page, rising out of the band */}
        <img
          src={playersSrc}
          width={566}
          height={305}
          style={{ position: "absolute", bottom: 64, left: 289 }}
        />

        {/* Black band with the one-line pitch */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 112,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 26,
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, #000 45%)",
          }}
        >
          <span style={{ fontFamily: "Clash", fontSize: 26, color: "white" }}>
            Call the score of every Premier League match. Closer calls earn more.
          </span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Fraunces", data: italic, weight: 400, style: "italic" },
        { name: "Fraunces", data: bold, weight: 700, style: "normal" },
        { name: "Clash", data: clash, weight: 600, style: "normal" },
      ],
    },
  );
}
