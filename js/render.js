'use strict';
// ---------- Renderer: draws a view (from local sim or network snapshot) ----------
(function () {
  const FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  const COMIC = ['POW!', 'BOOM!', 'KABLAM!', 'BIFF!', 'WALLOP!', 'KERPOW!', 'BLAM!', 'BOOF!'];

  class Renderer {
    constructor(canvas, terrain, meta, opts) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.T = terrain; this.meta = meta; this.smooth = !!(opts && opts.smooth);
      this.myId = (opts && opts.myId) || 'host';
      this.cam = { x: B.WORLD_W / 2, y: 600, z: 1, tz: 1, manualT: 0 };
      this.userZoom = 1;
      this.parts = []; this.floats = []; this.shake = 0; this.flash = 0;
      this.banner = null; this.disp = new Map();
      this.time = 0; this.view = null;
      this.clouds = [];
      const r = B.rng(meta.seed || 1);
      for (let i = 0; i < 14; i++) this.clouds.push({ x: r() * 3600 - 500, y: r() * 380 - 250, s: 0.6 + r() * 1.2, d: 0.2 + r() * 0.5 });
      this.hills = [];
      for (let l = 0; l < 2; l++) { const n = B.noise1(r, 10 + l * 6); this.hills.push(n); }
      this.stars = [];
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.dpr = dpr; this.sw = w; this.sh = h;
      this.baseZ = B.clamp(Math.min(h / 560, w / (h > w ? 440 : 820)), 0.5, 1.8);
    }

    setView(v) {
      this.view = v;
      if (!this.smooth) return;
      for (const b of v.bs) {
        const d = this.disp.get('b' + b[0]);
        if (!d || Math.hypot(d.x - b[1], d.y - b[2]) > 80) this.disp.set('b' + b[0], { x: b[1], y: b[2] });
      }
      for (const o of v.os) {
        const d = this.disp.get('o' + o[0]);
        if (!d || Math.hypot(d.x - o[2], d.y - o[3]) > 80) this.disp.set('o' + o[0], { x: o[2], y: o[3] });
      }
    }
    pos(key, x, y, dt) {
      if (!this.smooth) return [x, y];
      const d = this.disp.get(key);
      if (!d) return [x, y];
      const k = Math.min(1, dt * 22);
      d.x += (x - d.x) * k; d.y += (y - d.y) * k;
      return [d.x, d.y];
    }

    screenToWorld(sx, sy) {
      const z = this.cam.z;
      return [(sx - this.sw / 2) / z + this.cam.x, (sy - this.sh / 2) / z + this.cam.y];
    }
    pan(dx, dy) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.cam.manualT = 2.5; }
    zoomBy(f) { this.userZoom = B.clamp(this.userZoom * f, 0.45, 2.4); }

    // ---------- cosmetic events ----------
    event(e) {
      const th = this.T.theme;
      switch (e.t) {
        case 'boom': {
          const r = e.r;
          this.shake = Math.min(14, this.shake + r / 7);
          this.parts.push({ k: 'ring', x: e.x, y: e.y, r: r * 0.3, max: r * 1.3, life: 18, m: 18 });
          this.parts.push({ k: 'flash', x: e.x, y: e.y, r: r * 1.1, life: 7, m: 7 });
          const n = Math.min(40, 8 + r / 2);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * B.TAU, s = Math.random() * r / 10;
            this.parts.push({ k: 'fire', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.5, life: 20 + Math.random() * 20, m: 40, s: 4 + Math.random() * r / 6 });
          }
          for (let i = 0; i < n * 0.6; i++) {
            const a = Math.random() * B.TAU, s = Math.random() * r / 25;
            this.parts.push({ k: 'smoke', x: e.x + Math.cos(a) * r * 0.3, y: e.y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6, life: 50 + Math.random() * 50, m: 100, s: 6 + Math.random() * r / 4 });
          }
          const sc = `rgb(${th.soil[0]},${th.soil[1]},${th.soil[2]})`;
          for (let i = 0; i < n * 0.7; i++) {
            const a = -Math.random() * Math.PI, s = 2 + Math.random() * r / 9;
            this.parts.push({ k: 'dirt', x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 60 + Math.random() * 40, m: 100, s: 1.5 + Math.random() * 3, c: Math.random() < 0.3 ? th.char : sc });
          }
          if (r >= 45 && Math.random() < 0.7) this.floats.push({ x: e.x, y: e.y - r * 0.4, s: B.pick(COMIC), c: '#ffd23f', life: 50, m: 50, comic: true, sz: 14 + r / 6, rot: (Math.random() - 0.5) * 0.5 });
          break;
        }
        case 'dmg': this.floats.push({ x: e.x, y: e.y - 30, s: '-' + e.n, c: this.beanColor(e.id), life: 90, m: 90, box: true }); break;
        case 'heal': { const b = this.beanById(e.id); if (b) this.floats.push({ x: b[1], y: b[2] - 30, s: '+' + e.n, c: '#5bd65b', life: 90, m: 90, box: true }); break; }
        case 'txt': this.floats.push({ x: e.x, y: e.y, s: e.s, c: e.c, life: e.big ? 80 : 100, m: e.big ? 80 : 100, bubble: !e.big, comic: e.big, sz: e.big ? 18 : 12 }); break;
        case 'splash': {
          const n = e.big ? 30 : 14;
          for (let i = 0; i < n; i++) this.parts.push({ k: 'drop', x: e.x + (Math.random() - 0.5) * 16, y: e.y, vx: (Math.random() - 0.5) * 4, vy: -2 - Math.random() * (e.big ? 7 : 4), life: 60, m: 60, s: 1.5 + Math.random() * 2.5 });
          break;
        }
        case 'trail':
          if (e.c === 'spark') this.parts.push({ k: 'spark', x: e.x, y: e.y, vx: 0, vy: 0, life: 20, m: 20, s: 3 });
          else this.parts.push({ k: 'smoke', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 0.3, vy: -0.3, life: 30, m: 30, s: 3 + Math.random() * 3, light: true });
          break;
        case 'shot': this.parts.push({ k: 'line', x: e.x0, y: e.y0, x1: e.x1, y1: e.y1, life: 8, m: 8 }); break;
        case 'tele':
          for (const [x, y] of [[e.x0, e.y0], [e.x1, e.y1]]) for (let i = 0; i < 24; i++) { const a = Math.random() * B.TAU; this.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 30, m: 30, s: 2.5 }); }
          break;
        case 'poof': for (let i = 0; i < 12; i++) { const a = Math.random() * B.TAU; this.parts.push({ k: 'smoke', x: e.x, y: e.y, vx: Math.cos(a), vy: Math.sin(a) - 0.5, life: 40, m: 40, s: 6, light: true }); } break;
        case 'fire': for (let i = 0; i < 30; i++) this.parts.push({ k: 'fire', x: e.x + (Math.random() - 0.5) * 40, y: e.y, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 2, life: 40 + Math.random() * 60, m: 100, s: 4 + Math.random() * 5 }); break;
        case 'swing': for (let i = 0; i < 6; i++) this.parts.push({ k: 'spark', x: e.x, y: e.y - 4, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, life: 14, m: 14, s: 2 }); break;
        case 'punch': this.punchId = e.id; this.punchT = 30; break;
        case 'flash': this.flash = 1; break;
        case 'banner': this.banner = { s: e.s, sub: e.sub || '', life: 180, m: 180, c: e.c || '#fff' }; break;
        case 'turn': {
          const t = this.meta.teams[e.team], bn = this.meta.beans[e.bean];
          const mine = this.isMine(t);
          this.banner = { s: bn ? bn.name : '', sub: t.name + (mine ? ' — your turn!' : t.ctrl === 'cpu' ? ' (CPU)' : ''), life: 150, m: 150, c: B.beanType(t.type).team };
          this.cam.manualT = 0;
          break;
        }
        case 'over': {
          if (e.w >= 0) { const t = this.meta.teams[e.w]; this.banner = { s: t.name + ' win!', sub: 'Full of beans!', life: 99999, m: 99999, c: B.beanType(t.type).team }; }
          else this.banner = { s: 'Draw!', sub: 'Everybody got canned', life: 99999, m: 99999, c: '#fff' };
          for (let i = 0; i < 160; i++) this.parts.push({ k: 'confetti', x: this.cam.x + (Math.random() - 0.5) * this.sw / this.cam.z, y: this.cam.y - this.sh / this.cam.z / 2 - Math.random() * 300, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, life: 400, m: 400, s: 3 + Math.random() * 3, c: B.pick(['#ff5a4e', '#ffd23f', '#5bd65b', '#4fb8ff', '#ff7af0']), r: Math.random() * 6 });
          break;
        }
      }
    }

    isMine(team) { return team && ((team.ctrl === 'human' && this.myId === 'host') || (team.ctrl === 'remote' && team.owner === this.myId)); }
    beanById(id) { return this.view && this.view.bs.find(b => b[0] === id); }
    beanColor(id) { const m = this.meta.beans[id]; return m ? B.beanType(this.meta.teams[m.team].type).team : '#fff'; }

    // ---------- frame ----------
    frame(dt) {
      const v = this.view; if (!v) return;
      this.time += dt * 60;
      const ctx = this.ctx, th = this.T.theme;
      // camera
      const z = this.baseZ * this.userZoom;
      this.cam.z += (z - this.cam.z) * Math.min(1, dt * 8);
      if (this.cam.manualT > 0) this.cam.manualT -= dt;
      else if (v.fc) {
        const k = Math.min(1, dt * 4);
        this.cam.x += (v.fc[0] - this.cam.x) * k; this.cam.y += (v.fc[1] - 40 - this.cam.y) * k;
      }
      const vw = this.sw / this.cam.z, vh = this.sh / this.cam.z;
      this.cam.x = B.clamp(this.cam.x, vw / 2 - 400, B.WORLD_W - vw / 2 + 400);
      this.cam.y = B.clamp(this.cam.y, -500 + vh / 2, v.wy + 120 - vh / 2);
      if (vh > v.wy + 620) this.cam.y = (v.wy + 120 - 500) / 2;

      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // sky
      const g = ctx.createLinearGradient(0, 0, 0, this.sh);
      g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, this.sw, this.sh);
      this.drawBackdrop(ctx, v, th);

      // world transform
      let sx = 0, sy = 0;
      if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake *= 0.88; if (this.shake < 0.3) this.shake = 0; }
      ctx.setTransform(this.dpr * this.cam.z, 0, 0, this.dpr * this.cam.z, this.dpr * (this.sw / 2 - this.cam.x * this.cam.z + sx), this.dpr * (this.sh / 2 - this.cam.y * this.cam.z + sy));
      const x0 = this.cam.x - vw / 2, y0 = this.cam.y - vh / 2;
      this.drawWater(ctx, v, th, x0, vw, 0);
      // terrain
      const tx0 = Math.max(0, Math.floor(x0)), ty0 = Math.max(0, Math.floor(y0));
      const tx1 = Math.min(B.WORLD_W, Math.ceil(x0 + vw) + 1), ty1 = Math.min(B.WORLD_H, Math.ceil(y0 + vh) + 1);
      if (tx1 > tx0 && ty1 > ty0) ctx.drawImage(this.T.canvas, tx0, ty0, tx1 - tx0, ty1 - ty0, tx0, ty0, tx1 - tx0, ty1 - ty0);

      this.drawObjects(ctx, v, dt);
      this.drawBeans(ctx, v, dt);
      this.drawParticles(ctx, dt);
      this.drawWater(ctx, v, th, x0, vw, 1);
      this.drawFloats(ctx, dt);

      // screen space
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.hideHud) return;
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${this.flash * 0.8})`; ctx.fillRect(0, 0, this.sw, this.sh); this.flash -= dt * 2.5; }
      this.drawHud(ctx, v, dt);
    }

    drawBackdrop(ctx, v, th) {
      const cx = this.cam.x, cy = this.cam.y, z = this.cam.z;
      // sun
      ctx.fillStyle = th.deco === 'kitchen' ? 'rgba(255,250,220,0.8)' : 'rgba(255,248,210,0.9)';
      const sunX = this.sw * 0.78 - cx * 0.02, sunY = this.sh * 0.18 - cy * 0.02;
      ctx.beginPath(); ctx.arc(sunX, sunY, 46, 0, B.TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,210,0.25)'; ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, B.TAU); ctx.fill();
      // clouds drift with wind
      for (const c of this.clouds) {
        c.x += (v.wind * 1.2 + 0.05) * c.d;
        if (c.x > 3600) c.x = -600; if (c.x < -600) c.x = 3600;
        const px = (c.x - cx * c.d) * Math.min(1, z) * 0.6 + this.sw / 2, py = (c.y - cy * c.d * 0.3) * 0.6 + this.sh * 0.3;
        this.cloud(ctx, ((px % (this.sw + 400)) + this.sw + 400) % (this.sw + 400) - 200, py, c.s);
      }
      // hills (two parallax layers)
      for (let l = 0; l < 2; l++) {
        const par = l === 0 ? 0.15 : 0.32, base = this.sh * (l === 0 ? 0.62 : 0.72) - (cy - 600) * par * z * 0.5;
        ctx.fillStyle = th.hills[l];
        ctx.beginPath(); ctx.moveTo(0, this.sh);
        for (let x = 0; x <= this.sw + 20; x += 20) {
          const wx = ((x / z) + (cx - this.sw / 2 / z)) * par;
          const n = this.hills[l](((wx / 1400) % 1 + 1) % 1);
          let y = base - n * 160 * (l === 0 ? 1.2 : 0.8);
          if (th.deco === 'alpine' && l === 0) y -= Math.abs(Math.sin(wx / 160)) * 90;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(this.sw, this.sh); ctx.fill();
        if (th.deco === 'alpine' && l === 0) { ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(0, 0, this.sw, base - 140); ctx.restore(); }
      }
    }

    cloud(ctx, x, y, s) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 22 * s, 0, B.TAU); ctx.arc(x + 26 * s, y - 10 * s, 28 * s, 0, B.TAU); ctx.arc(x + 56 * s, y, 22 * s, 0, B.TAU); ctx.arc(x + 28 * s, y + 8 * s, 22 * s, 0, B.TAU);
      ctx.fill();
    }

    drawWater(ctx, v, th, x0, vw, front) {
      const wy = v.wy, t = this.time;
      ctx.fillStyle = front ? th.water : th.waterTop;
      ctx.globalAlpha = front ? 0.72 : 0.9;
      ctx.beginPath();
      const xs = Math.floor(x0 / 20) * 20 - 40;
      ctx.moveTo(xs, wy + 2000);
      for (let x = xs; x <= x0 + vw + 40; x += 20) ctx.lineTo(x, wy + (front ? 8 : 0) + Math.sin(x / 40 + t * (front ? 0.05 : 0.035)) * 4 + Math.sin(x / 17 - t * 0.03) * 2);
      ctx.lineTo(x0 + vw + 40, wy + 2000); ctx.closePath(); ctx.fill();
      if (front) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = xs; x <= x0 + vw + 40; x += 20) { const y = wy + 8 + Math.sin(x / 40 + t * 0.05) * 4 + Math.sin(x / 17 - t * 0.03) * 2; x === xs ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawObjects(ctx, v, dt) {
      const I = B.Art.icons, t = this.time;
      for (const o of v.os) {
        const [id, k, ox, oy, a, e, fz, chute] = o;
        const [x, y] = this.pos('o' + id, ox, oy, dt);
        ctx.save(); ctx.translate(x, y);
        switch (k) {
          case 'proj': {
            const icon = { bazooka: 'bazooka', homing: 'homing', grenade: 'grenade', cluster: 'cluster', clusterlet: 'clusterlet', plantain: 'plantain', plantainslice: 'plantainslice', bonnet: 'bonnet', dynamite: 'dynamite', missile: 'missile' }[e] || 'grenade';
            ctx.save(); ctx.rotate(a);
            if (e === 'dynamite') ctx.rotate(-a);
            ctx.scale(0.85, 0.85); I[icon](ctx, t); ctx.restore();
            if (e === 'dynamite' || e === 'bonnet') { if (Math.random() < 0.5) this.parts.push({ k: 'spark', x: x + 2, y: y - 12, vx: (Math.random() - 0.5), vy: -Math.random(), life: 10, m: 10, s: 1.6 }); }
            if (fz > 0) this.label(ctx, String(fz), 0, -18, '#fff', 10);
            break;
          }
          case 'goat': ctx.scale(e >= 0 ? 1 : -1, 1); if (Math.abs(e) === 2) ctx.scale(0.85, 0.85); I.goat(ctx, t + id * 7); break;
          case 'coco': ctx.rotate(a); ctx.scale(1.3, 1.3); I.coconut(ctx); break;
          case 'mine': I.mine(ctx, t); if (fz > 0) this.label(ctx, String(fz), 0, -12, '#ff6b6b', 9); break;
          case 'drum': I.drum(ctx); break;
          case 'crate': if (chute) B.Art.parachute(ctx, 0, -8, e === 'health' ? '#fff' : '#ffd23f', t); I.crate(ctx, e); break;
          case 'grave': { ctx.restore(); const tm = this.meta.teams[e]; B.Art.tin(ctx, x, y + 8, tm ? B.beanType(tm.type).team : '#999'); continue; }
          case 'hook': {
            ctx.restore();
            const cb = this.curBeanPos(v);
            if (cb) this.ropeLine(ctx, cb[0], cb[1], x, y);
            ctx.save(); ctx.translate(x, y);
            if (cb) ctx.rotate(Math.atan2(y - cb[1], x - cb[0]));
            I.hook(ctx); break;
          }
          case 'plane': ctx.scale(a >= 0 ? 1 : -1, 1); ctx.scale(1.4, 1.4); I.plane(ctx); break;
        }
        ctx.restore();
      }
      if (v.rope) { const cb = this.curBeanPos(v, dt); if (cb) { this.ropeLine(ctx, cb[0], cb[1], v.rope[0], v.rope[1]); ctx.save(); ctx.translate(v.rope[0], v.rope[1]); I.hook(ctx); ctx.restore(); } }
    }
    curBeanPos(v) { const b = v.bs.find(b => b[0] === v.cb); if (!b) return null; const d = this.disp.get('b' + b[0]); return d && this.smooth ? [d.x, d.y] : [b[1], b[2]]; }
    ropeLine(ctx, x0, y0, x1, y1) {
      ctx.strokeStyle = '#6b4a20'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, y0 - 2); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    }

    drawBeans(ctx, v, dt) {
      const t = this.time;
      const cur = v.bs.find(b => b[0] === v.cb);
      for (const b of v.bs) {
        const [id, bx, by, hp, f, aim, st, alive, vx, thrust, ropeAng, hurt] = b;
        if (!alive && st !== 'drown') continue;
        const m = this.meta.beans[id]; if (!m) continue;
        const team = this.meta.teams[m.team]; const T = B.beanType(team.type);
        const [x, y] = this.pos('b' + id, bx, by, dt);
        const isCur = id === v.cb && (v.ph === 'turn' || v.ph === 'start' || v.ph === 'retreat' || v.ph === 'firing');
        const blink = ((t + id * 97) % 220) < 7;
        const showWeapon = isCur && v.ph === 'turn' && (st === 'idle') && B.WEAPONS[v.w] && ['power', 'direct', 'melee', 'drop', 'target'].includes(B.WEAPONS[v.w].aim);
        if (st === 'drown') { ctx.save(); ctx.globalAlpha = 0.7; }
        B.Art.bean(ctx, { id, x, y: y - 1, type: team.type, facing: f, aim, state: st === 'idle' && showWeapon ? 'aim' : st === 'drown' ? 'fly' : st, hp, blink, weapon: showWeapon ? v.w : null, vx, thrust, ropeAng, hurt, dizzy: hp > 0 && hp < 15 }, t);
        if (st === 'drown') { ctx.restore(); continue; }
        // punch flame
        if (this.punchId === id && this.punchT > 0) {
          this.punchT -= dt * 60;
          ctx.save(); ctx.translate(x + f * 8, y - 12); ctx.scale(f, 1); B.Art.icons.punch(ctx); ctx.restore();
          if (Math.random() < 0.7) this.parts.push({ k: 'fire', x: x + f * 8, y: y - 6, vx: 0, vy: 0.5, life: 15, m: 15, s: 4 });
        }
        // name & hp tag
        const tagY = y - 26 - (st === 'chute' ? 36 : 0);
        ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (!(isCur && v.ph === 'turn' && st !== 'idle' && st !== 'walk')) {
          this.tag(ctx, m.name, x, tagY - 14, T.team, 11);
        }
        this.tag(ctx, String(hp), x, tagY, T.team, 11);
        // turn arrow
        if (isCur && (v.ph === 'start' || (v.ph === 'turn' && v.tm > 0 && this.view.t % 1 === 0 && (this.arrowT = (this.arrowT || 0) + dt) < 3))) {
          const bob = Math.sin(t * 0.15) * 4;
          ctx.fillStyle = T.team; ctx.strokeStyle = '#1d1410'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x - 8, tagY - 40 + bob); ctx.lineTo(x + 8, tagY - 40 + bob); ctx.lineTo(x, tagY - 28 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      if (v.ph !== 'turn') this.arrowT = 0;
      // crosshair & power
      if (cur && v.ph === 'turn' && cur[7]) {
        const W = B.WEAPONS[v.w];
        const [x, y] = this.pos('b' + cur[0], cur[1], cur[2], 0);
        const st = cur[6];
        const aimy = W && (W.aim === 'power' || W.aim === 'direct' || (v.w === 'rope' && st !== 'rope') || (v.w === 'bat'));
        if (aimy && (st === 'idle' || st === 'walk' || (v.w === 'rope' && (st === 'air' || st === 'fly')))) {
          const ang = cur[4] > 0 ? cur[5] : Math.PI - cur[5];
          const team = this.meta.teams[this.meta.beans[cur[0]].team]; const col = B.beanType(team.type).team;
          const cx = x + Math.cos(ang) * 64, cy = y - 2 + Math.sin(ang) * 64;
          ctx.strokeStyle = '#1d1410'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, B.TAU); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, B.TAU); ctx.moveTo(cx - 11, cy); ctx.lineTo(cx - 4, cy); ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 11, cy); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 4); ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 11); ctx.stroke();
          if (v.ch || v.pw > 0) {
            const n = Math.floor(v.pw * 16);
            for (let i = 0; i < n; i++) {
              const d = 16 + i * 4, r = 1.5 + i * 0.32;
              const hue = 60 - i * 4;
              ctx.fillStyle = `hsl(${hue},100%,${55 - i}%)`;
              ctx.beginPath(); ctx.arc(x + Math.cos(ang) * d, y - 2 + Math.sin(ang) * d, r, 0, B.TAU); ctx.fill();
            }
          }
        }
        if (v.tg) this.targetMark(ctx, v.tg[0], v.tg[1]);
        if (v.w === 'girder' && this.mouseWorld) {
          ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(this.mouseWorld[0], this.mouseWorld[1]); ctx.rotate(v.ga); B.Art.girderShape(ctx, 130, 12); ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(x, y, 380, 0, B.TAU); ctx.stroke(); ctx.setLineDash([]);
        } else if (W && (W.aim === 'target' || W.target) && this.mouseWorld && !v.tg) {
          ctx.save(); ctx.globalAlpha = 0.6; this.targetMark(ctx, this.mouseWorld[0], this.mouseWorld[1]); ctx.restore();
        }
      }
    }

    targetMark(ctx, x, y) {
      const t = this.time;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.04);
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, B.TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(18, 0); ctx.stroke(); }
      ctx.restore();
    }

    tag(ctx, s, x, y, col, sz) {
      ctx.font = `${sz}px ${FONT}`;
      const w = ctx.measureText(s).width + 8;
      ctx.fillStyle = 'rgba(20,14,10,0.72)';
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - sz / 2 - 2, w, sz + 4, 4); ctx.fill();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y + 0.5);
    }
    label(ctx, s, x, y, col, sz) { ctx.font = `${sz}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#1d1410'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }

    drawParticles(ctx, dt) {
      const f = dt * 60;
      const keep = [];
      for (const p of this.parts) {
        p.life -= f; if (p.life <= 0) continue; keep.push(p);
        const k = p.life / p.m;
        switch (p.k) {
          case 'fire':
            p.x += p.vx * f; p.y += p.vy * f; p.vx *= 0.92; p.vy = p.vy * 0.92 - 0.04 * f;
            ctx.fillStyle = k > 0.6 ? '#fff3a0' : k > 0.35 ? '#ffb020' : '#e0401a';
            ctx.globalAlpha = Math.min(1, k * 1.6);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + k * 0.6), 0, B.TAU); ctx.fill(); break;
          case 'smoke':
            p.x += p.vx * f; p.y += p.vy * f; p.vx *= 0.97; p.vy *= 0.97;
            ctx.fillStyle = p.light ? '#e8e8e8' : '#55504a'; ctx.globalAlpha = k * (p.light ? 0.5 : 0.55);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1.6 - k * 0.6), 0, B.TAU); ctx.fill(); break;
          case 'dirt': case 'drop': case 'confetti':
            p.vy += (p.k === 'confetti' ? 0.01 : 0.2) * f; p.x += p.vx * f; p.y += p.vy * f;
            if (p.k === 'confetti') { p.vx += Math.sin(this.time * 0.1 + p.r) * 0.05; ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, k * 3); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.time * 0.1 + p.r); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); break; }
            if (p.k === 'dirt' && this.T.solid(p.x, p.y)) { p.vx = 0; p.vy = 0; p.life = Math.min(p.life, 20); }
            ctx.fillStyle = p.k === 'drop' ? '#bfe6ff' : p.c; ctx.globalAlpha = Math.min(1, k * 2);
            ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); break;
          case 'spark':
            p.x += p.vx * f; p.y += p.vy * f; p.vx *= 0.9; p.vy *= 0.9;
            ctx.fillStyle = Math.random() < 0.5 ? '#fff' : '#ffd23f'; ctx.globalAlpha = k;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.s * k, 0, B.TAU); ctx.fill(); break;
          case 'ring':
            ctx.strokeStyle = '#fff'; ctx.globalAlpha = k * 0.8; ctx.lineWidth = 3 * k + 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.max - (p.max - p.r) * k, 0, B.TAU); ctx.stroke(); break;
          case 'flash':
            ctx.fillStyle = '#fffbe0'; ctx.globalAlpha = k * 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.2 - k * 0.4), 0, B.TAU); ctx.fill(); break;
          case 'line':
            ctx.strokeStyle = '#fff6b0'; ctx.globalAlpha = k; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x1, p.y1); ctx.stroke(); break;
        }
      }
      ctx.globalAlpha = 1;
      this.parts = keep.length > 1500 ? keep.slice(-1500) : keep;
    }

    drawFloats(ctx, dt) {
      const f = dt * 60, keep = [];
      for (const p of this.floats) {
        p.life -= f; if (p.life <= 0) continue; keep.push(p);
        const k = p.life / p.m, age = p.m - p.life;
        p.y -= (p.box ? 0.45 : 0.25) * f;
        ctx.globalAlpha = Math.min(1, k * 3);
        if (p.box) { this.tag(ctx, p.s, p.x, p.y, p.c, 13); }
        else if (p.comic) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
          const sc = Math.min(1, age / 6) * (1 + Math.max(0, (6 - age)) * 0.05); ctx.scale(sc, sc);
          ctx.font = `${p.sz}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 5; ctx.strokeStyle = '#1d1410'; ctx.strokeText(p.s, 0, 0); ctx.fillStyle = p.c; ctx.fillText(p.s, 0, 0);
          ctx.restore();
        } else if (p.bubble) {
          ctx.font = `${p.sz}px ${FONT}`; const w = ctx.measureText(p.s).width + 14;
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d1410'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y - 11, w, 20, 9); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 9); ctx.lineTo(p.x, p.y + 15); ctx.lineTo(p.x + 3, p.y + 9); ctx.fill();
          ctx.fillStyle = '#1d1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.s, p.x, p.y);
        }
      }
      ctx.globalAlpha = 1;
      this.floats = keep;
    }

    drawHud(ctx, v, dt) {
      const W = this.sw, H = this.sh, mobile = this.mobile;
      ctx.textBaseline = 'middle';
      // team bars
      const teams = this.meta.teams;
      const hpT = teams.map(() => 0);
      for (const b of v.bs) if (b[7]) hpT[this.meta.beans[b[0]].team] += b[3];
      const maxHp = Math.max(1, ...this.meta.teams.map(t => t.maxHp || 400));
      const barW = mobile ? Math.min(150, W * 0.34) : Math.min(220, W * 0.32), rowH = 15;
      const by = mobile ? 10 : H - 14 - teams.length * (rowH + 4);
      const bx = mobile ? 10 : W / 2 - barW / 2 + 40;
      const below = by + teams.length * (rowH + 4) + 4;
      teams.forEach((t, i) => {
        const y = by + i * (rowH + 4); const T = B.beanType(t.type);
        ctx.font = `11px ${FONT}`; ctx.textAlign = 'right';
        const nameX = bx - 6;
        if (!mobile) {
          ctx.fillStyle = 'rgba(20,14,10,0.65)'; const nw = Math.min(110, ctx.measureText(t.name).width + 10);
          ctx.beginPath(); ctx.roundRect(nameX - nw, y, nw, rowH, 4); ctx.fill();
          ctx.fillStyle = T.team; ctx.fillText(t.name.slice(0, 18), nameX - 5, y + rowH / 2 + 0.5);
        }
        const w = barW * hpT[i] / maxHp;
        ctx.fillStyle = 'rgba(20,14,10,0.5)'; ctx.fillRect(bx, y, barW, rowH);
        if (w > 0) { ctx.fillStyle = T.team; ctx.fillRect(bx, y, w, rowH); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx, y, w, rowH / 3); }
        if (mobile) { ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,10,0.8)'; ctx.font = `10px ${FONT}`; ctx.strokeText(t.name.slice(0, 18), bx + 4, y + rowH / 2 + 0.5); ctx.fillStyle = '#fff'; ctx.fillText(t.name.slice(0, 18), bx + 4, y + rowH / 2 + 0.5); }
        if (v.ct === i && v.ph !== 'over') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(bx - 1, y - 1, barW + 2, rowH + 2); }
      });
      // timer
      if (v.ph !== 'over') {
        const tx = mobile ? 10 : 18, ty = mobile ? below : H - 62;
        ctx.fillStyle = 'rgba(20,14,10,0.72)'; ctx.beginPath(); ctx.roundRect(tx, ty, 44, 44, 10); ctx.fill();
        const team = teams[v.ct];
        ctx.strokeStyle = team ? B.beanType(team.type).team : '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.font = `22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = v.tm <= 5 && v.ph === 'turn' ? '#ff5a4e' : '#fff';
        const show = v.ph === 'turn' || v.ph === 'retreat' || v.ph === 'start' ? (v.ph === 'start' ? '…' : v.tm) : '';
        ctx.fillText(String(show), tx + 22, ty + 23);
        if (v.ph === 'retreat') { ctx.font = `9px ${FONT}`; ctx.fillStyle = '#ffd23f'; ctx.fillText('RUN!', tx + 22, ty + 38); }
      }
      // wind
      {
        const ww = mobile ? 100 : 120, wx = mobile ? 60 : W - ww - 18, wy = mobile ? below + 8 : H - 34;
        ctx.fillStyle = 'rgba(20,14,10,0.72)'; ctx.beginPath(); ctx.roundRect(wx, wy, ww, 20, 6); ctx.fill();
        const n = Math.round(Math.abs(v.wind) * 6), dir = Math.sign(v.wind);
        for (let i = 0; i < n; i++) {
          const ax = wx + ww / 2 + dir * (6 + i * 9), ay = wy + 10;
          const off = (this.time * 0.5) % 9;
          ctx.fillStyle = dir > 0 ? '#4fd1ff' : '#ff7a59';
          ctx.beginPath(); ctx.moveTo(ax + dir * 7, ay); ctx.lineTo(ax - dir * 1, ay - 6); ctx.lineTo(ax - dir * 1, ay + 6); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#fff'; ctx.fillRect(wx + ww / 2 - 1, wy + 3, 2, 14);
        ctx.font = `9px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('WIND', wx + ww / 2, wy + 28);
      }
      // jet fuel
      if (v.jf >= 0 && v.ph === 'turn') {
        const fx = mobile ? 60 : W / 2 - 60, fy = mobile ? below + 40 : 16;
        ctx.fillStyle = 'rgba(20,14,10,0.72)'; ctx.fillRect(fx, fy, 120, 10);
        ctx.fillStyle = '#ffb020'; ctx.fillRect(fx + 1, fy + 1, 118 * v.jf / 420, 8);
      }
      // banner
      if (this.banner) {
        const b = this.banner; b.life -= dt * 60;
        if (b.life <= 0) this.banner = null;
        else {
          const k = Math.min(1, (b.m - b.life) / 12, b.life / 20);
          ctx.globalAlpha = k;
          const y = (mobile ? Math.max(below + 90, 70) : 64) - (1 - k) * 20;
          ctx.font = `${mobile ? 26 : 34}px ${FONT}`; ctx.textAlign = 'center';
          ctx.lineWidth = 6; ctx.strokeStyle = '#1d1410'; ctx.strokeText(b.s, W / 2, y); ctx.fillStyle = b.c; ctx.fillText(b.s, W / 2, y);
          if (b.sub) { ctx.font = `${mobile ? 15 : 18}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText(b.sub, W / 2, y + 30); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, W / 2, y + 30); }
          ctx.globalAlpha = 1;
        }
      }
      if (v.sd) { ctx.font = `11px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = '#ff7a59'; ctx.lineWidth = 3; ctx.strokeStyle = '#1d1410'; const sx = 18, sy = mobile ? below + 58 : H - 74; ctx.strokeText('SUDDEN DEATH', mobile ? 10 : sx, sy); ctx.fillText('SUDDEN DEATH', mobile ? 10 : sx, sy); }
    }
  }
  B.Renderer = Renderer;
})();
