'use strict';
// ---------- Synthesised sound effects (no audio files needed) ----------
(function () {
  let ctx = null, master = null, noiseBuf = null;
  const S = B.Sound = { muted: false, vol: 0.55 };
  try { S.muted = localStorage.getItem('beans.muted') === '1'; } catch (e) { }

  S.unlock = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = S.muted ? 0 : S.vol; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  S.toggle = function () {
    S.muted = !S.muted;
    try { localStorage.setItem('beans.muted', S.muted ? '1' : '0'); } catch (e) { }
    if (master) master.gain.value = S.muted ? 0 : S.vol;
    return S.muted;
  };

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function noise(t, dur, freq, q, peak, type) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.1);
    return f;
  }
  function tone(t, type, f0, f1, dur, peak) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); env(g, t, 0.005, peak, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  let lastBoom = 0;
  S.play = function (n, v) {
    if (!ctx || S.muted) return;
    const t = ctx.currentTime;
    switch (n) {
      case 'boom': {
        if (t - lastBoom < 0.03) return; lastBoom = t;
        const r = v || 50, big = B.clamp(r / 60, 0.4, 2);
        const f = noise(t, 0.5 + big * 0.5, 900 / big, 0.7, 0.9);
        f.frequency.exponentialRampToValueAtTime(80, t + 0.6 + big * 0.4);
        tone(t, 'sine', 120 / big, 30, 0.4 + big * 0.3, 0.8);
        break;
      }
      case 'launch': noise(t, 0.35, 1800, 0.6, 0.3, 'bandpass'); tone(t, 'sawtooth', 300, 120, 0.25, 0.08); break;
      case 'throw': noise(t, 0.15, 2500, 1, 0.15, 'bandpass'); break;
      case 'shotgun': noise(t, 0.25, 2500, 0.5, 0.7); tone(t, 'square', 180, 60, 0.12, 0.2); break;
      case 'jump': tone(t, 'sine', 300 * (v || 1), 700 * (v || 1), 0.12, 0.2); break;
      case 'bounce': tone(t, 'triangle', 320, 180, 0.08, 0.15); break;
      case 'splash': { const f = noise(t, 0.6, 3000, 0.5, 0.4, 'highpass'); f.frequency.exponentialRampToValueAtTime(600, t + 0.6); break; }
      case 'ouch': { const p = v || 1; tone(t, 'triangle', 700 * p, 380 * p, 0.18, 0.18); tone(t + 0.12, 'triangle', 520 * p, 300 * p, 0.14, 0.12); break; }
      case 'select': tone(t, 'square', 880, 880, 0.04, 0.06); break;
      case 'charge': tone(t, 'sine', 200, 600, 1.0, 0.04); break;
      case 'turn': tone(t, 'triangle', 523, 523, 0.12, 0.12); tone(t + 0.1, 'triangle', 784, 784, 0.18, 0.12); break;
      case 'tick': tone(t, 'square', 1200, 1200, 0.05, 0.08); break;
      case 'beep': tone(t, 'square', 1500, 1500, 0.08, 0.1); tone(t + 0.15, 'square', 1500, 1500, 0.08, 0.1); break;
      case 'punch': noise(t, 0.2, 1200, 1, 0.5); tone(t, 'sawtooth', 200, 500, 0.3, 0.12); break;
      case 'bat': noise(t, 0.12, 3000, 2, 0.6, 'bandpass'); tone(t, 'square', 600, 200, 0.1, 0.2); break;
      case 'whiff': noise(t, 0.2, 1500, 3, 0.15, 'bandpass'); break;
      case 'rope': noise(t, 0.12, 4000, 2, 0.2, 'bandpass'); tone(t, 'sine', 1200, 400, 0.1, 0.06); break;
      case 'thunk': tone(t, 'square', 160, 80, 0.06, 0.2); break;
      case 'jet': noise(t, 0.4, 600, 1, 0.25); break;
      case 'chute': noise(t, 0.3, 1000, 2, 0.2, 'bandpass'); break;
      case 'teleport': tone(t, 'sine', 200, 2000, 0.4, 0.15); tone(t + 0.05, 'triangle', 300, 2600, 0.35, 0.08); break;
      case 'girder': tone(t, 'square', 120, 90, 0.15, 0.25); noise(t, 0.1, 3000, 4, 0.2, 'bandpass'); break;
      case 'goat': case 'bleat': {
        const o = tone(t, 'sawtooth', 520, 470, 0.45, 0.12);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 40;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.5);
        break;
      }
      case 'plane': { const f = noise(t, 2.5, 400, 1, 0.25); f.frequency.linearRampToValueAtTime(900, t + 1.2); f.frequency.linearRampToValueAtTime(300, t + 2.5); break; }
      case 'whistle': tone(t, 'sine', 2200, 500, 1.6, 0.08); break;
      case 'fuse': noise(t, 0.6, 5000, 3, 0.1, 'highpass'); break;
      case 'crate': [660, 880, 1320].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, 0.12, 0.12)); break;
      case 'sd': [300, 250, 200].forEach((f, i) => tone(t + i * 0.25, 'sawtooth', f, f * 0.95, 0.3, 0.12)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(t + i * 0.13, 'triangle', f, f, 0.2, 0.15)); break;
    }
  };
})();
