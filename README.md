# Sprites

Sprite frames para movimientos tipo **side-scroller** del personaje robot-cat (diseño original del usuario), con hoja de sprites, metadatos de animación y demo web jugable.

## Contenido

| Ruta | Qué es |
|---|---|
| `assets/character-reference.png` | (opcional) referencia del personaje |
| `sprites/frames/raw/*.png` | Frames generados (1024px, fondo magenta de croma) |
| `sprites/frames/*.png` | Frames normalizados: 96×96, transparencia, pies anclados abajo |
| `sprites/atlas.png` | Hoja de sprites 768×192 (rejilla 8×2 de celdas 96×96) |
| `sprites/atlas.json` | Metadatos formato **TexturePacker** (importable en Aseprite, Godot, Unity) |
| `sprites/animations.json` | Animaciones: índices de frame, fps y loop |
| `demo/index.html` | Demo web: mini-plataformas + visor de animaciones |
| `tools/normalize.sh` | raw → normalizado (croma, trim, escala con tope ≤90px, ancla inferior) |
| `tools/derive_extra.sh` | (legacy) derivaba `land_*`/`wallslide_*`; ya no se usa, hoy son arte generado |
| `tools/build_atlas.sh` | Construye `atlas.png` + `atlas.json` + `animations.json` |

## Animaciones

| Animación | Frames | FPS | Loop |
|---|---|---|---|
| `idle` | 2 | 3 | ✔ |
| `run` | 6 | 10 | ✔ |
| `jump` | 1 | 10 | ✘ |
| `fall` | 1 | 8 | ✔ |
| `land` | 2 | 10 | ✘ |
| `wallslide` | 2 | 6 | ✔ |

Todos los frames (`idle`, `run`, `jump`, `fall`, `land`, `wallslide`) son arte generado con la misma referencia y escala; `normalize.sh` iguala la altura de contenido a ≤90px para un movimiento fluido sin recortes.

## Reconstruir el atlas

```bash
tools/normalize.sh       # raw -> frames 96x96 (escala con tope, sin recortes)
tools/build_atlas.sh     # atlas.png + atlas.json + animations.json
```

## Demo web

```bash
python3 -m http.server 8080 --bind 0.0.0.0   # y abrir /demo/
```

Controles: `←`/`→` o `A`/`D` mover · `Espacio`/`↑`/`W` saltar · mantén hacia la pared en el aire para **wall-slide** · salta tocando la pared para **wall-jump**. Incluye *coyote time* y *jump buffer*. El panel derecho permite forzar cada animación y cambiar la velocidad de reproducción.

## Importar en motores

- **Aseprite**: File → Import Sprite Sheet… usando `sprites/atlas.json` (formato TexturePacker); luego crea tags por animación según `animations.json`.
- **Godot**: `AnimatedSprite2D` → textura `atlas.png`; añade frames por región (96×96) siguiendo el orden de `animations.json` (o importa el JSON con un plugin tipo “TexturePacker importer”).
- **Unity**: sprite mode *Multiple*, slice por rejilla 96×96 en el orden de `animations.json`; o usa un importer de JSON TexturePacker.
