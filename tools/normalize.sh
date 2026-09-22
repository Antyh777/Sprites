#!/bin/bash
# Normaliza frames raw: quita fondo magenta, recorta, escala (tope: contenido <= 90px,
# nunca ampliar mas alla del 11% base) y centra-abajo en canvas 96x96 (pies al suelo).
set -e
cd "$(dirname "$0")/.."
mkdir -p sprites/frames
for f in sprites/frames/raw/*.png; do
  name=$(basename "$f")
  t1=$(mktemp /tmp/n1_XXXX.png); t2=$(mktemp /tmp/n2_XXXX.png)
  # 1) croma -> transparente, 2) limpia pixles aislados, 3) trim al contenido
  convert "$f" -fuzz 45% -transparent '#FF00FF' -channel A -morphology Open Diamond:1 +channel -trim +repage "$t1"
  # 4) escala: 11% base, reducido si el contenido superaria 90px de alto
  h=$(identify -format %h "$t1")
  pct=$(awk -v h="$h" 'BEGIN{p=11; m=9000/h; if (m<p) p=m; printf "%.2f", p}')
  convert "$t1" -filter box -resize "${pct}%" "$t2"
  # 5) componer centrado-abajo sobre canvas transparente 96x96
  convert -size 96x96 xc:none "$t2" -gravity South -geometry +0+0 -composite "sprites/frames/$name"
  rm -f "$t1" "$t2"
  echo "normalized $name (raw_h=$h pct=$pct)"
done
