#!/usr/bin/env bash
# Runs in the session's shell: downloads every address in images.txt with the browser's cookies (cookies.txt, from
# the session's cookie export) into output/images, then zips the folder. Prints how many images it saved.
set -uo pipefail
rm -rf output && mkdir -p output/images
n=0
while read -r url; do
  [ -z "$url" ] && continue
  n=$((n + 1))
  path="${url%%\?*}"
  ext=$(printf '%s' "$path" | grep -oE '\.[A-Za-z0-9]{2,4}$' || true)
  curl -sSfL --max-time 30 -b cookies.txt -o "output/images/$(printf '%03d' "$n")${ext:-.img}" "$url" || echo "could not download $url" >&2
done < images.txt
cd output && zip -qr images.zip images
ls images | wc -l
