/* ==========================================================================
   ui.js — HUD, overlays, panel de sprite propio e inspector de frames
   ========================================================================== */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function UI() {}

  var ui = new UI();
  ui.STEP = 1 / 60;

  /* ------------------------------- arranque ---------------------------- */

  UI.prototype.init = function () {
    var self = this;
    this.stage = $('stage');
    this.overlay = $('overlay');
    this.panel = $('panel');
    this.touch = $('touch');
    this.heartURL = root.Sprites.heartURL();
    this.pending = null;      // imagen cargada pendiente de aplicar
    this.detected = null;     // ultimo resultado de deteccion automatica
    this.zoom = 3;
    this.frameAnim = true;
    this.currentTab = 'sprite';

    root.Game.init($('game'), {
      onHud: function (stats, state) { self.renderHud(stats); self.showState(state); },
      onState: function (state) { self.showState(state); },
    });
    root.Game.onFrame = function () {
      self.tickHud();
      if (self.currentTab === 'frames' && !self.panel.hidden && self.panel.classList.contains('open')) {
        self.drawInspector();
      }
      if (self.currentTab === 'sprite') self.drawPreviewLive();
    };

    this.buildHearts();
    this.bindButtons();
    this.bindDrop();
    this.bindKeys();
    this.bindOptions();
    this.syncFieldsFromSheet(root.Game.sheet, true);
    this.showState('title');
    this.renderHud(root.Game.stats);
    this.drawInspector();
    this.drawPreviewLive();
    root.Game.startLoop();

    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) this.touch.classList.add('show');
  };

  /* --------------------------------- HUD ------------------------------- */

  UI.prototype.buildHearts = function () {
    var wrap = $('hud-hearts');
    wrap.innerHTML = '';
    this.heartImgs = [];
    for (var i = 0; i < root.Game.stats.maxHearts; i++) {
      var img = document.createElement('img');
      img.src = this.heartURL;
      img.alt = 'vida';
      wrap.appendChild(img);
      this.heartImgs.push(img);
    }
  };

  UI.prototype.renderHud = function (stats) {
    if (!this.heartImgs) return;
    for (var i = 0; i < this.heartImgs.length; i++) {
      this.heartImgs[i].classList.toggle('off', i >= stats.hearts);
    }
    $('hud-coins').textContent = stats.coins;
    $('hud-coins-total').textContent = stats.coinsTotal;
    $('hud-score').textContent = stats.score;
    this.tickHud(true);
  };

  /** El tiempo cambia cada frame: refresco ligero del reloj */
  UI.prototype.tickHud = function (force) {
    var t = root.Game.stats.time;
    if (force || t !== this._lastTime) {
      this._lastTime = t;
      $('hud-time').textContent = t.toFixed(1);
    }
  };

  /* ------------------------------ overlays ----------------------------- */

  var STATES = {
    title: {
      title: 'SPRITES',
      text: 'Aventura lateral con frames de animación',
      button: '▶ Jugar',
      keys: true,
    },
    paused: {
      title: 'PAUSA',
      text: 'Respira un momento',
      button: '▶ Continuar',
    },
    dead: {
      title: 'GAME OVER',
      text: '',
      button: '↺ Reintentar',
    },
    complete: {
      title: '¡NIVEL COMPLETADO!',
      text: '',
      button: '↺ Jugar de nuevo',
    },
  };

  UI.prototype.showState = function (state) {
    var def = STATES[state];
    var stats = root.Game.stats;
    if (!def) {
      this.overlay.classList.add('hidden');
      return;
    }
    this.overlay.classList.remove('hidden');
    $('ov-title').textContent = def.title;
    var text = def.text;
    if (state === 'complete') {
      text = 'Tiempo ' + stats.time.toFixed(1) + 's · ' + stats.coins + '/' + stats.coinsTotal +
        ' monedas · ' + stats.stomps + ' enemigos · ' + stats.score + ' puntos';
    }
    if (state === 'dead') {
      text = 'Puntos ' + stats.score + ' · ' + stats.coins + ' monedas recogidas';
    }
    $('ov-text').textContent = text;
    $('ov-button').textContent = def.button;
    $('ov-button').dataset.action = state;
    var keys = document.querySelector('.keys');
    if (keys) keys.style.display = def.keys ? '' : 'none';
  };

  /* ------------------------------ botones ------------------------------ */

  UI.prototype.bindButtons = function () {
    var self = this;
    $('ov-button').addEventListener('click', function () {
      var action = this.dataset.action;
      if (action === 'paused') root.Game.setState('playing');
      else root.Game.start();
      self.showState(root.Game.state);
    });

    $('btn-pause').addEventListener('click', function () { root.Game.togglePause(); });
    $('btn-sound').addEventListener('click', function () { self.toggleSound(this); });
    $('btn-sprite').addEventListener('click', function () { self.openPanel('sprite'); });
    $('btn-frames').addEventListener('click', function () { self.openPanel('frames'); });
    $('btn-options').addEventListener('click', function () { self.openPanel('options'); });
    $('panel-close').addEventListener('click', function () { self.closePanel(); });

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { self.selectTab(tab.dataset.tab); });
    });

    // pestaña sprite
    $('drop').addEventListener('click', function () { $('file-sprite').click(); });
    $('file-sprite').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) self.loadFile(e.target.files[0]);
    });
    $('btn-autodetect').addEventListener('click', function () { self.autodetect(); });
    $('btn-apply').addEventListener('click', function () { self.applySprite(); });
    $('btn-reset-sprite').addEventListener('click', function () { self.resetSprite(); });

    // pestaña frames
    $('btn-zoom-in').addEventListener('click', function () { self.setZoom(self.zoom + 1); });
    $('btn-zoom-out').addEventListener('click', function () { self.setZoom(self.zoom - 1); });
    $('chk-anim').addEventListener('change', function () { self.frameAnim = this.checked; });

    // opciones
    $('btn-restart').addEventListener('click', function () { root.Game.start(); });
  };

  UI.prototype.toggleSound = function (btn) {
    var on = root.Sfx.toggle();
    btn.textContent = on ? '🔊' : '🔇';
  };

  UI.prototype.openPanel = function (tab) {
    this.panel.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    this.selectTab(tab);
    this.setZoom(this.zoom);
  };

  UI.prototype.closePanel = function () {
    this.panel.classList.remove('open');
    this.panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
  };

  UI.prototype.selectTab = function (tab) {
    this.currentTab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.dataset.tab === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-body'), function (b) {
      b.hidden = b.dataset.tab !== tab;
    });
    if (tab === 'frames') this.drawInspector();
    if (tab === 'sprite') { this.drawPreviewLive(); this.syncFieldsFromSheet(root.Game.sheet, false); }
  };

  /* ------------------------- carga de sprite propio -------------------- */

  UI.prototype.bindDrop = function () {
    var self = this;
    var stage = this.stage;
    ['dragenter', 'dragover'].forEach(function (ev) {
      stage.addEventListener(ev, function (e) {
        e.preventDefault();
        stage.classList.add('is-drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      stage.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'dragleave' && e.relatedTarget) return;
        stage.classList.remove('is-drag');
      });
    });
    stage.addEventListener('drop', function (e) {
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) {
        self.openPanel('sprite');
        self.loadFile(file);
      }
    });
  };

  UI.prototype.loadFile = function (file) {
    var self = this;
    root.Sprites.loadImage(file).then(function (img) {
      self.pending = img;
      self.detected = null;
      $('btn-apply').disabled = false;
      $('sheet-info').textContent = 'Imagen cargada: ' + img.width + '×' + img.height +
        ' px (' + file.name + ')';
      // intentamos detectar la rejilla automaticamente
      self.autodetect(true);
      self.drawPreview();
    }).catch(function (err) {
      $('sheet-info').textContent = 'Error: ' + err.message;
    });
  };

  UI.prototype.autodetect = function (silent) {
    if (!this.pending) {
      $('sheet-info').textContent = 'Primero carga una imagen PNG.';
      return;
    }
    var self = this;
    var img = this.pending;
    var fallback = root.Game.sheet.anims;
    var sheet = root.Sprites.sheetFromAuto(img, { order: this.readOrder(), fallback: fallback });
    if (!sheet) {
      this.detected = null;
      if (!silent) {
        $('sheet-info').textContent = 'No se han encontrado zonas transparentes: ' +
          'define el tamaño de frame a mano.';
      }
      return;
    }
    this.detected = sheet;
    // reflejamos lo detectado en los campos
    $('cfg-fw').value = sheet.fw;
    $('cfg-fh').value = sheet.fh;
    order.forEach(function (name) {
      var n = (sheet.anims[name] && sheet.anims[name].length) || 1;
      var input = $('cfg-' + name);
      if (input) input.value = n;
    });
    var counts = order.map(function (n) { return sheet.anims[n] ? sheet.anims[n].length : 0; });
    $('sheet-info').textContent = 'Detectado: frames de ' + sheet.fw + '×' + sheet.fh +
      ' px · filas [' + counts.join(', ') + '] en orden ' + order.join(' → ');
    if (!silent) this.drawPreview();
    this.drawPreview();
  };

  UI.prototype.readConfig = function () {
    return {
      fw: Math.max(4, parseInt($('cfg-fw').value, 10) || 16),
      fh: Math.max(4, parseInt($('cfg-fh').value, 10) || 24),
      gap: Math.max(0, parseInt($('cfg-gap').value, 10) || 0),
      order: this.readOrder(),
      counts: {
        idle: Math.max(1, parseInt($('cfg-idle').value, 10) || 1),
        walk: Math.max(1, parseInt($('cfg-walk').value, 10) || 1),
        run: Math.max(1, parseInt($('cfg-run').value, 10) || 1),
        jump: Math.max(1, parseInt($('cfg-jump').value, 10) || 1),
        fall: Math.max(1, parseInt($('cfg-fall').value, 10) || 1),
      },
      trim: $('cfg-trim').checked,
      name: 'sprite propio',
    };
  };

  UI.prototype.readOrder = function () {
    return $('cfg-order').value.split(',');
  };

  UI.prototype.buildPendingSheet = function () {
    if (!this.pending) return null;
    var cfg = this.readConfig();
    var fallback = root.Game.sheet.anims;
    cfg.fallback = fallback;
    // rejilla declarada a mano (respetando "recortar")
    var sheet = root.Sprites.sheetFromGrid(this.pending, cfg);
    sheet.order = cfg.order;
    sheet.config = cfg;
    return sheet;
  };

  UI.prototype.applySprite = function () {
    var sheet = this.buildPendingSheet();
    if (!sheet) return;
    sheet.name = 'sprite propio';
    root.Game.setSprite(sheet, true);
    this.syncFieldsFromSheet(sheet, false);
    $('sheet-info').textContent = 'Aplicado: ' + sheet.fw + '×' + sheet.fh + ' px por frame · ' +
      'animaciones ' + root.Sprites.ANIM_ORDER.map(function (n) {
        return n + ':' + sheet.anims[n].length;
      }).join(' ');
    this.drawPreview();
    this.drawInspector();
  };

  UI.prototype.resetSprite = function () {
    this.pending = null;
    this.detected = null;
    $('btn-apply').disabled = true;
    var sheet = root.Game.sheetDefaults;
    root.Game.setSprite(sheet, true);
    this.syncFieldsFromSheet(sheet, true);
    $('sheet-info').textContent = 'Héroe incluido: ' + sheet.fw + '×' + sheet.fh + ' px · ' +
      root.Sprites.ANIM_ORDER.map(function (n) {
        return n + ':' + sheet.anims[n].length;
      }).join(' ');
    this.drawPreview();
    this.drawInspector();
  };

  /** Rellena los campos del panel con los valores de una hoja */
  UI.prototype.syncFieldsFromSheet = function (sheet, full) {
    if (!sheet) return;
    if (full) {
      $('cfg-fw').value = sheet.fw;
      $('cfg-fh').value = sheet.fh;
      var counts = { idle: 4, walk: 6, run: 6, jump: 2, fall: 2 };
      root.Sprites.ANIM_ORDER.forEach(function (n) {
        var input = $('cfg-' + n);
        if (input) input.value = (sheet.anims[n] && sheet.anims[n].length) || counts[n];
      });
      $('sheet-info').textContent = 'Héroe incluido: ' + sheet.fw + '×' + sheet.fh + ' px · ' +
        root.Sprites.ANIM_ORDER.map(function (n) {
          return n + ':' + sheet.anims[n].length;
        }).join(' ');
    }
  };

  /* ---------------------------- previsualizar -------------------------- */

  UI.prototype.drawPreview = function () {
    var cv = $('preview');
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#121729';
    ctx.fillRect(0, 0, cv.width, cv.height);

    if (!this.pending) {
      $('preview-legend').textContent = 'Sin imagen cargada · usa "Elegir PNG" o arrastra la hoja al juego.';
      return;
    }
    var img = this.pending;
    var left = { x: 8, y: 8, w: 132, h: 164 };
    var sc = Math.min(left.w / img.width, left.h / img.height);
    var dw = Math.max(1, Math.round(img.width * sc));
    var dh = Math.max(1, Math.round(img.height * sc));
    var dx = left.x + Math.round((left.w - dw) / 2);
    var dy = left.y + Math.round((left.h - dh) / 2);

    ctx.fillStyle = '#1b2138';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.drawImage(img, dx, dy, dw, dh);

    var cfg = this.readConfig();
    var order = cfg.order;
    ctx.strokeStyle = this.detected ? 'rgba(140,240,170,.9)' : 'rgba(87,182,255,.9)';
    ctx.lineWidth = 1;
    if (this.detected) {
      order.forEach(function (name, row) {
        var frames = this.detected.anims[name] || [];
        frames.forEach(function (f) {
          ctx.strokeRect(dx + f.x * sc + 0.5, dy + f.y * sc + 0.5, f.w * sc - 1, f.h * sc - 1);
        });
      }, this);
    } else {
      order.forEach(function (name, row) {
        var n = cfg.counts[name] || 1;
        for (var c = 0; c < n; c++) {
          var fx = c * (cfg.fw + cfg.gap) * sc;
          var fy = row * (cfg.fh + cfg.gap) * sc;
          ctx.strokeRect(dx + fx + 0.5, dy + fy + 0.5, cfg.fw * sc - 1, cfg.fh * sc - 1);
        }
      });
    }

    // nombres de fila
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = '#9aa3c7';
    ctx.textAlign = 'left';
    order.forEach(function (name, row) {
      ctx.fillText(name, dx, dy + row * (cfg.fh + 6) * sc + 9);
    });

    var total = order.reduce(function (n, k) { return n + (cfg.counts[k] || 1); }, 0);
    $('preview-legend').textContent = (this.detected ? 'Detección automática · ' : 'Rejilla manual · ') +
      total + ' frames · ' + cfg.fw + '×' + cfg.fh + ' px';
  };

  /** Vista previa viva (animación ciclando) en la mitad derecha del panel */
  UI.prototype.drawPreviewLive = function () {
    var cv = $('preview');
    var ctx = cv.getContext('2d');
    var x0 = 148;
    var w = cv.width - x0;
    var h = cv.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0f1324';
    ctx.fillRect(x0, 0, w, h);

    var sheet = root.Game.sheet;
    var anims = ['idle', 'walk', 'run', 'jump', 'fall'];
    var slot = h / anims.length;
    var t = (performance.now() / 1000);

    anims.forEach(function (name, i) {
      var frames = root.Game.framesOf(name);
      var fps = name === 'idle' ? 5 : 10;
      var idx = Math.floor(t * fps) % frames.length;
      var rect = frames[idx];
      var s = Math.min(2, (slot - 12) / rect.h, (w - 20) / (rect.w * 2));
      s = Math.max(0.4, s);
      var cx = x0 + 30;
      var feet = i * slot + slot - 6;
      var src = sheet.source;
      ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h,
        Math.round(cx - rect.w * s / 2), Math.round(feet - rect.h * s),
        Math.round(rect.w * s), Math.round(rect.h * s));
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = '#9aa3c7';
      ctx.textAlign = 'left';
      ctx.fillText(name, x0 + 60, i * slot + slot / 2 + 3);
      ctx.fillStyle = '#33405f';
      ctx.fillRect(x0 + 6, Math.round(feet), w - 12, 1);
    });
  };

  /* ------------------------ inspector de frames ------------------------ */

  UI.prototype.setZoom = function (z) {
    this.zoom = Math.max(1, Math.min(6, z));
    $('zoom-label').textContent = '×' + this.zoom;
    this.drawInspector();
  };

  UI.prototype.drawInspector = function () {
    var self = this;
    var cv = $('inspector');
    var now = performance.now() / 1000;
    var sheet = root.Game.sheet;
    var zoom = this.zoom;
    var rowH = sheet.fh * zoom + 34;
    var height = rowH * root.Sprites.ANIM_ORDER.length + 16;
    if (cv.height !== height) cv.height = height;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);

    root.Sprites.ANIM_ORDER.forEach(function (name, i) {
      var frames = root.Game.framesOf(name);
      var active = root.Game.player && root.Game.player.anim === name && root.Game.state === 'playing';
      var y = 8 + i * rowH;

      ctx.fillStyle = active ? '#243056' : '#1a2138';
      ctx.fillRect(0, y - 6, cv.width, rowH - 8);

      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.fillStyle = active ? '#ffd166' : '#c8d0f0';
      ctx.textAlign = 'left';
      ctx.fillText(name, 10, y + 14);
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillStyle = '#8f9ac0';
      ctx.fillText(frames.length + ' frames', 10, y + 32);

      var idx = 0;
      if (self.frameAnim) {
        var fps = name === 'idle' ? 5 : 10;
        idx = Math.floor(now * fps) % frames.length;
      }

      for (var f = 0; f < frames.length; f++) {
        var rect = frames[f];
        var fx = 96 + f * (rect.w * zoom + 6);
        var fy = y + rowH - 14 - rect.h * zoom;
        var src = sheet.source;
        if (f === idx && self.frameAnim) {
          ctx.fillStyle = 'rgba(87,182,255,.18)';
          ctx.fillRect(fx - 2, fy - 2, rect.w * zoom + 4, rect.h * zoom + 4);
        }
        ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h,
          Math.round(fx), Math.round(fy), Math.round(rect.w * zoom), Math.round(rect.h * zoom));
        ctx.strokeStyle = 'rgba(90,110,160,.5)';
        ctx.strokeRect(fx - 0.5, fy - 0.5, rect.w * zoom + 1, rect.h * zoom + 1);
      }
    });

    $('inspector-info').textContent = 'Sprite activo: ' + sheet.name + ' · ' + sheet.fw + '×' +
      sheet.fh + ' px por frame · escala ×' + (sheet.scale || 1).toFixed(2) +
      (sheet.detected ? ' · rejilla detectada' : '');
  };

  /* ------------------------------ opciones ----------------------------- */

  UI.prototype.bindOptions = function () {
    var self = this;
    var map = {
      'opt-hurtbox': 'hitboxes',
      'opt-shadows': 'shadows',
      'opt-parallax': 'parallax',
      'opt-autoplay': 'autoplay',
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      root.Game.options[map[id]] = el.checked;
      el.addEventListener('change', function () {
        root.Game.options[map[id]] = el.checked;
        if (map[id] === 'autoplay' && el.checked) root.Sfx.unlock();
      });
    });

    $('opt-touch').addEventListener('change', function () {
      self.touch.classList.toggle('show', this.checked);
    });

    $('opt-fps').addEventListener('change', function () {
      self.showFps = this.checked;
      self.updateFpsBadge();
    });

    var speed = $('opt-speed');
    speed.addEventListener('input', function () {
      root.Game.options.speed = parseFloat(speed.value);
      $('opt-speed-val').textContent = root.Game.options.speed.toFixed(2);
    });

    var prev = root.Game.onFrame;
    root.Game.onFrame = function (dt) {
      if (prev) prev(dt);
      if (self.showFps) {
        self.fps = self.fps ? self.fps * 0.9 + (1 / Math.max(dt, 0.0001)) * 0.1 : 1 / dt;
        self.updateFpsBadge();
      }
    };
  };

  UI.prototype.updateFpsBadge = function () {
    if (!this.showFps) {
      if (this.fpsBadge) this.fpsBadge.textContent = '';
      return;
    }
    if (!this.fpsBadge) {
      this.fpsBadge = document.createElement('div');
      this.fpsBadge.style.cssText = 'position:absolute;left:10px;bottom:8px;font:11px ui-monospace,monospace;color:#8ef2a8;text-shadow:0 2px 0 #000';
      this.stage.appendChild(this.fpsBadge);
    }
    this.fpsBadge.textContent = Math.round(this.fps) + ' fps';
  };

  /* --------------------------- atajos de teclado ----------------------- */

  UI.prototype.bindKeys = function () {
    var self = this;
    root.Input.init({ buffer: 0.12 });
    root.Input.onAction = function (key) {
      switch (key) {
        case 'r': root.Game.start(); self.showState(root.Game.state); break;
        case 'p': root.Game.togglePause(); break;
        case 'm': self.toggleSound($('btn-sound')); break;
        case 'h': self.openPanel('frames'); break;
        case 'o': self.openPanel('options'); break;
        case 's': self.openPanel('sprite'); break;
        case 'f':
          // avanzar un frame con el juego en pausa
          if (root.Game.state === 'playing') root.Game.setState('paused');
          root.Game.update(self.STEP);
          root.Game.render();
          break;
        case 'g': root.Game.debugGod = !root.Game.debugGod; break;
      }
    };
  };

  /* ------------------------------ arranque ---------------------------- */

  root.addEventListener('DOMContentLoaded', function () {
    ui.init();
  });
  root.UI = ui;
})(typeof window !== 'undefined' ? window : this);
