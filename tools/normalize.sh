#!/bin/bash
# Normaliza frames raw: quita fondo magenta, recorta, escala y centra-abajo en canvas 96x96.
set -e
cd "$(dirname "$0")/.."
mkdir -p sprites/frames
for f in sprites/frames/raw/*.png; do
  name=$(basename "$f")
  tmp=$(mktemp /tmp/frame_XXXX.png)
  # 1) fondo magenta -> transparente, 2) trim al contenido, 3) escala fija 11% (mismo factor para todos los frames)
  convert "$f" -fuzz 45% -transparent '#FF00FF' -channel A -morphology Open Diamond:1 +channel -trim +repage -filter box -resize 11% "$tmp"
  # 4) componer centrado-abajo sobre canvas transparente 96x96 (pies anclados al suelo)
  convert -size 96x96 xc:none "$tmp" -gravity South -geometry +0+0 -composite "sprites/frames/$name"
  rm -f "$tmp"
  echo "normalized $name"
done
