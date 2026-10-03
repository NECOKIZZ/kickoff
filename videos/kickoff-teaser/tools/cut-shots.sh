#!/usr/bin/env bash
# Cut, grade and upscale the source clips into the teaser's shots (1920x1080, 30fps, silent).
# Usage: bash tools/cut-shots.sh <dir with c1..c7.mp4 and n1..n5.mp4>   (mapping in EDIT.md)
set -euo pipefail
SRC=${1:?source dir}; OUT=$(dirname "$0")/../assets/shots; mkdir -p "$OUT"

# grade presets (eq + colour balance + curves)
COLD="eq=contrast=1.12:saturation=0.45:brightness=-0.04,colorbalance=bs=0.10:bm=0.06:rh=-0.04"
WARM="eq=contrast=1.15:saturation=1.05:brightness=-0.03,colorbalance=rs=0.06:gs=0.02:bs=-0.06:rh=0.04"
FIRE="eq=contrast=1.18:saturation=1.15:brightness=-0.05,curves=all='0/0 0.18/0.10 1/1'"
TEAL="eq=contrast=1.12:saturation=0.85:brightness=-0.04,colorbalance=bs=0.06:bm=0.03:rh=0.04,curves=all='0/0 0.2/0.14 1/1'"
BCAST="eq=contrast=1.14:saturation=0.82:brightness=-0.06:gamma=0.95,colorbalance=bs=0.05:rh=0.05,curves=all='0/0 0.2/0.13 1/0.97'"
NOIR="eq=contrast=1.2:saturation=0.18:brightness=-0.05,colorbalance=bs=0.08:bm=0.04"
VHS="scale=560:316,rgbashift=rh=-5:bh=5:rv=1,eq=contrast=1.2:saturation=1.3:brightness=-0.03,colorbalance=rs=0.05:bs=-0.04,scale=1920:1080:flags=bilinear,vignette=angle=PI/3.2"
NIGHT="eq=contrast=1.15:saturation=0.85:brightness=-0.04,colorbalance=bs=0.05,curves=all='0/0 0.2/0.13 1/1'"

# shot <name> <src> <media-start> <timeline-dur> <rate> <grade> [extra pre-filter]
only=${ONLY:-}
shot() {
  [ -n "$only" ] && [[ " $only " != *" $1 "* ]] && return 0
  local name=$1 src=$2 ms=$3 dur=$4 rate=$5 grade=$6 pre=${7:-null}
  local srclen; srclen=$(python3 -c "print($dur*$rate+0.2)")
  local slow="null"
  if python3 -c "import sys; sys.exit(0 if $rate<0.97 else 1)"; then
    slow="minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
  fi
  ffmpeg -v error -y -ss "$ms" -t "$srclen" -i "$SRC/$src.mp4" -an -vf \
    "$pre,$slow,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setpts=PTS/$rate,fps=30,$grade,unsharp=5:5:0.6,noise=alls=7:allf=t,format=yuv420p" \
    -t "$dur" -c:v libx264 -preset medium -crf 17 -movflags +faststart "$OUT/$name.mp4"
  echo "$name  $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$name.mp4")s"
}

# ── act 1 · origins
shot s01-boardroom   c1 1.0   4.3  1.0  "$COLD"
shot s02-streets     c7 0.2   2.3  1.0  "$WARM"
shot s03-mud         c7 5.55  1.05 0.5  "$WARM"
shot s04-noise       c6 0.0   1.55 1.0  "$FIRE"
shot s05-by          c2 0.5   2.2  1.0  "$TEAL"
shot s06-of          c6 3.3   1.5  1.0  "$FIRE"
shot s07-for         c6 6.5   1.8  0.8  "$FIRE"
shot s08-simple      c7 6.6   2.8  0.8  "$WARM"
# ── act 2 · chaos (penalty punched in on the box so the real 36' scorebug is out of frame)
shot s10a-pen        n2 2.8   0.65 1.0  "$BCAST" "crop=iw*0.62:ih*0.62:iw*0.3:ih*0.12"
shot s10b-save       n2 3.45  1.6  0.4  "$BCAST" "crop=iw*0.62:ih*0.62:iw*0.3:ih*0.12"
shot s10c-reaction   n2 6.62  0.85 0.5  "$BCAST" "crop=iw*0.82:ih*0.82:iw*0.18:ih*0.18"
shot s11-redcard     n1 2.2   2.45 1.0  "$NIGHT"
shot s12-goal        c4 2.62  3.9  1.0  "$BCAST"
shot s13-aguero      c4 8.5   1.9  1.0  "$BCAST"
# ── act 3 · the takes (old pub/barbershop footage becomes a VHS "everyone has a take" montage)
shot s14a-tv         c5 0.0   1.1  1.0  "$VHS" "crop=iw*0.8:ih*0.78:iw*0.1:0"
shot s14b-tv         c5 1.7   1.2  1.0  "$VHS"
shot s15-threenil    n4 2.9   2.75 1.0  "$NIGHT"
shot s16-bottle      n5 3.55  1.9  1.0  "$WARM" "crop=iw*0.94:ih:iw*0.03:0"
shot s17-oneall      n3 1.25  2.35 1.0  "$FIRE"
shot s19-fan         c2 3.0   1.2  1.0  "$TEAL"
shot s20-city        c1 12.0  0.95 1.0  "$COLD"
shot s21-opinion     c5 6.7   1.25 1.0  "$VHS"
# ── act 4 · the turn
shot s22-noise       c5 8.2   3.3  0.5  "$NOIR"
shot s23-right       c3 2.4   3.4  0.5  "$NIGHT"
# ── act 5 · call the score, anthem
shot s25-proves      c3 0.5   2.4  1.0  "$NIGHT"
shot s27-people      c2 5.0   2.7  0.9  "$TEAL"
shot s28-reward      c4 22.6  2.4  0.8  "$BCAST"
