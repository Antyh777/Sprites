#!/bin/bash
# Deriva land_00/01 (squash del idle) y wallslide_00/01 (inclinacion del fall)
set -e
cd "$(dirname "$0")/.."
F=sprites/frames
C() { # canvas 96x96, gravedad South, offset $1
  convert -size 96x96 xc:none "$1" -gravity South -geometry "$2" -composite "$3"
}
# land_00: squash fuerte
t=$(mktemp /tmp/d_XXXX.png); convert $F/idle_00.png -trim +repage -resize 110%x76% "$t"; C "$t" +0+0 $F/land_00.png; rm -f "$t"
# land_01: squash leve
t=$(mktemp /tmp/d_XXXX.png); convert $F/idle_00.png -trim +repage -resize 104%x90% "$t"; C "$t" +0+0 $F/land_01.png; rm -f "$t"
# wallslide_00: fall inclinado hacia la pared (derecha), desplazado a la derecha
t=$(mktemp /tmp/d_XXXX.png); convert $F/fall_00.png -trim +repage -background none -rotate -8 "$t"; C "$t" +8+0 $F/wallslide_00.png; rm -f "$t"
# wallslide_01: variacion leve
t=$(mktemp /tmp/d_XXXX.png); convert $F/fall_00.png -trim +repage -background none -resize 100%x96% -rotate -5 "$t"; C "$t" +6+0 $F/wallslide_01.png; rm -f "$t"
echo "derived land_00 land_01 wallslide_00 wallslide_01"
