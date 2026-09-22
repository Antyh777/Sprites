/* ==========================================================================
   lab.js — laboratorio de movimiento
   ==========================================================================
   Ejecuta el MOTOR REAL del juego (js/game.js) en un escenario limpio:
   misma física, misma máquina de animación y mismo cambio de vista, pero
   dibujado por este laboratorio para poder ver al detalle qué frame usa.

   Modos:
     drive   el usuario conduce (flechas, shift, espacio)
     auto    guion automático de movimientos
     manual  elige vista/animeción/frame a mano
   ========================================================================== */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STEP = 1 / 60;

  var VIEW_COLORS = {
    front: '#57b6ff',
    right: '#8ef2a8',
    side: '#8ef2a8',
    left: '#ffd166',
    back: '#c792ea',
  };
  var SHEET_OF_VIEW = { front: 'front', right: 'side', side: 'side', left: 'left', back: 'back' };
  var VIEW_LABELS = {
    front: 'FRENTE', right: 'PERFIL DERECHA', left: 'PERFIL IZQUIERDA',
    side: 'PERFIL', back: 'ESPALDAS',
  };

  var Lab = {
    mode: 'drive',
    speed: 1,
    onion: false,
    markers: true,
    planks: false,
    frontWalk: false,

    /* ------------------------------ arranque --------------------------- */

    init: function () {
      var self = this;
      this.canvas = $('lab');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.time = 0;
      this.accum = 0;
      this.viewLog = [];
      this.coverage = {};
      this.totalTicks = 0;
      this.autoIndex = 0;
      this.autoTimer = 0;
      this.manual = { view: 'front', anim: 'idle', frame: 0 };
      this.last = 0;
      this.fps = 60;

      root.Sprites.robotViews(function (views) {
        if (!views) {
          $('readout').textContent = 'No se pudieron cargar las hojas del robot.';
          return;
        }
        self.boot(views);
      });
    },

    boot: function (views) {
      var self = this;
      // canvas propio del motor, oculto: aquí no se dibuja, solo se simula
      var engineCanvas = document.createElement('canvas');
      engineCanvas.width = root.Game.VIEW.w;
      engineCanvas.height = root.Game.VIEW.h;
      engineCanvas.style.display = 'none';
      document.body.appendChild(engineCanvas);

      root.Game.init(engineCanvas, { views: views });
      root.Game.options.parallax = false;
      root.Game.options.shadows = false;
      root.Game.options.autoplay = false;
      this.Game = root.Game;
      this.views = views;
      // plataformas del nivel original (se pueden reactivar para probar aterrizajes)
      this.originalPlanks = root.Game.LEVEL.solids.filter(function (s) { return s.type === 'plank'; });
      this.originalSolids = root.Game.LEVEL.solids.slice();
      this.originalWidth = root.Game.LEVEL.width;
      this.originalGoal = root.Game.LEVEL.goal;

      this.sheetCache = {};
      this.framesOf = function (anim) {
        var view = self.Game.currentView || 'front';
        var sheet = views[view] || views.front;
        var list = sheet.anims[anim] || sheet.anims.idle;
        return { sheet: sheet, list: list };
      };

      this.bindControls();
      this.buildStrip();
      this.buildCoverage();
      this.reset();
      this.Game.setState('playing');
      this.applyMode('drive');

      root.requestAnimationFrame(function (t) { self.loop(t); });
    },

    /** Deja el mundo en un estado limpio para probar el movimiento */
    reset: function () {
      var G = this.Game;
      var floor = { x: -20000, y: G.GROUND_TOP, w: 480000, h: 40, type: 'ground' };
      G.LEVEL.width = 400000;           // pista larga: nunca se llega al borde
      G.LEVEL.solids = [floor].concat(this.planks ? this.originalPlanks : []);
      G.LEVEL.coins = [];
      G.LEVEL.enemies = [];
      G.LEVEL.goal = { x: 999999, base: G.GROUND_TOP };   // sin meta
      G.start();
      G.LEVEL.coins = [];
      G.LEVEL.enemies = [];
      G.stats.time = 0;
      G.viewMode = 'auto';
      G.options.frontWalk = this.frontWalk;
      G.player.x = 40;
      G.cam.x = 0;
      this.time = 0;
      this.autoIndex = 0;
      this.autoTimer = 0;
      this.viewLog = [];
      root.Input.set('left', false);
      root.Input.set('right', false);
      root.Input.set('run', false);
      root.Input.set('jump', false);
      root.Input.setHold(null);
      this.coverage = {};
      this.buildCoverage();
      this.buildStrip();
    },

    /* ------------------------------- controles -------------------------- */

    bindControls: function () {
      var self = this;
      Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (btn) {
        btn.addEventListener('click', function () { self.applyMode(btn.dataset.mode); });
      });

      $('sel-view').addEventListener('change', function () {
        self.manual.view = this.value;
        self.applyMode('manual');
      });
      $('sel-anim').addEventListener('change', function () {
        self.manual.anim = this.value;
        self.manual.frame = 0;
        self.applyMode('manual');
      });
      $('btn-prev').addEventListener('click', function () {
        self.manual.frame -= 1;
        self.applyMode('manual');
      });
      $('btn-next').addEventListener('click', function () {
        self.manual.frame += 1;
        self.applyMode('manual');
      });
      $('speed').addEventListener('input', function () {
        self.speed = parseFloat(this.value);
        $('speed-label').textContent = '×' + self.speed.toFixed(1);
      });
      $('onion').addEventListener('change', function () { self.onion = this.checked; });
      $('markers').addEventListener('change', function () { self.markers = this.checked; });
      $('btn-reset').addEventListener('click', function () { self.reset(); });
      $('frontwalk').addEventListener('change', function () {
        self.frontWalk = this.checked;
        self.Game.options.frontWalk = this.checked;
        self.coverage = {};
        self.buildCoverage();
      });
      $('planks').addEventListener('change', function () {
        self.planks = this.checked;
        self.reset();
      });

      // teclado del modo conducir
      root.Input.init({ buffer: 0.12 });
      root.Input.onAction = function (key) {
        if (key === 'r') self.reset();
      };
    },

    applyMode: function (mode) {
      this.mode = mode;
      Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
        b.classList.toggle('is-active', b.dataset.mode === mode);
      });
      $('manual-group').hidden = mode !== 'manual';
      if (mode === 'manual') {
        this.Game.viewMode = this.manual.view;
        if (this.Game.views[this.manual.view]) this.Game.setView(this.manual.view);
        this.Game.setState('paused');
      } else if (mode === 'auto') {
        this.Game.viewMode = 'auto';
        this.Game.setState('playing');
        this.autoIndex = 0;
        this.autoTimer = 0;
      } else {
        this.Game.viewMode = 'auto';
        this.Game.setState('playing');
      }
      this.buildStrip();
      this.updateReadout();
    },

    /* -------------------------------- guion ----------------------------- */

    SCRIPT: [
      { t: 1.0, keys: {}, name: 'quieto → vista frontal' },
      { t: 1.8, keys: { right: true }, name: 'andar a la derecha' },
      { t: 2.4, keys: { right: true, run: true }, name: 'correr a la derecha' },
      { t: 0.30, keys: { right: true, run: true, jump: true }, name: 'salto' },
      { t: 1.0, keys: { right: true, run: true }, name: 'caída' },
      { t: 1.2, keys: {}, name: 'frenar → frontal' },
      { t: 1.8, keys: { left: true }, name: 'andar a la izquierda' },
      { t: 2.4, keys: { left: true, run: true }, name: 'correr a la izquierda' },
      { t: 1.0, keys: { left: true, run: true, jump: true }, name: 'salto a la izquierda' },
      { t: 1.2, keys: {}, name: 'quieto' },
      { t: 4.0, keys: {}, name: 'rato quieto → espaldas' },
    ],

    driveScript: function (dt) {
      var step = this.SCRIPT[this.autoIndex % this.SCRIPT.length];
      this.autoTimer += dt;
      var keys = step.keys;
      root.Input.set('left', !!keys.left);
      root.Input.set('right', !!keys.right);
      root.Input.set('run', !!keys.run);
      var jump = !!keys.jump;
      if (jump && !root.Input.state.jump) root.Input.queueJump();
      root.Input.set('jump', jump);
      root.Input.setHold(jump ? true : null);
      if (this.autoTimer >= step.t) {
        this.autoTimer = 0;
        this.autoIndex++;
      }
      return step.name;
    },

    /* -------------------------------- bucle ----------------------------- */

    loop: function (ts) {
      var self = this;
      root.requestAnimationFrame(function (t) { self.loop(t); });
      if (!this.last) this.last = ts;
      var real = Math.min(0.05, (ts - this.last) / 1000);
      this.last = ts;
      this.fps = this.fps * 0.9 + (1 / Math.max(real, 0.0001)) * 0.1;

      var dt = real * this.speed;
      this.accum += dt;

      while (this.accum >= STEP) {
        this.tick(STEP);
        this.accum -= STEP;
      }
      this.draw();
    },

    tick: function (dt) {
      var G = this.Game;
      this.time += dt;

      if (this.mode === 'auto') {
        this.currentStep = this.driveScript(dt);
      } else if (this.mode === 'drive') {
        this.currentStep = 'control manual';
      } else {
        this.currentStep = 'frame a frame';
        // en manual no avanzamos la simulación: solo refrescamos el frame pedido
        if (G.currentView !== this.manual.view && G.views[this.manual.view]) {
          G.setView(this.manual.view);
        }
        var list = this.framesOf(this.manual.anim).list;
        var n = list.length;
        var f = ((this.manual.frame % n) + n) % n;
        this.manual.frame = f;
        G.player.anim = this.manual.anim;
        G.player.frame = f;
        this.recordCoverage(SHEET_OF_VIEW[this.manual.view] || 'front', this.manual.anim, f);
        this.updateReadout();
        return;
      }

      G.update(dt);
      this.totalTicks++;

      var view = G.currentView;
      var sheetKey = SHEET_OF_VIEW[view] || 'front';
      this.recordCoverage(sheetKey, G.player.anim, G.player.frame);
      this.logView(view);
      this.updateReadout();
    },

    recordCoverage: function (sheet, anim, frame) {
      if (!this.coverage[sheet]) this.coverage[sheet] = {};
      if (!this.coverage[sheet][anim]) this.coverage[sheet][anim] = {};
      this.coverage[sheet][anim][frame] = true;
      this.coverageDirty = true;
    },

    logView: function (view) {
      var list = this.viewLog;
      var last = list[list.length - 1];
      if (last && last.view === view) { last.n++; return; }
      list.push({ view: view, n: 1 });
      if (list.length > 500) list.shift();
    },

    /* -------------------------------- dibujo ---------------------------- */

    draw: function () {
      var ctx = this.ctx;
      var G = this.Game;
      var W = this.canvas.width;
      var H = this.canvas.height;

      // fondo de tablero (deja ver que el fondo es transparente)
      ctx.fillStyle = '#151a2e';
      ctx.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 16) {
        for (var x = 0; x < W; x += 16) {
          if (((x >> 4) + (y >> 4)) % 2 === 0) {
            ctx.fillStyle = '#181e36';
            ctx.fillRect(x, y, 16, 16);
          }
        }
      }

      // cámara que sigue al personaje
      var p = G.player;
      var camX = Math.max(0, p.x - 120);
      this.camX = camX;

      // suelo y marcas de distancia
      var groundY = G.GROUND_TOP;
      ctx.fillStyle = '#2b3355';
      ctx.fillRect(0, groundY, W, 2);
      ctx.fillStyle = '#1f2745';
      ctx.fillRect(0, groundY + 2, W, H - groundY - 2);
      if (this.markers) {
        var first = Math.floor(camX / 32) * 32;
        ctx.font = '8px ui-monospace, monospace';
        for (var mx = first; mx < camX + W; mx += 32) {
          var sx = Math.round(mx - camX);
          var major = mx % 128 === 0;
          ctx.fillStyle = major ? '#4a5b90' : '#333d63';
          ctx.fillRect(sx, groundY + 2, 1, major ? 12 : 6);
          if (major) {
            ctx.fillStyle = '#6d7cb0';
            ctx.fillText(String(mx), sx + 2, groundY + 18);
          }
        }
      }

      // el personaje, con las mismas reglas que el juego
      var sheet = G.sheet;
      var rect = G.frameRect(p.anim, p.frame);
      var scale = sheet.scale || 1;
      var cx = Math.round(p.x + p.w / 2 - camX);
      var feet = Math.round(p.y + p.h);
      var w = Math.round(rect.w * scale);
      var h = Math.round(rect.h * scale);

      if (this.speed < 1) {
        // en cámara lenta marcamos la caja de colisión
        ctx.strokeStyle = 'rgba(255,209,102,.5)';
        ctx.strokeRect(p.x - camX + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
      }

      var doFlip = p.facing < 0 && !sheet.preFlipped;
      var src = doFlip ? sheet.flipped : sheet.source;
      var sx = doFlip ? src.width - rect.x - rect.w : rect.x;

      if (this.onion) {
        // frame anterior superpuesto
        var list = this.framesOf(p.anim).list;
        var prev = list[(p.frame - 1 + list.length) % list.length];
        ctx.globalAlpha = 0.3;
        ctx.drawImage(sheet.source, prev.x, prev.y, prev.w, prev.h,
          cx - Math.round(prev.w * scale / 2), feet - Math.round(prev.h * scale),
          Math.round(prev.w * scale), Math.round(prev.h * scale));
        ctx.globalAlpha = 1;
      }

      ctx.drawImage(src, sx, rect.y, rect.w, rect.h,
        cx - Math.round(w / 2), feet - h, w, h);

      // flecha que indica hacia dónde mira
      ctx.fillStyle = p.facing < 0 ? '#ffd166' : '#8ef2a8';
      var midY = feet - Math.round(h / 2);
      if (p.facing < 0) {
        ctx.fillRect(cx - Math.round(w / 2) - 9, midY, 8, 2);
        ctx.fillRect(cx - Math.round(w / 2) - 9, midY - 2, 2, 6);
      } else {
        ctx.fillRect(cx + Math.round(w / 2) + 1, midY, 8, 2);
        ctx.fillRect(cx + Math.round(w / 2) + 7, midY - 2, 2, 6);
      }

      this.drawStripHighlight();
      if (this.coverageDirty) {
        this.coverageDirty = false;
        this.buildCoverage();
      }
      this.buildTimeline();
    },

    /* ------------------------------- lecturas --------------------------- */

    formatReadout: function () {
      var G = this.Game;
      var p = G.player;
      var view = G.currentView || 'front';
      var lines = [];
      lines.push('modo      ' + this.mode + ' · ' + (this.currentStep || ''));
      lines.push('vista     ' + (VIEW_LABELS[view] || view) + '   hoja: ' +
        (SHEET_OF_VIEW[view] || view) + '-sheet.png');
      lines.push('animación ' + p.anim + '   frame ' + (p.frame + 1) + '/' +
        this.framesOf(p.anim).list.length + '   fps ' + (p.fps || 0).toFixed(1));
      lines.push('posición  x ' + p.x.toFixed(0) + '  y ' + p.y.toFixed(0) +
        '   vx ' + p.vx.toFixed(0) + '  vy ' + p.vy.toFixed(0));
      lines.push('estado    ' + (p.onGround ? 'en el suelo' : 'en el aire') +
        '   mirando ' + (p.facing < 0 ? '←' : '→') + '   fps juego ' + this.fps.toFixed(0));
      lines.push('corrido   ' + (p.x - 40).toFixed(0) + ' px en ' + this.time.toFixed(1) + ' s');
      return lines.join('\n');
    },

    updateReadout: function () {
      var el = $('readout');
      if (el) el.textContent = this.formatReadout();
      var label = $('frame-label');
      if (label) label.textContent = (this.Game.player.frame + 1) + '';
      this.drawStripHighlight();
    },

    /* ---------------------------- tira de frames ------------------------ */

    buildStrip: function () {
      var self = this;
      var wrap = $('strip');
      if (!wrap) return;
      wrap.innerHTML = '';
      var order = root.Sprites.ANIM_ORDER;
      this.cellEls = {};
      order.forEach(function (anim) {
        var row = document.createElement('div');
        row.className = 'row';
        row.dataset.anim = anim;
        var frames = self.views.front.anims[anim];
        frames.forEach(function (rect, i) {
          var c = document.createElement('canvas');
          c.className = 'cell';
          c.width = rect.w;
          c.height = rect.h;
          c.title = anim + ' · frame ' + (i + 1);
          var g = c.getContext('2d');
          g.imageSmoothingEnabled = false;
          g.drawImage(self.views.front.source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
          row.appendChild(c);
          self.cellEls[anim + '/' + i] = c;
        });
        wrap.appendChild(row);
      });
    },

    drawStripHighlight: function () {
      if (!this.cellEls) return;
      var G = this.Game;
      var anim = G.player.anim;
      var frame = G.player.frame;
      var sheetKey = SHEET_OF_VIEW[G.currentView] || 'front';
      Object.keys(this.cellEls).forEach(function (key) {
        var el = this.cellEls[key];
        var parts = key.split('/');
        var a = parts[0];
        var i = parseInt(parts[1], 10);
        el.classList.toggle('active', a === anim && i === frame);
        var cov = (this.coverage[sheetKey] || {})[a] || {};
        el.classList.toggle('seen', !!cov[i]);
        el.parentNode.classList.toggle('dim', a !== anim);
      }, this);
      var info = $('strip-info');
      if (info) {
        var total = 0;
        var seen = 0;
        var order = root.Sprites.ANIM_ORDER;
        order.forEach(function (a) {
          var n = this.views.front.anims[a].length;
          total += n;
          var cov = (this.coverage[sheetKey] || {})[a] || {};
          seen += Object.keys(cov).length;
        }, this);
        info.textContent = 'Hoja ' + sheetKey + ': ' + seen + '/' + total +
          ' frames vistos en esta sesión · la tira muestra la hoja frontal (referencia)';
      }
    },

    /* ------------------------- registro y cobertura --------------------- */

    buildTimeline: function () {
      var el = $('timeline');
      if (!el) return;
      var items = this.viewLog.slice(-160);
      var signature = items.length + ':' + (items.length ? items[items.length - 1].n : 0);
      if (el.dataset.signature !== signature) {
        el.dataset.signature = signature;
        el.innerHTML = '';
        items.forEach(function (it) {
          var i = document.createElement('i');
          i.style.background = VIEW_COLORS[it.view] || '#555';
          i.style.flexGrow = String(it.n);
          el.appendChild(i);
        });
      }
      var counts = {};
      this.viewLog.forEach(function (it) {
        counts[it.view] = (counts[it.view] || 0) + it.n;
      });
      var txt = Object.keys(counts).map(function (v) {
        return (VIEW_LABELS[v] || v) + ' ' + (counts[v] / Math.max(1, this.totalTicks) * 100).toFixed(0) + '%';
      }, this).join(' · ');
      var elc = $('view-counts');
      if (elc) elc.textContent = txt || 'sin datos todavía';
    },

    /**
     * Qué animaciones le tocan a cada hoja según el modo de vista del juego:
     *   automático      → frente y espaldas sólo el reposo; los perfiles, el movimiento
     *   frente caminando→ toda la hoja frontal (incluye andar/correr/saltar/caer)
     */
    expectedOf: function (sheet) {
      if (this.frontWalk) return sheet === 'front' ? ['idle', 'walk', 'run', 'jump', 'fall'] : [];
      if (sheet === 'front' || sheet === 'back') return ['idle'];
      return ['walk', 'run', 'jump', 'fall'];
    },

    buildCoverage: function () {
      var wrap = $('coverage');
      if (!wrap) return;
      wrap.innerHTML = '';
      var order = root.Sprites.ANIM_ORDER;
      var sheets = ['front', 'side', 'left', 'back'];
      var totalGot = 0;
      var totalExp = 0;
      sheets.forEach(function (sheet) {
        var expected = this.expectedOf(sheet);
        order.forEach(function (anim) {
          var n = this.views.front.anims[anim].length;
          var cov = (this.coverage[sheet] || {})[anim] || {};
          var row = document.createElement('div');
          row.className = 'crow' + (expected.indexOf(anim) < 0 ? ' off' : '');
          var label = document.createElement('span');
          label.className = 'label';
          label.textContent = sheet.slice(0, 2).toUpperCase() + '/' + anim.slice(0, 4);
          row.appendChild(label);
          var on = 0;
          for (var i = 0; i < n; i++) {
            var b = document.createElement('span');
            b.className = 'box' + (cov[i] ? ' on' : '');
            row.appendChild(b);
            if (cov[i]) on++;
          }
          var count = document.createElement('span');
          count.className = 'count';
          count.textContent = on + '/' + n;
          row.appendChild(count);
          wrap.appendChild(row);
          if (expected.indexOf(anim) >= 0) { totalGot += on; totalExp += n; }
        }, this);
      }, this);

      var summary = $('coverage-total');
      if (summary) {
        var pct = totalExp ? Math.round((totalGot / totalExp) * 100) : 0;
        summary.textContent = 'Cobertura de esta sesión: ' + totalGot + '/' + totalExp + ' (' + pct + '%)';
        summary.classList.toggle('done', totalExp > 0 && totalGot === totalExp);
      }
    },
  };

  root.Lab = Lab;
  root.addEventListener('DOMContentLoaded', function () { Lab.init(); });
})(typeof window !== 'undefined' ? window : this);
