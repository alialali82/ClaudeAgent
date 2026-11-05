#!/bin/sh
# One-command build: sh build.sh   (needs the Lemo-Opuscar library at $LIB, ffmpeg 7+)
set -e
LIB=/root/lemo-opuscar
HERE=$(cd "$(dirname "$0")" && pwd)
export LIB
[ -d /root/tools/bin ] && export PATH="/root/tools/bin:$PATH"   # a private ffmpeg 7+ when the system one is older
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the library folder"; exit 1; }
cd "$LIB"
node core/render/events.mjs "$HERE"
node core/render/video.mjs "$HERE" --fps 24 --workers 3 --out "$HERE/out/video.mp4"
"$LIB/.venv/bin/python" "$HERE/mix.py"
"$LIB/.venv/bin/python" "$HERE/subs.py"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/little-bear-and-the-unfinished-dark.mp4" 24 0
