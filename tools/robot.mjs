/**
 * robot.mjs — el personaje: robot-gato blanco y azul marino
 *
 * Reconstruido píxel a píxel a partir de la referencia del usuario:
 *   · cabeza grande con orejas de gato y visor azul marino
 *   · ojos cian, aros laterales (auriculares) azul marino
 *   · torso blanco con emblema de anillo naranja
 *   · brazos segmentados con puños azul marino y pies pequeños
 *
 * Se dibuja por piezas (cabeza, torso, brazos, pies) para poder animar con
 * coherencia total: todos los frames salen del mismo modelo.
 *
 * Vistas: 'front' (de frente), 'side' (perfil mirando a la derecha) y
 * 'back' (de espaldas). La vista hacia la izquierda se obtiene espejando.
 */
import { Pix } from './pixel.mjs';

export const W = 50;
export const H = 60;

export const PALETTE = {
  '.': null,        // transparente
  K: '#182338',     // contorno
  W: '#f5f3ee',     // blanco principal
  w: '#e4e1d8',     // blanco medio (volumen)
  v: '#c9c5ba',     // blanco sombra
  u: '#a6a294',     // blanco sombra profunda
  N: '#34487c',     // azul marino medio
  n: '#22345c',     // azul marino oscuro
  m: '#182747',     // azul marino profundo
  b: '#4d67a6',     // brillo azul (metal)
  C: '#3fc9f2',     // cian del ojo
  c: '#a9edfd',     // brillo del ojo
  O: '#f2933a',     // naranja del emblema
  o: '#c86a1e',     // naranja sombra
  G: '#8e93a3',     // gris metal
  g: '#6b7182',     // gris metal sombra
};

/* ====================================================================== */
/* Geometría del personaje (en su espacio de 44x56, sin el margen)       */
/* ====================================================================== */

const C = {
  headX: 6, headY: 5, headW: 32, headH: 26, headR: 9,
  visorX: 10, visorY: 11, visorW: 24, visorH: 15, visorR: 6,
  torsX: 12, torsY: 32, torsW: 20, torsH: 18, torsR: 8,
  emblemCx: 21.5, emblemCy: 41,
  footY: 50, footH: 6,
  shoulderY: 34.5,
};

/* ---------------------------------------------------------------------- */
/* Piezas: cabeza                                                        */
/* ---------------------------------------------------------------------- */

/** Aro lateral (auricular) */
function earCup(p, cx, cy, front) {
  p.ellipse(cx, cy, 4.2, 5.2, 'n');
  p.ellipse(cx, cy - 0.6, 3.2, 4.2, 'N');
  p.ellipse(cx - 0.4, cy - 1, 1.8, 2.4, 'm');
  // brillo superior del metal (arco continuo)
  p.line(cx - 3, cy - 2, cx - 1, cy - 4, 'b');
  p.line(cx - 1, cy - 4, cx + 1, cy - 4, 'b');
  if (front) p.set(cx + 2, cy - 3, 'b');
}

/** Oreja de gato: trapecio inclinado hacia fuera */
function ear(p, baseX, baseY, dir) {
  const rows = 7;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);              // 0 arriba, 1 abajo
    const w = Math.round(2 + t * 6);
    const x = Math.round(baseX + dir * (1 - t) * 1.6);
    const y = baseY - (rows - 1 - i);
    p.rect(x, y, w, 1, 'W');
    // borde interior oscuro (hueco de la oreja)
    if (i >= 2 && i <= 4) p.set(x + dir * 1, y, dir > 0 ? 'w' : 'v');
  }
  // hueco de la oreja
  p.line(baseX + dir * 1, baseY - 5, baseX + dir * 3, baseY - 1, 'w');
}

function headShell(p) {
  const x = C.headX;
  const y = C.headY;
  const w = C.headW;
  const h = C.headH;
  const r = C.headR;
  p.roundRect(x, y, w, h, r, 'W');
  // volumen: lado derecho y parte baja más apagados
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const px = x + xx;
      const py = y + yy;
      if (p.get(px, py) !== 'W') continue;
      const edgeR = x + w - 1 - px + Math.max(0, yy - h * 0.55) * 0.8;
      const edgeB = y + h - 1 - py;
      if (edgeB <= 1 && edgeR > 2) p.set(px, py, 'w');
      else if (edgeR <= 0) p.set(px, py, 'w');
      else if (edgeR <= 1 && edgeB <= 3) p.set(px, py, 'v');
    }
  }
  // brillo superior izquierdo
  for (let i = 0; i < 5; i++) p.set(x + 8 + i, y + 2 + Math.floor(i / 3), 'W');
}

/** Cabeza de frente */
function headFront(p) {
  earCup(p, 3.5, 19, true);
  earCup(p, 40.5, 19, true);
  ear(p, 11, C.headY + 2, -1);
  ear(p, 33, C.headY + 2, 1);
  headShell(p, {});

  // visor
  p.roundRect(C.visorX, C.visorY, C.visorW, C.visorH, C.visorR, 'n');
  // borde superior del visor un poco más claro + reflejo
  for (let x = C.visorX + 2; x < C.visorX + C.visorW - 2; x++) {
    if (p.get(x, C.visorY + 1) === 'n') p.set(x, C.visorY + 1, 'N');
  }
  p.rect(C.visorX + 3, C.visorY + 2, 5, 1, 'N');
  // zona inferior del visor más oscura
  for (let x = C.visorX + 2; x < C.visorX + C.visorW - 2; x++) {
    if (p.get(x, C.visorY + C.visorH - 2) === 'n') p.set(x, C.visorY + C.visorH - 2, 'm');
  }

  // ojos
  eye(p, 13.5, 15.5);
  eye(p, 24.5, 15.5);

  // mentón / placa inferior
  p.rect(C.headX + 6, C.headY + C.headH - 4, C.headW - 12, 2, 'w');

  // banda del cuello
  p.roundRect(15, 29, 14, 4, 2, 'n');
  p.rect(16, 29, 12, 1, 'N');
}

function eye(p, x, y) {
  p.roundRect(x, y, 6, 7, 2, 'C');
  p.rect(x + 1, y + 1, 3, 2, 'c');
  p.set(x + 4, y + 4, 'c');
}

/** Cabeza de perfil (mira a la derecha, +x) */
function headSide(p) {
  const x = 9;
  const y = 6;
  const w = 28;
  const h = 24;
  const r = 9;
  p.roundRect(x, y, w, h, r, 'W');
  // volumen: la parte trasera (izquierda) y la base quedan en sombra
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const px = x + xx;
      const py = y + yy;
      if (p.get(px, py) !== 'W') continue;
      const edgeB = h - 1 - yy;
      if (edgeB <= 1) p.set(px, py, 'w');
      else if (xx <= 1) p.set(px, py, 'v');
      else if (xx <= 3 && edgeB < 7) p.set(px, py, 'v');
    }
  }
  // orejas: la de atrás (más baja, asoma a la izquierda) y la de delante
  ear(p, 17, y + 2, -1);
  ear(p, 30, y + 2, 1);
  // aro lateral: en perfil queda en la parte trasera de la cabeza
  earCup(p, 12, 19, false);

  // visor envolviendo el frente, recortado a la silueta de la cabeza
  const vx = 19;
  const vy = 12.5;
  const vw = 16;
  const vh = 15;
  const vr = 5;
  for (let yy = 0; yy < vh; yy++) {
    for (let xx = 0; xx < vw; xx++) {
      // esquinas redondeadas
      let dx = 0;
      let dy = 0;
      if (xx < vr) dx = vr - xx - 1;
      else if (xx >= vw - vr) dx = xx - (vw - vr);
      if (yy < vr) dy = vr - yy - 1;
      else if (yy >= vh - vr) dy = yy - (vh - vr);
      if (dx * dx + dy * dy > (vr - 0.5) * (vr - 0.5) + vr) continue;
      const px = vx + xx;
      const py = vy + yy;
      const cur = p.get(px, py);
      // sólo sustituimos el blanco de la cabeza (el aro se queda delante)
      if (cur !== 'W' && cur !== 'w' && cur !== 'v') continue;
      p.set(px, py, 'n');
    }
  }
  // banda superior iluminada y borde inferior oscuro del visor
  for (let px = 0; px < W; px++) {
    for (let py = 0; py < H; py++) {
      if (p.get(px, py) !== 'n') continue;
      const up = p.get(px, py - 1);
      if (up === 'W' || up === 'w' || up === 'v' || up === '.') p.set(px, py, 'N');
    }
  }
  for (let px = 0; px < W; px++) {
    let last = -1;
    for (let py = 0; py < H; py++) if (p.get(px, py) === 'n' || p.get(px, py) === 'N') last = py;
    if (last >= 0 && p.get(px, last + 1) === '.') p.set(px, last, 'm');
  }

  // ojo cian dentro del visor
  p.roundRect(25, 15, 6, 8, 2, 'C');
  p.rect(26, 16, 3, 2, 'c');
  p.set(29, 20, 'c');

  // morro blanco bajo el visor
  p.each((v, px, py) => {
    if ((v === 'W' || v === 'w') && py >= 25 && py <= 27 && px >= 20) return 'w';
    return undefined;
  });
}

/** Cabeza de espaldas */
function headBack(p) {
  earCup(p, 3.5, 19, false);
  earCup(p, 40.5, 19, false);
  ear(p, 11, C.headY + 2, -1);
  ear(p, 33, C.headY + 2, 1);
  headShell(p, {});

  // placa trasera azul con rejillas
  p.roundRect(12, 13, 20, 12, 5, 'n');
  for (let x = 13; x < 31; x++) if (p.get(x, 13) === 'n') p.set(x, 13, 'N');
  p.rect(15, 17, 14, 1, 'm');
  p.rect(15, 20, 14, 1, 'm');
  p.set(21, 15, 'b');
  p.set(22, 15, 'b');

  p.roundRect(15, 29, 14, 4, 2, 'n');
  p.rect(16, 29, 12, 1, 'N');
}

/* ---------------------------------------------------------------------- */
/* Piezas: torso                                                         */
/* ---------------------------------------------------------------------- */

function torsoShell(p, x, y, w, h, r) {
  p.roundRect(x, y, w, h, r, 'W');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const px = x + xx;
      const py = y + yy;
      if (p.get(px, py) !== 'W') continue;
      const edgeR = x + w - 1 - px;
      const edgeB = y + h - 1 - py;
      if (edgeR === 0) p.set(px, py, 'w');
      else if (edgeB === 0 && edgeR > 1) p.set(px, py, 'w');
      else if (edgeR === 1 && edgeB <= 2) p.set(px, py, 'v');
    }
  }
}

function torsoFront(p) {
  // cuerpo: casco azul marino
  p.roundRect(C.torsX, C.torsY, C.torsW, C.torsH, C.torsR, 'n');
  for (let x = C.torsX + 3; x < C.torsX + C.torsW - 3; x++) {
    if (p.get(x, C.torsY + 1) === 'n') p.set(x, C.torsY + 1, 'N');
  }
  p.rect(C.torsX + 5, C.torsY + 2, 4, 1, 'N');
  // brillo del borde superior
  p.set(C.torsX + 4, C.torsY, 'N');
  p.set(C.torsX + 5, C.torsY, 'N');

  // placa blanca de la barriga (sobresale un poco del casco)
  const px = 13;
  const py = 34;
  const pw = 17;
  const ph = 17;
  p.roundRect(px, py, pw, ph, 7, 'W');
  // costura interior y volumen
  p.each((v, x, y) => {
    if (v !== 'W') return undefined;
    const edgeR = px + pw - 1 - x;
    const edgeB = py + ph - 1 - y;
    if (edgeR === 0) return 'w';
    if (edgeB === 0 && edgeR > 2) return 'w';
    if (edgeR === 1 && edgeB <= 3) return 'v';
    return undefined;
  }, px, py, px + pw - 1, py + ph - 1);
  // línea de la placa
  p.each((v, x, y) => {
    if (v === 'n' && x >= px - 1 && x <= px + pw && y === py) return 'w';
    return undefined;
  });

  // collar (sólo el borde del casco, sin tapar la placa)
  p.roundRect(16, C.torsY, 11, 2, 1, 'N');
  p.rect(17, C.torsY, 9, 1, 'b');

  // emblema
  emblem(p, C.emblemCx, 42);
}

function emblem(p, cx, cy) {
  p.ring(cx, cy, 5.8, 4.4, 'n');        // aro exterior marino
  p.ring(cx, cy, 4.4, 2.9, 'O');        // aro naranja
  p.ellipse(cx, cy, 2.2, 2.2, 'W');     // núcleo claro
  p.ellipse(cx, cy + 0.7, 1.3, 0.9, 'w');
  p.set(cx - 1, cy - 1, 'W');
  // brillos del aro
  p.set(cx - 2, cy - 4, 'b');
  p.set(cx - 3, cy - 3, 'b');
  p.set(cx + 2, cy + 3, 'o');
  p.set(cx + 3, cy + 2, 'o');
}

function torsoSide(p) {
  // casco del cuerpo visto de canto
  p.roundRect(15, C.torsY, 16, C.torsH, 7, 'n');
  for (let x = 18; x < 29; x++) if (p.get(x, C.torsY + 1) === 'n') p.set(x, C.torsY + 1, 'N');
  p.rect(19, C.torsY + 2, 4, 1, 'N');

  // placa de la barriga, desplazada al frente (deja ver el casco por detrás)
  p.roundRect(21, C.torsY + 3, 10, 13, 5, 'W');
  p.each((v, x, y) => {
    if (v !== 'W') return undefined;
    const edgeB = C.torsY + 3 + 13 - 1 - y;
    if (edgeB <= 0) return 'w';
    return undefined;
  }, 21, C.torsY + 3, 31, C.torsY + 15);

  // el emblema, de canto, sobre la placa
  p.ellipse(26.5, 42, 4.4, 4.6, 'n');
  p.ellipse(26.5, 42, 3.2, 3.4, 'O');
  p.ellipse(26.5, 42, 1.9, 2, 'W');
  p.set(25, 40, 'b');
  p.set(28, 44, 'o');

  // collar
  p.roundRect(17, C.torsY, 11, 2, 1, 'N');
  p.rect(18, C.torsY, 9, 1, 'b');
}

function torsoBack(p) {
  p.roundRect(C.torsX, C.torsY, C.torsW, C.torsH, C.torsR, 'n');
  for (let x = C.torsX + 3; x < C.torsX + C.torsW - 3; x++) {
    if (p.get(x, C.torsY + 1) === 'n') p.set(x, C.torsY + 1, 'N');
  }
  p.rect(C.torsX + 5, C.torsY + 2, 4, 1, 'N');
  // placa trasera con rejillas
  p.roundRect(15, C.torsY + 5, 14, 10, 3, 'N');
  p.rect(17, C.torsY + 8, 10, 1, 'm');
  p.rect(17, C.torsY + 11, 10, 1, 'm');
  p.set(21, C.torsY + 6, 'b');
  p.set(22, C.torsY + 6, 'b');
  p.roundRect(16, C.torsY + 1, 12, 3, 1, 'N');
  p.rect(17, C.torsY + 1, 10, 1, 'b');
}

/* ---------------------------------------------------------------------- */
/* Piezas: brazos y pies                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Brazo por cápsulas: hombro (marino), brazo blanco con banda, puño marino.
 * a1 = ángulo del brazo respecto a la vertical (rad), a2 = flexión del codo.
 */
function arm(p, sx, sy, a1, a2, opts = {}) {
  const L1 = opts.L1 || 6;
  const L2 = opts.L2 || 5.5;
  const ex = sx + Math.sin(a1) * L1;
  const ey = sy + Math.cos(a1) * L1;
  const hx = ex + Math.sin(a1 + a2) * L2;
  const hy = ey + Math.cos(a1 + a2) * L2;

  // brazo (segmento blanco)
  p.thickLine(sx, sy + 2, ex, ey, 6, 'W');
  p.thickLine(ex, ey, hx, hy - 1.5, 6, 'W');
  // junta del codo: banda fina (deja ver el blanco del brazo)
  p.ellipse(ex, ey, 3, 1.4, 'n');
  // puño
  p.ellipse(hx, hy, 2.8, 2.8, 'n');
  p.ellipse(hx, hy - 0.6, 1.8, 1.7, 'N');
  // hombro (hombrera)
  p.ellipse(sx, sy, 2.9, 2.9, 'n');
  p.ellipse(sx, sy - 0.6, 2, 1.9, 'N');
  p.set(sx - 2, sy - 2, 'b');
  p.set(sx - 1, sy - 2, 'b');

  // sombreado del lado derecho del brazo
  p.each((v, x, y) => {
    if (v === 'W' && x > sx + 1) return 'w';
    return undefined;
  }, Math.round(sx), Math.round(sy), W - 1, Math.round(Math.max(hy, ey)) + 4);
}

/** Dibuja un brazo con contorno propio, para separarlo del cuerpo */
function armOutlined(p, sx, sy, a1, a2, opts = {}) {
  const tmp = new Pix(W, H, PALETTE);
  arm(tmp, sx, sy, a1, a2, opts);
  tmp.outline('K');
  p.blit(tmp, 0, 0);
}

/** Dibuja un pie con contorno, para separarlo de lo que ya hay pintado */
function footSeparation(p, cx, cy, opts = {}) {
  const tmp = new Pix(W, H, PALETTE);
  foot(tmp, cx, cy, opts);
  const keys = tmp.bounds();
  if (keys) tmp.outline('K');
  p.blit(tmp, 0, 0);
}

function foot(p, cx, cy, opts = {}) {
  const w = opts.w || 8;
  const h = opts.h || 6;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h + 1);
  p.roundRect(x, y, w, h, 3, 'n');
  // banda superior iluminada (separa el pie del cuerpo)
  p.rect(x + 2, y, w - 4, 1, 'N');
  p.rect(x + 1, y + 1, w - 2, 1, 'N');
  p.set(x + 1, y + 1, 'b');
  // suela
  p.rect(x + 1, y + h - 2, w - 2, 2, 'm');
}

/* ====================================================================== */
/* Composición de un frame                                                */
/* ====================================================================== */

/**
 * Limita el ángulo de un brazo sin cambiar su dirección: escalarlo (como se
 * hacía antes con *0.75) dejaba los brazos del perfil apuntando de lado en las
 * poses de salto, porque un ángulo grande se acercaba a la horizontal.
 */
function clampAngle(a, max = 2.6) {
  return Math.max(-max, Math.min(max, a));
}

/**
 * @param {'front'|'side'|'back'} view
 * @param {object} pose
 *   bob      desplazamiento vertical del cuerpo
 *   lean     inclinación horizontal del cuerpo (px)
 *   armBack / armFront  {a1, a2} ángulos de los brazos
 *   feet     [{dx, dy}, {dx, dy}] pies (lejano y cercano)
 *   blink    ojos cerrados
 *   ear      {dy} orejas
 */
/**
 * El dibujo se compone en el espacio original de 44x56 y luego se coloca
 * dentro del lienzo con este margen, que deja sitio para el contorno.
 * Antes la celda era de 44x56 justos y el arte se salía: los aros de las
 * orejas quedaban cortados a los lados y la suela por abajo.
 */
export const OX = 2;
export const OY = 2;

export function compose(view, pose) {
  const p = new Pix(W, H, PALETTE);
  const dx0 = OX;      // margen del lienzo (deja sitio al contorno)
  const dy0 = OY;
  const bob = pose.bob || 0;
  const lean = pose.lean || 0;
  const armF = pose.armFront || { a1: 0.12, a2: 0 };
  const armB = pose.armBack || { a1: -0.12, a2: 0 };
  const feet = pose.feet || [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }];
  const lift = pose.lift || 0;   // separación del cuerpo del suelo (saltos)

  const bodyY = bob + lift;

  if (view === 'front') {
    // pies
    foot(p, 17 + feet[0].dx + dx0, C.footY + C.footH - 1 + feet[0].dy + lift + dy0, {});
    foot(p, 27 + feet[1].dx + dx0, C.footY + C.footH - 1 + feet[1].dy + lift + dy0, {});
    // brazos (detrás del torso)
    arm(p, 9.5 + lean + dx0, C.shoulderY + bodyY + dy0, armB.a1, armB.a2);
    arm(p, 34.5 + lean + dx0, C.shoulderY + bodyY + dy0, armF.a1, armF.a2);
    // torso y cabeza
    torsoFrontOffset(p, lean + dx0, bodyY + dy0);
    headOffset(p, 'front', lean + dx0, bodyY + dy0, pose);
  } else if (view === 'back') {
    foot(p, 17 + feet[0].dx + dx0, C.footY + C.footH - 1 + feet[0].dy + lift + dy0, {});
    foot(p, 27 + feet[1].dx + dx0, C.footY + C.footH - 1 + feet[1].dy + lift + dy0, {});
    arm(p, 9.5 + lean + dx0, C.shoulderY + bodyY + dy0, armF.a1, armF.a2);
    arm(p, 34.5 + lean + dx0, C.shoulderY + bodyY + dy0, armB.a1, armB.a2);
    torsoBackOffset(p, lean + dx0, bodyY + dy0);
    headOffset(p, 'back', lean + dx0, bodyY + dy0, pose);
  } else {
    // perfil: pie de atrás, brazo de atrás (asoma), cuerpo, brazo delante, pie delante
    foot(p, 19 + feet[0].dx * 0.6 + dx0, C.footY + C.footH - 1 + feet[0].dy + lift + dy0, { w: 8 });
    arm(p, 20 + lean + dx0, C.shoulderY + bodyY - 1 + dy0, armB.a1 * 0.3, 0, { L1: 5.5, L2: 4.5 });
    torsoSideOffset(p, lean + dx0, bodyY + dy0);
    armOutlined(p, 25 + lean + dx0, C.shoulderY + bodyY + dy0,
      clampAngle(armF.a1), armF.a2 * 0.5, { L1: 6.5, L2: 6 });
    // el pie delantero recortado contra el de atrás
    footSeparation(p, 27 + feet[1].dx + dx0, C.footY + C.footH - 1 + feet[1].dy + lift + dy0, { w: 9 });
    headOffset(p, 'side', lean + dx0, bodyY + dy0, pose);
  }

  // contorno exterior
  p.outline('K');
  // los pies y el brazo del perfil ya vienen contorneados: quitamos el anillo
  // extra que el contorno global añadiría alrededor de ese contorno
  trimOutline(p);
  return p;
}

/**
 * Elimina los píxeles de contorno que no tocan la silueta. Sin esto, las
 * piezas que ya venían contorneadas (pie delantero y brazo del perfil)
 * acababan con dos filas de contorno y una base más gruesa que el resto.
 */
function trimOutline(p) {
  const kill = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.get(x, y) !== 'K') continue;
      const around = [p.get(x - 1, y), p.get(x + 1, y), p.get(x, y - 1), p.get(x, y + 1)];
      const touchesShape = around.some((n) => n && n !== '.' && n !== 'K');
      if (!touchesShape) kill.push([x, y]);
    }
  }
  kill.forEach(([x, y]) => p.set(x, y, '.'));
}

function torsoFrontOffset(p, dx, dy) {
  const tmp = new Pix(W, H, PALETTE);
  torsoFront(tmp);
  p.blit(tmp, dx, dy);
}

function torsoBackOffset(p, dx, dy) {
  const tmp = new Pix(W, H, PALETTE);
  torsoBack(tmp);
  p.blit(tmp, dx, dy);
}

function torsoSideOffset(p, dx, dy) {
  const tmp = new Pix(W, H, PALETTE);
  torsoSide(tmp);
  p.blit(tmp, dx, dy);
}

function headOffset(p, view, dx, dy, pose) {
  const tmp = new Pix(W, H, PALETTE);
  if (view === 'front') headFront(tmp);
  else if (view === 'back') headBack(tmp);
  else headSide(tmp);
  if (pose.blink) closeEyes(tmp, view);
  p.blit(tmp, dx, dy);
}

/**
 * Pestañeo: el ojo se cierra con un párpado oscuro bien visible.
 * (Antes se borraba el ojo dejando sólo una línea del mismo azul marino del
 * visor, y el resultado parecía un visor vacío; además el brillo del ojo se
 * quedaba suelto y la vista de espaldas —que no tiene ojos— recibía párpados
 * fantasma.)
 */
function closeEyes(p, view) {
  if (view === 'back') return;               // de espaldas no hay ojos
  const spots = view === 'side'
    ? [[25, 15, 6, 8]]
    : [[14, 16, 6, 7], [25, 16, 6, 7]];
  spots.forEach(([x, y, w, h]) => {
    // borrar el ojo entero, brillo incluido
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const v = p.get(x + xx, y + yy);
        if (v === 'C' || v === 'c') p.set(x + xx, y + yy, 'n');
      }
    }
    // párpado: barra oscura en el centro y las puntas un poco más altas
    p.rect(x + 1, y + 2, w - 2, 2, 'm');
    p.set(x + 1, y + 1, 'm');
    p.set(x + w - 2, y + 1, 'm');
  });
}

/* ====================================================================== */
/* Animaciones                                                            */
/* ====================================================================== */

const ARM_REST = { a1: 0.09, a2: 0.02 };
const ARM_REST_B = { a1: -0.09, a2: 0.02 };

/** Pose de reposo con respiración */
function idlePoses() {
  return [
    { bob: 0, armFront: ARM_REST, armBack: ARM_REST_B, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }] },
    { bob: -1, armFront: { a1: 0.13, a2: -0.05 }, armBack: ARM_REST_B, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], ear: -1 },
    { bob: 0, armFront: ARM_REST, armBack: ARM_REST_B, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }] },
    { bob: 0, armFront: ARM_REST, armBack: ARM_REST_B, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], blink: true },
  ];
}

/**
 * Ciclo de caminar de 6 frames.
 * Los pies se mueven en el eje X y el cuerpo sube y baja dos veces.
 */
function walkPoses() {
  const step = 3.2;
  return [
    // 0 contacto: pie delantero lejos, trasero atrás
    { bob: 0, feet: [{ dx: -step, dy: 0 }, { dx: step, dy: 0 }], armFront: { a1: -0.3, a2: 0 }, armBack: { a1: 0.3, a2: 0 } },
    // 1 apoyo: el peso baja
    { bob: 1, feet: [{ dx: -step * 0.5, dy: 0 }, { dx: step * 0.3, dy: 0 }], armFront: { a1: -0.15, a2: 0.1 }, armBack: { a1: 0.15, a2: 0.1 } },
    // 2 paso: los pies se cruzan
    { bob: -1, feet: [{ dx: 0, dy: -1.5 }, { dx: 0, dy: 0 }], armFront: { a1: 0.05, a2: 0.05 }, armBack: { a1: -0.05, a2: 0.05 }, ear: -1 },
    // 3 contacto contrario
    { bob: 0, feet: [{ dx: step, dy: 0 }, { dx: -step, dy: 0 }], armFront: { a1: 0.3, a2: 0 }, armBack: { a1: -0.3, a2: 0 } },
    // 4 apoyo
    { bob: 1, feet: [{ dx: step * 0.3, dy: 0 }, { dx: -step * 0.5, dy: 0 }], armFront: { a1: 0.15, a2: 0.1 }, armBack: { a1: -0.15, a2: 0.1 } },
    // 5 paso
    { bob: -1, feet: [{ dx: 0, dy: 0 }, { dx: 0, dy: -1.5 }], armFront: { a1: -0.05, a2: 0.05 }, armBack: { a1: 0.05, a2: 0.05 }, ear: -1 },
  ];
}

/** Zancada de correr: más inclinación, brazos bombeando y fase de vuelo */
function runPoses() {
  const step = 5.4;
  return [
    { bob: -1, lean: 1, feet: [{ dx: -step, dy: -2 }, { dx: step * 0.8, dy: 0 }], armFront: { a1: -0.55, a2: -0.6 }, armBack: { a1: 0.5, a2: -0.45 } },
    { bob: 1, lean: 1, feet: [{ dx: -step * 0.6, dy: 0 }, { dx: step * 0.2, dy: 0 }], armFront: { a1: -0.25, a2: -0.45 }, armBack: { a1: 0.25, a2: -0.35 } },
    { bob: -1, lean: 1, feet: [{ dx: 0, dy: -3 }, { dx: -step * 0.2, dy: -2 }], armFront: { a1: 0.1, a2: -0.5 }, armBack: { a1: -0.1, a2: -0.35 }, ear: -1 },
    { bob: -1, lean: 1, feet: [{ dx: step, dy: 0 }, { dx: -step, dy: -2 }], armFront: { a1: 0.5, a2: -0.45 }, armBack: { a1: -0.55, a2: -0.6 } },
    { bob: 1, lean: 1, feet: [{ dx: step * 0.2, dy: 0 }, { dx: -step * 0.6, dy: 0 }], armFront: { a1: 0.25, a2: -0.35 }, armBack: { a1: -0.25, a2: -0.45 } },
    { bob: -1, lean: 1, feet: [{ dx: -step * 0.2, dy: -2 }, { dx: 0, dy: -3 }], armFront: { a1: -0.1, a2: -0.35 }, armBack: { a1: 0.1, a2: -0.5 }, ear: -1 },
  ];
}

/**
 * Salto: piernas recogidas y brazos hacia arriba.
 * Los brazos se levantan con ángulos cercanos a ±2.6 rad (arriba y algo hacia
 * fuera); con ±1.8 quedaban estirados de lado y las manos se salían del
 * lienzo. El cuerpo sólo se separa del suelo 1 px: del aire se encarga el
 * motor, que ya mueve al jugador.
 */
function jumpPoses() {
  return [
    { lift: -1, bob: 0, feet: [{ dx: -2, dy: -3 }, { dx: 2, dy: -3 }], armFront: { a1: 1.7, a2: 1.25 }, armBack: { a1: -1.7, a2: -1.25 } },
    { lift: -1, bob: 0, feet: [{ dx: -2.5, dy: -5 }, { dx: 2.5, dy: -5 }], armFront: { a1: 1.85, a2: 1.3 }, armBack: { a1: -1.85, a2: -1.3 }, ear: -1 },
  ];
}

/** Caída: piernas abiertas buscando el suelo, brazos abiertos */
function fallPoses() {
  return [
    { lift: -1, feet: [{ dx: -3, dy: -1 }, { dx: 3, dy: -1 }], armFront: { a1: -0.65, a2: 0.3 }, armBack: { a1: 0.65, a2: 0.3 } },
    { lift: 0, feet: [{ dx: -3.5, dy: 0 }, { dx: 3.5, dy: 0 }], armFront: { a1: -0.7, a2: 0.1 }, armBack: { a1: 0.7, a2: 0.1 }, blink: true },
  ];
}

const POSES = {
  idle: idlePoses,
  walk: walkPoses,
  run: runPoses,
  jump: jumpPoses,
  fall: fallPoses,
};

export const ANIM_ORDER = ['idle', 'walk', 'run', 'jump', 'fall'];
export const VIEWS = ['front', 'side', 'back'];

/** { front: { idle: [Pix...], ... }, side: {...}, back: {...} } */
export function buildAll() {
  const out = {};
  VIEWS.forEach((view) => {
    out[view] = {};
    ANIM_ORDER.forEach((anim) => {
      out[view][anim] = POSES[anim]().map((pose) => compose(view, pose));
    });
  });
  return out;
}

/** Rejilla de referencia de todas las vistas y animaciones */
export function sheetForView(frames, view, opts = {}) {
  const rows = ANIM_ORDER.map((a) => frames[view][a]);
  const cols = Math.max(...rows.map((r) => r.length));
  const gap = opts.gap == null ? 1 : opts.gap;
  const scale = opts.scale || 1;
  const cellW = W * scale + gap;
  const cellH = H * scale + gap;
  const sheet = new Pix(cols * cellW + gap, rows.length * cellH + gap, PALETTE);
  rows.forEach((row, ry) => {
    row.forEach((frame, rx) => {
      const f = scale === 1 ? frame : frame.scaled(scale);
      sheet.blit(f, gap + rx * cellW, gap + ry * cellH);
    });
  });
  return sheet;
}
