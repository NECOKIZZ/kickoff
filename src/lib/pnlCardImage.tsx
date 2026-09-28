import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { PnlCardView } from "@/lib/pnlCard";
import { clubFor } from "@/ui/markets/clubs";

/**
 * Renders the PnL share card (the 2026-09 design: black card, win = green
 * goal-net photo, loss = red-card photo). Laid out on the design's native
 * 2000×1125 grid and scaled to the requested width, so every number below
 * is a measurement off the design file.
 */

export const CARD_W = 2000;
export const CARD_H = 1125;

const GREEN = "#02F007";
const RED = "#EE0104";
const LABEL = "#D2D2D2";

const ASSETS = path.join(process.cwd(), "src/assets/pnl-card");
const PHOTOS = path.join(process.cwd(), "public/brand/pnl");

const readB64 = async (file: string, mime: string) =>
  `data:${mime};base64,${(await readFile(file)).toString("base64")}`;

let fontsP: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 900 }[]> | null = null;
function fonts() {
  fontsP ??= Promise.all([
    readFile(path.join(ASSETS, "fonts/ClashDisplay-Regular.ttf")).then((data) => ({ name: "Clash", data, weight: 400 as const })),
    readFile(path.join(ASSETS, "fonts/ClashDisplay-Medium.ttf")).then((data) => ({ name: "Clash", data, weight: 500 as const })),
    readFile(path.join(ASSETS, "fonts/ClashDisplay-Semibold.ttf")).then((data) => ({ name: "Clash", data, weight: 600 as const })),
    readFile(path.join(ASSETS, "fonts/Fraunces-Black-144.ttf")).then((data) => ({ name: "Fraunces", data, weight: 900 as const })),
  ]).catch((e) => {
    fontsP = null; // don't cache a failed read
    throw e;
  });
  return fontsP;
}

const photoCache = new Map<string, Promise<string>>();
function photo(tone: PnlCardView["tone"]) {
  let p = photoCache.get(tone);
  if (!p) {
    p = readB64(path.join(PHOTOS, `${tone}.jpg`), "image/jpeg");
    photoCache.set(tone, p);
  }
  return p;
}

async function crest(team: string | null): Promise<string | null> {
  const club = clubFor(team);
  if (!club) return null;
  try {
    return await readB64(path.join(ASSETS, `crests/${club.slug}.png`), "image/png");
  } catch {
    return null;
  }
}

/** Width units of an amount string: digits/$ ≈ 1, separators much narrower. */
const amountUnits = (s: string) => [...s].reduce((n, c) => n + (c === "," || c === "." ? 0.4 : 1), 0);

export async function renderPnlCard(view: PnlCardView, width = 1200): Promise<ImageResponse> {
  const k = width / CARD_W;
  const u = (n: number) => n * k;
  const [fontData, bg, homeCrest, awayCrest] = await Promise.all([
    fonts(),
    photo(view.tone),
    crest(view.home),
    crest(view.away),
  ]);

  const color = view.tone === "win" ? GREEN : RED;
  // "$190" sits at 343px in the design; longer amounts shrink to stay left of the photo.
  const size = Math.min(343, (343 * 5.2) / amountUnits(view.amount));
  const r = size / 343;

  const stat = (label: string, value: string, left: number) => (
    <div style={{ position: "absolute", left: u(left), top: u(917), display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: "Clash", fontWeight: 400, fontSize: u(37), letterSpacing: u(2.4), color: LABEL, lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ fontFamily: "Clash", fontWeight: 500, fontSize: u(71), color: "#fff", lineHeight: 1, marginTop: u(3), letterSpacing: u(0.5) }}>
        {value}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#000",
          borderTopRightRadius: u(120),
          borderBottomLeftRadius: u(120),
          overflow: "hidden",
        }}
      >
        {/* Photo, pre-tinted, fading into the black on its left edge */}
        <img src={bg} width={u(910)} height={u(1125)} style={{ position: "absolute", left: u(1090), top: 0 }} />
        <div
          style={{
            position: "absolute",
            left: u(1088),
            top: 0,
            width: u(340),
            height: "100%",
            backgroundImage: "linear-gradient(to right, #000 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Kickoff mark */}
        <svg
          width={u(112)}
          height={u(112 * (502 / 500))}
          viewBox="0 0 500 502"
          style={{ position: "absolute", left: u(121), top: u(97) }}
        >
          <circle cx="400" cy="100" r="100" fill="#fff" />
          <path d="M150 0L500 502H327.5L150 251.5V500H0V0H150Z" fill="#fff" />
        </svg>

        {/* Fixture / player + crests */}
        <div style={{ position: "absolute", left: u(121), top: u(275), height: u(113), display: "flex", alignItems: "center" }}>
          <div style={{ fontFamily: "Clash", fontWeight: 500, fontSize: u(82), color: "#fff", lineHeight: 1, letterSpacing: u(5.2), marginTop: u(12) }}>
            {view.headline}
          </div>
          {homeCrest && <img src={homeCrest} width={u(113)} height={u(113)} style={{ marginLeft: u(38) }} />}
          {awayCrest && <img src={awayCrest} width={u(113)} height={u(113)} style={{ marginLeft: u(homeCrest ? 15 : 38) }} />}
        </div>

        {/* Signed PnL — the sign is a drawn block (as in the design), the amount is Fraunces Black */}
        <div style={{ position: "absolute", left: u(view.sign === "-" ? 112 : 118), top: u(436 + (343 - size) / 2), display: "flex", alignItems: "center" }}>
          {view.sign === "+" && (
            <div style={{ position: "relative", display: "flex", width: u(147 * r), height: u(145 * r), marginTop: u(14 * r), marginRight: u(16 * r) }}>
              <div style={{ position: "absolute", left: 0, top: u(51.5 * r), width: u(147 * r), height: u(42 * r), background: color }} />
              <div style={{ position: "absolute", left: u(52.5 * r), top: 0, width: u(42 * r), height: u(145 * r), background: color }} />
            </div>
          )}
          {view.sign === "-" && (
            <div style={{ display: "flex", width: u(73 * r), height: u(26 * r), marginTop: u(72 * r), marginRight: u(10 * r), background: color }} />
          )}
          <div style={{ fontFamily: "Fraunces", fontWeight: 900, fontSize: u(size), color, lineHeight: 1, letterSpacing: u(-4 * r) }}>
            {view.amount}
          </div>
        </div>

        {stat("RESULT", view.result, 121)}
        {stat("PREDICTION", view.prediction, 369)}
        {stat("RANK", `#${view.rank} of ${view.of}`, 734)}
      </div>
    ),
    {
      width: Math.round(width),
      height: Math.round(u(CARD_H)),
      fonts: fontData,
      headers: { "cache-control": "public, max-age=300, s-maxage=86400" },
    },
  );
}
