#!/bin/bash
# Normaliza frames raw a escala 40px uniforme:
#  - croma -> trim
#  - detecta el cuello (minimo local de ancho bajo la cabeza) en el perfil de filas
#  - escala cada frame por tamano de cabeza (constante entre poses) => cuerpos iguales
#  - tope: contenido <= 40px; centrado-abajo en canvas 40x40
set -e
cd "$(dirname "$0")/.."
mkdir -p sprites/frames
export TARGET_HEAD=18.5 CELL=40

for f in sprites/frames/raw/*.png; do
  name=$(basename "$f")
  t1=$(mktemp /tmp/n1_XXXX.png)
  convert "$f" -fuzz 45% -transparent '#FF00FF' -channel A -morphology Open Diamond:1 +channel -trim +repage "$t1"
  # perfil de ancho por fila (alpha promediado por fila)
  prof=$(mktemp /tmp/prof_XXXX.txt)
  convert "$t1" -alpha extract -rotate 90 -resize x1! -depth 8 txt:- > "$prof" 2>/dev/null
  PROF="$prof" TARGET_HEAD=$TARGET_HEAD CELL=$CELL NAME="$name" T1="$t1" OUT="sprites/frames/$name" python3 - <<'EOF'
import os, sys, subprocess, re

vals = []
with open(os.environ['PROF']) as fh:
    for line in fh:
        m = re.search(r':\s*\(([\d.]+)', line)
        if m:
            vals.append(float(m.group(1)))
n = len(vals)
top = vals[:int(n * 0.6)]
headmax = max(top)
peak = top.index(headmax)
thr = 0.72 * headmax
neck = None
for i in range(peak, n):
    if vals[i] < thr:
        neck = i
        break
if neck is None or neck < n * 0.35 or neck > n * 0.62:
    neck = int(n * 0.47)

target = float(os.environ['TARGET_HEAD'])
cell = int(os.environ['CELL'])
scale = min(target / neck, (cell - 1) / n)

t2 = subprocess.run(['convert', os.environ['T1'], '-filter', 'point',
                     '-resize', f'{scale * 100:.3f}%', 'png:-'],
                    capture_output=True, check=True).stdout
t3 = f'/tmp/n2_{os.getpid()}.png'
with open(t3, 'wb') as fh:
    fh.write(t2)
subprocess.run(['convert', '-size', f'{cell}x{cell}', 'xc:none', t3,
                '-gravity', 'South', '-geometry', '+0+0', '-composite',
                os.environ['OUT']], check=True)
os.unlink(t3)
print(f"normalized {os.environ['NAME']} (h={n} neck={neck} scale={scale:.4f})")
EOF
  rm -f "$t1" "$prof"
done
