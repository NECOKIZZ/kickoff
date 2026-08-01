// Crops the left/right players out of hero-players.webp so they can slide in
// from the section edges in player-perps mode. Run: node scripts/crop-players.mjs
import sharp from "sharp";

const SRC = "public/brand/hero-players.webp";
const m = await sharp(SRC).metadata();
console.log("src", m.width, m.height);

const lw = Math.round(m.width * 0.4);
const rw = Math.round(m.width * 0.34);
await sharp(SRC)
  .extract({ left: 0, top: 0, width: lw, height: m.height })
  .webp({ quality: 85 })
  .toFile("public/brand/player-left.webp");
await sharp(SRC)
  .extract({ left: m.width - rw, top: 0, width: rw, height: m.height })
  .webp({ quality: 85 })
  .toFile("public/brand/player-right.webp");
console.log("done: player-left.webp player-right.webp");
