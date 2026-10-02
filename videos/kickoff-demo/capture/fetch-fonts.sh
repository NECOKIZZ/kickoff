#!/usr/bin/env bash
# Cache the app's web fonts (Fontshare Clash Display, Google Fraunces/Inter) for capture.mjs.
# Headless Chrome can't reach the font CDNs through the cloud proxy, so capture serves them from here.
set -euo pipefail
cd "$(dirname "$0")" && mkdir -p fontcache
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
curl -sS -A "$UA" "https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap" -o fontcache/clash.css
curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,300;1,9..144,400;1,9..144,500&family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,400&display=swap" -o fontcache/google.css
for u in $(grep -ho "url([^)]*\.woff2[^)]*)" fontcache/*.css | sed "s/url(//; s/)//; s/'//g" | sort -u); do
  case $u in //*) u="https:$u" ;; esac
  f=fontcache/$(echo -n "$u" | sha1sum | cut -c1-16).woff2
  [ -s "$f" ] || curl -sS "$u" -o "$f"
done
echo "cached $(ls fontcache/*.woff2 | wc -l) font files"
