# Kickoff launch promo — "The Future of the Match"

45s · 1920×1080 · dark glassmorphic HyperFrames composition with voice-over.

- `renders/video.mp4` — the final render
- `BRIEF.md` / `SCRIPT.md` / `STORYBOARD.md` — the approved brief, VO script and frame plan
- `frame.md` — the dark-glass design system (Clash Display, purple `#7B62F6` = your pick, green `#00C805` = payout)
- `tools/build_frames.py` — generates `compositions/frames/01…07-*.html` (edit here, not the HTML)
- `assets/voice` — Kokoro `am_onyx` VO, one file per frame (lead-in silence baked in)
- `assets/bgm/track.wav` — MusicGen synthwave bed · `assets/sfx` — ffmpeg-synthesised hits/whooshes

## Rebuild

```bash
python3 tools/build_frames.py
S=../../.agents/skills/product-launch-video/scripts
node $S/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes . --audio-meta ./audio_meta.json
node $S/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes .
npx hyperframes lint && npx hyperframes render --quality high --output renders/video.mp4
```
