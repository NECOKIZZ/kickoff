// Downloads EPL club crests from football-data.org's public crest CDN and
// converts them to small webps for the landing marquee.
// Run: node scripts/fetch-crests.mjs
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { CLUBS } from "../src/ui/landing/clubs.data.mjs";

const OUT = new URL("../public/brand/clubs/", import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

for (const club of CLUBS) {
  const url = `https://crests.football-data.org/${club.fdId}.png`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = `${OUT}${club.slug}.webp`;
    await sharp(buf)
      .resize(120, 120, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(out);
    console.log(`ok  ${club.slug}`);
  } catch (e) {
    // Some crests only exist as svg — save svg verbatim as fallback.
    try {
      const res = await fetch(`https://crests.football-data.org/${club.fdId}.svg`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(`${OUT}${club.slug}.svg`, Buffer.from(await res.arrayBuffer()));
      console.log(`ok  ${club.slug} (svg)`);
    } catch (e2) {
      console.error(`FAIL ${club.slug}: ${e.message} / ${e2.message}`);
    }
  }
}
