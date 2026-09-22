/**
 * hero-parts.mjs — taller de pixel art para el heroe (16x24 px)
 *
 * Formato del lienzo (y):
 *    0        contorno superior
 *    1.. 8    cabeza
 *    9..16    torso (hombros, pecho, cinturon, cadera)
 *   17..23    piernas y botas
 *
 * Cada parte es una rejilla ASCII; las letras son colores de PALETTE.
 * El contorno oscuro de la silueta y el que separa los brazos del
 * cuerpo se generan automaticamente al componer.
 */

export const PALETTE = {
  '.': null, // transparente
  K: '#141322', // contorno
  S: '#f4c79c', // piel
  s: '#d2965f', // piel sombra
  H: '#e0483c', // bandana
  h: '#a3282a', // bandana sombra
  T: '#3f86d8', // camisa
  t: '#2a5b9e', // camisa sombra
  B: '#8d5a2b', // cinturon
  b: '#5e3a1b', // cinturon sombra
  Y: '#ffd166', // hebilla
  P: '#56679f', // pantalon pierna cercana
  p: '#3c4870', // pantalon sombra
  L: '#414f7a', // pantalon pierna lejana
  l: '#2c3455', // pantalon lejano sombra
  O: '#96652f', // bota
  o: '#5e3d1c', // bota sombra
  W: '#ffffff', // brillo del ojo
  E: '#1d1a2c', // pupila
};

/* ------------------------------------------------------------------ */
/* CABEZA (8 filas x 13 columnas, se coloca en x=3, y=1)                */
/* ------------------------------------------------------------------ */

const HEAD = [
  '.....HHHHH...',
  '....HHHHHHH..',
  '...HHHHHHHHH.',
  '..hHHHHHHHHHh',
  '..hhhSSSSSSS.',
  '..hhhSSWESS..',
  '..sSSSSSSSSs.',
  '...sSSSSSSs..',
];

const HEAD_BLINK = [
  '.....HHHHH...',
  '....HHHHHHH..',
  '...HHHHHHHHH.',
  '..hHHHHHHHHHh',
  '..hhhSSSSSSS.',
  '..hhhSSKKSSS.',
  '..sSSSSSSSSs.',
  '...sSSSSSSs..',
];

/** Cola de la bandana: 3 filas x 4 columnas, se dibuja en x=0, y=3 */
const TAILS = {
  rest: ['.hh.', '.h..', '....'],
  rest2: ['.hh.', '..h.', '....'],
  wave1: ['hhh.', 'h...', '....'],
  wave2: ['hh..', '.hh.', '....'],
  wave3: ['h...', 'hh..', '....'],
  up: ['.h..', '.hh.', '..hh'],
  up2: ['hh..', 'hh..', '.h..'],
  back: ['.hh.', 'h...', '....'],
  down: ['.hh.', 'hh..', '....'],
};

/* ------------------------------------------------------------------ */
/* TORSO (8 filas x 16 columnas, se coloca en x=4, y=9)                 */
/* ------------------------------------------------------------------ */

const TORSO = [
  '.....TTTTTT.....', // hombros
  '....TTTTTTTT....',
  '...TTTTTTTTtt...',
  '...tTTTTTTTTt...',
  '...BBBBBBBBBB...', // cinturon
  '...bbbbYbbbbb...',
  '...LLLLLLLLLL...', // cadera (pierna lejana)
  '...LLLLLLLLLL...',
];

const TORSO_UP = [ // pecho mas alto (rebote del ciclo de respiracion)
  '.....TTTTTT.....',
  '....TTTTTTTT....',
  '...TTTTTTTTTt...',
  '...tTTTTTTTTt...',
  '...BBBBBBBBBB...',
  '...bbbbYbbbbb...',
  '...LLLLLLLLLL...',
  '...LLLLLLLLLL...',
];

/* ------------------------------------------------------------------ */
/* BRAZOS (7 filas x 5 columnas)                                        */
/* ------------------------------------------------------------------ */

const ARMS = {
  // colgando, relajado: manga, antebrazo y mano a la altura de la cadera
  down: [
    'TTt..',
    'TTt..',
    '.St..',
    '.SS..',
    '.SS..',
    '..S..',
    '..s..',
  ],
  // balanceo hacia atras
  back: [
    'TTt..',
    'TTt..',
    '.St..',
    '.S...',
    'S....',
    'S....',
    's....',
  ],
  // balanceo hacia adelante (el puño va delante del pecho)
  front: [
    'TTt..',
    'TTt..',
    '.St..',
    '.SS..',
    '..SS.',
    '...S.',
    '...s.',
  ],
  // corriendo: antebrazo adelante, puño a la altura del pecho
  runUp: [
    'TTt..',
    'TTtt.',
    '.TSS.',
    '.SS..',
    '..s..',
    '.....',
    '.....',
  ],
  // corriendo: antebrazo atras, puño junto a la cadera
  runDown: [
    'TTt..',
    'TTt..',
    'TSS..',
    'SSt..',
    'S....',
    's....',
    '.....',
  ],
  // salto: brazo extendido adelante
  jump: [
    'TTt..',
    'TTt..',
    '.TSt.',
    '..SSS',
    '..SS.',
    '...S.',
    '...s.',
  ],
};

/* ------------------------------------------------------------------ */
/* PIERNAS (6 filas x 4 columnas)                                       */
/* ------------------------------------------------------------------ */

const LEGS = {
  // pierna de apoyo, recta
  plant: [
    '.LL.',
    '.LL.',
    '.LL.',
    '.LL.',
    '.OO.',
    'OOOO',
  ],
  // pierna adelante (llega con el talon)
  reach: [
    '.LL.',
    '..LL',
    '..LL',
    '..LL',
    '..OO',
    'OOOO',
  ],
  // pierna atras, la punta del pie toca el suelo
  trail: [
    '.LL.',
    '.LL.',
    '.LL.',
    'LL..',
    'LL..',
    'OOO.',
  ],
  // rodilla arriba con el pie levantado
  kneeUp: [
    '.LL.',
    '.LL.',
    '..LL',
    '..LL',
    '.OO.',
    '.OO.',
  ],
  // rodilla arriba y adelante (paso en el aire)
  step: [
    '.LL.',
    '.LL.',
    '..LL',
    '..LL',
    '..OO',
    '.OOO',
  ],
  // empuje: talon levantado
  push: [
    '.LL.',
    '.LL.',
    '.LL.',
    '.LL.',
    '.OO.',
    '.OO.',
  ],
  // en el aire, flexionada hacia atras
  tuck: [
    '.LL.',
    '.LL.',
    'LL..',
    'LL..',
    'OO..',
    'OO..',
  ],
};

/* ------------------------------------------------------------------ */
/* Composicion                                                          */
/* ------------------------------------------------------------------ */

const W = 16;
const H = 24;
const LEG_Y = 17;
const TORSO_Y = 9;
const HEAD_Y = 1;
const HEAD_X = 3;
const TORSO_X = 4;
const FAR_X = 6; // pierna lejana (se dibuja primero, mas oscura)
const NEAR_X = 8; // pierna cercana

const blank = () => Array.from({ length: H }, () => Array(W).fill('.'));

function put(grid, rows, x, y, map) {
  const mask = [];
  for (let r = 0; r < rows.length; r++) {
    const yy = y + r;
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      let ch = row[c];
      if (ch === ' ' || ch === '.') continue;
      if (map && map[ch]) ch = map[ch];
      const xx = x + c;
      if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
      grid[yy][xx] = ch;
      mask.push([xx, yy]);
    }
  }
  return mask;
}

/** Dibuja una parte y traza su contorno solo sobre el cuerpo ya pintado
 *  (asi el brazo se separa visualmente de la camisa). */
function putOutlined(grid, rows, x, y) {
  const mask = put(grid, rows, x, y);
  const isPart = new Set(mask.map(([px, py]) => py * W + px));
  for (const [px, py] of mask) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (isPart.has(ny * W + nx)) continue;
      if (grid[ny][nx] !== '.') grid[ny][nx] = 'K';
    }
  }
}

/** Contorno oscuro alrededor de la silueta (vecinos de 4 lados) */
function outline(grid) {
  const out = grid.map((r) => r.slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== '.') continue;
      const near =
        (y > 0 && grid[y - 1][x] !== '.') ||
        (y < H - 1 && grid[y + 1][x] !== '.') ||
        (x > 0 && grid[y][x - 1] !== '.') ||
        (x < W - 1 && grid[y][x + 1] !== '.');
      if (near) out[y][x] = 'K';
    }
  }
  return out;
}

/**
 * @param {object} s
 *   legs:  [ {pose, dx, dy, far} ]  de atras hacia adelante
 *   arms:  { back, front }          nombres en ARMS
 *   tail:  nombre en TAILS
 *   blink: bool
 *   bob:   desplazamiento vertical del torso/cabeza/brazos
 *   lean:  desplazamiento horizontal del torso/cabeza/brazos
 *   torso: 'normal' | 'up'
 */
function compose(s) {
  const g = blank();
  const bob = s.bob || 0;
  const lean = s.lean || 0;

  put(g, TAILS[s.tail], 0 + lean, 3 + bob);
  if (s.arms && s.arms.back) putOutlined(g, ARMS[s.arms.back], 2 + lean, TORSO_Y + bob);

  for (const leg of s.legs) {
    put(g, LEGS[leg.pose], (leg.far ? FAR_X : NEAR_X) + (leg.dx || 0), LEG_Y + (leg.dy || 0));
  }

  put(g, s.torso === 'up' ? TORSO_UP : TORSO, TORSO_X + lean, TORSO_Y + bob);
  put(g, s.blink ? HEAD_BLINK : HEAD, HEAD_X + lean, HEAD_Y + bob);

  if (s.arms && s.arms.front) putOutlined(g, ARMS[s.arms.front], 9 + lean, TORSO_Y + bob);

  return outline(g).map((r) => r.join(''));
}

/* ------------------------------------------------------------------ */
/* Animaciones                                                          */
/* ------------------------------------------------------------------ */

const LEG = (pose, dx = 0, dy = 0, far = false) => ({ pose, dx, dy, far });

const A = {
  /* --- reposo: respira, parpadea, la cola se mueve ------------------ */
  idle: [
    { legs: [LEG('plant', 0, 0, true), LEG('plant', 0, 0)], arms: { back: 'down', front: 'down' }, tail: 'rest', bob: 0 },
    { legs: [LEG('plant', 0, 0, true), LEG('plant', 0, 0)], arms: { back: 'down', front: 'down' }, tail: 'rest2', bob: 0, torso: 'up' },
    { legs: [LEG('plant', 0, 0, true), LEG('plant', 0, 0)], arms: { back: 'down', front: 'down' }, tail: 'rest', bob: 1 },
    { legs: [LEG('plant', 0, 0, true), LEG('plant', 0, 0)], arms: { back: 'down', front: 'down' }, tail: 'rest2', bob: 1, blink: true },
  ],

  /* --- caminar: 6 frames -------------------------------------------- */
  walk: [
    // contacto con el talon adelante
    { legs: [LEG('trail', -1, -1, true), LEG('reach', 1, 0)], arms: { back: 'back', front: 'front' }, tail: 'wave1', bob: 0 },
    // apoyo: el cuerpo baja
    { legs: [LEG('push', -1, -1, true), LEG('plant', 0, 0)], arms: { back: 'down', front: 'down' }, tail: 'wave2', bob: 1 },
    // paso: la pierna de atras cruza adelante
    { legs: [LEG('plant', 0, 0, true), LEG('step', 1, -1)], arms: { back: 'front', front: 'back' }, tail: 'wave3', bob: 0 },
    // contacto con el otro pie
    { legs: [LEG('reach', 1, 0, true), LEG('trail', -1, -1)], arms: { back: 'front', front: 'back' }, tail: 'wave1', bob: 0 },
    // apoyo
    { legs: [LEG('plant', 0, 0, true), LEG('push', -1, -1)], arms: { back: 'down', front: 'down' }, tail: 'wave2', bob: 1 },
    // paso
    { legs: [LEG('step', 1, -1, true), LEG('plant', 0, 0)], arms: { back: 'back', front: 'front' }, tail: 'wave3', bob: 0 },
  ],

  /* --- correr: 6 frames con fase de vuelo --------------------------- */
  run: [
    { legs: [LEG('tuck', -1, -2, true), LEG('reach', 1, 0)], arms: { back: 'runDown', front: 'runUp' }, tail: 'up', bob: 0, lean: 1 },
    { legs: [LEG('push', -1, -1, true), LEG('plant', 0, 0)], arms: { back: 'runUp', front: 'runDown' }, tail: 'up2', bob: 1, lean: 1 },
    { legs: [LEG('plant', 0, -1, true), LEG('kneeUp', 1, -2)], arms: { back: 'runDown', front: 'runUp' }, tail: 'up', bob: 0, lean: 1 },
    { legs: [LEG('reach', 1, 0, true), LEG('tuck', -1, -2)], arms: { back: 'runUp', front: 'runDown' }, tail: 'up', bob: 0, lean: 1 },
    { legs: [LEG('plant', 0, 0, true), LEG('push', -1, -1)], arms: { back: 'runDown', front: 'runUp' }, tail: 'up2', bob: 1, lean: 1 },
    { legs: [LEG('kneeUp', 1, -2, true), LEG('plant', 0, -1)], arms: { back: 'runUp', front: 'runDown' }, tail: 'up', bob: 0, lean: 1 },
  ],

  /* --- salto -------------------------------------------------------- */
  jump: [
    { legs: [LEG('tuck', -1, -2, true), LEG('kneeUp', 1, -2)], arms: { back: 'jump', front: 'jump' }, tail: 'up', bob: 0, lean: 1 },
    { legs: [LEG('tuck', -2, -2, true), LEG('step', 1, -2)], arms: { back: 'jump', front: 'jump' }, tail: 'up2', bob: 1, lean: 1, blink: true },
  ],

  /* --- caida -------------------------------------------------------- */
  fall: [
    { legs: [LEG('trail', -1, -2, true), LEG('reach', 0, -1)], arms: { back: 'jump', front: 'down' }, tail: 'back', bob: 0 },
    { legs: [LEG('trail', -2, -1, true), LEG('plant', 1, -1)], arms: { back: 'jump', front: 'down' }, tail: 'down', bob: 1 },
  ],
};

export const ANIMATIONS = {};
for (const [name, frames] of Object.entries(A)) {
  ANIMATIONS[name] = frames.map(compose);
}

export const META = { W, H, PALETTE };
