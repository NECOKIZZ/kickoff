---
name: kickoff-video-workflow
description: Step-by-step process for producing a Kickoff video with HyperFrames — where projects live, brief and storyboard, build, verification gates, render specs per platform, and hand-off. Use when starting, editing, or rendering any Kickoff video, together with kickoff-video-brand and kickoff-video-product.
---

# Kickoff video workflow

HyperFrames (HTML + a paused GSAP timeline, rendered in headless Chrome) is the video framework. It ships its own skills — **use them for mechanics, use the Kickoff skills for what to say and how it should look**:

| Need | Read |
|---|---|
| Entry point, routing, project resume | `hyperframes` |
| Composition contract, `data-*` attributes, determinism rules | `hyperframes-core` |
| Motion rules, blueprints, transitions, GSAP/Lottie/Three adapters | `hyperframes-animation` |
| Palette/type/beat/story direction | `hyperframes-creative` (the Kickoff brand overrides its palettes and presets) |
| Camera moves, zooms, keyframes | `hyperframes-keyframes` |
| Timeline layout, safe zones, storyboard order | `hyperframes-studio` |
| Audio, music, SFX, voiceover | `hyperframes-audio`, `media-use` |
| CLI commands and render failures | `hyperframes-cli` |

If those skills aren't installed: `npx hyperframes skills`. They are a reference, not part of this repo. **Precedence when they conflict: `kickoff-video-product` (facts) > `kickoff-video-brand` (look) > HyperFrames defaults.**

## Before you start

1. Read `kickoff-video-product` — status (testnet, Score Markets only) and the claims list bind every script.
2. Read `kickoff-video-brand` — theme, fonts, logo, voice.
3. Read `kickoff-video-motion` — the approved motion style, measured from the user's reference video.
4. **Open `videos/kickoff-launch-v2/index.html`** — the user-approved reference implementation. Reuse its patterns (the `at(phrase, pulse)` beat helper, the `sticker`/`card`/`pop`/`burst`/`click` helpers, transparent scenes, iris/wipe/blur-dissolve/collapse transitions, vendored fonts and GSAP) rather than starting from scratch. Default to its look: light cream + purple, unless the user asks otherwise.
5. Ready-to-fill prompt for the user: `prompt-template.md` (next to this file). Human-facing how-to: `videos/README.md`.

## Where things live

- Projects: `videos/<slug>/` at the repo root (`index.html`, `compositions/`, `assets/`, `meta.json`). Create with
  `npx hyperframes init videos/<slug> --non-interactive --resolution landscape` (or `portrait`, `square`, `4k` variants).
- Keep video projects **HTML/JS/JSON only** — `tsconfig.json` globs `**/*.ts(x)` and would pick up stray TypeScript. Don't add `node_modules` or rendered `.mp4`s to git; render outputs go to `videos/<slug>/out/` (add to `.gitignore` before the first commit of a video).
- Copy needed logos/crests/players from `public/brand/` into the project's `assets/`.

## Process

1. **Brief.** One line each: purpose, audience, platform + aspect ratio, length, single takeaway, CTA. Default takeaway for launch content: *closeness pays.*
2. **Script + storyboard** as beats with timings and on-screen text, using only lines/claims allowed by `kickoff-video-product`. One idea per beat. Show the storyboard to the user before building anything long (>15s) — see `hyperframes-studio` §0 "talk before you build".
3. **Music, then beats.** Get the track into `assets/`, tag it `data-timeline-role="music"`, run `npx hyperframes beats .`, and copy the beat times into the composition (details in `kickoff-video-motion` §1). Do this before building scenes so timing is designed to the grid, not retrofitted.
4. **Build scene by scene**: one sub-composition per scene, one paused GSAP timeline registered on `window.__timelines`, deterministic (no `Math.random`, `Date.now`, infinite repeats). Pull reusable named visuals (charts, transitions, glass, grain) from the registry before hand-building: `npx hyperframes catalog <word>` (see `hyperframes-registry`).
5. **Gate every scene** before moving on:
   - `npx hyperframes check` — lint + runtime validation + layout (JS errors, missing assets, contrast).
   - `npx hyperframes snapshot` — inspect real frames at the key moment of each beat. Look for: wrong font fallback, logo below 80px, text clipped or in a safe-zone margin, low contrast, off-palette color, crowded frames.
   - Optionally `node <hyperframes-animation>/scripts/animation-map.mjs <dir>` to audit dead time and stagger consistency.
6. **Testnet check.** Confirm a "Testnet · play money" label or end-card line is on screen, and no forbidden claim slipped into copy or a mockup.
7. **Render**: `npx hyperframes render -o out/<slug>-<ratio>.mp4` from the project directory. Draft renders are quick (a 10s 1080p clip took ~15s on 4 cores); iterate freely, render finals last.
8. **Hand-off**: report the file path, duration, resolution, and anything you weren't able to verify (audio, fonts).

## Formats

| Use | Size | Notes |
|---|---|---|
| X / YouTube / site | 1920×1080 (16:9) | default |
| Reels / TikTok / Shorts | 1080×1920 (9:16) | keep key content out of the top ~250px and bottom ~450px (UI overlays) |
| Feed square | 1080×1080 | |
| Hi-res masters | 3840×2160 | render only when asked |

Make the 9:16 a re-layout, not a crop: use composition variables (`data-composition-variables`) or a separate layout, and re-check safe zones.

## Environment notes

- Fresh environment: run `bash videos/setup.sh` (FFmpeg, headless Chrome, HyperFrames skills, numpy), then restart the session. Needs Node ≥ 22.
- **Vendor fonts and GSAP into `assets/`** (copy `assets/fonts/` and `assets/vendor/gsap.min.js` from `kickoff-launch-v2`). Lint requires an `@font-face` pointing at a local file for every named font, and in proxied cloud containers headless Chrome rejects CDN certificates (`ERR_CERT_AUTHORITY_INVALID` → "gsap is not defined").
- **Music**: use the user's licensed track. Without one, generate a draft with `python3 videos/tools/placeholder-music.py out.wav` (same phrase shape as the reference), convert to mp3, and say clearly that it's a placeholder. Never use a reference video's audio.
- `check` pitfalls seen so far: a full-screen wipe left covering the frame shows up as many contrast failures; intentional layering (a pick tile over its grid cell) gets `data-layout-allow-overlap data-layout-allow-occlusion`; opaque `.scene` backgrounds make push/zoom transitions go blank, so paint the background on the root.
- Don't publish (`hyperframes publish`) or upload anywhere without the user asking.
