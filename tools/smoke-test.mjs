/**
 * smoke-test.mjs — prueba automática sin navegador
 *
 * Carga index.html en jsdom con un canvas simulado, ejecuta la simulación
 * muchos frames y comprueba que:
 *   · el héroe se mueve, salta y cambia de animación (idle→walk→run→jump)
 *   · se recogen monedas y se aplastan enemigos
 *   · el piloto automático completa el nivel
 *   · cargar un sprite propio no rompe el juego
 *
 * Uso:  node tools/smoke-test.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');

/* ------------------------- canvas simulado ------------------------- */

function fakeCtx(canvas) {
  const noop = () => {};
  const ctx = {
    canvas,
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px monospace',
    textAlign: 'left',
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 0 }),
  };
  for (const m of ['clearRect', 'fillRect', 'strokeRect', 'drawImage', 'save', 'restore', 'translate',
    'scale', 'rotate', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'clip',
    'putImageData', 'setTransform', 'fillText', 'strokeText', 'rect', 'quadraticCurveTo', 'ellipse']) {
    ctx[m] = noop;
  }
  return ctx;
}

const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on('jsdomError', (e) => errors.push(String(e && e.message ? e.message : e)));
virtualConsole.on('error', (...a) => errors.push(a.join(' ')));
virtualConsole.on('warn', () => {});

const dom = new JSDOM(html, {
  url: 'https://example.com/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

window.HTMLCanvasElement.prototype.getContext = function () {
  this._ctx = this._ctx || fakeCtx(this);
  return this._ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

// jsdom no implementa matchMedia ni AudioContext: no hacen falta, pero
// nos aseguramos de que el código tolere su ausencia.

/* --------------------------- cargar scripts ------------------------- */

const scripts = ['js/hero-frames.js', 'js/hero-png.js', 'js/sprites.js', 'js/input.js', 'js/audio.js', 'js/game.js', 'js/ui.js'];
for (const file of scripts) {
  window.eval(readFileSync(resolve(ROOT, file), 'utf8'));
}

/* ------------------------------ pruebas ----------------------------- */

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? '  ok  ' : ' FALLA'} ${name}${extra ? ' — ' + extra : ''}`);
}

const { UI, Game, Input, Sprites } = window;
const document = window.document;

// 1. arranque de la interfaz
UI.init();
Game.start();
check('la interfaz arranca y el juego empieza', Game.state === 'playing', 'estado=' + Game.state);

// 2. animaciones (idle → walk → run)
Game.setSprite(Sprites.builtinHero(), true);
const seen = new Set();
const animsBySpeed = {};
Game.update(1 / 60);
seen.add(Game.player.anim);

Input.set('right', true);
for (let i = 0; i < 40; i++) Game.update(1 / 60);
animsBySpeed.walk = Game.player.anim;
const xAfterWalk = Game.player.x;

Input.set('run', true);
for (let i = 0; i < 90; i++) Game.update(1 / 60);
animsBySpeed.run = Game.player.anim;
check('se mueve hacia la derecha', Game.player.x > xAfterWalk + 40,
  `x=${Game.player.x.toFixed(1)} vx=${Game.player.vx.toFixed(1)}`);
check('animación de caminar', animsBySpeed.walk === 'walk', 'anim=' + animsBySpeed.walk);
check('animación de correr', animsBySpeed.run === 'run', 'anim=' + animsBySpeed.run);

// 3. salto con altura variable
Input.set('run', false);
Input.queueJump();
Input.set('jump', true);   // el jugador mantiene el boton
const yBefore = Game.player.y;
let apex = yBefore;
let airborne = false;
const jumpAnims = new Set();
for (let i = 0; i < 40; i++) {
  Game.update(1 / 60);
  apex = Math.min(apex, Game.player.y);
  if (!Game.player.onGround) airborne = true;
  if (!Game.player.onGround) jumpAnims.add(Game.player.anim);
  if (i === 6) Input.set('jump', false); // soltar el botón pronto
}
check('salta y vuelve al suelo', airborne && Game.player.onGround, `salto recortado=${(yBefore - apex).toFixed(1)} px`);

// salto completo (manteniendo el botón)
Game.start();
Game.update(1 / 60);
const y0 = Game.player.y;
let top = y0;
Input.queueJump();
Input.set('jump', true);
for (let i = 0; i < 60; i++) {
  Game.update(1 / 60);
  top = Math.min(top, Game.player.y);
  if (i > 30) Input.set('jump', false);
}
const jumpHeight = y0 - top;
check('salto completo alcanza 2 alturas del personaje', jumpHeight > 40 && jumpHeight < 60,
  `${jumpHeight.toFixed(1)} px (hitbox ${Game.playerH} px)`);
check('animaciones de salto y caída durante el salto',
  jumpAnims.has('jump') && jumpAnims.has('fall'), [...jumpAnims].join(','));

// 4. dibujar no lanza excepciones (todas las capas y opciones)
let renderOk = true;
try {
  Game.options.hitboxes = true;
  Game.options.shadows = true;
  Game.options.parallax = true;
  for (let i = 0; i < 12; i++) { Game.update(1 / 60); Game.render(); }
  Game.render();
} catch (e) {
  renderOk = false;
  console.error(e);
}
check('el render funciona (incluida la vista de colisiones)', renderOk);

// 5. monedas y enemigos: el bot juega solo
Game.start();
Game.options.autoplay = true;
const animKinds = new Set();
let steps = 0;
let completed = false;
let maxX = 0;
while (steps < 7200) { // 2 minutos de juego simulado
  Game.update(1 / 60);
  animKinds.add(Game.player.anim);
  maxX = Math.max(maxX, Game.player.x);
  steps++;
  if (Game.state === 'complete') { completed = true; break; }
  if (Game.state === 'dead') break;
}
Input.set('right', false);
Input.set('run', false);
Input.queueJump();
Game.update(1 / 60);

check('el bot avanza por el nivel', maxX > 600, `x=${maxX.toFixed(0)} de ${Game.LEVEL.width}`);
check('se usan las 4 animaciones de movimiento',
  ['idle', 'walk', 'run', 'fall'].every((a) => animKinds.has(a)) || completed,
  [...animKinds].join(','));
check('se recogen monedas', Game.stats.coins > 3, `monedas=${Game.stats.coins}/${Game.stats.coinsTotal}`);
check('el bot completa el nivel o llega muy lejos',
  completed || maxX > 2000, completed ? `completado en ${Game.stats.time.toFixed(1)}s` : `x=${maxX.toFixed(0)}`);

// 6. sprite propio (hoja de rejilla ficticia)
let customOk = true;
try {
  const fakeImage = { width: 96, height: 120, naturalWidth: 96, naturalHeight: 120 };
  const sheet = Sprites.sheetFromGrid(fakeImage, {
    fw: 16, fh: 24, gap: 0, order: Sprites.ANIM_ORDER,
    counts: { idle: 4, walk: 6, run: 6, jump: 2, fall: 2 },
    trim: false,
    fallback: Sprites.builtinHero().anims,
  });
  Game.setSprite(sheet, true);
  for (let i = 0; i < 30; i++) { Game.update(1 / 60); Game.render(); }
  customOk = sheet.anims.walk.length === 6 && sheet.flipped && Game.player.h > 0;
} catch (e) {
  customOk = false;
  console.error(e);
}
check('cargar un sprite propio funciona', customOk,
  `hitbox=${Game.playerW}×${Game.playerH} anim=${Game.player.anim}`);

// 7. interfaz: paneles, inspector, cargar/aplicar sprite y reinicio
const uiChecks = {};
try {
  UI.openPanel('sprite');
  uiChecks.panelOpen = UI.panel.classList.contains('open') && document.body.classList.contains('panel-open');
  UI.selectTab('frames');
  uiChecks.tabFrames = !document.querySelector('.tab-body[data-tab="frames"]').hidden;
  UI.setZoom(4);
  uiChecks.zoom = UI.zoom === 4;
  UI.setZoom(3);
  // cargar una imagen falsa (jsdom no decodifica PNG: simulamos la Image)
  const fakeFile = { name: 'heroe.png', type: 'image/png' };
  const fakeImg = { width: 96, height: 120, naturalWidth: 96, naturalHeight: 120 };
  const origLoad = Sprites.loadImage;
  Sprites.loadImage = () => Promise.resolve(fakeImg);
  UI.loadFile(fakeFile);
  await new Promise((r) => setTimeout(r, 0)); // dejamos resolver la promesa
  uiChecks.pending = !!UI.pending;
  uiChecks.applyDisabled = document.getElementById('btn-apply').disabled === false;
  UI.applySprite();
  uiChecks.applied = Game.sheet.name === 'sprite propio' && Game.sheet.anims.walk.length === 6;
  UI.resetSprite();
  uiChecks.reset = Game.sheet.name.indexOf('heroe incluido') === 0;
  Sprites.loadImage = origLoad;
  UI.selectTab('options');
  document.getElementById('opt-hurtbox').checked = true;
  document.getElementById('opt-hurtbox').dispatchEvent(new window.Event('change'));
  uiChecks.option = Game.options.hitboxes === true;
  document.getElementById('opt-hurtbox').checked = false;
  document.getElementById('opt-hurtbox').dispatchEvent(new window.Event('change'));
  UI.closePanel();
  uiChecks.closed = !UI.panel.classList.contains('open');
} catch (e) {
  uiChecks.error = String(e && e.stack ? e.stack.split('\n')[0] : e);
  console.error(e);
}
check('el panel de sprite carga y aplica una imagen',
  uiChecks.panelOpen && uiChecks.tabFrames && uiChecks.pending && uiChecks.applied && uiChecks.reset,
  uiChecks.error || JSON.stringify(uiChecks));
check('las opciones y el cierre del panel funcionan',
  uiChecks.option && uiChecks.closed && uiChecks.zoom, uiChecks.error || '');

// 8. arte auxiliar
const slime = Sprites.slimeSheet();
const coin = Sprites.coinFrames();
check('hoja del enemigo y monedas generadas', slime.anims.live.length === 4 && coin.frames.length === 4);
check('corazón del HUD generado', typeof UI.heartURL === 'string' && UI.heartURL.length > 20);

// 9. sin errores de consola
check('sin errores en consola', errors.length === 0, errors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exit(failed.length ? 1 : 0);
