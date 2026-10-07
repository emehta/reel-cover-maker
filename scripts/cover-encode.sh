#!/bin/zsh
# encode.sh <master.mkv> <out-dir> [crf]
set -e
MASTER=$1; OUT=$2; CRF=${3:-22}
mkdir -p $OUT
COUNT=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 $MASTER)
TAIL=$((COUNT - 90))
ffmpeg -y -loglevel error -i $MASTER \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf $CRF -profile:v high -level 4.1 \
  -g $COUNT -keyint_min $COUNT -sc_threshold 0 \
  -x264-params "aq-mode=3:zones=0,0,q=10/$TAIL,$((COUNT - 1)),q=12:colorprim=bt709:transfer=bt709:colormatrix=bt709" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -movflags +faststart -an $OUT/reelic.mp4
ffmpeg -y -loglevel error -i $MASTER -frames:v 1 $OUT/first.png
cwebp -quiet -q 88 -m 6 $OUT/first.png -o $OUT/reelic.webp
rm $OUT/first.png
ls -l $OUT
