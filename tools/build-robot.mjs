/**
 * build-robot.mjs — genera todas las hojas del robot-gato
 *
 * Salidas:
 *   assets/robot-sheet.png            todas las vistas y animaciones (referencia)
 *   assets/robot-front-sheet.png      de frente: idle, caminar, correr, salto, caída
 *   assets/robot-side-sheet.png       de perfil (mira a la derecha), lo mismo
 *   assets/robot-back-sheet.png       de espaldas, lo mismo
 *   assets/robot-left-sheet.png       perfil moviéndose a la IZQUIERDA (espejado)
 *   assets/robot-right-sheet.png      perfil moviéndose a la DERECHA
 *   assets/robot-front-left/right.png hojas de frente mirando a cada lado
 *   js/robot-sheet.js                 las hojas embebidas en base64 para el juego
 *
 * Uso:  node tools/build-robot.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, stackVertical, stackHorizontal } from './pixel.mjs';
import {
  buildAll, W, H, PALETTE, ANIM_ORDER, VIEWS,
} from './robot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(ROOT, 'js'), { recursive: true });

const all = buildAll();

/* --------------------------- hojas por vista --------------------------- */

/** Rejilla: filas = animaciones, columnas = frames (sin separación) */
function viewSheet(frames, view, opts = {}) {
  const mirror = !!opts.mirror;
  const rows = ANIM_ORDER.map((a) => frames[view][a]);
  const cols = Math.max(...rows.map((r) => r.length));
  const gap = opts.gap == null ? 0 : opts.gap;
  const cellW = W + gap;
  const cellH = H + gap;
  const sheet = new Pix(cols * cellW + gap, rows.length * cellH + gap, PALETTE);
  rows.forEach((row, ry) => {
    row.forEach((frame, rx) => {
      const f = mirror ? frame.flipX() : frame;
      sheet.blit(f, gap + rx * cellW, gap + ry * cellH);
    });
  });
  return sheet;
}

const sheets = {
  'robot-front-sheet.png': viewSheet(all, 'front'),
  'robot-side-sheet.png': viewSheet(all, 'side'),
  'robot-back-sheet.png': viewSheet(all, 'back'),
  // movimiento lateral: perfil a la derecha y su espejo a la izquierda
  'robot-right-sheet.png': viewSheet(all, 'side'),
  'robot-left-sheet.png': viewSheet(all, 'side', { mirror: true }),
  // de frente, mirando a cada lado (el cuerpo gira levemente)
  'robot-front-right-sheet.png': viewSheet(all, 'front'),
  'robot-front-left-sheet.png': viewSheet(all, 'front', { mirror: true }),
};

Object.entries(sheets).forEach(([name, pix]) => {
  writeFileSync(resolve(OUT, name), pix.toPNG());
});

/* ------------------ hoja de referencia con etiquetas ------------------- */

const refScale = 4;
const refRows = [];
const refLabels = [];
VIEWS.forEach((view) => {
  ANIM_ORDER.forEach((anim) => {
    const frames = all[view][anim];
    const row = new Pix(frames.length * (W * refScale + 3) + 3, H * refScale + 6, PALETTE);
    frames.forEach((f, i) => row.blit(f.scaled(refScale), 3 + i * (W * refScale + 3), 3));
    refRows.push(row);
    refLabels.push(`${view.toUpperCase()} · ${anim.toUpperCase()} (${frames.length} frames)`);
  });
});
const ref = stackVertical(refRows, PALETTE, { gap: 4, bg: 'K' });

// etiquetas con ImageMagick si está disponible
let labeled = false;
const baseName = '/tmp/._robot-ref-base.png';
writeFileSync(baseName, ref.toPNG());
try {
  execFileSync('convert', ['-version'], { stdio: 'ignore' });
  const args = [baseName, '-font', 'DejaVu-Sans', '-fill', '#ffd166', '-pointsize', '15'];
  let y = 6;
  refRows.forEach((row, i) => {
    args.push('-annotate', `+${row.w + 8}+${y + 20}`, refLabels[i]);
    y += row.h + 4;
  });
  args.push(resolve(OUT, 'robot-referencia.png'));
  execFileSync('convert', args);
  labeled = true;
} catch (e) {
  writeFileSync(resolve(OUT, 'robot-referencia.png'), ref.toPNG());
}
if (existsSync(baseName)) {
  try { execFileSync('rm', ['-f', baseName]); } catch (e) { /* nada */ }
}

/* ------------------ plantilla vacía para dibujar sprites ---------------- */

function templateSheet(cols, rows, fw, fh, scale, labelW) {
  const cellW = fw * scale;
  const cellH = fh * scale;
  const w = labelW + cols * cellW + 10;
  const h = rows * cellH + 10;
  const t = new Pix(w, h, PALETTE);
  // fondo semitransparente para ver la rejilla (trama oscura)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x >> 2) % 2 === (y >> 2) % 2) t.set(x, y, 'm');
    }
  }
  t.d = t.d.map((v) => (v === 'm' ? 'n' : v));
  rows = undefined; // eslint-disable-line no-param-reassign
  return t;
}

// plantilla: celdas transparentes del tamaño de frame, con marco y línea base
{
  const cols = Math.max(...ANIM_ORDER.map((a) => all.front[a].length));
  const scale = 2;
  const labelW = 168;
  const cellW = W * scale;
  const cellH = H * scale;
  const w = labelW + cols * cellW + 10;
  const h = ANIM_ORDER.length * cellH + 10;
  const t = new Pix(w, h, PALETTE);
  ANIM_ORDER.forEach((anim, row) => {
    const count = all.front[anim].length;
    for (let col = 0; col < count; col++) {
      const x0 = labelW + col * cellW + 5;
      const y0 = row * cellH + 5;
      // marco de la celda
      for (let i = 0; i < cellW; i++) {
        t.set(x0 + i, y0, 'G');
        t.set(x0 + i, y0 + cellH - 1, 'g');
      }
      for (let j = 0; j < cellH; j++) {
        t.set(x0, y0 + j, 'G');
        t.set(x0 + cellW - 1, y0 + j, 'g');
      }
      // línea base: aquí deben apoyarse los pies
      for (let i = 1; i < cellW - 1; i++) {
        if (i % 4 < 2) t.set(x0 + i, y0 + cellH - 3, 'O');
      }
      // cruz central tenue (para centrar el personaje)
      for (let j = 1; j < cellH - 3; j += 2) t.set(x0 + Math.floor(cellW / 2), y0 + j, 'u');
    }
  });
  const base = '/tmp/._plantilla-base.png';
  writeFileSync(base, t.toPNG());
  let ok = false;
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    const args = [base, '-font', 'DejaVu-Sans', '-pointsize', '15', '-fill', '#e8ecff'];
    ANIM_ORDER.forEach((anim, row) => {
      const count = all.front[anim].length;
      const y = row * cellH + 5;
      args.push('-annotate', `+8+${y + 24}`, `${anim.toUpperCase()} ×${count}`);
      args.push('-pointsize', '11', '-fill', '#8f9ac0');
      args.push('-annotate', `+8+${y + 42}`, `frames: ${all.front[anim].map((_, i) => i + 1).join(' ')}`);
      args.push('-pointsize', '15', '-fill', '#e8ecff');
    });
    args.push('-pointsize', '12', '-fill', '#8f9ac0');
    args.push('-annotate', `+8+${h - 8}`, 'fondo transparente · ancla: centro-abajo (línea naranja)');
    args.push(resolve(OUT, 'plantilla-hoja-sprites.png'));
    execFileSync('convert', args);
    ok = true;
  } catch (e) {
    writeFileSync(resolve(OUT, 'plantilla-hoja-sprites.png'), t.toPNG());
  }
  if (!ok) console.log('    (plantilla sin etiquetas: ImageMagick no disponible)');
  try { execFileSync('rm', ['-f', base]); } catch (e) { /* nada */ }
}

/* ---------------------- hojas embebidas para el juego ------------------ */

function dataURL(pix) {
  return 'data:image/png;base64,' + pix.toPNG().toString('base64');
}

// el juego embebe frente, perfil y espaldas; la vista a la izquierda se
// obtiene espejando el perfil (exactamente igual que robot-left-sheet.png)
const gameSheets = {
  front: dataURL(sheets['robot-front-sheet.png']),
  side: dataURL(sheets['robot-side-sheet.png']),
  back: dataURL(sheets['robot-back-sheet.png']),
};

const meta = {
  w: W,
  h: H,
  order: ANIM_ORDER,
  views: VIEWS,
  counts: ANIM_ORDER.map((a) => all.front[a].length),
  leftFrom: 'side',
  sheets: gameSheets,
  palette: PALETTE,
};

writeFileSync(
  resolve(ROOT, 'js/robot-sheet.js'),
  '/* Generado por tools/build-robot.mjs — no editar a mano. */\n' +
    '(function (root, factory) {\n' +
    '  const api = factory();\n' +
    '  if (typeof module === "object" && module.exports) module.exports = api;\n' +
    '  root.ROBOT_SHEET = api;\n' +
    '})(typeof globalThis !== "undefined" ? globalThis : this, function () {\n' +
    '  return ' + JSON.stringify(meta) + ';\n' +
    '});\n',
);

// hoja de referencia de una vista, también embebida (para el panel)
const totalFrames = ANIM_ORDER.reduce((n, a) => n + all.front[a].length, 0);
console.log(
  `OK  robot-gato ${W}x${H} · ${totalFrames} frames por vista ` +
    `(${ANIM_ORDER.map((a) => a + ':' + all.front[a].length).join(' ')})\n` +
    `    assets/robot-{front,side,back,left,right}-sheet.png\n` +
    `    assets/robot-referencia.png${labeled ? ' (con etiquetas)' : ' (sin etiquetas)'}\n` +
    `    js/robot-sheet.js`,
);

// lectura de la hoja recién generada para verificar que se puede decodificar
const check = readFileSync(resolve(OUT, 'robot-side-sheet.png'));
void check;
