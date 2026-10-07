# Kickoff videos

Motion-design videos for Kickoff, made with [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML + one GSAP timeline, rendered to MP4) by Claude Code using the project skills in `.claude/skills/kickoff-video-*`.

## What's here

| Path | What |
|---|---|
| `kickoff-launch-v2/` | **The approved house style.** 30s launch video: cream + purple, sticker words, floating product cards, phrase-synced cuts. Use it as the reference implementation. |
| `kickoff-launch/` | v1 (dark theme, slower motion). Kept for comparison only. |
| `kickoff-walkthrough/` | 89s product walkthrough: real kickoff.cash captures in a browser frame, AI voiceover (George), captions, house-style recreations for the steps that need a login. |
| `kickoff-floodlight/` | 45s motion piece in the Floodlight (dark) look: split-flap scoreboard, 3D pitch grid, match clock, tactics-board distances, payouts, 90/5/5 split, season wall. No voiceover. |
| `kickoff-teaser/` | 74s teaser trailer: real football footage cut to the "Football belongs to the people" voiceover, graded per shot, with an original synthesised score, a letterbox, a match-clock HUD and motion-design product and end-card beats. Source clips aren't committed; see its `EDIT.md` to rebuild. |
| `tools/matchday-track.py` | Original 45s, 128 BPM track (intro, two drops, break, referee whistles) that `kickoff-floodlight` is cut to. |
| `tools/placeholder-music.py` | Generates a licence-free draft track in the reference's phrase shape (`out.wav [seconds]`). |
| `tools/redeem-invite.mjs`, `tools/capture-pages.mjs` | Redeem an invite code headlessly, then capture the gated app pages at 2× for walkthroughs. |
| `setup.sh` | One-time environment setup (FFmpeg, headless Chrome, HyperFrames skills). |

The skills (loaded automatically by Claude Code in this repo):

| Skill | Holds |
|---|---|
| `kickoff-video-brand` | Colours, fonts, logo, assets, voice, what to avoid |
| `kickoff-video-product` | Score Market facts, the worked example, allowed / forbidden claims (testnet, no Player Perps) |
| `kickoff-video-motion` | The motion style, measured from the reference video (`reference-analysis.md`) |
| `kickoff-video-workflow` | The build → check → render → inspect loop, formats, fill-in prompt (`prompt-template.md`) |

## Making the next video

1. **Start a Claude Code session in this repo** (Opus recommended). In a fresh or cloud environment, first run:
   ```bash
   bash videos/setup.sh
   ```
   then start a new session so the HyperFrames skills load.
2. **Optional: music.** Put a track you have rights to in the chat or at `videos/<slug>/assets/music.mp3`. Without one, Claude makes a placeholder.
3. **Ask for it.** Short works, because the skills carry the brand, facts and style:
   > Make a 15-second 9:16 video for Kickoff explaining the Season Accumulator. Same style as kickoff-launch-v2.

   For more control, fill in `.claude/skills/kickoff-video-workflow/prompt-template.md`.
4. **Approve the storyboard** it shows you (for anything over ~15s).
5. **Review the render** it sends. Give feedback by timestamp: "8s: grid too small", "cut at 13s feels late", "swap Arsenal–Chelsea for Liverpool–City".

Renders land in `videos/<slug>/out/` (git-ignored). A 30s 1080p render takes about a minute.

## Updating the style

- **New reference video:** send it and say "analyse this as a reference and update the motion skill". Claude measures it frame by frame and updates `kickoff-video-motion`.
- **Product changes** (mainnet, Player Perps going live, new fees): tell Claude to update `kickoff-video-product`, which currently forbids both.
- **Brand changes:** update `kickoff-video-brand`, which is sourced from `public/kickoff_brand_book.pdf` and `app/globals.css`.

## Open items

- Confirm Clash Display's Fontshare licence allows the font files committed in `assets/fonts/`.
- Both videos use placeholder music. Swap in a licensed track before publishing.
