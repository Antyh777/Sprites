/**
 * lab-test.mjs — comprobaciones del laboratorio de movimiento (lab.html)
 *
 * Carga lab.html en jsdom con el canvas simulado, ejecuta js/lab.js y
 * comprueba que el entorno de pruebas se comporta como debe: que el motor
 * real responde a las teclas, que la vista acompaña a la animación, que el
 * guion automático toca todas las hojas y que la cobertura esperada llega
 * al 100 %.
 *
 * Uso:  node tools/lab-test.mjs
 */
import { fakeWindow, surfaceOf, LAB_SCRIPTS } from './fake-canvas.mjs';

const STEP = 1 / 60;
const checks = [];

function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${name}${detail ? ' — ' + detail : ''}`);
}

const { window } = fakeWindow('lab.html', LAB_SCRIPTS);
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e)));

const Lab = window.Lab;
if (!Lab) throw new Error('js/lab.js no exportó Lab');

console.log('\nLABORATORIO DE MOVIMIENTO (lab.html)');
console.log('-'.repeat(64));

Lab.init();
for (let i = 0; i < 300 && !Lab.Game; i++) await new Promise((r) => setTimeout(r, 10));
check('lab.html arranca el motor real', !!Lab.Game);

/* ---------------- modo conducir: las teclas mueven al personaje ---------- */

Lab.reset();
Lab.applyMode('drive');
const Game = Lab.Game;
const x0 = Game.player.x;
for (let i = 0; i < 60 * 2; i++) { window.Input.set('right', true); Lab.tick(STEP); Lab.draw(); }
const xWalk = Game.player.x;
const viewWalk = Game.currentView;
const animWalk = Game.player.anim;

window.Input.set('run', true);
for (let i = 0; i < 60 * 1.5; i++) { Lab.tick(STEP); Lab.draw(); }
const xRun = Game.player.x;
const animRun = Game.player.anim;

window.Input.set('right', false); window.Input.set('run', false);
for (let i = 0; i < 60; i++) { Lab.tick(STEP); Lab.draw(); }
const viewStop = Game.currentView;
const animStop = Game.player.anim;

for (let i = 0; i < 60 * 1.5; i++) { window.Input.set('left', true); Lab.tick(STEP); Lab.draw(); }
const viewLeft = Game.currentView;
window.Input.set('left', false);

check('andar con → avanza y usa la animación walk',
  xWalk > x0 + 60 && animWalk === 'walk', `x ${x0.toFixed(0)} → ${xWalk.toFixed(0)}, anim ${animWalk}`);
check('correr con shift acelera (run)', xRun > xWalk + 80 && animRun === 'run',
  `x ${xWalk.toFixed(0)} → ${xRun.toFixed(0)}, anim ${animRun}`);
check('andando a la derecha la vista es el perfil derecho', viewWalk === 'right', 'vista ' + viewWalk);
check('andando a la izquierda la vista es el perfil izquierdo', viewLeft === 'left', 'vista ' + viewLeft);
check('al pararse vuelve a la vista frontal con la animación idle',
  viewStop === 'front' && animStop === 'idle', `vista ${viewStop}, anim ${animStop}`);

/* ---------------- guion automático: recorrido completo ------------------- */

Lab.reset();
Lab.applyMode('auto');
const views = new Set();
const anims = new Set();
for (let i = 0; i < 60 * 24; i++) {
  Lab.tick(STEP);
  Lab.draw();
  views.add(Game.currentView);
  anims.add(Game.player.anim);
}
const totalEl = window.document.getElementById('coverage-total');
const m = /(\d+)\/(\d+)/.exec(totalEl.textContent || '');
const got = m ? Number(m[1]) : 0;
const expected = m ? Number(m[2]) : -1;

check('el guion usa las cuatro vistas', views.size === 4, [...views].join(', '));
check('el guion usa las cinco animaciones',
  ['idle', 'walk', 'run', 'jump', 'fall'].every((a) => anims.has(a)) && anims.size === 5,
  [...anims].join(', '));
check('el guion recorre la animación completa sin huecos',
  Object.keys(Lab.coverage.side || {}).every((a) => {
    const total = Lab.views.front.anims[a].length;
    return a === 'idle' || Object.keys(Lab.coverage.side[a]).length === total;
  }), 'hoja de perfil: walk/run/jump/fall completos');
check('la cobertura esperada llega al 100 % con el guion',
  got === expected && expected > 0, totalEl.textContent);
check('el panel de cobertura se marca como completado',
  totalEl.classList.contains('done'));

/* ---------------- modo frame a frame ------------------------------------ */

Lab.applyMode('manual');
Lab.manual.view = 'left';
Lab.manual.anim = 'run';
Lab.manual.frame = 4;
Lab.tick(STEP);
Lab.draw();
check('el modo frame a frame aplica vista, animación y frame',
  Game.currentView === 'left' && Game.player.anim === 'run' && Game.player.frame === 4,
  `${Game.currentView}/${Game.player.anim}/${Game.player.frame}`);

/* ---------------- se dibuja de verdad ----------------------------------- */

const surf = surfaceOf(window.document.getElementById('lab'));
let nonBg = 0;
for (let i = 0; i < surf.width * surf.height; i++) {
  const r = surf.data[i * 4], g = surf.data[i * 4 + 1], b = surf.data[i * 4 + 2];
  if (Math.abs(r - 21) > 14 || Math.abs(g - 26) > 14 || Math.abs(b - 46) > 14) nonBg++;
}
check('el lienzo del laboratorio dibuja al personaje', nonBg > 300, nonBg + ' px distintos del fondo');

/* ---------------- opción «frente caminando» ----------------------------- */

Lab.reset();
Lab.frontWalk = true;
Lab.Game.options.frontWalk = true;
Lab.coverage = {};
Lab.applyMode('auto');
const frontAnims = new Set();
const frontViews = new Set();
for (let i = 0; i < 60 * 16; i++) {
  Lab.tick(STEP);
  Lab.draw();
  if (Game.currentView === 'front') frontAnims.add(Game.player.anim);
  frontViews.add(Game.currentView);
}
check('con «frente caminando» la hoja frontal anima el movimiento',
  frontViews.size === 1 && frontAnims.size === 5,
  'vistas ' + [...frontViews].join(',') + ' · animaciones ' + [...frontAnims].join(','));
const t2 = window.document.getElementById('coverage-total').textContent;
check('cobertura de la hoja frontal al 100 %', /100%/.test(t2), t2);

check('sin errores de consola', errors.length === 0, errors.join(' | '));

/* ------------------------------- resumen -------------------------------- */

const ok = checks.filter((c) => c.ok).length;
console.log('-'.repeat(64));
console.log(`${ok}/${checks.length} comprobaciones correctas\n`);
process.exit(ok === checks.length ? 0 : 1);
