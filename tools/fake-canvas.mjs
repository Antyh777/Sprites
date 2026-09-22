/**
 * fake-canvas.mjs — entorno de simulación sin navegador
 *
 * Implementa lo mínimo de <canvas> 2D (fillRect, drawImage, gradientes,
 * getImageData/putImageData, alpha) sobre jsdom para poder EJECUTAR el juego
 * de verdad (motor, física, animaciones) y capturar lo que dibuja.
 *
 * Lo usan tools/render-shot.mjs (capturas) y tools/motion-test.mjs
 * (prueba automática de movimiento).
 */
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './png.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export class Surface {
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
  scaled(n) {
    const out = new Surface(this.width * n, this.height * n);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        for (let sy = 0; sy < n; sy++) {
          for (let sx = 0; sx < n; sx++) {
            const j = ((y * n + sy) * out.width + (x * n + sx)) * 4;
            out.data[j] = this.data[i];
            out.data[j + 1] = this.data[i + 1];
            out.data[j + 2] = this.data[i + 2];
            out.data[j + 3] = this.data[i + 3];
          }
        }
      }
    }
    return out;
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

export function surfaceOf(el) {
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

export function makeCtx(canvas) {
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
      else if (src && src._canvas) source = surfaceOf(src._canvas); // Image simulada
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
export function toPNG(surf) {
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

/* ============================ arranque del juego ==================== */

/**
 * Levanta index.html en jsdom con el canvas simulado y devuelve el juego.
 * @returns {Promise<object>} { window, Game, Sprites, Input, UI, views, ... }
 */
export async function bootGame(opts = {}) {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8')
    .replace(/<script[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'https://example.com/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = function () {
    return this._ctx || makeCtx(this);
  };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

  // jsdom no decodifica PNG: convertimos el data URL en un canvas ya pintado
  window.Image = class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; }
    set src(v) {
      this._src = v;
      try {
        const png = decodePNG(Buffer.from(v.split(',')[1], 'base64'));
        const c = window.document.createElement('canvas');
        c.width = png.width;
        c.height = png.height;
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(png.width, png.height);
        img.data.set(png.data);
        ctx.putImageData(img, 0, 0);
        this._canvas = c;
        this.width = png.width;
        this.height = png.height;
        this.naturalWidth = png.width;
        this.naturalHeight = png.height;
        setTimeout(() => this.onload && this.onload(), 0);
      } catch (e) {
        setTimeout(() => this.onerror && this.onerror(e), 0);
      }
    }
    get src() { return this._src; }
  };

  const scripts = [
    'js/robot-sheet.js', 'js/sprites.js', 'js/input.js',
    'js/audio.js', 'js/game.js', 'js/ui.js',
  ];
  for (const f of scripts) window.eval(readFileSync(resolve(ROOT, f), 'utf8'));

  const { Game, Sprites, Input, UI } = window;
  window.document.getElementById('game').width = Game.VIEW.w;
  window.document.getElementById('game').height = Game.VIEW.h;
  UI.init();
  await new Promise((r) => setTimeout(r, 0));   // carga de hojas
  if (!Game.views) throw new Error('no se cargaron las hojas del robot');

  const rig = {
    window,
    dom,
    Game,
    Sprites,
    Input,
    UI,
    views: Game.views,
    VIEW: Game.VIEW,

    /** Lienzo donde dibuja el juego */
    shot: () => surfaceOf(window.document.getElementById('game')),

    /** Copia de una región */
    crop: (surface, x, y, w, h) => {
      const out = new Surface(w, h);
      out.copyFrom(surface, x, y, w, h, 0, 0, w, h, 1);
      return out;
    },

    /** Pega lienzos en horizontal */
    hstack: (items, gap = 6, bg = [26, 30, 52, 255]) => {
      const w = items.reduce((n, s) => n + s.width, 0) + gap * (items.length + 1);
      const h = Math.max(...items.map((s) => s.height)) + gap * 2;
      const out = filled(w, h, bg);
      let x = gap;
      for (const s of items) {
        out.copyFrom(s, 0, 0, s.width, s.height, x, gap, s.width, s.height, 1);
        x += s.width + gap;
      }
      return out;
    },

    /** Pega lienzos en vertical */
    vstack: (items, gap = 6, bg = [26, 30, 52, 255]) => {
      const w = Math.max(...items.map((s) => s.width)) + gap * 2;
      const h = items.reduce((n, s) => n + s.height, 0) + gap * (items.length + 1);
      const out = filled(w, h, bg);
      let y = gap;
      for (const s of items) {
        out.copyFrom(s, 0, 0, s.width, s.height, gap, y, s.width, s.height, 1);
        y += s.height + gap;
      }
      return out;
    },

    /** Vista previa del jugador en un momento dado */
    playerCrop: (padX = 30, padY = 52) => {
      const p = Game.player;
      const cx = Math.round(p.x + p.w / 2 - Game.cam.x);
      const feet = Math.round(p.y + p.h);
      return rig.crop(rig.shot(), cx - padX, feet - padY, padX * 2, padY + 6);
    },
  };
  return rig;
}

/** Lienzo relleno de un color */
export function filled(w, h, bg = [26, 30, 52, 255]) {
  const out = new Surface(w, h);
  for (let i = 0; i < w * h; i++) {
    out.data[i * 4] = bg[0];
    out.data[i * 4 + 1] = bg[1];
    out.data[i * 4 + 2] = bg[2];
    out.data[i * 4 + 3] = bg[3] == null ? 255 : bg[3];
  }
  return out;
}

/** Reduce un lienzo a la mitad (para GIFs más ligeros) */
export function downscale(surface, n = 2) {
  const w = Math.max(1, Math.floor(surface.width / n));
  const h = Math.max(1, Math.floor(surface.height / n));
  const out = new Surface(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const si = ((y * n + j) * surface.width + (x * n + i)) * 4;
          r += surface.data[si]; g += surface.data[si + 1];
          b += surface.data[si + 2]; a += surface.data[si + 3];
        }
      }
      const k = n * n;
      const di = (y * w + x) * 4;
      out.data[di] = r / k; out.data[di + 1] = g / k;
      out.data[di + 2] = b / k; out.data[di + 3] = a / k;
    }
  }
  return out;
}

/** Escribe un PNG en disco */
export function writePNG(surface, file) {
  writeFileSync(file, toPNG(surface));
}
