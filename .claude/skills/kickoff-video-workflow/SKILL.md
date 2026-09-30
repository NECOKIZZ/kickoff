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
2. **Idea pass, then script + storyboard.** First the idea-pass table from `kickoff-video-motion` §1 (product truth → football image → device → technique), with 1–2 signature devices only Kickoff could use. Then beats with timings and on-screen text, using only lines/claims allowed by `kickoff-video-product`. Borrow craft from the reference videos, never their content. One idea per beat. Show the storyboard to the user before building anything long (>15s) — see `hyperframes-studio` §0 "talk before you build".
3. **Music, then beats.** Get the track into `assets/`, tag it `data-timeline-role="music"`, run `npx hyperframes beats .`, and copy the beat times into the composition (details in `kickoff-video-motion` §1). Do this before building scenes so timing is designed to the grid, not retrofitted.
4. **Build scene by scene**: one sub-composition per scene, one paused GSAP timeline registered on `window.__timelines`, deterministic (no `Math.random`, `Date.now`, infinite repeats). Pull reusable named visuals (charts, transitions, glass, grain) from the registry before hand-building: `npx hyperframes catalog <word>` (see `hyperframes-registry`).
5. **Gate every scene** before moving on:
   - `npx hyperframes check` — lint + runtime validation + layout (JS errors, missing assets, contrast).
   - `npx hyperframes snapshot` — inspect real frames at the key moment of each beat. Look for: wrong font fallback, logo below 80px, text clipped or in a safe-zone margin, low contrast, off-palette color, crowded frames.
   - Optionally `node <hyperframes-animation>/scripts/animation-map.mjs <dir>` to audit dead time and stagger consistency.
6. **Testnet check.** Confirm a "Testnet · play money" label or end-card line is on screen, and no forbidden claim slipped into copy or a mockup.
7. **Render**: `npx hyperframes render -o out/<slug>-<ratio>.mp4` from the project directory. Draft renders are quick (a 10s 1080p clip took ~15s on 4 cores); iterate freely, render finals last.
8. **Hand-off**: report the file path, duration, resolution, and anything you weren't able to verify (audio, fonts).

## Product walkthroughs (real app + voiceover)

Reference implementation: `videos/kickoff-walkthrough/` (89s, George voice, approved script in `vo.txt`). Recipe:

1. **Access.** Most of the app is behind the invite gate (`/markets`, `/leaderboard`, `/positions`, `/agent`). Ask the user for an invite code, then `node videos/tools/redeem-invite.mjs <CODE> <scratch>/state.json <scratch>/shots`. Keep `state.json` out of the repo. Staking, positions and My Agent also need a Privy email login, which can't be done headlessly: show those steps as house-style recreations with an "Illustration" pill, or ask the user to screen-record them.
2. **Look before scripting.** Screenshot every page and read the live `/docs`: live data can be sparse, and the site can be ahead of `kickoff-video-product` (update that skill first). Ask how to handle thin data rather than implying volume.
3. **Script + voice.** Write the VO per section (one line per section in `vo.txt`), show it with voice samples (`npx hyperframes tts "<text>" -v <voice>`; George = `bm_george`, Michael = `am_michael`, Heart = `af_heart`), and get approval. Spell out what TTS mispronounces: "U S D C", "A I", "two, one", "kickoff dot cash". In a `while read` loop, give `npx` `< /dev/null` or it swallows the rest of the file.
4. **Timing.** Use each clip's duration (ffprobe) plus a ~0.8s gap for section starts, and `ffmpeg -af silencedetect=noise=-35dB:d=0.12` to get the phrase starts for captions (they line up with the script's commas and full stops).
5. **Capture.** `node videos/tools/capture-pages.mjs <state.json> videos/<slug>/assets/shots` (2× screenshots + element boxes). Paint out anything off-limits with `ffmpeg … drawbox=…:t=fill` (the docs sidebar and Player Perps section) so no camera move can reveal it. Find edges (e.g. where a dark section starts) by sampling pixel rows, and keep camera regions inside them.
6. **Compose.** Real captures sit in a floating browser frame (URL bar and testnet pill); a `cam(region)` helper turns a CSS-pixel region into `x/y/scale` for the shot; rings and cursors live inside the shot so they track zooms. Move them with `x`/`y`, never `left`/`top` (lint blocks those). Phrase captions are one element per phrase, toggled with `tl.set` (seek-safe).
7. **Audio.** Music bed `data-volume` ≈ 0.3, VO ≈ 1.35 → voice ≈ −19 dB mean, bed ~14 dB under, ≈ −16 LUFS overall. Check with `volumedetect` on a voice window and a gap window (avoid the placeholder track's silent "breath" pulses), and `ebur128` for the total.

**GSAP gotcha:** a `fromTo` applies its *from* values when the timeline is built, so a later `fromTo` on an element that's already visible earlier (the browser frame re-entering) corrupts every earlier frame. Pass `immediateRender: false` on any `fromTo` that isn't the element's first appearance.

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
