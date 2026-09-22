/**
 * check-frames.mjs — validación del arte de los frames
 *
 * Revisa las 45 poses (5 animaciones × front/side/back) y avisa de los errores
 * típicos de un juego de sprites:
 *
 *   1. arte recortado por el borde de la celda (orejas, suela, manos…)
 *   2. piezas sueltas (un puño o un pie separados del cuerpo)
 *   3. contorno incompleto por algún lado
 *   4. contorno doble (una base más gruesa que el resto)
 *   5. que el tamaño de celda coincida con el que usa el juego (robot-sheet.js)
 *
 * Uso:  node tools/check-frames.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, ANIM_ORDER, VIEWS, W, H } from './robot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const solid = (p, x, y) => {
  const v = p.get(x, y);
  return !!v && v !== '.';
};

/** Componentes conexas de la silueta (4-vecindad) */
function components(p) {
  const seen = new Set();
  const out = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const k = y * p.w + x;
      if (seen.has(k) || !solid(p, x, y)) continue;
      const stack = [[x, y]];
      seen.add(k);
      let n = 0;
      let minX = x; let maxX = x; let minY = y; let maxY = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nk = ny * p.w + nx;
          if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
          if (seen.has(nk) || !solid(p, nx, ny)) continue;
          seen.add(nk);
          stack.push([nx, ny]);
        }
      }
      out.push({ n, minX, maxX, minY, maxY });
    }
  }
  return out.sort((a, b) => b.n - a.n);
}

const all = buildAll();
const problems = [];

/** 1. cabe dentro de la celda, con margen para el contorno */
function checkFit(view, anim, i, frame) {
  const b = frame.bounds();
  const hit = [];
  if (b.x < 1) hit.push('izquierda');
  if (b.y < 1) hit.push('arriba');
  if (b.x + b.w > W - 1) hit.push('derecha');
  if (b.y + b.h > H - 1) hit.push('abajo');
  if (hit.length) {
    problems.push(`${view}/${anim}/${i + 1}: el arte se sale por ${hit.join(', ')}` +
      ` (caja ${b.x},${b.y} ${b.w}x${b.h} en una celda de ${W}x${H})`);
  }
}

/** 2. una sola pieza */
function checkParts(view, anim, i, frame) {
  const comps = components(frame);
  if (comps.length > 1) {
    const loose = comps.slice(1)
      .map((c) => `${c.n}px en (${c.minX},${c.minY})`).join(', ');
    problems.push(`${view}/${anim}/${i + 1}: ${comps.length} piezas suelta(s) — ${loose}`);
  }
}

/**
 * 3 y 4. contorno completo y de un solo píxel
 *
 * Completo: ningún píxel transparente puede tocar el dibujo (salvo el propio
 * contorno). Doble: ningún píxel de contorno puede quedarse sin tocar el
 * dibujo, porque significaría un anillo extra alrededor del contorno.
 */
function checkOutline(view, anim, i, frame) {
  const isShape = (x, y) => {
    const v = frame.get(x, y);
    return !!v && v !== '.' && v !== 'K';
  };
  const nudos = [];
  for (let y = 0; y < frame.h && nudos.length < 1; y++) {
    for (let x = 0; x < frame.w; x++) {
      if (frame.get(x, y) !== '.') continue;
      if (isShape(x - 1, y) || isShape(x + 1, y) || isShape(x, y - 1) || isShape(x, y + 1)) {
        nudos.push(`${x},${y}`);
        break;
      }
    }
  }
  if (nudos.length) {
    problems.push(`${view}/${anim}/${i + 1}: contorno incompleto (el dibujo toca el fondo en ${nudos[0]})`);
  }
  // contorno doble: ningún pixel de contorno debe quedar sin tocar la silueta
  let orphan = 0;
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      if (frame.get(x, y) !== 'K') continue;
      const around = [frame.get(x - 1, y), frame.get(x + 1, y), frame.get(x, y - 1), frame.get(x, y + 1)];
      if (!around.some((n) => n && n !== '.' && n !== 'K')) orphan++;
    }
  }
  if (orphan) {
    problems.push(`${view}/${anim}/${i + 1}: contorno doble (${orphan} px de anillo extra)`);
  }
}

/** 5. el juego y el arte deben coincidir en el tamaño de celda */
function checkSheetMeta() {
  const src = readFileSync(resolve(ROOT, 'js/robot-sheet.js'), 'utf8');
  const m = /"w"\s*:\s*(\d+)\s*,\s*"h"\s*:\s*(\d+)/.exec(src)
    || /w:\s*(\d+)\s*,\s*h:\s*(\d+)/.exec(src);
  if (!m) {
    problems.push('no se pudo leer el tamaño de celda de js/robot-sheet.js');
    return;
  }
  if (Number(m[1]) !== W || Number(m[2]) !== H) {
    problems.push(`js/robot-sheet.js dice ${m[1]}x${m[2]} y el arte mide ${W}x${H}: ` +
      'hay que regenerar las hojas con tools/build-robot.mjs');
  }
}

let frames = 0;
VIEWS.forEach((view) => {
  ANIM_ORDER.forEach((anim) => {
    all[view][anim].forEach((frame, i) => {
      frames++;
      checkFit(view, anim, i, frame);
      checkParts(view, anim, i, frame);
      checkOutline(view, anim, i, frame);
    });
  });
});
checkSheetMeta();

console.log('\nVALIDACIÓN DEL ARTE DE LOS FRAMES');
console.log('-'.repeat(64));
console.log(`  ${frames} poses revisadas · celda ${W}x${H}`);
console.log(`  animaciones: ${ANIM_ORDER.join(', ')}`);
console.log(`  vistas: ${VIEWS.join(', ')}`);

if (problems.length) {
  console.log(`\n  ${problems.length} problema(s):`);
  problems.forEach((p) => console.log('   · ' + p));
  console.log('\n  FALLA\n');
  process.exit(1);
}
console.log('\n  ok  ninguna pose se sale de la celda');
console.log('  ok  ninguna pose tiene piezas sueltas');
console.log('  ok  el contorno está completo y es de un solo píxel');
console.log('  ok  el tamaño de celda coincide con el que usa el juego');
console.log('\n  ARTE CORRECTO\n');
