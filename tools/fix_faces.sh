#!/bin/bash
# Unifica caras: trasplanta la cabeza canonica (dos ojos cyan + audifono) de un frame
# "fuente" sobre frames "objetivo" cuyo rosto derivo (un ojo / espalda).
# Uso: tools/fix_faces.sh            (aplica el mapeo por defecto)
#      tools/fix_faces.sh TARGET:SOURCE ...
set -e
cd "$(dirname "$0")/.."
F=sprites/frames
HEADROWS=52

if [ $# -gt 0 ]; then MAP=("$@"); else
  MAP=(run_01:run_00 run_03:run_00 run_04:run_00 run_05:run_00 fall_00:idle_00 land_00:idle_00)
fi

for pair in "${MAP[@]}"; do
  T=${pair%%:*}; S=${pair##*:}
  [ -f "$F/$T.png" ] && [ -f "$F/$S.png" ] || { echo "falta $T o $S"; exit 1; }
  convert "$F/$S.png" -crop 96x${HEADROWS}+0+0 +repage /tmp/ff_head.png
  convert "$F/$T.png" -size 96x${HEADROWS} xc:none -geometry +0+0 -compose DstOut -composite /tmp/ff_clear.png
  convert /tmp/ff_clear.png /tmp/ff_head.png -compose Over -composite "$F/$T.png"
  echo "face unificada: $T <- $S"
done
