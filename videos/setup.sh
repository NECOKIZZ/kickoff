#!/usr/bin/env bash
# One-time setup for making Kickoff videos with HyperFrames in a fresh environment
# (cloud sessions start from a clean container). Safe to re-run.
set -euo pipefail

HF_VERSION="0.8.92"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "→ Installing FFmpeg"
  if command -v apt-get >/dev/null 2>&1; then
    (apt-get update -qq && apt-get install -y -qq ffmpeg) || sudo sh -c 'apt-get update -qq && apt-get install -y -qq ffmpeg'
  elif command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  else
    echo "Install FFmpeg manually, then re-run." >&2; exit 1
  fi
fi

echo "→ Headless Chrome for rendering"
npx --yes "hyperframes@${HF_VERSION}" browser ensure

echo "→ HyperFrames' own agent skills (installed to ~/.claude/skills, not this repo)"
npx --yes "hyperframes@${HF_VERSION}" skills update

if ! python3 -c "import numpy" >/dev/null 2>&1; then
  echo "→ numpy (for videos/tools/placeholder-music.py)"
  pip install -q numpy || echo "numpy install failed; only needed for placeholder music"
fi

npx --yes "hyperframes@${HF_VERSION}" doctor || true
echo "✓ Ready. Restart the Claude Code session so the HyperFrames skills load."
