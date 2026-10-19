#!/usr/bin/env bash
# Validates the exported film against the delivery spec and fully decodes it.
#   bash scripts/verify-mp4.sh [path/to/file.mp4]
set -euo pipefail

FILE="${1:-out/textbook-studio-60s.mp4}"
[ -s "$FILE" ] || { echo "FAIL: $FILE missing or empty"; exit 1; }

fail=0
check() { # name actual expected
  if [ "$2" = "$3" ]; then echo "OK    $1 = $2"; else echo "FAIL  $1 = $2 (expected $3)"; fail=1; fi
}

v() { ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of default=nw=1:nk=1 "$FILE"; }

check codec        "$(v codec_name)" h264
check width        "$(v width)" 1920
check height       "$(v height)" 1080
check pixel_format "$(v pix_fmt)" yuv420p
check frame_rate   "$(v r_frame_rate)" 30/1
check frames       "$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$FILE")" 1800
check duration_s   "$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$FILE" | awk '{printf "%.2f", $1}')" 60.00
check audio_streams "$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$FILE" | wc -l | tr -d ' ')" 0
check container    "$(ffprobe -v error -show_entries format=format_name -of default=nw=1:nk=1 "$FILE")" mov,mp4,m4a,3gp,3g2,mj2

# Decode every frame; any decoder error means the file is not fully playable.
errors="$(ffmpeg -v error -i "$FILE" -f null - 2>&1 | wc -l | tr -d ' ')"
check decode_errors "$errors" 0

echo "size: $(du -h "$FILE" | cut -f1)  sha256: $(sha256sum "$FILE" | cut -d' ' -f1)"
[ "$fail" = 0 ] && echo "MP4 VERIFIED" || { echo "MP4 VERIFICATION FAILED"; exit 1; }
