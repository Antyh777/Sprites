/* ==========================================================================
   audio.js — efectos de sonido con WebAudio (sin archivos externos)
   ========================================================================== */
(function (root) {
  'use strict';

  var Sfx = {
    enabled: true,
    ctx: null,
    master: null,

    unlock: function () {
      if (!this.ctx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    /** Tono simple con envolvente */
    tone: function (opts) {
      if (!this.enabled) return;
      var ctx = this.unlock();
      if (!ctx) return;
      var t0 = ctx.currentTime + (opts.delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = opts.type || 'square';
      osc.frequency.setValueAtTime(opts.from, t0);
      if (opts.to && opts.to !== opts.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + (opts.dur || 0.12));
      }
      var vol = (opts.vol == null ? 0.5 : opts.vol);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.12));
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + (opts.dur || 0.12) + 0.02);
    },

    /** Ruido corto (aterrizajes, golpes) */
    noise: function (opts) {
      if (!this.enabled) return;
      var ctx = this.unlock();
      if (!ctx) return;
      var dur = opts.dur || 0.12;
      var len = Math.floor(ctx.sampleRate * dur);
      var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.cutoff || 900;
      var gain = ctx.createGain();
      gain.gain.value = opts.vol == null ? 0.5 : opts.vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
    },

    play: function (name) {
      switch (name) {
        case 'jump':
          this.tone({ from: 380, to: 720, dur: 0.13, type: 'square', vol: 0.35 });
          break;
        case 'land':
          this.noise({ dur: 0.09, cutoff: 700, vol: 0.35 });
          break;
        case 'coin':
          this.tone({ from: 990, to: 990, dur: 0.07, type: 'square', vol: 0.3 });
          this.tone({ from: 1480, to: 1480, dur: 0.12, type: 'square', vol: 0.28, delay: 0.07 });
          break;
        case 'stomp':
          this.noise({ dur: 0.14, cutoff: 1200, vol: 0.5 });
          this.tone({ from: 220, to: 90, dur: 0.16, type: 'sawtooth', vol: 0.3 });
          break;
        case 'hurt':
          this.tone({ from: 420, to: 110, dur: 0.34, type: 'sawtooth', vol: 0.4 });
          break;
        case 'goal':
          [523, 659, 784, 1047].forEach(function (f, i) {
            Sfx.tone({ from: f, to: f, dur: 0.16, type: 'square', vol: 0.32, delay: i * 0.12 });
          });
          break;
        case 'gameover':
          [392, 330, 262, 196].forEach(function (f, i) {
            Sfx.tone({ from: f, to: f * 0.98, dur: 0.24, type: 'triangle', vol: 0.35, delay: i * 0.16 });
          });
          break;
      }
    },

    toggle: function () {
      this.enabled = !this.enabled;
      if (this.enabled) this.unlock();
      return this.enabled;
    },
  };

  root.Sfx = Sfx;
})(typeof window !== 'undefined' ? window : this);
