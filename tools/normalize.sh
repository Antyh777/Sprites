#!/bin/bash
# Normaliza frames raw a medida unica: croma -> trim -> muestreo point a 64px de alto
# (pixel-crisp, misma medida para todos) -> centrado-abajo en canvas 96x96.
set -e
cd "$(dirname "$0")/.."
mkdir -p sprites/frames
for f in sprites/frames/raw/*.png; do
  name=$(basename "$f")
  t1=$(mktemp /tmp/n1_XXXX.png)
  convert "$f" -fuzz 45% -transparent '#FF00FF' -channel A -morphology Open Diamond:1 +channel -trim +repage -filter point -resize x64 "$t1"
  convert -size 96x96 xc:none "$t1" -gravity South -geometry +0+0 -composite "sprites/frames/$name"
  rm -f "$t1"
  echo "normalized $name"
done
