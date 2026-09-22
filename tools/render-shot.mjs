/**
 * render-shot.mjs — "capturas" del juego sin navegador
 *
 * Implementa un canvas 2D minimo (fillRect, drawImage, gradientes, alpha)
 * sobre jsdom, dibuja escenas reales del juego y exporta PNG para revisarlas.
 *
 * Uso:  node tools/render-shot.mjs /tmp/shots
 */
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp/shots';
mkdirSync(OUT, { recursive: true });

/* ============================ rasterizador ========================== */

function parseColor(col) {
  if (col && typeof col === 'object' && col.__gradient) return null;
  if (typeof col !== 'string') return [0, 0, 0, 255];
  const s = col.trim();
  if (s[0] === '#') {
    const hex = s.length === 4
      ? s.slice(1).split('').map((c) => c + c).join('')
      : s.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      255,
    ];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  if (s === 'transparent') return [0, 0, 0, 0];
  return [255, 0, 255, 255];
}

function gradientColor(stops, y) {
  // gradiente vertical entre paradas
  if (!stops.length) return [0, 0, 0, 255];
  if (y <= stops[0].at) return stops[0].rgb;
  if (y >= stops[stops.length - 1].at) return stops[stops.length - 1].rgb;
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i].at) {
      const a = stops[i - 1];
      const b = stops[i];
      const t = (y - a.at) / Math.max(0.0001, b.at - a.at);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
        255,
      ];
    }
  }
  return stops[stops.length - 1].rgb;
}

class Surface {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  resize(w, h) {
    if (this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  blend(x, y, rgb, alpha) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const i = (y * this.width + x) * 4;
    const a = Math.min(1, alpha);
    const inv = 1 - a;
    this.data[i] = rgb[0] * a + this.data[i] * inv;
    this.data[i + 1] = rgb[1] * a + this.data[i + 1] * inv;
    this.data[i + 2] = rgb[2] * a + this.data[i + 2] * inv;
    this.data[i + 3] = Math.max(this.data[i + 3], Math.round(255 * a));
  }
  copyFrom(src, sx, sy, sw, sh, dx, dy, dw, dh, alpha) {
    for (let y = 0; y < dh; y++) {
      const syy = sy + Math.floor((y * sh) / dh);
      if (syy < 0 || syy >= src.height) continue;
      for (let x = 0; x < dw; x++) {
        const sxx = sx + Math.floor((x * sw) / dw);
        if (sxx < 0 || sxx >= src.width) continue;
        const i = (syy * src.width + sxx) * 4;
        const a = (src.data[i + 3] / 255) * alpha;
        if (a <= 0) continue;
        this.blend(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], a);
      }
    }
  }
}

const surfaces = new WeakMap();

function surfaceOf(el) {
  let s = surfaces.get(el);
  const need = { w: el.width | 0, h: el.height | 0 };
  if (!s) {
    s = new Surface(Math.max(1, need.w), Math.max(1, need.h));
    surfaces.set(el, s);
  } else {
    s.resize(Math.max(1, need.w), Math.max(1, need.h));
  }
  return s;
}

function makeCtx(canvas) {
  const state = { fillStyle: '#000', globalAlpha: 1, tx: 0, ty: 0, imageSmoothingEnabled: false };
  const stack = [];
  const surf = () => surfaceOf(canvas);

  const ctx = {
    canvas,
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v) { state.fillStyle = v; },
    get globalAlpha() { return state.globalAlpha; },
    set globalAlpha(v) { state.globalAlpha = v; },
    set strokeStyle(v) { state.strokeStyle = v; },
    get strokeStyle() { return state.strokeStyle || '#000'; },
    set lineWidth(v) { state.lineWidth = v; },
    get lineWidth() { return state.lineWidth || 1; },
    set font(v) { state.font = v; },
    get font() { return state.font || '10px monospace'; },
    set textAlign(v) { state.textAlign = v; },
    get textAlign() { return state.textAlign || 'left'; },
    get imageSmoothingEnabled() { return false; },
    set imageSmoothingEnabled(v) { void v; },

    save() { stack.push({ ...state }); },
    restore() {
      const s = stack.pop();
      if (s) Object.assign(state, s);
    },
    translate(x, y) { state.tx += x; state.ty += y; },
    scale() {},
    rotate() {},
    setTransform() {},

    createLinearGradient(x0, y0, x1, y1) {
      const g = { __gradient: true, stops: [], x0, y0, x1, y1 };
      g.addColorStop = (at, color) => { g.stops.push({ at, rgb: parseColor(color) }); };
      return g;
    },
    createPattern: () => null,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => {
      const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const s = surf();
          const sx = x + xx; const sy = y + yy;
          if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
          const i = (sy * s.width + sx) * 4;
          const o = (yy * w + xx) * 4;
          out.data[o] = s.data[i]; out.data[o + 1] = s.data[i + 1];
          out.data[o + 2] = s.data[i + 2]; out.data[o + 3] = s.data[i + 3];
        }
      }
      return out;
    },
    putImageData(img, dx, dy) {
      const s = surf();
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          const tx = dx + x; const ty = dy + y;
          if (tx < 0 || ty < 0 || tx >= s.width || ty >= s.height) continue;
          const j = (ty * s.width + tx) * 4;
          s.data[j] = img.data[i]; s.data[j + 1] = img.data[i + 1];
          s.data[j + 2] = img.data[i + 2]; s.data[j + 3] = img.data[i + 3];
        }
      }
    },

    fillRect(x, y, w, h) {
      const s = surf();
      const gx = Math.round(x) + state.tx;
      const gy = Math.round(y) + state.ty;
      const gw = Math.round(w);
      const gh = Math.round(h);
      const grad = state.fillStyle && state.fillStyle.__gradient ? state.fillStyle : null;
      const rgb = grad ? null : parseColor(state.fillStyle);
      for (let yy = 0; yy < gh; yy++) {
        const py = gy + yy;
        const col = grad ? gradientColor(grad.stops, py) : rgb;
        for (let xx = 0; xx < gw; xx++) {
          s.blend(gx + xx, py, col, state.globalAlpha * (col[3] / 255));
        }
      }
    },
    strokeRect(x, y, w, h) {
      const s = surf();
      const rgb = parseColor(state.strokeStyle);
      const a = state.globalAlpha * (rgb[3] / 255);
      const gx = Math.round(x) + state.tx;
      const gy = Math.round(y) + state.ty;
      for (let xx = 0; xx <= w; xx++) {
        s.blend(gx + xx, gy, rgb, a);
        s.blend(gx + xx, gy + h, rgb, a);
      }
      for (let yy = 0; yy <= h; yy++) {
        s.blend(gx, gy + yy, rgb, a);
        s.blend(gx + w, gy + yy, rgb, a);
      }
    },
    clearRect(x, y, w, h) {
      const s = surf();
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const i = ((Math.round(y) + yy) * s.width + Math.round(x) + xx) * 4;
          s.data[i] = s.data[i + 1] = s.data[i + 2] = s.data[i + 3] = 0;
        }
      }
    },

    drawImage(src, ...a) {
      const s = surf();
      let source;
      if (src instanceof Surface) source = src;
      else if (src && src._ctx) source = surfaceOf(src);
      else if (src && src.width) source = null; // imagen cargada: no simulada
      if (!source) return;

      let sx = 0; let sy = 0; let sw = source.width; let sh = source.height;
      let dx = 0; let dy = 0; let dw = sw; let dh = sh;
      if (a.length === 2) { [dx, dy] = a; }
      else if (a.length === 4) { [dx, dy, dw, dh] = a; }
      else if (a.length === 8) { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
      s.copyFrom(source, sx, sy, sw, sh, Math.round(dx) + state.tx, Math.round(dy) + state.ty, Math.round(dw), Math.round(dh), state.globalAlpha);
    },

    // el resto de la API no afecta a los pixeles que nos interesan
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    fill() {}, stroke() {}, clip() {}, rect() {}, quadraticCurveTo() {}, ellipse() {},
    fillText() {}, strokeText() {}, measureText: () => ({ width: 0 }),
    toDataURL: () => 'data:image/png;base64,',
  };
  canvas._ctx = ctx;
  return ctx;
}

/* ============================== PNG ================================= */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function toPNG(surf) {
  const raw = Buffer.alloc((surf.width * 4 + 1) * surf.height);
  for (let y = 0; y < surf.height; y++) {
    raw[y * (surf.width * 4 + 1)] = 0;
    Buffer.from(surf.data.buffer, surf.data.byteOffset + y * surf.width * 4, surf.width * 4)
      .copy(raw, y * (surf.width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(surf.width, 0);
  ihdr.writeUInt32BE(surf.height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ============================ jsdom + juego ========================= */

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () { return this._ctx || makeCtx(this); };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

for (const f of ['js/hero-frames.js', 'js/hero-png.js', 'js/sprites.js', 'js/input.js', 'js/audio.js', 'js/game.js', 'js/ui.js']) {
  window.eval(readFileSync(resolve(ROOT, f), 'utf8'));
}
const { Game, Sprites, Input, UI } = window;
UI.init();

/* ---- utilidades de montaje ---- */

const VIEW = Game.VIEW;

function shot() {
  return surfaceOf(window.document.getElementById('game'));
}

function crop(surface, x, y, w, h) {
  const out = new Surface(w, h);
  out.copyFrom(surface, x, y, w, h, 0, 0, w, h, 1);
  return out;
}

function hstack(surfaces, gap = 6, bg = [26, 30, 52, 255]) {
  const w = surfaces.reduce((n, s) => n + s.width, 0) + gap * (surfaces.length + 1);
  const h = Math.max(...surfaces.map((s) => s.height)) + gap * 2;
  const out = new Surface(w, h);
  for (let i = 0; i < out.width * out.height; i++) {
    out.data[i * 4] = bg[0]; out.data[i * 4 + 1] = bg[1]; out.data[i * 4 + 2] = bg[2]; out.data[i * 4 + 3] = 255;
  }
  let x = gap;
  for (const s of surfaces) {
    out.copyFrom(s, 0, 0, s.width, s.height, x, gap, s.width, s.height, 1);
    x += s.width + gap;
  }
  return out;
}

function vstack(surfaces, gap = 6, bg = [26, 30, 52, 255]) {
  const w = Math.max(...surfaces.map((s) => s.width)) + gap * 2;
  const h = surfaces.reduce((n, s) => n + s.height, 0) + gap * (surfaces.length + 1);
  const out = new Surface(w, h);
  for (let i = 0; i < out.width * out.height; i++) {
    out.data[i * 4] = bg[0]; out.data[i * 4 + 1] = bg[1]; out.data[i * 4 + 2] = bg[2]; out.data[i * 4 + 3] = 255;
  }
  let y = gap;
  for (const s of surfaces) {
    out.copyFrom(s, 0, 0, s.width, s.height, gap, y, s.width, s.height, 1);
    y += s.height + gap;
  }
  return out;
}

/* ---- 1. poses de animación dentro del juego ---- */

Game.setSprite(Sprites.builtinHero(), true);
Game.start();
Game.update(1 / 60);
const poses = [];
const poseList = [['idle', 1], ['walk', 1], ['walk', 4], ['run', 2], ['run', 4], ['jump', 0], ['fall', 0]];
for (const [name, frame] of poseList) {
  Game.player.x = 560;
  Game.player.y = Game.GROUND_TOP - Game.player.h;
  Game.player.vx = name === 'idle' ? 0 : 100;
  Game.player.anim = name;
  Game.player.frame = frame;
  Game.cam.x = Math.round(Game.player.x - VIEW.w * 0.42);
  Game.render();
  poses.push(crop(shot(), 120, 90, 140, 100));
}
writeFileSync(resolve(OUT, 'poses.png'), toPNG(hstack(poses)));

/* ---- 2. escenas completas jugando con el piloto automático ---- */

Game.start();
Game.options.autoplay = true;
const scenes = [];
const marks = [90, 260, 520, 900, 1500, 2100, 2500];
let step = 0;
while (step <= Math.max(...marks) && Game.state !== 'complete') {
  Game.update(1 / 60);
  step++;
  if (marks.includes(step)) {
    Game.render();
    scenes.push(crop(shot(), 0, 0, VIEW.w, VIEW.h));
  }
}
Game.options.autoplay = false;
writeFileSync(resolve(OUT, 'escenas.png'), toPNG(vstack(scenes)));

/* ---- 3. fondo con y sin parallax + vista de colisiones ---- */

Game.start();
Game.player.x = 1400;
Game.player.y = Game.GROUND_TOP - Game.player.h;
Game.cam.x = 1200;
Game.options.parallax = true; Game.render();
const parOn = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.parallax = false; Game.render();
const parOff = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.parallax = true;
Game.options.hitboxes = true; Game.render();
const hit = crop(shot(), 0, 0, VIEW.w, VIEW.h);
Game.options.hitboxes = false;
writeFileSync(resolve(OUT, 'extras.png'), toPNG(vstack([parOn, parOff, hit])));

console.log('PNG escritos en ' + OUT + ' (poses.png, escenas.png, extras.png)');

// jsdom mantiene vivo el bucle de requestAnimationFrame: cerramos a mano
process.exit(0);
