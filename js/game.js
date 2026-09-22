/* ==========================================================================
   game.js — motor del side-scroller
   ==========================================================================
   - Fisica de plataformas (aceleracion, coyote time, salto de altura variable)
   - Maquina de estados de animacion: idle / walk / run / jump / fall
   - Enemigos que patrullan, monedas, particulas, meta
   - Camara con seguimiento suavizado y fondo en parallax
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------ constantes ---------------------------- */

  var VIEW = { w: 384, h: 216 };
  var GRAVITY = 1050;
  var MAX_FALL = 470;
  var SPEED = { walk: 78, run: 138 };
  var ACCEL = 900;
  var AIR_ACCEL = 620;
  var FRICTION = 1100;
  var AIR_DRAG = 280;
  var JUMP_VY = -355;          // sube ~60 px (2 alturas del personaje)
  var JUMP_CUT = 0.42;         // al soltar el boton de salto
  var COYOTE = 0.09;
  var STEP = 1 / 60;

  var GROUND_TOP = 176;

  /* -------------------------------- nivel ------------------------------ */

  function ground(x, w) { return { x: x, y: GROUND_TOP, w: w, h: 40, type: 'ground' }; }
  function plank(x, y, w) { return { x: x, y: y, w: w, h: 8, type: 'plank' }; }

  /**
   * Metros del heroe (hitbox 12x28, salto de 60 px):
   *   · suelo en y=176
   *   · plataforma baja:  top y=124 (52 px sobre el suelo) → alcanzable de un salto
   *   · plataforma alta:  top y= 92 (32 px mas arriba) → se sube desde la baja
   *   · huecos: 44 px → se cruzan corriendo y, justo, andando
   */
  var LEVEL = {
    width: 2760,
    solids: [
      ground(0, 640),
      ground(684, 480),     // hueco 640..684
      ground(1208, 520),    // hueco 1164..1208
      ground(1772, 988),    // hueco 1728..1772

      plank(300, 124, 64),
      plank(420, 92, 56),
      plank(760, 124, 72),
      plank(900, 92, 64),
      plank(1040, 124, 80),
      plank(1174, 140, 28),   // trampolin sobre el hueco
      plank(1300, 124, 72),
      plank(1420, 92, 64),
      plank(1560, 124, 96),
      plank(1742, 140, 28),   // trampolin sobre el hueco
      plank(1900, 124, 72),
      plank(2020, 92, 88),
      plank(2200, 124, 64),
      plank(2320, 124, 64),
    ],
    coins: [
      [308, 108], [322, 108], [336, 108],       // sobre la plataforma de 300
      [428, 76], [444, 76],                     // plataforma alta de 420
      [560, 160], [574, 160], [588, 160],       // suelo
      [652, 130], [664, 116], [676, 130],       // arco sobre el hueco 1
      [768, 108], [782, 108], [796, 108],
      [908, 76], [924, 76],
      [1050, 108], [1064, 108], [1078, 108], [1092, 108],
      [1190, 122],
      [1310, 108], [1324, 108], [1338, 108],
      [1428, 76], [1444, 76],
      [1570, 108], [1584, 108], [1598, 108], [1612, 108],
      [1704, 130], [1716, 116], [1728, 130],    // arco sobre el hueco 2
      [1910, 108], [1924, 108], [1938, 108],
      [2030, 76], [2044, 76], [2058, 76],
      [2210, 108], [2224, 108],
      [2330, 108], [2344, 108],
      [2480, 160], [2500, 160], [2520, 160], [2540, 160],
      [2610, 160], [2624, 160],
    ],
    enemies: [
      { x: 520, base: GROUND_TOP, min: 470, max: 600 },
      { x: 790, base: 124, min: 762, max: 826 },      // patrulla en plataforma
      { x: 1000, base: GROUND_TOP, min: 960, max: 1130 },
      { x: 1350, base: GROUND_TOP, min: 1290, max: 1500 },
      { x: 1590, base: 124, min: 1566, max: 1650 },
      { x: 1950, base: GROUND_TOP, min: 1880, max: 2140 },
      { x: 2400, base: GROUND_TOP, min: 2300, max: 2520 },
    ],
    goal: { x: 2650, base: GROUND_TOP },
  };

  /* ------------------------------ utilidades --------------------------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(cur, target, delta) {
    return cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target);
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* -------------------------------- motor ------------------------------ */

  var Game = {
    VIEW: VIEW,
    LEVEL: LEVEL,
    SPEED: SPEED,
    JUMP_VY: JUMP_VY,
    GROUND_TOP: GROUND_TOP,

    options: {
      parallax: true,
      particles: true,
      shadows: true,
      hitboxes: false,
      speed: 1,
      autoplay: false,
    },

    state: 'title',   // title | playing | paused | dead | complete
    sheet: null,
    sheetDefaults: null,
    stats: { hearts: 3, maxHearts: 3, coins: 0, coinsTotal: 0, score: 0, time: 0, stomps: 0 },
    cam: { x: 0, y: 0 },
    paused: false,
    debugGod: false,
    onHud: null,
    onState: null,
    onEvent: null,

    /* ------------------------------ arranque --------------------------- */

    init: function (canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.sheetDefaults = root.Sprites.builtinHero();
      this.setSprite(this.sheetDefaults, true);
      this.bakeArt();
      this.reset();
      this.state = 'title';
      if (opts) {
        if (opts.onHud) this.onHud = opts.onHud;
        if (opts.onState) this.onState = opts.onState;
      }
      return this;
    },

    /** Fuente de aleatoriedad estable para el decorado */
    rng: mulberry32(1337),

    /* -------------------- cambio de sprite (heroe) --------------------- */

    setSprite: function (sheet, keep) {
      var prevFeet = this.player ? this.player.y + this.player.h : 0;
      this.sheet = sheet;
      if (sheet && !sheet.scale) sheet.scale = 1;
      var h = clamp(Math.round(sheet.fh * sheet.scale) - 2, 14, 46);
      var w = clamp(Math.round(sheet.fw * sheet.scale * 0.62), 8, 30);
      this.playerW = w;
      this.playerH = h;
      if (keep && this.player) {
        this.player.w = w;
        this.player.h = h;
        this.player.y = prevFeet - h;
      }
    },

    /* ------------------------------ reset ------------------------------ */

    reset: function () {
      var w = this.playerW || 10;
      var h = this.playerH || 22;
      this.player = {
        x: 40, y: GROUND_TOP - h, w: w, h: h,
        vx: 0, vy: 0, facing: 1, onGround: true,
        coyote: 0, canCut: false, invuln: 0,
        anim: 'idle', animTime: 0, frame: 0, prevAnim: '',
        spawn: { x: 40, y: GROUND_TOP - h },
        deathTimer: 0,
      };
      this.coins = LEVEL.coins.map(function (c) {
        return { x: c[0], y: c[1], w: 8, h: 8, taken: false, t: Math.random() * 10 };
      });
      this.enemies = LEVEL.enemies.map(function (e) {
        var sheetE = Game.slimeSheet;
        var hh = sheetE ? sheetE.fh : 10;
        return {
          x: e.x, y: e.base - hh, w: 12, h: hh,
          vx: 26, min: e.min, max: e.max, alive: true,
          squash: 0, t: Math.random() * 5, frame: 1, base: e.base,
        };
      });
      this.particles = [];
      this.rumble = 0;
      this.stats.hearts = this.stats.maxHearts;
      this.stats.coins = 0;
      this.stats.coinsTotal = this.coins.length;
      this.stats.score = 0;
      this.stats.time = 0;
      this.stats.stomps = 0;
      this.cam.x = 0;
      this.paused = false;
      this.acc = 0;
      this.animClock = 0;
      this.emitHud();
    },

    /* ------------------------------ paso ------------------------------- */

    /** Un paso de simulacion. dt en segundos (idealmente STEP). */
    update: function (dt) {
      if (this.state !== 'playing' && this.state !== 'dying') return;
      if (this.state === 'playing') this.stats.time += dt;

      var p = this.player;
      Input.update(dt);

      if (this.state === 'dying') {
        p.deathTimer -= dt;
        p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
        p.y += p.vy * dt;
        if (p.deathTimer <= 0) {
          if (this.stats.hearts > 0) this.respawn();
          else this.setState('dead');
        }
        this.updateCamera(dt);
        return;
      }

      /* --- entrada (o piloto automatico de demo) --- */
      var ax = Input.axisX();
      var run = Input.state.run;
      if (this.options.autoplay) {
        var bot = this.botInput();
        ax = bot.ax;
        run = bot.run;
        if (bot.jump) Input.queueJump();
        Input.setHold(bot.hold);
      }

      var maxSpeed = run ? SPEED.run : SPEED.walk;
      var target = ax * maxSpeed;
      if (ax !== 0) {
        p.vx = approach(p.vx, target, (p.onGround ? ACCEL : AIR_ACCEL) * dt);
        p.facing = ax > 0 ? 1 : -1;
      } else {
        p.vx = approach(p.vx, 0, (p.onGround ? FRICTION : AIR_DRAG) * dt);
      }
      p.vx = clamp(p.vx, -SPEED.run * 1.12, SPEED.run * 1.12);

      /* --- salto --- */
      if (p.onGround) p.coyote = COYOTE;
      else p.coyote = Math.max(0, p.coyote - dt);

      if (p.coyote > 0 && Input.consumeJump()) {
        p.vy = JUMP_VY;
        p.onGround = false;
        p.coyote = 0;
        p.canCut = false;
        Sfx.play('jump');
        this.spawnDust(p.x + p.w / 2, p.y + p.h, 6, -1);
      }
      // altura variable: solo se recorta si el boton llego a estar pulsado
      if (p.vy < 0) {
        if (Input.jumpHeld) p.canCut = true;
        else if (p.canCut) { p.vy *= JUMP_CUT; p.canCut = false; }
      } else {
        p.canCut = false;
      }

      /* --- fisica --- */
      var wasGround = p.onGround;
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

      this.moveX(p, p.vx * dt);
      this.moveY(p, p.vy * dt);

      if (!wasGround && p.onGround) {
        if (p.vy > 120) this.spawnDust(p.x + p.w / 2, p.y + p.h, 5, 0);
        Sfx.play('land');
        this.rumble = Math.min(1, this.rumble + 0.35);
      }

      /* polvo al correr */
      if (p.onGround && Math.abs(p.vx) > 60) {
        this.dustTimer = (this.dustTimer || 0) + dt;
        if (this.dustTimer > 0.09) {
          this.dustTimer = 0;
          this.spawnDust(p.x + p.w / 2 - p.facing * 4, p.y + p.h - 1, 1, 0);
        }
      }

      if (p.invuln > 0) p.invuln -= dt;

      /* --- caerse al vacio --- */
      if (p.y > VIEW.h + 24) this.damage(1, true);

      /* --- recordar punto seguro --- */
      if (p.onGround && Math.abs(p.vx) < 40) {
        p.spawn.x = p.x;
        p.spawn.y = p.y;
      }

      this.updateAnimation(dt);
      this.updateCoins(dt);
      this.updateEnemies(dt);
      this.updateParticles(dt);
      this.updateGoal();
      this.updateCamera(dt);

      // el HUD solo se refresca cuando cambia algo visible
      var s = this.stats;
      if (s.score !== this._lastScore || s.coins !== this._lastCoins || s.hearts !== this._lastHearts) {
        this._lastScore = s.score; this._lastCoins = s.coins; this._lastHearts = s.hearts;
        this.emitHud();
      }
      if (this.rumble > 0) this.rumble = Math.max(0, this.rumble - dt * 3);
    },

    /* --------------------------- colisiones ---------------------------- */

    moveX: function (body, dx) {
      body.x += dx;
      for (var i = 0; i < LEVEL.solids.length; i++) {
        var s = LEVEL.solids[i];
        if (!overlap(body, s)) continue;
        if (dx > 0) body.x = s.x - body.w;
        else if (dx < 0) body.x = s.x + s.w;
        body.vx = 0;
      }
      body.x = clamp(body.x, 0, LEVEL.width - body.w);
    },

    moveY: function (body, dy) {
      body.y += dy;
      body.onGround = false;
      for (var i = 0; i < LEVEL.solids.length; i++) {
        var s = LEVEL.solids[i];
        if (!overlap(body, s)) continue;
        if (dy > 0) {
          body.y = s.y - body.h;
          body.onGround = true;
        } else if (dy < 0) {
          body.y = s.y + s.h;
        }
        body.vy = 0;
      }
    },

    /* --------------------------- animaciones --------------------------- */

    updateAnimation: function (dt) {
      var p = this.player;
      var speed = Math.abs(p.vx);
      var name;
      if (!p.onGround) name = p.vy < -12 ? 'jump' : 'fall';
      else if (speed > SPEED.walk * 1.14) name = 'run';
      else if (speed > 8) name = 'walk';
      else name = 'idle';

      if (name !== p.anim) {
        p.anim = name;
        p.animTime = 0;
      }
      p.animTime += dt;

      var fps;
      if (name === 'walk') fps = 3.4 + speed * 0.1;
      else if (name === 'run') fps = 4 + speed * 0.085;
      else if (name === 'idle') fps = 5;
      else fps = 6;

      var frames = this.framesOf(name);
      var idx = Math.floor(p.animTime * fps) % frames.length;
      p.frame = idx < 0 ? 0 : idx;
    },

    framesOf: function (name) {
      var anims = this.sheet.anims;
      var list = anims[name] || anims.idle || anims.walk;
      return list && list.length ? list : [{ x: 0, y: 0, w: this.sheet.fw, h: this.sheet.fh }];
    },

    frameRect: function (name, index) {
      var list = this.framesOf(name);
      return list[index % list.length];
    },

    /* ---------------------------- entidades ---------------------------- */

    updateCoins: function (dt) {
      var p = this.player;
      var box = { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 };
      for (var i = 0; i < this.coins.length; i++) {
        var c = this.coins[i];
        if (c.taken) continue;
        c.t += dt;
        if (!overlap(box, c)) continue;
        c.taken = true;
        this.stats.coins++;
        this.stats.score += 50;
        Sfx.play('coin');
        this.spawnSparkles(c.x + 4, c.y + 4, 10);
      }
    },

    updateEnemies: function (dt) {
      var p = this.player;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) {
          if (e.squash > 0) e.squash -= dt;
          continue;
        }
        e.t += dt;
        e.x += e.vx * dt;
        if (e.x < e.min) { e.x = e.min; e.vx = Math.abs(e.vx); }
        if (e.x + e.w > e.max) { e.x = e.max - e.w; e.vx = -Math.abs(e.vx); }
        e.frame = Math.floor(e.t * 5) % 4;

        if (!overlap(p, e)) continue;

        var feetPrev = p.y + p.h + p.vy * dt; // posicion de los pies antes de moverse
        var stomping = p.vy > 30 && feetPrev - e.y < 12;
        if (stomping || this.debugGod) {
          e.alive = false;
          e.squash = 0.5;
          p.vy = this.debugGod ? p.vy : -240;
          this.stats.stomps++;
          this.stats.score += 150;
          Sfx.play('stomp');
          this.spawnSparkles(e.x + e.w / 2, e.y + 2, 12, true);
          this.rumble = Math.min(1, this.rumble + 0.5);
          this.emitHud();
        } else {
          this.damage(1, false, e);
        }
      }
    },

    updateGoal: function () {
      var p = this.player;
      var g = { x: LEVEL.goal.x - 6, y: LEVEL.goal.base - 60, w: 16, h: 60 };
      if (overlap(p, g)) {
        var bonus = Math.max(0, Math.round((120 - this.stats.time) * 5));
        this.stats.score += 500 + bonus;
        Sfx.play('goal');
        this.emitHud();
        this.setState('complete');
      }
    },

    updateParticles: function (dt) {
      var list = this.particles;
      for (var i = list.length - 1; i >= 0; i--) {
        var q = list[i];
        q.life -= dt;
        if (q.life <= 0) { list.splice(i, 1); continue; }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.gravity) q.vy += q.gravity * dt;
      }
    },

    updateCamera: function (dt) {
      var p = this.player;
      var target = p.x + p.w / 2 - VIEW.w * 0.42 + p.facing * 14;
      target = clamp(target, 0, LEVEL.width - VIEW.w);
      this.cam.x += (target - this.cam.x) * Math.min(1, dt * 8);
      if (this.cam.x < 0) this.cam.x = 0;
    },

    /* ------------------------- daño y reaparicion ---------------------- */

    damage: function (n, fell, source) {
      if (this.debugGod) return;
      var p = this.player;
      if (p.invuln > 0 && !fell) return;
      this.stats.hearts -= n;
      Sfx.play('hurt');
      this.rumble = 1;
      this.emitHud();

      if (this.stats.hearts <= 0) {
        p.deathTimer = 0.9;
        p.vy = -230;
        this.setState('dying');
        Sfx.play('gameover');
        return;
      }
      if (fell) {
        this.respawn();
      } else {
        p.invuln = 1.4;
        p.vx = (source && p.x < source.x ? -1 : 1) * 170;
        p.vy = -200;
        p.onGround = false;
      }
    },

    respawn: function () {
      var p = this.player;
      p.x = clamp(p.spawn.x, 8, LEVEL.width - p.w - 8);
      p.y = p.spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.invuln = 1.6;
      p.onGround = true;
      this.state = 'playing';
      if (this.onState) this.onState('playing');
    },

    /* ---------------------------- particulas --------------------------- */

    spawnDust: function (x, y, n, dir) {
      for (var i = 0; i < n; i++) {
        this.particles.push({
          x: x, y: y, vx: (Math.random() - 0.5) * 60 + (dir || 0) * -60,
          vy: -Math.random() * 40, life: 0.3 + Math.random() * 0.25, max: 0.55,
          size: Math.random() < 0.5 ? 2 : 1, color: '#e6ecff', gravity: 220, type: 'dust',
        });
      }
    },

    spawnSparkles: function (x, y, n, star) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 40 + Math.random() * 90;
        this.particles.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
          life: 0.35 + Math.random() * 0.3, max: 0.65, size: star ? 3 : 2,
          color: star ? '#8ef2a8' : '#ffd166', gravity: 180, type: star ? 'star' : 'spark',
        });
      }
    },

    /* ------------------------------ bot demo --------------------------- */

    botInput: function () {
      var p = this.player;
      var feet = p.y + p.h;
      var enemyAhead = null;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        if (e.x > p.x && e.x - p.x < 52 && Math.abs((e.y + e.h) - feet) < 30) { enemyAhead = e; break; }
      }
      if (LEVEL.goal.x - (p.x + p.w) < 10) return { ax: 0, run: false, jump: false, hold: false };

      // mira 14 px por delante de los pies: si no hay suelo, hay que saltar
      var probe = p.x + p.w + 16;
      var noGround = !this.groundAt(probe, feet + 6) && !this.groundAt(p.x + p.w + 6, feet + 6);
      var jump = false;
      if (p.onGround && (noGround || enemyAhead || Math.random() < 0.002)) jump = true;
      return { ax: 1, run: true, jump: jump, hold: true };
    },

    /** ¿Hay suelo solido justo debajo de (x, y)? */
    groundAt: function (x, y) {
      for (var i = 0; i < LEVEL.solids.length; i++) {
        var s = LEVEL.solids[i];
        if (x >= s.x && x <= s.x + s.w && y >= s.y - 4 && y <= s.y + s.h + 2) return s;
      }
      return null;
    },

    /* ------------------------------ estados ---------------------------- */

    setState: function (next) {
      this.state = next;
      this.emitHud();
      if (this.onState) this.onState(next);
    },

    start: function () {
      this.reset();
      this.setState('playing');
      Sfx.unlock();
    },

    togglePause: function () {
      if (this.state === 'playing') this.setState('paused');
      else if (this.state === 'paused') this.setState('playing');
    },

    emitHud: function () {
      if (this.onHud) this.onHud(this.stats, this.state);
    },

    /* ============================== DIBUJO ============================== */

    /** Pre-renderiza fondo, terreno y plataformas (una sola vez) */
    bakeArt: function () {
      this.slimeSheet = root.Sprites.slimeSheet();
      this.coinArt = root.Sprites.coinFrames();
      this.bakeSky();
      this.bakeLayers();
      this.bakeGround();
    },

    bakeSky: function () {
      var c = document.createElement('canvas');
      c.width = VIEW.w; c.height = VIEW.h;
      var g = c.getContext('2d');
      var grad = g.createLinearGradient(0, 0, 0, VIEW.h);
      grad.addColorStop(0, '#20264d');
      grad.addColorStop(0.45, '#3c4b86');
      grad.addColorStop(0.8, '#7a86c4');
      grad.addColorStop(1, '#c3a6c9');
      g.fillStyle = grad;
      g.fillRect(0, 0, VIEW.w, VIEW.h);
      // sol: circulo de pixeles con halo
      var circle = function (cx, cy, r, color) {
        g.fillStyle = color;
        for (var y = -r; y <= r; y++) {
          var w = Math.floor(Math.sqrt(r * r - y * y));
          g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
        }
      };
      circle(304, 44, 30, 'rgba(255, 232, 170, 0.10)');
      circle(304, 44, 23, 'rgba(255, 232, 170, 0.16)');
      circle(304, 44, 17, '#ffe6a2');
      circle(304, 42, 12, '#fff3c8');
      this.skyCanvas = c;
    },

    bakeLayers: function () {
      function layer(draw) {
        var c = document.createElement('canvas');
        c.width = VIEW.w * 2;
        c.height = VIEW.h;
        var g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        draw(g);
        return c;
      }

      this.layerFar = layer(function (g) {
        // cordillera: cara iluminada a la derecha y nieve en las cumbres
        var rnd = mulberry32(99);
        g.fillStyle = '#2b3560';
        g.fillRect(0, 150, VIEW.w * 2, 26);
        for (var m = 0; m < 8; m++) {
          var cx = 20 + m * 96 + rnd() * 26;
          var hgt = 52 + rnd() * 40;
          var wid = 96 + rnd() * 54;
          for (var x = -wid / 2; x <= wid / 2; x++) {
            var t = 1 - Math.abs(x) / (wid / 2);
            var hh = hgt * Math.pow(t, 0.85);
            if (hh <= 0.5) continue;
            for (var y = 0; y < hh; y++) {
              var col;
              if (y < hgt * 0.2) col = '#cdd8f5';
              else if (y < hgt * 0.26) col = '#9aa8d4';
              else if (x > 2) col = '#39477c';
              else if (x > -6) col = '#2f3a6a';
              else col = '#28315a';
              g.fillStyle = col;
              g.fillRect(Math.round(cx + x), Math.round(150 - hh + y), 1, 1);
            }
          }
        }
      });

      this.layerMid = layer(function (g) {
        // colinas verdes con borde iluminado
        var rnd = mulberry32(7);
        for (var k = 0; k < 7; k++) {
          var cx = 30 + k * 112 + rnd() * 36;
          var hgt = 34 + rnd() * 30;
          var wid = 140 + rnd() * 90;
          for (var x = -wid / 2; x <= wid / 2; x++) {
            var t = 1 - Math.abs(x) / (wid / 2);
            var hh = Math.round(hgt * Math.pow(t, 0.62));
            if (hh <= 0) continue;
            g.fillStyle = x > 1 ? '#2f6149' : '#26523e';
            g.fillRect(Math.round(cx + x), 170 - hh, 1, hh);
            if (hh > 3) {
              g.fillStyle = '#3d7a58';
              g.fillRect(Math.round(cx + x), 170 - hh, 1, 2);
            }
          }
        }
        // arboles de silueta, con copa ancha y tronco
        for (var t = 0; t < 11; t++) {
          var tx = 16 + t * 72 + rnd() * 26;
          var th = 30 + rnd() * 18;
          g.fillStyle = '#1d3b30';
          for (var y = 0; y < th - 6; y++) {
            var prog = y / (th - 6);
            var wdt = Math.round(4 + prog * 16);
            g.fillRect(Math.round(tx - wdt / 2), 170 - th + y, wdt, 1);
          }
          g.fillStyle = '#17312a';
          g.fillRect(Math.round(tx - 1), 170 - 7, 3, 7);
        }
      });

      this.layerNear = layer(function (g) {
        // arbustos y valla de madera
        var rnd = mulberry32(21);
        g.fillStyle = '#4a3a2a';
        for (var f = 0; f < 30; f++) {
          var fx = 22 + f * 26;
          if (fx > VIEW.w * 2 - 16) break;
          g.fillRect(fx, 158, 2, 18);
          g.fillRect(fx, 161, 12, 2);
          g.fillRect(fx, 168, 12, 2);
        }
        for (var b = 0; b < 14; b++) {
          var bx = 12 + b * 54 + rnd() * 18;
          var bh = 9 + Math.round(rnd() * 5);
          var bw = 16 + Math.round(rnd() * 12);
          g.fillStyle = '#1f4b3c';
          g.fillRect(Math.round(bx), 176 - bh, bw, bh + 10);
          g.fillStyle = '#2a6350';
          g.fillRect(Math.round(bx + 1), 176 - bh, bw - 2, 3);
          g.fillStyle = '#173a2f';
          g.fillRect(Math.round(bx + 2), 176 - 3, bw - 4, 3);
        }
      });
    },

    bakeGround: function () {
      var c = document.createElement('canvas');
      c.width = LEVEL.width;
      c.height = VIEW.h;
      var g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      var rnd = mulberry32(4242);

      LEVEL.solids.forEach(function (s) {
        if (s.type === 'ground') {
          // hierba
          g.fillStyle = '#6fc35c';
          g.fillRect(s.x, s.y, s.w, 3);
          g.fillStyle = '#4f9c46';
          g.fillRect(s.x, s.y + 3, s.w, 3);
          g.fillStyle = '#3c7a3a';
          g.fillRect(s.x, s.y + 6, s.w, 2);
          // tierra
          g.fillStyle = '#6b4a2f';
          g.fillRect(s.x, s.y + 8, s.w, s.h - 8);
          g.fillStyle = '#5a3d26';
          for (var i = 0; i < s.w * 0.6; i++) {
            var px = s.x + Math.floor(rnd() * s.w);
            var py = s.y + 10 + Math.floor(rnd() * (s.h - 12));
            g.fillRect(px, py, 2, 2);
          }
          g.fillStyle = '#7d5838';
          for (var j = 0; j < s.w * 0.25; j++) {
            var qx = s.x + Math.floor(rnd() * s.w);
            var qy = s.y + 9 + Math.floor(rnd() * (s.h - 11));
            g.fillRect(qx, qy, 1, 1);
          }
          // borde
          g.fillStyle = '#2a2016';
          g.fillRect(s.x, s.y, 1, s.h);
          g.fillRect(s.x + s.w - 1, s.y, 1, s.h);
        } else {
          // plataformas de madera
          g.fillStyle = '#3a2a1c';
          g.fillRect(s.x, s.y, s.w, s.h);
          g.fillStyle = '#a9713f';
          g.fillRect(s.x + 1, s.y + 1, s.w - 2, 3);
          g.fillStyle = '#8a5730';
          g.fillRect(s.x + 1, s.y + 4, s.w - 2, 3);
          g.fillStyle = '#6f4526';
          for (var t = 6; t < s.w; t += 10) g.fillRect(s.x + t, s.y + 1, 1, s.h - 2);
          g.fillStyle = '#d8a463';
          g.fillRect(s.x + 1, s.y + 1, s.w - 2, 1);
        }
      });

      this.groundCanvas = c;
    },

    /* ------------------------------ render ----------------------------- */

    render: function () {
      var ctx = this.ctx;
      var cam = this.cam;
      var shake = this.rumble > 0.02 ? this.rumble : 0;
      var sx = shake ? Math.round((Math.random() - 0.5) * 3 * shake) : 0;
      var sy = shake ? Math.round((Math.random() - 0.5) * 3 * shake) : 0;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(sx, sy);

      ctx.drawImage(this.skyCanvas, 0, 0);

      var par = this.options.parallax ? 1 : 0;
      this.drawLayer(ctx, this.layerFar, cam.x * 0.12 * par);
      this.drawClouds(ctx, cam.x * 0.06 * par);
      this.drawLayer(ctx, this.layerMid, cam.x * 0.34 * par);
      this.drawLayer(ctx, this.layerNear, cam.x * 0.62 * par);

      // mundo
      var camX = Math.round(cam.x);
      ctx.drawImage(this.groundCanvas, camX, 0, VIEW.w, VIEW.h, 0, 0, VIEW.w, VIEW.h);

      this.drawGoal(ctx, camX);
      this.drawCoins(ctx, camX);
      this.drawEnemies(ctx, camX);
      this.drawParticles(ctx, camX);
      this.drawPlayer(ctx, camX);

      if (this.options.hitboxes) this.drawDebug(ctx, camX);

      ctx.restore();
    },

    drawLayer: function (ctx, canvas, offset) {
      var tw = canvas.width;
      var x = -((offset % tw) + tw) % tw;
      ctx.drawImage(canvas, Math.round(x), 0);
      ctx.drawImage(canvas, Math.round(x + tw), 0);
    },

    drawClouds: function (ctx, offset) {
      var tw = 480;
      var x0 = -((offset % tw) + tw) % tw + 40;
      for (var i = 0; i < 3; i++) {
        var cx = x0 + i * tw / 2;
        if (cx < -140 || cx > VIEW.w + 140) continue;
        var cy = 26 + i * 22;
        var cw = 46 + i * 8;
        ctx.fillStyle = 'rgba(226, 234, 255, 0.72)';
        ctx.fillRect(Math.round(cx), Math.round(cy), cw, 5);
        ctx.fillRect(Math.round(cx + 6), Math.round(cy - 4), cw - 14, 4);
        ctx.fillRect(Math.round(cx + 14), Math.round(cy - 8), cw - 30, 4);
        ctx.fillStyle = 'rgba(180, 196, 240, 0.5)';
        ctx.fillRect(Math.round(cx + 2), Math.round(cy + 5), cw - 6, 2);
      }
    },

    drawGoal: function (ctx, camX) {
      var g = LEVEL.goal;
      var x = Math.round(g.x - camX);
      var top = g.base - 64;
      // poste
      ctx.fillStyle = '#2a2016';
      ctx.fillRect(x - 1, top - 1, 4, 66);
      ctx.fillStyle = '#e8e2d0';
      ctx.fillRect(x, top, 2, 64);
      // bandera ondeando
      var wav = Math.sin(this.animClock * 3) * 1.5;
      ctx.fillStyle = '#e0483c';
      ctx.fillRect(x + 2, top + 2, 22, 14);
      ctx.fillRect(x + 24, top + 4 + Math.round(wav), 6, 10);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x + 6, top + 6, 8, 6);
      // base
      ctx.fillStyle = '#5a3d26';
      ctx.fillRect(x - 5, g.base - 4, 14, 4);
    },

    drawCoins: function (ctx, camX) {
      var art = this.coinArt;
      for (var i = 0; i < this.coins.length; i++) {
        var c = this.coins[i];
        if (c.taken) continue;
        var x = Math.round(c.x - camX);
        if (x < -12 || x > VIEW.w + 12) continue;
        var bob = Math.round(Math.sin(c.t * 4) * 1.5);
        var fr = art.frames[Math.floor(c.t * 8) % art.frames.length];
        ctx.drawImage(art.source, fr.x, fr.y, fr.w, fr.h, x, Math.round(c.y + bob), fr.w, fr.h);
      }
    },

    drawEnemies: function (ctx, camX) {
      var art = this.slimeSheet;
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        var x = Math.round(e.x - camX);
        if (x < -20 || x > VIEW.w + 20) continue;
        if (!e.alive && e.squash <= 0) continue;
        var row = e.alive ? 0 : 1;
        var col = e.alive ? e.frame : 0;
        var rect = { x: col * art.fw, y: row * art.fh, w: art.fw, h: art.fh };
        var drawY = e.alive ? e.y : e.base - 5;
        if (this.options.shadows) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x + 1, e.base - 1, e.w - 2, 2);
        }
        ctx.drawImage(art.source, rect.x, rect.y, rect.w, rect.h, x, Math.round(drawY), rect.w, rect.h);
      }
    },

    drawParticles: function (ctx, camX) {
      for (var i = 0; i < this.particles.length; i++) {
        var q = this.particles[i];
        var x = Math.round(q.x - camX);
        var y = Math.round(q.y);
        ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
        ctx.fillStyle = q.color;
        ctx.fillRect(x, y, q.size, q.size);
        if (q.type === 'star') {
          ctx.fillRect(x - 1, y + 1, q.size + 2, 1);
          ctx.fillRect(x + 1, y - 1, 1, q.size + 2);
        }
        ctx.globalAlpha = 1;
      }
    },

    drawPlayer: function (ctx, camX) {
      var p = this.player;
      if (this.state === 'dead') return;
      var sheet = this.sheet;
      var rect = this.frameRect(p.anim, p.frame);
      var scale = sheet.scale || 1;
      var cx = Math.round(p.x + p.w / 2 - camX);
      var feet = Math.round(p.y + p.h);
      var w = Math.round(rect.w * scale);
      var h = Math.round(rect.h * scale);

      if (this.options.shadows) {
        var groundY = this.groundAt(p.x + p.w / 2, p.y + p.h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        var sw = Math.max(8, Math.round(w * 0.7));
        ctx.fillRect(cx - sw / 2, (groundY ? groundY.y : p.y + p.h) - 1, sw, 2);
      }

      // parpadeo al ser invulnerable
      if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.42;

      var src = p.facing < 0 ? sheet.flipped : sheet.source;
      var sx = p.facing < 0 ? src.width - rect.x - rect.w : rect.x;
      ctx.drawImage(src, sx, rect.y, rect.w, rect.h,
        cx - Math.round(w / 2), feet - h, w, h);
      ctx.globalAlpha = 1;

      if (this.options.hitboxes) {
        ctx.strokeStyle = '#ff5d5d';
        ctx.strokeRect(p.x - camX + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
      }
    },

    drawDebug: function (ctx, camX) {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.85)';
      ctx.lineWidth = 1;
      LEVEL.solids.forEach(function (s) {
        ctx.strokeRect(s.x - camX + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      });
      ctx.strokeStyle = 'rgba(140, 240, 170, 0.9)';
      this.coins.forEach(function (c) {
        if (c.taken) return;
        ctx.strokeRect(c.x - camX + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
      });
      ctx.strokeStyle = 'rgba(255, 120, 120, 0.9)';
      this.enemies.forEach(function (e) {
        if (!e.alive) return;
        ctx.strokeRect(e.x - camX + 0.5, e.y + 0.5, e.w - 1, e.h - 1);
      });
    },

    /* ------------------------------ bucle ------------------------------ */

    loop: function (ts) {
      var self = this;
      this.rafId = root.requestAnimationFrame(function (t) { self.loop(t); });
      if (!this.lastTime) this.lastTime = ts;
      var dt = Math.min(0.05, (ts - this.lastTime) / 1000);
      this.lastTime = ts;

      this.animClock += dt;
      if (this.state === 'playing' || this.state === 'dying') {
        this.acc += dt * this.options.speed;
        var guard = 0;
        while (this.acc >= STEP && guard++ < 6) {
          this.update(STEP);
          this.acc -= STEP;
        }
      } else {
        this.updateParticles(dt);
      }
      this.render();
      if (this.onFrame) this.onFrame(dt);
    },

    startLoop: function () {
      var self = this;
      if (this.rafId) return;
      this.lastTime = 0;
      this.rafId = root.requestAnimationFrame(function (t) { self.loop(t); });
    },

    stopLoop: function () {
      if (this.rafId && root.cancelAnimationFrame) root.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    },
  };

  root.Game = Game;
})(typeof window !== 'undefined' ? window : this);
