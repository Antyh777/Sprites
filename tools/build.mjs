/**
 * build.mjs — genera los artefactos a partir del taller de pixel art.
 *
 *   assets/hero-sheet.png   hoja de sprites (columnas = frames, filas = animaciones)
 *   assets/preview-*.png    ampliaciones de cada animacion (para revisar a ojo)
 *   js/hero-frames.js       datos de frames que consume el HTML
 *
 * Uso:  node tools/build.mjs [--preview-dir /tmp]
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ANIMATIONS, META, PALETTE } from './hero-parts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pvIdx = args.indexOf('--preview-dir');
const PREVIEW_DIR = pvIdx >= 0 ? args[pvIdx + 1] : resolve(ROOT, 'assets');

const { W, H } = META;
const ORDER = ['idle', 'walk', 'run', 'jump', 'fall'];

/* ------------------------- utilidades PNG ------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array de w*h*4 -> Buffer PNG */
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filtro none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Convierte un frame (array de strings) a una funcion que consulta color */
function pixelGetter(frame, palette) {
  return (x, y) => {
    if (y < 0 || y >= frame.length) return null;
    const row = frame[y];
    if (x < 0 || x >= row.length) return null;
    const c = palette[row[x]];
    return c ? hex(c) : null;
  };
}

/** Pinta los frames en un lienzo rgba con escala y separacion opcionales */
function paint(sheetFrames, { scale = 1, gap = 0, bg = null } = {}) {
  const cols = Math.max(...sheetFrames.map((r) => r.length));
  const rows = sheetFrames.length;
  const cellW = W * scale + gap;
  const cellH = H * scale + gap;
  const w = cols * cellW + gap;
  const h = rows * cellH + gap;
  const out = new Uint8Array(w * h * 4);
  if (bg) {
    const [r, g, b] = hex(bg);
    for (let i = 0; i < w * h; i++) {
      out[i * 4] = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = 255;
    }
  }
  for (let ry = 0; ry < rows; ry++) {
    const rowFrames = sheetFrames[ry];
    for (let cx = 0; cx < rowFrames.length; cx++) {
      const get = pixelGetter(rowFrames[cx], PALETTE);
      const ox = gap + cx * cellW;
      const oy = gap + ry * cellH;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const c = get(x, y);
          if (!c) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = ox + x * scale + sx;
              const py = oy + y * scale + sy;
              const i = (py * w + px) * 4;
              out[i] = c[0];
              out[i + 1] = c[1];
              out[i + 2] = c[2];
              out[i + 3] = 255;
            }
          }
        }
      }
    }
  }
  return { w, h, rgba: out };
}

/* ------------------------------ salida ---------------------------- */

mkdirSync(resolve(ROOT, 'assets'), { recursive: true });
mkdirSync(resolve(ROOT, 'js'), { recursive: true });
mkdirSync(PREVIEW_DIR, { recursive: true });

const rows = ORDER.map((name) => ANIMATIONS[name]);

// 1. hoja de sprites limpia (1px de separacion para que se vean los frames)
const sheet = paint(rows, { scale: 1, gap: 1 });
writeFileSync(resolve(ROOT, 'assets/hero-sheet.png'), encodePNG(sheet.w, sheet.h, sheet.rgba));

// 2. hoja ampliada x6 para revisar el pixel art
const big = paint(rows, { scale: 6, gap: 2, bg: '#20223a' });
writeFileSync(resolve(PREVIEW_DIR, 'preview-sheet-x6.png'), encodePNG(big.w, big.h, big.rgba));

// 3. una tira por animacion
for (const name of ORDER) {
  const g = paint([ANIMATIONS[name]], { scale: 8, gap: 2, bg: '#20223a' });
  writeFileSync(resolve(PREVIEW_DIR, `preview-${name}-x8.png`), encodePNG(g.w, g.h, g.rgba));
}

// 4. datos para el navegador
const data = {
  meta: { w: W, h: H, palette: PALETTE, order: ORDER, rows: rows.map((r) => r.length) },
  animations: ANIMATIONS,
};
writeFileSync(
  resolve(ROOT, 'js/hero-frames.js'),
  `/* Generado por tools/build.mjs — no editar a mano. */\n` +
    `(function (root, factory) {\n` +
    `  const api = factory();\n` +
    `  if (typeof module === 'object' && module.exports) module.exports = api;\n` +
    `  root.HERO_FRAMES = api;\n` +
    `})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n` +
    `  return ${JSON.stringify(data)};\n` +
    `});\n`,
);

// 5. hoja embebida como data URL: permite abrir index.html con file:// sin CORS
const png = readFileSync(resolve(ROOT, 'assets/hero-sheet.png'));
writeFileSync(
  resolve(ROOT, 'js/hero-png.js'),
  `/* Generado por tools/build.mjs — no editar a mano. */\n` +
    `(function (root, factory) {\n` +
    `  const api = factory();\n` +
    `  if (typeof module === 'object' && module.exports) module.exports = api;\n` +
    `  root.HERO_SHEET_PNG = api;\n` +
    `})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n` +
    `  return ${JSON.stringify('data:image/png;base64,' + png.toString('base64'))};\n` +
    `});\n`,
);

/* ------------------------------------------------------------------ */
/* Plantilla y hoja de referencia con etiquetas (usan ImageMagick)      */
/* ------------------------------------------------------------------ */

const LABELS = {
  idle: 'IDLE ×4', walk: 'WALK ×6', run: 'RUN ×6', jump: 'JUMP ×2', fall: 'FALL ×2',
};
const HINTS = {
  idle: 'respira / parpadea', walk: 'ciclo de 6 pasos', run: 'zancada inclinada',
  jump: 'impulso, piernas recogidas', fall: 'caída, brazos abiertos',
};

function hasConvert() {
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/** Rejilla vacía: celdas de fw×fh con línea base (donde apoyan los pies) */
function gridBase(cols, rows, fw, fh, scale, labelW) {
  const cellW = fw * scale;
  const cellH = fh * scale;
  const w = labelW + cols * cellW + 8;
  const h = rows * cellH + 8;
  const out = new Uint8Array(w * h * 4);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
  };
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = labelW + cx * cellW + 4;
      const y0 = ry * cellH + 4;
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const border = x === 0 || y === 0 || x === cellW - 1 || y === cellH - 1;
          if (border) put(x0 + x, y0 + y, 70, 84, 130, 200);
          else if (y === cellH - 3) put(x0 + x, y0 + y, 90, 110, 170, 90); // línea base
          else put(x0 + x, y0 + y, 255, 255, 255, 8);
        }
      }
    }
  }
  return { w, h, rgba: out };
}

function writeLabeled(file, base, lines) {
  const basePath = resolve(PREVIEW_DIR, '._base.png');
  writeFileSync(basePath, encodePNG(base.w, base.h, base.rgba));
  const args = [basePath];
  args.push('-font', 'DejaVu-Sans', '-fill', '#c8d0f0', '-pointsize', '16');
  lines.forEach((l) => {
    args.push('-annotate', `+${l.x}+${l.y}`, l.text);
    if (l.color) args.push('-fill', l.color);
  });
  args.push(file);
  try {
    execFileSync('convert', args);
    return true;
  } catch (e) {
    return false;
  }
}

// plantilla en blanco para dibujar un sprite propio
if (hasConvert()) {
  const cols = Math.max(...ORDER.map((k) => ANIMATIONS[k].length));
  const scale = 4;
  const labelW = 150;
  const base = gridBase(cols, ORDER.length, W, H, scale, labelW);
  const lines = ORDER.map((name, i) => ({
    x: 8,
    y: 4 + i * (H * scale) + 22,
    text: LABELS[name] || name.toUpperCase(),
  })).concat(ORDER.map((name, i) => ({
    x: 8,
    y: 4 + i * (H * scale) + 42,
    text: HINTS[name] || '',
    color: '#7c88b0',
  })));
  lines.push({
    x: 8,
    y: base.h - 10,
    text: 'una fila por animación · ancla: centro-abajo · fondo transparente',
    color: '#7c88b0',
  });
  const ok = writeLabeled(resolve(ROOT, 'assets/plantilla-hoja-sprites.png'), base, lines);
  if (!ok) console.log('    (ImageMagick no disponible: plantilla sin etiquetas)');
} else {
  console.log('    (ImageMagick no disponible: no se genera la plantilla)');
}

// hoja de referencia del héroe incluido, ampliada y etiquetada
const refScale = 6;
const refBase = paint(rows, { scale: refScale, gap: 3, bg: '#20223a' });
writeLabeled(resolve(ROOT, 'assets/hoja-heroe-etiquetada.png'), refBase,
  ORDER.map((name, i) => ({
    x: 6,
    y: 4 + i * (H * refScale + 3) + 18,
    text: (LABELS[name] || name).replace('×', 'x'),
  })));

const total = ORDER.reduce((n, k) => n + ANIMATIONS[k].length, 0);
console.log(
  `OK  ${total} frames (${ORDER.map((k) => `${k}:${ANIMATIONS[k].length}`).join(' ')})\n` +
    `    assets/hero-sheet.png ${sheet.w}x${sheet.h} · plantilla y hoja etiquetada\n` +
    `    js/hero-frames.js + js/hero-png.js`,
);
