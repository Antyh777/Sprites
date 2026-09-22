/* ==========================================================================
   sprites.js — hojas de sprites: generacion, recorte y deteccion automatica
   ==========================================================================
   Todo el juego trabaja con un objeto "sheet":

     sheet = {
       source,                  // Image o canvas de donde se dibuja
       flipped,                 // copia espejada (para mirar a la izquierda)
       fw, fh,                  // tamaño de frame
       scale,                   // escala de dibujo recomendada
       anims: { idle:[r,...], walk:[...], run:[...], jump:[...], fall:[...] },
       rects: {x,y,w,h},        // rectangulo de origen en la hoja
       name
     }

   Reglas de anclaje: cada frame se dibuja con el centro-abajo del rect
   (los pies) en la posicion del personaje, asi cualquier hoja encaja.
   ========================================================================== */
(function (root) {
  'use strict';

  var ANIM_ORDER = ['idle', 'walk', 'run', 'jump', 'fall'];

  /* ---------------------------- utilidades ---------------------------- */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function ctxOf(canvas) {
    var g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    return g;
  }

  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function flipCanvas(src) {
    var c = makeCanvas(src.width, src.height);
    var g = ctxOf(c);
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  /* ------------------ hoja a partir de frames de texto ----------------- */
  /* data = { meta:{w,h,palette,order,rows}, animations:{nombre:[frames]} } */

  function buildFromFrames(data) {
    var meta = data.meta;
    var order = (meta.order || ANIM_ORDER).filter(function (n) {
      return data.animations[n] && data.animations[n].length;
    });
    var counts = order.map(function (n) { return data.animations[n].length; });
    var cols = Math.max.apply(null, counts);
    var fw = meta.w;
    var fh = meta.h;
    var canvas = makeCanvas(cols * fw, order.length * fh);
    var ctx = ctxOf(canvas);
    var img = ctx.createImageData(canvas.width, canvas.height);
    var buf = img.data;

    var colors = {};
    Object.keys(meta.palette).forEach(function (k) {
      var v = meta.palette[k];
      colors[k] = v ? hexToRgb(v) : null;
    });

    var anims = {};
    order.forEach(function (name, row) {
      var frames = data.animations[name];
      anims[name] = frames.map(function (frame, col) {
        for (var y = 0; y < fh; y++) {
          var line = frame[y] || '';
          for (var x = 0; x < fw; x++) {
            var rgb = colors[line[x]];
            if (!rgb) continue;
            var i = ((row * fh + y) * canvas.width + col * fw + x) * 4;
            buf[i] = rgb[0];
            buf[i + 1] = rgb[1];
            buf[i + 2] = rgb[2];
            buf[i + 3] = 255;
          }
        }
        return { x: col * fw, y: row * fh, w: fw, h: fh };
      });
    });

    ctx.putImageData(img, 0, 0);

    return finishSheet({
      source: canvas,
      fw: fw,
      fh: fh,
      anims: anims,
      name: 'heroe incluido',
      sourceType: 'generated',
    });
  }

  /* --------------- hoja a partir de una imagen cargada --------------- */

  function imageToCanvas(img) {
    var c = makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
    var g = ctxOf(c);
    g.drawImage(img, 0, 0);
    return c;
  }

  /** Filas de rectangulos creadas con rejilla uniforme */
  function gridRows(cfg) {
    var rows = [];
    var order = cfg.order || ANIM_ORDER;
    order.forEach(function (name, row) {
      var n = cfg.counts[name] || 1;
      var frames = [];
      for (var c = 0; c < n; c++) {
        frames.push({
          x: c * (cfg.fw + cfg.gap),
          y: row * (cfg.fh + cfg.gap),
          w: cfg.fw,
          h: cfg.fh,
        });
      }
      rows.push({ name: name, frames: frames });
    });
    return rows;
  }

  /* ------------------- deteccion automatica de rejilla ---------------- */
  /* Busca huecos totalmente transparentes para separar los frames.      */

  function detectGroups(canvas) {
    var ctx = ctxOf(canvas);
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;

    function colEmpty(x, y0, y1) {
      for (var y = y0; y < y1; y++) {
        if (data[(y * w + x) * 4 + 3] > 8) return false;
      }
      return true;
    }
    function rowEmpty(y, x0, x1) {
      for (var x = x0; x < x1; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) return false;
      }
      return true;
    }
    function runs(isEmpty, from, to) {
      var out = [];
      var start = -1;
      for (var i = from; i <= to; i++) {
        var empty = i === to ? true : isEmpty(i);
        if (!empty && start < 0) start = i;
        else if (empty && start >= 0) {
          out.push({ a: start, b: i - 1 });
          start = -1;
        }
      }
      return out;
    }

    var rowRuns = runs(function (y) { return rowEmpty(y, 0, w); }, 0, h);
    var rows = [];
    rowRuns.forEach(function (rr) {
      var colRuns = runs(function (x) { return colEmpty(x, rr.a, rr.b + 1); }, 0, w);
      if (!colRuns.length) return;
      rows.push({
        frames: colRuns.map(function (cr) {
          return { x: cr.a, y: rr.a, w: cr.b - cr.a + 1, h: rr.b - rr.a + 1 };
        }),
      });
    });
    return rows;
  }

  /**
   * Recorta el margen transparente comun a todos los frames (mantiene la
   * alineacion entre frames, cosa que un recorte por frame rompería).
   */
  function commonTrim(canvas, rows, fw, fh) {
    var ctx = ctxOf(canvas);
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var minX = fw, minY = fh, maxX = -1, maxY = -1;

    rows.forEach(function (row) {
      row.frames.forEach(function (fr) {
        for (var y = 0; y < fr.h; y++) {
          for (var x = 0; x < fr.w; x++) {
            var a = data[((fr.y + y) * canvas.width + (fr.x + x)) * 4 + 3];
            if (a > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
      });
    });
    if (maxX < 0) return null;

    rows.forEach(function (row) {
      row.frames = row.frames.map(function (fr) {
        return { x: fr.x + minX, y: fr.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      });
    });
    return { w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /** Normaliza filas detectadas: tamaño comun (maximo) y anclaje abajo */
  function normalizeRows(rows) {
    var fw = 0;
    var fh = 0;
    rows.forEach(function (row) {
      row.frames.forEach(function (f) {
        if (f.w > fw) fw = f.w;
        if (f.h > fh) fh = f.h;
      });
    });
    rows.forEach(function (row) {
      row.frames = row.frames.map(function (f) {
        // centrado horizontal y pegado abajo dentro del frame comun
        var x = f.x - Math.round((fw - f.w) / 2);
        var y = f.y - (fh - f.h);
        return { x: x, y: y, w: fw, h: fh };
      });
    });
    return { fw: fw, fh: fh };
  }

  function finishSheet(sheet) {
    sheet.flipped = flipCanvas(sheet.source);
    if (!sheet.scale) sheet.scale = autoScale(sheet.fh);
    return sheet;
  }

  /** Escala para que el personaje mida ~30 px de alto en pantalla */
  function autoScale(fh) {
    return Math.max(0.3, Math.min(1.5, 30 / fh));
  }

  function animsFromRows(rows, order, fallback) {
    var anims = {};
    var names = order || ANIM_ORDER;
    names.forEach(function (name, i) {
      var row = rows[i];
      anims[name] = row && row.frames.length ? row.frames : null;
    });
    // rellenos: correr usa caminar, salto/caida usan el primer frame disponible
    if (!anims.run) anims.run = anims.walk || anims.idle;
    if (!anims.jump) anims.jump = anims.idle;
    if (!anims.fall) anims.fall = anims.jump;
    if (!anims.idle) anims.idle = anims.walk || anims.run || anims.jump;
    if (!anims.walk) anims.walk = anims.idle;
    if (fallback) {
      Object.keys(anims).forEach(function (k) {
        if (!anims[k]) anims[k] = fallback[k];
      });
    }
    return anims;
  }

  function sheetFromCanvas(canvas, rows, info) {
    var size = normalizeRows(rows);
    var sheet = {
      source: canvas,
      fw: size.fw,
      fh: size.fh,
      anims: animsFromRows(rows, info.order, info.fallback),
      name: info.name || 'sprite cargado',
      sourceType: info.sourceType || 'custom',
      detected: !!info.detected,
    };
    if (info.scale) sheet.scale = info.scale;
    return finishSheet(sheet);
  }

  /* --------------------------- API publica --------------------------- */

  var Sprites = {
    ANIM_ORDER: ANIM_ORDER,

    /** Hoja del heroe incluido (frames generados por tools/build.mjs) */
    builtinHero: function () {
      var data = root.HERO_FRAMES;
      if (data && data.animations && data.meta) return buildFromFrames(data);
      // respaldo: PNG embebido como data URL
      var img = new Image();
      img.src = root.HERO_SHEET_PNG;
      var sheet = {
        source: img,
        fw: 16,
        fh: 24,
        anims: {},
        name: 'heroe incluido (png)',
        sourceType: 'generated',
        scale: 1,
      };
      var counts = { idle: 4, walk: 6, run: 6, jump: 2, fall: 2 };
      var rows = gridRows({ fw: 16, fh: 24, gap: 0, order: ANIM_ORDER, counts: counts });
      sheet.anims = animsFromRows(rows, ANIM_ORDER);
      return finishSheet(sheet);
    },

    gridRows: gridRows,
    detectGroups: detectGroups,

    /** Rejilla definida a mano en el panel */
    sheetFromGrid: function (img, cfg) {
      var canvas = imageToCanvas(img);
      var rows = gridRows(cfg);
      if (cfg.trim) {
        var trimmed = commonTrim(canvas, rows, cfg.fw, cfg.fh);
        if (trimmed) {
          cfg = Object.assign({}, cfg, { fw: trimmed.w, fh: trimmed.h });
        }
      }
      var sheet = sheetFromCanvas(canvas, rows, {
        order: cfg.order,
        name: cfg.name || 'sprite cargado',
        fallback: cfg.fallback,
        detected: false,
      });
      sheet.trimmed = !!cfg.trim;
      return sheet;
    },

    /** Deteccion automatica por huecos transparentes */
    sheetFromAuto: function (img, cfg) {
      cfg = cfg || {};
      var canvas = imageToCanvas(img);
      var groups = detectGroups(canvas);
      if (!groups.length) return null;
      var sheet = sheetFromCanvas(canvas, groups, {
        order: cfg.order,
        name: cfg.name || 'sprite detectado',
        fallback: cfg.fallback,
        detected: true,
      });
      sheet.rowsDetected = groups.map(function (g) { return g.frames.length; });
      return sheet;
    },

    /** Lee un File/Blob y devuelve una Image ya cargada */
    loadImage: function (file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('No se pudo leer la imagen'));
        };
        img.src = url;
      });
    },

    /** Igual que loadImage pero desde un src (p. ej. data URL) */
    loadImageSrc: function (src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
        img.src = src;
      });
    },

    /** Vuelca un frame concreto sobre un canvas de destino */
    drawFrame: function (ctx, sheet, rect, cx, feetY, facing, scale) {
      var s = scale || sheet.scale || 1;
      var w = rect.w * s;
      var h = rect.h * s;
      var src = facing < 0 ? sheet.flipped : sheet.source;
      // fuente espejada: el rect se refleja dentro de la hoja
      var sx = facing < 0 ? src.width - rect.x - rect.w : rect.x;
      ctx.drawImage(src, sx, rect.y, rect.w, rect.h, Math.round(cx - w / 2), Math.round(feetY - h), Math.round(w), Math.round(h));
    },

    /** Data URL de un sprite de texto (corazones del HUD, iconos...) */
    dataURLFromAscii: function (frame, palette, scale) {
      scale = scale || 1;
      var h = frame.length;
      var w = frame[0].length;
      var canvas = makeCanvas(w, h);
      var ctx = ctxOf(canvas);
      var img = ctx.createImageData(w, h);
      var buf = img.data;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var c = palette[frame[y][x]];
          if (!c) continue;
          var rgb = hexToRgb(c);
          var i = (y * w + x) * 4;
          buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (scale === 1) return canvas.toDataURL();
      var big = makeCanvas(w * scale, h * scale);
      var g2 = ctxOf(big);
      g2.drawImage(canvas, 0, 0, w * scale, h * scale);
      return big.toDataURL();
    },

    /* ----------------------- arte auxiliar ----------------------- */

    /** Slime: enemigo que patrulla. Filas = animaciones (vivo / aplastado) */
    slimeSheet: function () {
      var palette = {
        '.': null, K: '#101f1a', G: '#57c777', g: '#2f8f52',
        m: '#a8e8bd', W: '#ffffff', E: '#16241d',
      };
      var alive = [
        [ // agachado
          '............',
          '............',
          '...KKKKKK...',
          '..KGGGGGGK..',
          '.KGmWEGEWmK.',
          '.KGGGGGGGGK.',
          'KGGgGGGGgGGK',
          'KggggggggggK',
          'KKKKKKKKKKKK',
          '............',
        ],
        [ // normal
          '............',
          '...KKKKKK...',
          '..KGGGGGGK..',
          '.KGmWEGEWmK.',
          '.KGGGGGGGGK.',
          '.KGGGGGGGGK.',
          'KGGgGGGGgGGK',
          'KGggggggggGK',
          'KggggggggggK',
          'KKKKKKKKKKKK',
        ],
        [ // estirado
          '...KKKKKK...',
          '..KGGGGGGK..',
          '.KGGGGGGGGK.',
          '.KGmWEGEWmK.',
          '.KGGGGGGGGK.',
          '.KGGGGGGGGK.',
          'KGGgGGGGgGGK',
          'KGggggggggGK',
          'KggggggggggK',
          'KKKKKKKKKKKK',
        ],
        [ // normal (para el rebote)
          '............',
          '...KKKKKK...',
          '..KGGGGGGK..',
          '.KGmWEGEWmK.',
          '.KGGGGGGGGK.',
          '.KGGGGGGGGK.',
          'KGGgGGGGgGGK',
          'KGggggggggGK',
          'KggggggggggK',
          'KKKKKKKKKKKK',
        ],
      ];
      var dead = [
        '............',
        '............',
        '............',
        '............',
        '............',
        '............',
        '...KKKKKK...',
        '.KKGgGGgGKK.',
        'KGGGGGGGGGGK',
        'KKKKKKKKKKKK',
      ];
      return buildFromFrames({
        meta: { w: 12, h: 10, palette: palette, order: ['live', 'dead'] },
        animations: { live: alive, dead: [dead] },
      });
    },

    /** Moneda girando: 4 frames dibujados con elipses */
    coinFrames: function () {
      var W = 8;
      var H = 8;
      var widths = [1, 0.66, 0.3, 0.66];
      var canvas = makeCanvas(W * widths.length, H);
      var ctx = ctxOf(canvas);
      var img = ctx.createImageData(canvas.width, H);
      var buf = img.data;

      function set(x, y, col, fr) {
        var i = ((y * canvas.width) + x + fr * W) * 4;
        buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = 255;
      }

      var gold = [255, 209, 102];
      var goldDark = [176, 123, 32];
      var shine = [255, 245, 200];

      widths.forEach(function (wf, fr) {
        var rx = 3.4 * wf + 0.4;
        var ry = 3.5;
        var cx = 3.5;
        var cy = 3.5;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var nx = (x - cx) / rx;
            var ny = (y - cy) / ry;
            var d = nx * nx + ny * ny;
            if (d > 1.28) continue;
            var col;
            if (d > 0.62) col = goldDark;
            else if (nx < -0.15 && ny < -0.15) col = shine;
            else col = gold;
            set(x, y, col, fr);
          }
        }
      });
      ctx.putImageData(img, 0, 0);
      var frames = widths.map(function (_, i) {
        return { x: i * W, y: 0, w: W, h: H };
      });
      return { source: canvas, fw: W, fh: H, frames: frames, anims: { coin: frames }, scale: 1 };
    },

    /** Corazon 7x7 para el HUD, en data URL */
    heartURL: function () {
      var frame = [
        '.RR.RR.',
        'RWRRRRR',
        'RRRRRRR',
        'RRRRRRR',
        '.RRRRR.',
        '..RRR..',
        '...R...',
      ];
      var palette = { '.': null, R: '#e0483c', W: '#ffb3ad', K: '#141322' };
      // contorno
      var h = frame.length;
      var w = frame[0].length;
      var withOutline = [];
      for (var y = 0; y < h; y++) {
        var row = '';
        for (var x = 0; x < w; x++) {
          if (frame[y][x] !== '.') { row += frame[y][x]; continue; }
          var near =
            (y > 0 && frame[y - 1][x] !== '.') ||
            (y < h - 1 && frame[y + 1][x] !== '.') ||
            (x > 0 && frame[y][x - 1] !== '.') ||
            (x < w - 1 && frame[y][x + 1] !== '.');
          row += near ? 'K' : '.';
        }
        withOutline.push(row);
      }
      return Sprites.dataURLFromAscii(withOutline, palette, 1);
    },
  };

  root.Sprites = Sprites;
})(typeof window !== 'undefined' ? window : this);
