/**
 * pixel.mjs — lienzo de pixel art por índices de paleta
 *
 * Se trabaja con "claves" de paleta (1 carácter por píxel), no con colores,
 * de modo que reemplazar tonos, contornear o volcar a ASCII es inmediato.
 */
import { encodePNG } from './png.mjs';

export class Pix {
  constructor(w, h, palette) {
    this.w = w;
    this.h = h;
    this.palette = palette;               // { clave: '#rrggbb' | null }
    this.d = new Array(w * h).fill('.');
  }

  idx(x, y) { return Math.round(y) * this.w + Math.round(x); }
  inside(x, y) {
    x = Math.round(x); y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x, y) { return this.inside(x, y) ? this.d[this.idx(x, y)] : '.'; }
  set(x, y, c) {
    if (!this.inside(x, y)) return;
    if (c === null || c === undefined) c = '.';
    this.d[this.idx(x, y)] = c;
  }

  /* ------------------------------ primitivas ------------------------------ */

  rect(x, y, w, h, c) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
  }

  roundRect(x, y, w, h, r, c) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        // distancia a la esquina más cercana
        let dx = 0;
        let dy = 0;
        if (xx < r) dx = r - xx - 1;
        else if (xx >= w - r) dx = xx - (w - r);
        if (yy < r) dy = r - yy - 1;
        else if (yy >= h - r) dy = yy - (h - r);
        if (dx * dx + dy * dy > (r - 0.5) * (r - 0.5) + r) continue;
        this.set(x + xx, y + yy, c);
      }
    }
  }

  ellipse(cx, cy, rx, ry, c) {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.02) this.set(x, y, c);
      }
    }
  }

  ring(cx, cy, rOuter, rInner, c) {
    const x0 = Math.floor(cx - rOuter - 1);
    const x1 = Math.ceil(cx + rOuter + 1);
    const y0 = Math.floor(cy - rOuter - 1);
    const y1 = Math.ceil(cy + rOuter + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rOuter + 0.35 && d >= rInner - 0.35) this.set(x, y, c);
      }
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Línea gruesa (para cápsulas: brazos, piernas) */
  thickLine(x0, y0, x1, y1, thickness, c) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    const r = (thickness - 1) / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (r <= 0.5) this.set(Math.round(x), Math.round(y), c);
      else this.ellipse(x, y, r, r, c);
    }
  }

  /* ------------------------------- utilidades ----------------------------- */

  /** Cambia un tono por otro en todo el lienzo */
  replace(from, to) {
    for (let i = 0; i < this.d.length; i++) if (this.d[i] === from) this.d[i] = to;
    return this;
  }

  /** Aplica fn(clave, x, y) a una región */
  each(fn, x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = fn(this.get(x, y), x, y);
        if (v !== undefined) this.set(x, y, v);
      }
    }
  }

  /** Contorno exterior de 1 px alrededor de la silueta */
  outline(c, skip = []) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== '.') continue;
        const near =
          this.get(x - 1, y) !== '.' || this.get(x + 1, y) !== '.' ||
          this.get(x, y - 1) !== '.' || this.get(x, y + 1) !== '.';
        if (near && !skip.includes(this.get(x, y))) add.push([x, y]);
      }
    }
    add.forEach(([x, y]) => this.set(x, y, c));
    return this;
  }

  /** Sombra interior: pinta el borde inferior/derecho de una región con otro tono */
  shadeBottomRight(c, from, depth = 1) {
    this.each((v, x, y) => {
      if (from && !from.includes(v)) return undefined;
      const below = this.get(x, y + 1);
      const right = this.get(x + 1, y);
      if (below === '.' || right === '.') return c;
      return undefined;
    });
    void depth;
    return this;
  }

  flipX() {
    const out = new Pix(this.w, this.h, this.palette);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    }
    return out;
  }

  /** Voltea el contenido horizontalmente in situ */
  mirrorInPlace() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < Math.floor(this.w / 2); x++) {
        const a = this.get(x, y);
        const b = this.get(this.w - 1 - x, y);
        this.set(x, y, b);
        this.set(this.w - 1 - x, y, a);
      }
    }
    return this;
  }

  copy() {
    const out = new Pix(this.w, this.h, this.palette);
    out.d = this.d.slice();
    return out;
  }

  /** Pega otro lienzo con desplazamiento */
  blit(other, dx, dy) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const v = other.get(x, y);
        if (v !== '.') this.set(x + dx, y + dy, v);
      }
    }
    return this;
  }

  /** Pega sólo las claves indicadas (por ejemplo, sólo la línea de contorno) */
  blitKeys(other, dx, dy, keys) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const v = other.get(x, y);
        if (keys.includes(v)) this.set(x + dx, y + dy, v);
      }
    }
    return this;
  }

  /* ------------------------------- salidas -------------------------------- */

  /** Rejilla a ASCII (para depurar en consola) */
  rows() {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      let s = '';
      for (let x = 0; x < this.w; x++) s += this.get(x, y) === '.' ? ' ' : this.get(x, y);
      out.push(s);
    }
    return out;
  }

  /** Delimitador del contenido (sin transparencias) */
  bounds() {
    let minX = this.w;
    let minY = this.h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) === '.') continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  toRGBA() {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.d.length; i++) {
      const hex = this.palette[this.d[i]];
      if (!hex) continue;
      out[i * 4] = parseInt(hex.slice(1, 3), 16);
      out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  toPNG() {
    return encodePNG(this.w, this.h, this.toRGBA());
  }

  /** Ampliación con vecino más cercano */
  scaled(n) {
    const out = new Pix(this.w * n, this.h * n, this.palette);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = this.get(x, y);
        if (v === '.') continue;
        out.rect(x * n, y * n, n, n, v);
      }
    }
    return out;
  }
}

/* ------------------------------ composición ------------------------------ */

/** Lienzo grande donde se pegan frames en rejilla */
export function sheetFromFrames(rows, palette, opts = {}) {
  const scale = opts.scale || 1;
  const gap = opts.gap == null ? 0 : opts.gap;
  const cols = Math.max(...rows.map((r) => r.length));
  const fw = rows[0][0].w;
  const fh = rows[0][0].h;
  const cellW = fw * scale + gap;
  const cellH = fh * scale + gap;
  const sheet = new Pix(cols * cellW + gap, rows.length * cellH + gap, palette);
  rows.forEach((row, ry) => {
    row.forEach((frame, cx) => {
      const f = scale === 1 ? frame : frame.scaled(scale);
      sheet.blit(f, gap + cx * cellW, gap + ry * cellH);
    });
  });
  return sheet;
}

/** Pega varios lienzos en vertical (para previsualizaciones) */
export function stackVertical(items, palette, opts = {}) {
  const gap = opts.gap == null ? 6 : opts.gap;
  const bg = opts.bg || null;
  const w = Math.max(...items.map((i) => i.w)) + gap * 2;
  const h = items.reduce((n, i) => n + i.h, 0) + gap * (items.length + 1);
  const out = new Pix(w, h, palette);
  if (bg) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(x, y, bg);
  }
  let y = gap;
  items.forEach((it) => {
    out.blit(it, gap, y);
    y += it.h + gap;
  });
  return out;
}

/** Pega varios lienzos en horizontal */
export function stackHorizontal(items, palette, opts = {}) {
  const gap = opts.gap == null ? 6 : opts.gap;
  const bg = opts.bg || null;
  const w = items.reduce((n, i) => n + i.w, 0) + gap * (items.length + 1);
  const h = Math.max(...items.map((i) => i.h)) + gap * 2;
  const out = new Pix(w, h, palette);
  if (bg) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(x, y, bg);
  }
  let x = gap;
  items.forEach((it) => {
    out.blit(it, x, gap);
    x += it.w + gap;
  });
  return out;
}
