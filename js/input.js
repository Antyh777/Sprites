/* ==========================================================================
   input.js — teclado + controles tactiles
   ==========================================================================
   Expone Input.state ({left,right,jump,run}) y temporizadores de ayuda:
     jumpBuffer : segundos restantes desde la ultima pulsacion de salto
     coyote     : lo gestiona el juego
   ========================================================================== */
(function (root) {
  'use strict';

  var KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', z: 'jump', Z: 'jump',
    Shift: 'run', x: 'run', X: 'run',
  };

  var Input = {
    state: { left: false, right: false, jump: false, run: false },
    jumpBuffer: 0,
    jumpHeld: false,
    holdOverride: null,   // lo usa el piloto automatico de demo
    pausedToggled: false,
    onAction: null, // callback(nombre) para teclas de interfaz

    init: function (opts) {
      var self = this;
      var bufferTime = (opts && opts.buffer) || 0.12;

      function setKey(name, down) {
        var s = self.state;
        if (!(name in s)) return;
        if (name === 'jump' && down && !s.jump) self.jumpBuffer = bufferTime;
        s[name] = down;
      }

      window.addEventListener('keydown', function (e) {
        var name = KEYMAP[e.key];
        if (name) {
          if (e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault();
          setKey(name, true);
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var k = e.key.toLowerCase();
        if (['r', 'p', 'm', 'h', 'o', 's', 'f', 'g', 'arrowdown'].indexOf(k) >= 0) e.preventDefault();
        if (self.onAction) self.onAction(k, e);
      });

      window.addEventListener('keyup', function (e) {
        var name = KEYMAP[e.key];
        if (name) {
          if (e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault();
          setKey(name, false);
        }
      });

      // perder el foco deja las teclas "pegadas": las soltamos
      window.addEventListener('blur', function () {
        Object.keys(self.state).forEach(function (k) { self.state[k] = false; });
      });

      this.bindTouch();
      return this;
    },

    bindTouch: function () {
      var self = this;
      var buttons = document.querySelectorAll('[data-key]');
      Array.prototype.forEach.call(buttons, function (btn) {
        var key = btn.getAttribute('data-key');
        function press(on, e) {
          if (e && e.cancelable) e.preventDefault();
          if (key === 'jump' && on && !self.state.jump) self.jumpBuffer = 0.12;
          self.state[key] = on;
          self.holdOverride = null;
          btn.classList.toggle('on', on);
        }
        btn.addEventListener('pointerdown', function (e) { btn.setPointerCapture(e.pointerId); press(true, e); });
        btn.addEventListener('pointerup', function (e) { press(false, e); });
        btn.addEventListener('pointercancel', function (e) { press(false, e); });
        btn.addEventListener('pointerleave', function (e) { if (self.state[key]) press(false, e); });
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      });
    },

    /** Decae el buffer de salto y actualiza si el boton sigue pulsado */
    update: function (dt) {
      if (this.jumpBuffer > 0) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.jumpHeld = this.holdOverride == null ? this.state.jump : this.holdOverride;
    },

    consumeJump: function () {
      if (this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        return true;
      }
      return false;
    },

    /** Direccion -1 / 0 / 1 */
    axisX: function () {
      return (this.state.right ? 1 : 0) - (this.state.left ? 1 : 0);
    },

    /** Programa una pulsacion de salto sin mantenerla (buffer de salto) */
    queueJump: function () {
      this.jumpBuffer = 0.12;
    },

    /** Fuerza si el salto se considera mantenido (piloto automatico) */
    setHold: function (v) {
      this.holdOverride = v;
    },

    /** Simula el estado de teclas (utilidades de test) */
    set: function (name, on) {
      if (name === 'jump' && on && !this.state.jump) this.jumpBuffer = 0.12;
      this.state[name] = on;
    },
  };

  root.Input = Input;
})(typeof window !== 'undefined' ? window : this);
