#!/bin/bash
# Construye sprites/atlas.png (rejilla 8x2 de celdas 96x96) y los metadatos:
# sprites/atlas.json (formato TexturePacker, importable en Aseprite/Godot/Unity)
# sprites/animations.json (lista de frames por animacion, fps y loop)
set -e
cd "$(dirname "$0")/.."
F=sprites/frames

ORDER=(idle_00 idle_01 run_00 run_01 run_02 run_03 run_04 run_05 jump_00 fall_00 land_00 land_01 wallslide_00 wallslide_01)

# Verifica que todos existan
for n in "${ORDER[@]}"; do
  [ -f "$F/$n.png" ] || { echo "falta $F/$n.png"; exit 1; }
done

FILES=()
for n in "${ORDER[@]}"; do FILES+=("$F/$n.png"); done

montage "${FILES[@]}" -tile 8x2 -geometry +0+0 -background none sprites/atlas.png

python3 - "$F" "${ORDER[@]}" <<'EOF'
import json, sys, os
frames_dir = sys.argv[1]
order = sys.argv[2:]
CELL = 96
COLS = 8

frames_tp = {}
for i, name in enumerate(order):
    x = (i % COLS) * CELL
    y = (i // COLS) * CELL
    frames_tp[name + ".png"] = {
        "frame": {"x": x, "y": y, "w": CELL, "h": CELL},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": CELL, "h": CELL},
        "sourceSize": {"w": CELL, "h": CELL},
    }

atlas = {
    "meta": {
        "app": "Sprites-repo build_atlas.sh",
        "image": "sprites/atlas.png",
        "format": "RGBA8888",
        "size": {"w": COLS * CELL, "h": ((len(order) + COLS - 1) // COLS) * CELL},
        "scale": "1",
    },
    "frames": frames_tp,
}
with open("sprites/atlas.json", "w") as f:
    json.dump(atlas, f, indent=2)

idx = {name: i for i, name in enumerate(order)}
animations = {
    "image": "sprites/atlas.png",
    "frame_size": {"w": CELL, "h": CELL},
    "animations": {
        "idle":      {"frames": [idx["idle_00"], idx["idle_01"]], "fps": 3,  "loop": True},
        "run":       {"frames": [idx["run_00"], idx["run_01"], idx["run_02"], idx["run_03"], idx["run_04"], idx["run_05"]], "fps": 10, "loop": True},
        "jump":      {"frames": [idx["jump_00"]], "fps": 10, "loop": False},
        "fall":      {"frames": [idx["fall_00"]], "fps": 8,  "loop": True},
        "land":      {"frames": [idx["land_00"], idx["land_01"]], "fps": 10, "loop": False},
        "wallslide": {"frames": [idx["wallslide_00"], idx["wallslide_01"]], "fps": 6, "loop": True},
    },
}
with open("sprites/animations.json", "w") as f:
    json.dump(animations, f, indent=2)

print("atlas.png + atlas.json + animations.json OK (%d frames)" % len(order))
EOF
