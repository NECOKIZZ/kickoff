# Kickoff teaser: "Football belongs to the people"

A 74s 16:9 teaser trailer that edits real football footage to the approved voiceover script (`vo.txt`), with motion design for the product beat and the end card. It uses the Floodlight (dark) look: ink, chalk and a single green accent, plus a letterbox. The paced arc runs slow, accelerates, then hits a hard silence, the product, an anthem and the end card.

## Structure (global seconds, all values in `edit.json`)

| Act | Time | Picture | Sound |
|---|---|---|---|
| Origins | 0–18.6 | Etihad drone (cold, "boardroom") → street football, mud splash slow-mo, flares → flags / crowd / screaming fan, with a "By / Of / For the people." stack | dark drone, bell motif, low booms on each cut |
| Chaos | 18.6–33.8 | YES / NO, WIN / LOSE slams with a strike-through → 80' missed penalty → red card flies in over the red flares → Agüero 93:20 with the original commentary, white-out on the goal. A match clock in the letterbox runs 80' → 87' → 90+3' → 90+4' | the ticking clock accelerates, pulse bass, a riser into the goal impact |
| Variables | 33.8–37.4 | a wall of 98 flickering scoreline tiles collapses into one split-flap "3–2" | flap clicks, collapse hit |
| The takes | 37.4–46.9 | barbershop, pub, phone and ultras shots, each fan line in its own voice and chat bubble → bubbles flood the frame under "Every fan. Every city. Every opinion." | 120 BPM groove that stops dead |
| The turn | 46.9–53.6 | silence. Slow phone push while the bubbles fall away, the letterbox closes in, Palmer's slow-mo stare | held tone, heartbeat, reverse swell |
| Call the score | 53.6–60.1 | product beat: 5×5 scoreline grid in 3D, a cursor taps 2–1 → Palmer knee slide → the full-time board flips "FT 2–1", "Called it." stamp, green burst | impact, pluck arp, referee whistles |
| Anthem + end | 60.1–74 | flags, Agüero shirt twirl, "Football belongs to the people. / Now so does the reward." → black → logo hit, "Beat the pack. Keep the stack.", waitlist / kickoff.cash / testnet pills | anthem chords, half-time drums, silence, logo impact |

## Source clips

The user supplied these clips in two zips. They are not committed to the repo; put them in a folder as `c1.mp4`–`c7.mp4` to rebuild.

| id | original file | content |
|---|---|---|
| c1 | `12314609_640_360_30fps.mp4` | Etihad Stadium drone |
| c2 | `16931645_640_360_25fps.mp4` | Brighton flag display |
| c3 | `Cole Palmer Celebration vs Arsenal 4K UHD … .mp4` | Palmer goal celebration (no audio) |
| c4 | `_dNObs2w2jBfHIO5.mp4` | Agüero 93:20 v QPR with Martin Tyler commentary |
| c5 | `gemini_generated_video_511776d4.mp4` | AI: pub fans, barbershop, phone, group chat |
| c6 | `gemini_generated_video_7a38f132.mp4` | AI: ultras, flares, screaming fan |
| c7 | `gemini_generated_video_e7364164.mp4` | AI: barefoot street football, mud |

## Rebuild

```bash
cd videos/kickoff-teaser
bash tools/cut-shots.sh <clips dir>        # → assets/shots/*.mp4 (graded, 1080p, slow-mo interpolated; git-ignored)
python3 tools/score.py <clips dir>         # → assets/bed.wav (score + crowd/commentary, ducked under the VO)
ffmpeg -i assets/bed.wav -af loudnorm=I=-23:TP=-2:LRA=14 -b:a 192k assets/bed.mp3 && rm assets/bed.wav
npx hyperframes check && npx hyperframes render -o out/kickoff-teaser.mp4
```

Voice: Kokoro `bm_george` for the narrator (per-line speed in `vo.txt`). Fan quotes use `am_michael`, `bf_emma` and `am_adam`. Each line was verified with Whisper. Three lines needed fixes, and `vo.txt` notes them: "Kickoff!" (instead of "kick over"), `-l en-us` for "stack" (the en-gb phonemes say "stock"), and v03's tail trimmed by 0.15s.

## Open items

- **Rights.** The Agüero and Palmer clips are Premier League broadcast footage and commentary. Clear them before any public or commercial use, or swap them out.
- **Claim check.** The script line "you get paid for it" is the user's own. Kickoff is on testnet with play money (`kickoff-video-product`), so the product beat and the end card carry a "Testnet · play money" pill.
- The score is original and self-synthesised, so it needs no licence.
