/**
 * motion-test.mjs — SIMULADOR de movimiento del personaje
 *
 * Ejecuta el juego de verdad (motor, física y máquina de estados de animación)
 * dentro del entorno simulado y le hace recorrer un guion de movimientos:
 *
 *   andar → correr → frenar → saltar en carrera → caer por un hueco →
 *   girar a la izquierda → correr a la izquierda → pararse de espaldas
 *
 * Mientras corre, registra en cada frame qué vista, animación y frame concreto
 * del sprite se están dibujando, y comprueba:
 *   · que cada dirección usa su vista (derecha/izquierda) y que al pararse
 *     vuelve a la vista frontal (y a las espaldas tras unos segundos)
 *   · que las cinco animaciones se usan
 *   · QUÉ FRAMES de cada hoja llegan a verse (cobertura) y cuáles nunca
 *   · que no hay saltos imposibles de posición ni caídas fuera del mundo
 *
 * Salidas (en assets/):
 *   movimiento-informe.txt      informe legible con la cobertura
 *   movimiento-cobertura.png    mapa de calor de frames usados / no usados
 *   movimiento-frente.gif       bucle animado de las 5 animaciones (frente)
 *   movimiento-perfil.gif       ídem (perfil, derecha)
 *   movimiento-espaldas.gif     ídem (espaldas)
 *   movimiento-juego.gif        captura real jugando el nivel
 *
 * Uso:  node tools/motion-test.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { bootGame, ROOT, toPNG, downscale, filled, writePNG } from './fake-canvas.mjs';
import { Pix } from './pixel.mjs';
import { buildAll, W, H, ANIM_ORDER, VIEWS, PALETTE } from './robot.mjs';

const OUT = resolve(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });

const rig = await bootGame();
const { Game, Input, views, VIEW } = rig;

/* ====================================================================== */
/* Guion de movimiento                                                    */
/* ====================================================================== */
/* Cada paso: [segundos, teclas]. El simulador mantiene las teclas pulsadas
   durante ese tiempo y anota todo lo que ocurre.                        */

const SCRIPT = [
  { t: 1.2, keys: {}, name: 'quieto (idle, vista frontal)' },
  { t: 2.0, keys: { right: true }, name: 'andar a la derecha' },
  { t: 3.0, keys: { right: true, run: true }, name: 'correr a la derecha' },
  { t: 0.35, keys: { right: true, run: true, jump: true }, name: 'salto en carrera' },
  { t: 1.2, keys: { right: true, run: true }, name: 'caída tras el salto' },
  { t: 1.5, keys: {}, name: 'frenar (idle)' },
  { t: 2.0, keys: { left: true }, name: 'andar a la izquierda' },
  { t: 3.0, keys: { left: true, run: true }, name: 'correr a la izquierda' },
  { t: 1.0, keys: { left: true, run: true, jump: true }, name: 'salto hacia la izquierda' },
  { t: 1.5, keys: {}, name: 'quieto de nuevo' },
  { t: 4.5, keys: {}, name: 'mucho rato quieto (vista de espaldas)' },
  { t: 1.0, keys: { right: true }, name: 'volver a andar' },
];

const STEP = 1 / 60;

/* ====================================================================== */
/* Simulación                                                            */
/* ====================================================================== */

const log = [];                 // una entrada por frame simulado
const coverage = {};            // cobertura[view][anim] = Set de frames vistos
const gameplay = [];            // capturas del juego durante la prueba

/**
 * El motor elige la vista ('front', 'back', 'left' o 'right'), pero las hojas
 * son cuatro: la de la derecha es la misma que la del perfil. Agrupamos por
 * hoja para no contar dos veces la misma imagen.
 */
const SHEETS = [
  { key: 'front', label: 'FRONT (de frente)', views: ['front'] },
  { key: 'side', label: 'SIDE (perfil, derecha)', views: ['right', 'side'] },
  { key: 'left', label: 'LEFT (perfil, izquierda)', views: ['left'] },
  { key: 'back', label: 'BACK (espaldas)', views: ['back'] },
];
const sheetOfView = (view) => (SHEETS.find((s) => s.views.includes(view)) || SHEETS[0]).key;

/**
 * En modo automático la vista sigue a la animación: el robot quieto se ve de
 * frente (o de espaldas tras un rato) y, al moverse, de perfil. Por eso cada
 * hoja sólo tiene que mostrar unas animaciones concretas; las demás filas de
 * la hoja existen en el arte (y se ven con la opción «frente caminando» o en
 * el modo frame a frame del laboratorio), pero no corresponden aquí.
 */
const expectedAnims = (sheet) =>
  (sheet === 'front' || sheet === 'back' ? ['idle'] : ['walk', 'run', 'jump', 'fall']);

function resetCoverage() {
  Object.keys(coverage).forEach((k) => delete coverage[k]);
  SHEETS.forEach((sheet) => {
    coverage[sheet.key] = {};
    ANIM_ORDER.forEach((a) => { coverage[sheet.key][a] = new Set(); });
  });
}

function applyKeys(keys) {
  ['left', 'right', 'run'].forEach((k) => Input.set(k, !!keys[k]));
  const jump = !!keys.jump;
  if (jump && !Input.state.jump) Input.queueJump();
  Input.set('jump', jump);
  if (jump) Input.setHold(true);
  else Input.setHold(null);
}

resetCoverage();
Game.viewMode = 'auto';
Game.options.autoplay = false;
Game.start();

let simTime = 0;
let shotTick = 0;
let pitFalls = 0;
let respawns = 0;
let heartsBefore = Game.stats.hearts;
const teleports = [];
const stepReports = [];

SCRIPT.forEach((step) => {
  applyKeys(step.keys);
  const frames = Math.round(step.t / STEP);
  const seen = { views: new Set(), anims: new Set(), frames: new Set() };
  for (let i = 0; i < frames; i++) {
    const before = { x: Game.player.x, y: Game.player.y, onGround: Game.player.onGround };
    heartsBefore = Game.stats.hearts;
    Game.update(STEP);
    Game.render();
    simTime += STEP;

    const p = Game.player;
    const view = Game.currentView;
    const anim = p.anim;
    const frame = p.frame;

    log.push({
      t: simTime, step: step.name, view, anim, frame,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, state: Game.state,
    });
    const sheetKey = sheetOfView(view);
    if (coverage[sheetKey] && coverage[sheetKey][anim]) coverage[sheetKey][anim].add(frame);
    seen.views.add(view);
    seen.anims.add(anim);
    seen.frames.add(view + '/' + anim + '/' + frame);

    // telemetría: distinguimos reaparición (tras caerse) de un salto raro
    const dx = Math.abs(p.x - before.x);
    if (dx > 6) {
      const wasFallingOut = before.y > VIEW.h + 10 || p.y > VIEW.h + 10;
      const lostHeart = Game.stats.hearts < heartsBefore;
      if (wasFallingOut || lostHeart) respawns++;
      else teleports.push({ step: step.name, dx });
    }
    if (p.y > VIEW.h + 40) pitFalls++;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error('posición no finita en ' + step.name);
    }

    // capturas para el GIF de juego (una de cada 4)
    if (shotTick++ % 4 === 0 && gameplay.length < 90) {
      gameplay.push(rig.playerCrop(34, 56));
    }
  }
  stepReports.push({
    name: step.name,
    views: [...seen.views].join('+'),
    anims: [...seen.anims].join('+'),
  });
});

// dejar el mundo en reposo
applyKeys({});
Game.update(STEP);

/* ====================================================================== */
/* Análisis                                                              */
/* ====================================================================== */

const allViews = SHEETS.map((s) => s.key);
const animTotals = {};
ANIM_ORDER.forEach((a) => { animTotals[a] = views.front.anims[a].length; });

// 1. ¿se usan las cinco animaciones?
const usedAnims = new Set();
const usedViews = new Set();
Object.entries(coverage).forEach(([sheet, anims]) => {
  Object.entries(anims).forEach(([anim, frames]) => {
    if (frames.size) { usedAnims.add(anim); usedViews.add(sheet); }
  });
});

// 2. cobertura de frames por hoja y animación
const coverageTable = [];
allViews.forEach((sheet) => {
  ANIM_ORDER.forEach((anim) => {
    const total = animTotals[anim];
    const seen = coverage[sheet][anim] ? coverage[sheet][anim].size : 0;
    coverageTable.push({ view: sheet, anim, seen, total, missing: total - seen });
  });
});

// 3. comprobación de vistas por dirección: mirar la traza
function viewUsedWhile(anim, view) {
  return log.some((l) => l.anim === anim && l.view === view);
}
const walkedRight = viewUsedWhile('walk', 'right') || viewUsedWhile('run', 'right');
const walkedLeft = viewUsedWhile('walk', 'left') || viewUsedWhile('run', 'left');
const idleFront = log.some((l) => l.anim === 'idle' && l.view === 'front');
const idleBack = log.some((l) => l.anim === 'idle' && l.view === 'back');
const jumped = log.some((l) => l.anim === 'jump');
const fell = log.some((l) => l.anim === 'fall');

// 4. secuencia de animaciones observada (para el informe)
const seq = [];
log.forEach((l) => {
  const key = l.view + '/' + l.anim;
  if (!seq.length || seq[seq.length - 1].key !== key) {
    seq.push({ key, view: l.view, anim: l.anim, t: l.t, dur: 0 });
  }
  seq[seq.length - 1].dur += STEP;
});

/* ------------------------------- informe ------------------------------- */

const checks = [];
function check(name, ok, extra = '') {
  checks.push({ name, ok, extra });
}

check('se usan las cinco animaciones', usedAnims.size === ANIM_ORDER.length,
  [...usedAnims].join(', '));
check('se usan las dos vistas laterales (izquierda y derecha)',
  walkedLeft && walkedRight, `derecha=${walkedRight} izquierda=${walkedLeft}`);
check('quieto usa la vista frontal', idleFront);
check('tras varios segundos quieto se ve de espaldas', idleBack);
check('el salto y la caída tienen sus frames', jumped && fell);
check('no hay saltos de posición inexplicables',
  teleports.length === 0,
  teleports.slice(0, 2).map((t) => `${t.step}: ${t.dx.toFixed(1)} px`).join(' | '));
check('las animaciones que aparecen muestran TODOS sus frames',
  coverageTable.filter((c) => c.seen > 0).every((c) => c.missing === 0),
  coverageTable.filter((c) => c.seen > 0 && c.missing > 0)
    .map((c) => `${c.view}/${c.anim}: faltan ${c.missing}`).join(' | '));

// cobertura obligatoria: las hojas laterales deben mostrar el ciclo completo
const locomotionGaps = [];
['side', 'left'].forEach((sheet) => {
  ['walk', 'run', 'jump', 'fall'].forEach((anim) => {
    const row = coverageTable.find((c) => c.view === sheet && c.anim === anim);
    if (row && row.missing > 0) locomotionGaps.push(`${sheet}/${anim}: ${row.missing}`);
  });
});
check('el ciclo completo de caminar/correr/saltar/caer se ve en ambas direcciones',
  locomotionGaps.length === 0, locomotionGaps.join(' | '));

// cobertura esperada: cada hoja muestra enteras las animaciones que le tocan
const expectedGaps = [];
let expectedSeen = 0;
let expectedTotal = 0;
SHEETS.forEach((sheet) => {
  expectedAnims(sheet.key).forEach((anim) => {
    const row = coverageTable.find((c) => c.view === sheet.key && c.anim === anim);
    if (!row) return;
    expectedTotal += row.total;
    expectedSeen += row.seen;
    if (row.missing > 0) expectedGaps.push(`${sheet.key}/${anim}: faltan ${row.missing}`);
  });
});
check('la cobertura esperada por hoja está completa',
  expectedGaps.length === 0 && expectedTotal > 0,
  expectedGaps.length ? expectedGaps.join(' | ')
    : expectedSeen + '/' + expectedTotal + ' frames (' +
      Math.round((expectedSeen / expectedTotal) * 100) + '%)');

// --- ritmo de la animación: ningún frame aparece menos de 3 frames de juego ---
const runs = {};
log.forEach((l) => {
  const key = sheetOfView(l.view) + '/' + l.anim + '/' + l.frame;
  const last = runs[key];
  if (!last || last.end !== log.indexOf(l) - 1) {
    runs[key] = { key, count: 1, min: Infinity };
    if (!runs._list) runs._list = [];
    runs._list.push(runs[key]);
    void last;
  } else {
    last.count++;
  }
});
// recuento por tramos consecutivos
const runList = [];
{
  let prevKey = null;
  log.forEach((l) => {
    const key = sheetOfView(l.view) + '/' + l.anim + '/' + l.frame;
    if (key === prevKey) runList[runList.length - 1].count++;
    else { runList.push({ key, count: 1 }); prevKey = key; }
  });
}
// agrupamos por episodios (misma vista+animación seguida) y sólo miramos los
// tramos interiores: el primero y el último se truncan al entrar/salir
const episodes = [];
log.forEach((l) => {
  const key = sheetOfView(l.view) + '/' + l.anim;
  if (!episodes.length || episodes[episodes.length - 1].key !== key) {
    episodes.push({ key, runs: [] });
  }
  const ep = episodes[episodes.length - 1];
  const frameKey = key + '/' + l.frame;
  if (ep.runs.length && ep.runs[ep.runs.length - 1].key === frameKey) {
    ep.runs[ep.runs.length - 1].count++;
  } else {
    ep.runs.push({ key: frameKey, count: 1 });
  }
});
const flickers = [];
episodes.forEach((ep) => {
  if (ep.runs.length < 3) {
    // una animación de 1-2 frames no puede tener parpadeos interiores
    if (ep.runs.length === 2 && ep.runs[0].count < 3 && ep.key.indexOf('jump') < 0) {
      flickers.push(ep.runs[0]);
    }
    return;
  }
  ep.runs.slice(1, -1).forEach((r) => {
    if (r.count < 3) flickers.push(r);
  });
});
check('ningún frame se muestra solo un instante (parpadeo)',
  flickers.length === 0,
  flickers.slice(0, 3).map((f) => f.key + ' (' + f.count + ')').join(' | '));

const avgRun = runList.reduce((n, r) => n + r.count, 0) / Math.max(1, runList.length);
check('el ritmo de la animación es coherente (≥ 4 frames de juego por frame de sprite)',
  avgRun >= 4, avgRun.toFixed(1) + ' frames de juego por frame de sprite');
void runs;

/* informe de texto */

const lines = [];
lines.push('INFORME DE MOVIMIENTO · robot-gato ' + W + 'x' + H);
lines.push('='.repeat(64));
lines.push('');
lines.push('Guion simulado: ' + (simTime).toFixed(1) + ' s · ' + log.length + ' frames de juego');
lines.push('Caídas fuera del mundo: ' + pitFalls + '  ·  reapariciones: ' + respawns);
lines.push('');
lines.push('SECUENCIA OBSERVADA (vista/animación)');
lines.push('-'.repeat(64));
seq.forEach((s) => {
  lines.push('  ' + s.t.toFixed(2).padStart(6) + ' s  ' + s.key.padEnd(22) +
    s.dur.toFixed(2).padStart(5) + ' s');
});
lines.push('');
lines.push('PASOS DEL GUION');
lines.push('-'.repeat(64));
stepReports.forEach((s) => {
  if (s.issue) lines.push('  ¡AVISO! ' + s.name + ': ' + s.issue);
  else lines.push('  ' + s.name.padEnd(38) + ' vistas: ' + s.views + ' · ' + s.anims);
});
lines.push('');
lines.push('COBERTURA DE FRAMES POR HOJA');
lines.push('  █ visto   · falta   (no se usa en esta vista)');
lines.push('-'.repeat(64));
SHEETS.forEach((sheet) => {
  const view = sheet.key;
  lines.push('  ' + sheet.label);
  ANIM_ORDER.forEach((anim) => {
    const row = coverageTable.find((c) => c.view === view && c.anim === anim);
    const bar = '█'.repeat(row.seen) + '·'.repeat(row.missing);
    const applies = expectedAnims(view).indexOf(anim) >= 0;
    const note = !applies ? '  (no se usa en esta vista)'
      : row.missing ? '  ← faltan ' + row.missing : '';
    lines.push('    ' + anim.padEnd(6) + ' ' + bar.padEnd(row.total) +
      '  ' + row.seen + '/' + row.total + note);
  });
});
lines.push('');
lines.push('COMPROBACIONES');
lines.push('-'.repeat(64));
checks.forEach((c) => {
  lines.push('  ' + (c.ok ? ' ok  ' : 'FALLA ') + c.name + (c.extra ? ' — ' + c.extra : ''));
});
const failed = checks.filter((c) => !c.ok).length;
lines.push('');
lines.push((checks.length - failed) + '/' + checks.length + ' comprobaciones correctas');

const report = lines.join('\n');
writeFileSync(resolve(OUT, 'movimiento-informe.txt'), report + '\n');
console.log(report);

/* --------------------- mapa de calor de cobertura --------------------- */

function coverageHeatmap() {
  const cell = 14;
  const gap = 3;
  const labelW = 74;
  const rows = allViews.length * ANIM_ORDER.length;
  const cols = Math.max(...ANIM_ORDER.map((a) => animTotals[a]));
  const w = labelW + cols * (cell + gap) + gap;
  const h = rows * (cell + gap) + gap + 26;
  const p = new Pix(w, h, PALETTE);
  // fondo
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, 'm');
  let row = 0;
  allViews.forEach((view) => {
    ANIM_ORDER.forEach((anim) => {
      const total = animTotals[anim];
      const seen = coverage[view][anim] || new Set();
      const y0 = gap + row * (cell + gap);
      const applies = expectedAnims(view).indexOf(anim) >= 0;
      for (let i = 0; i < cols; i++) {
        const x0 = labelW + gap + i * (cell + gap);
        if (i >= total) continue;
        const ok = seen.has(i);
        // gris = el arte existe pero esa vista no reproduce esa animación
        const base = !applies ? 'm' : ok ? 'C' : 'o';
        p.rect(x0, y0, cell, cell, base);
        // brillo del marco
        const edge = !applies ? 'N' : ok ? 'c' : 'O';
        for (let k = 0; k < cell; k++) {
          p.set(x0 + k, y0, edge);
          p.set(x0 + k, y0 + cell - 1, edge);
          p.set(x0, y0 + k, edge);
          p.set(x0 + cell - 1, y0 + k, edge);
        }
      }
      row++;
    });
  });
  return { pix: p, cell, gap, labelW, cols, rowH: cell + gap, headerY: 4 };
}

const heat = coverageHeatmap();
writeFileSync(resolve(OUT, 'movimiento-cobertura.png'), heat.pix.toPNG());

// etiquetas del mapa de calor con ImageMagick
try {
  execFileSync('convert', ['-version'], { stdio: 'ignore' });
  const base = '/tmp/._heat.png';
  writeFileSync(base, heat.pix.toPNG());
  const args = [base, '-font', 'DejaVu-Sans', '-pointsize', '12'];
  let y = 4;
  allViews.forEach((view) => {
    const sheet = SHEETS.find((sh) => sh.key === view);
    args.push('-fill', '#ffd166', '-annotate', `+6+${y + 12}`, (sheet ? sheet.label : view).toUpperCase());
    y += 16;
    ANIM_ORDER.forEach((anim) => {
      const total = animTotals[anim];
      const seen = (coverage[view][anim] || new Set()).size;
      const applies = expectedAnims(view).indexOf(anim) >= 0;
      args.push('-fill', !applies ? '#5c6688' : seen === total ? '#8ef2a8' : '#ff9f43');
      args.push('-annotate', `+8+${y + 2}`, anim + ' ' + seen + '/' + total + (applies ? '' : ' (no aplica)'));
      y += heat.rowH;
    });
  });
  args.push(resolve(OUT, 'movimiento-cobertura.png'));
  execFileSync('convert', args);
  execFileSync('rm', ['-f', base]);
} catch (e) {
  /* sin etiquetas */
}

/* ====================================================================== */
/* GIFs: las animaciones de cada vista, tal cual las muestra el motor     */
/* ====================================================================== */

const all = buildAll();
const GIF_SCALE = 3;

/** Tira horizontal de los frames de una animación, en orden, con la pose del motor */
function animStrip(view, anim, scale) {
  const frames = all[view][anim];
  const strip = new Pix(frames.length * (W * scale + 2) + 2, H * scale + 4, PALETTE);
  frames.forEach((f, i) => strip.blit(f.scaled(scale), 2 + i * (W * scale + 2), 2));
  return strip;
}

/** GIF por vista: cinco filas (una por animación) en bucle */
async function makeReelGif(view, file, { scale = GIF_SCALE, delay = 10 } = {}) {
  if (!all[view]) return false;
  const rows = ANIM_ORDER.map((a) => all[view][a]);
  const maxFrames = Math.max(...rows.map((r) => r.length));
  const cellW = W * scale + 2;
  const cellH = H * scale + 4;
  const frames = [];
  for (let f = 0; f < maxFrames; f++) {
    const p = new Pix(maxFrames * cellW + 2, rows.length * cellH + 2, PALETTE);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, 'N');
    rows.forEach((row, ri) => {
      // cada fila cicla por sus propios frames: así se ven todos en marcha
      for (let col = 0; col < maxFrames; col++) {
        const frame = row[(col + f) % row.length];
        p.blit(frame.scaled(scale), 2 + col * cellW, 2 + ri * cellH);
      }
    });
    frames.push(p);
  }
  const dir = '/tmp/._reel';
  execFileSync('mkdir', ['-p', dir]);
  frames.forEach((pix, i) => {
    writeFileSync(`${dir}/f${String(i).padStart(3, '0')}.png`, pix.toPNG());
  });
  execFileSync('convert', [
    '-delay', String(delay), '-loop', '0',
    `${dir}/f*.png`, '-layers', 'Optimize', resolve(OUT, file),
  ]);
  execFileSync('rm', ['-rf', dir]);
  return true;
}

let gifs = 0;
try {
  execFileSync('convert', ['-version'], { stdio: 'ignore' });
  if (await makeReelGif('front', 'movimiento-frente.gif')) gifs++;
  if (await makeReelGif('side', 'movimiento-perfil.gif')) gifs++;
  if (await makeReelGif('back', 'movimiento-espaldas.gif')) gifs++;
  // GIF del juego real: fotogramas capturados mientras el personaje se movía
  if (gameplay.length > 4) {
    const dir = '/tmp/._game';
    execFileSync('mkdir', ['-p', dir]);
    gameplay.forEach((s, i) => {
      writeFileSync(`${dir}/g${String(i).padStart(3, '0')}.png`, toPNG(downscale(s, 2)));
    });
    execFileSync('convert', [
      '-delay', '6', '-loop', '0',
      `${dir}/g*.png`, '-layers', 'Optimize', resolve(OUT, 'movimiento-juego.gif'),
    ]);
    execFileSync('rm', ['-rf', dir]);
    gifs++;
  }
} catch (e) {
  console.log('\n(ImageMagick no disponible: no se generan los GIF)');
}

void filled;
void animStrip;

console.log('\nSalidas en assets/:');
console.log('  movimiento-informe.txt');
console.log('  movimiento-cobertura.png');
if (gifs) console.log('  movimiento-{frente,perfil,espaldas,juego}.gif');

process.exit(failed ? 1 : 0);
