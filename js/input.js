'use strict';
// ---------- Keyboard, mouse & touch input ----------
(function () {
  class Input {
    constructor(canvas, hooks) {
      this.cv = canvas; this.hooks = hooks; // {held(h), act(a), target(x,y), pan(dx,dy), zoom(f), menu(), pause(), hover(x,y)}
      this.held = { l: 0, r: 0, u: 0, d: 0 };
      this.keys = new Set();
      this.btn = { l: 0, r: 0, u: 0, d: 0 };
      this.enabled = true;
      this.bind();
    }
    emitHeld() {
      const h = {
        l: this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.btn.l ? 1 : 0,
        r: this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.btn.r ? 1 : 0,
        u: this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.btn.u ? 1 : 0,
        d: this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.btn.d ? 1 : 0,
      };
      if (h.l !== this.held.l || h.r !== this.held.r || h.u !== this.held.u || h.d !== this.held.d) { this.held = h; this.hooks.held(h); }
    }
    bind() {
      const H = this.hooks;
      window.addEventListener('keydown', (e) => {
        if (!this.enabled) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
        const c = e.code;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Backspace', 'Tab'].includes(c)) e.preventDefault();
        if (e.repeat) return;
        B.Sound.unlock();
        if (c === 'Space') H.act({ a: 'fireDown' });
        else if (c === 'Enter') H.act({ a: 'jump' });
        else if (c === 'Backspace') H.act({ a: 'backflip' });
        else if (/^Digit[1-5]$/.test(c)) H.act({ a: 'fuse', v: +c.slice(5) });
        else if (c === 'KeyQ' || c === 'Tab') H.menu();
        else if (c === 'Escape') H.pause();
        else if (c === 'KeyM') H.mute && H.mute();
        else if (c === 'Equal' || c === 'NumpadAdd') H.zoom(1.15);
        else if (c === 'Minus' || c === 'NumpadSubtract') H.zoom(1 / 1.15);
        this.keys.add(c); this.emitHeld();
      });
      window.addEventListener('keyup', (e) => {
        const c = e.code;
        if (c === 'Space') H.act({ a: 'fireUp' });
        this.keys.delete(c); this.emitHeld();
      });
      window.addEventListener('blur', () => { if (this.keys.has('Space')) H.act({ a: 'fireUp' }); this.keys.clear(); this.btn = { l: 0, r: 0, u: 0, d: 0 }; this.emitHeld(); });

      // mouse
      const cv = this.cv;
      let down = null;
      cv.addEventListener('contextmenu', (e) => { e.preventDefault(); H.menu(); });
      cv.addEventListener('mousedown', (e) => { if (e.button !== 0) return; B.Sound.unlock(); down = { x: e.clientX, y: e.clientY, moved: 0 }; });
      window.addEventListener('mousemove', (e) => {
        H.hover(e.clientX, e.clientY);
        if (!down) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        if (down.moved > 6) H.pan(dx, dy);
        down.x = e.clientX; down.y = e.clientY;
      });
      window.addEventListener('mouseup', (e) => {
        if (down && down.moved <= 6 && e.target === cv) H.target(e.clientX, e.clientY);
        down = null;
      });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); H.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

      // touch on canvas: drag pans, pinch zooms, tap targets
      const touches = new Map(); let pinch = null, tap = null;
      cv.addEventListener('touchstart', (e) => {
        e.preventDefault(); B.Sound.unlock(); document.body.classList.add('touch');
        for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (touches.size === 1) { const t = e.changedTouches[0]; tap = { x: t.clientX, y: t.clientY, moved: 0, t: performance.now() }; }
        else { tap = null; const p = [...touches.values()]; pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
      }, { passive: false });
      cv.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (touches.size === 1) {
          const t = e.changedTouches[0], o = touches.get(t.identifier); if (!o) return;
          const dx = t.clientX - o.x, dy = t.clientY - o.y;
          if (tap) tap.moved += Math.abs(dx) + Math.abs(dy);
          if (!tap || tap.moved > 10) H.pan(dx, dy);
          H.hover(t.clientX, t.clientY);
        }
        for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (touches.size >= 2 && pinch) {
          const p = [...touches.values()]; const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
          H.zoom(d / pinch); pinch = d;
        }
      }, { passive: false });
      const end = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (tap && touches.size === 1 && tap.moved <= 10 && performance.now() - tap.t < 500) H.target(t.clientX, t.clientY);
          touches.delete(t.identifier);
        }
        if (touches.size < 2) pinch = null;
        if (!touches.size) tap = null;
      };
      cv.addEventListener('touchend', end, { passive: false });
      cv.addEventListener('touchcancel', end, { passive: false });

      // on-screen buttons
      document.querySelectorAll('[data-hold]').forEach((el) => {
        const k = el.dataset.hold;
        const on = (e) => { e.preventDefault(); B.Sound.unlock(); this.btn[k] = 1; el.classList.add('on'); this.emitHeld(); };
        const off = (e) => { e.preventDefault(); this.btn[k] = 0; el.classList.remove('on'); this.emitHeld(); };
        el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false }); el.addEventListener('touchcancel', off, { passive: false });
        el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
      });
      document.querySelectorAll('[data-act]').forEach((el) => {
        const a = el.dataset.act;
        const on = (e) => { e.preventDefault(); B.Sound.unlock(); el.classList.add('on'); H.act({ a: a === 'fire' ? 'fireDown' : a }); };
        const off = (e) => { e.preventDefault(); if (!el.classList.contains('on')) return; el.classList.remove('on'); if (a === 'fire') H.act({ a: 'fireUp' }); };
        el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false }); el.addEventListener('touchcancel', off, { passive: false });
        el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
      });
    }
  }
  B.Input = Input;
})();
