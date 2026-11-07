'use strict';
// ---------- Destructible terrain ----------
(function () {
  const W = 2560, H = 1250;
  B.WORLD_W = W; B.WORLD_H = H;

  B.THEMES = {
    garden: {
      name: 'Back Garden', sky: ['#6fb7ff', '#bfe6ff'], hills: ['#7fb36a', '#5e9450'], water: '#2f74b5', waterTop: '#5fa8e8',
      soil: [122, 74, 42], soil2: [92, 54, 30], top: [88, 170, 60], top2: [60, 132, 40], topDepth: 9, char: '#2b1a10', edge: [50, 30, 16],
      deco: 'garden'
    },
    beach: {
      name: 'Negril Beach', sky: ['#33b8e8', '#fde7b0'], hills: ['#3aa58a', '#2a7f6a'], water: '#0d8fb0', waterTop: '#4fd8e8',
      soil: [226, 192, 122], soil2: [196, 160, 96], top: [246, 226, 170], top2: [230, 206, 146], topDepth: 7, char: '#6b4b26', edge: [140, 106, 58],
      deco: 'beach'
    },
    alpine: {
      name: 'Alpine Slopes', sky: ['#8fb4e6', '#eef4ff'], hills: ['#b9c8dd', '#93a6c2'], water: '#2a5a8a', waterTop: '#7fb0e0',
      soil: [118, 126, 140], soil2: [88, 96, 110], top: [248, 252, 255], top2: [210, 226, 245], topDepth: 12, char: '#2a2e36', edge: [50, 56, 66],
      deco: 'alpine'
    },
    kitchen: {
      name: 'Pantry Shelf', sky: ['#f5d9a8', '#fff3dc'], hills: ['#e4b77d', '#cf9d62'], water: '#9a3b1c', waterTop: '#d9622e',
      soil: [196, 132, 74], soil2: [168, 104, 52], top: [240, 220, 190], top2: [220, 196, 160], topDepth: 6, char: '#4a2a12', edge: [110, 64, 28],
      deco: 'kitchen'
    }
  };

  class Terrain {
    constructor() {
      this.W = W; this.H = H;
      this.mask = new Uint8Array(W * H);
      this.canvas = document.createElement('canvas');
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
      this.theme = B.THEMES.garden;
      this.version = 0;
    }

    solid(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || x >= W || y < 0 || y >= H) return false;
      return this.mask[y * W + x] === 1;
    }

    // Returns {nx, ny, count} if circle overlaps terrain, else null
    circleHit(cx, cy, r) {
      let nx = 0, ny = 0, c = 0;
      const N = 16;
      for (let i = 0; i < N; i++) {
        const a = i / N * B.TAU;
        const dx = Math.cos(a), dy = Math.sin(a);
        if (this.solid(cx + dx * r, cy + dy * r)) { nx -= dx; ny -= dy; c++; }
      }
      if (this.solid(cx, cy)) c += 2;
      if (!c) return null;
      const l = Math.hypot(nx, ny);
      if (l < 0.01) return { nx: 0, ny: -1, count: c };
      return { nx: nx / l, ny: ny / l, count: c };
    }

    generate(seed, themeId, style) {
      const rand = B.rng(seed);
      this.theme = B.THEMES[themeId] || B.THEMES.garden;
      this.themeId = themeId;
      const m = this.mask; m.fill(0);
      const n1 = B.noise1(rand, 6), n2 = B.noise1(rand, 17), n3 = B.noise1(rand, 45);
      const gap = B.noise1(rand, 5);
      const cave = B.noise2(rand, 40, 22);
      const cave2 = B.noise2(rand, 90, 45);
      const waterY = H - 70;
      const islands = style === 'islands';
      const caves = style === 'caves';
      const tops = new Int32Array(W);
      for (let x = 0; x < W; x++) {
        const t = x / W;
        let h = 0.55 * n1(t) + 0.3 * n2(t) + 0.15 * n3(t);
        let top = H * (0.28 + 0.42 * (1 - h));
        // edges fall into the sea
        const edge = Math.min(x, W - 1 - x);
        if (edge < 160) top += (160 - edge) * (160 - edge) / 40;
        // chasms
        const g = gap(t);
        if (islands && g < 0.33) top = H + 10;
        else if (g < 0.2) top += (0.2 - g) * 2600;
        tops[x] = top | 0;
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (y >= tops[x] && y < H) {
            let solid = true;
            const depth = y - tops[x];
            if (depth > 30) {
              const c = cave(x / 64, y / 56) * 0.7 + cave2(x / 28, y / 28) * 0.3;
              const thr = caves ? 0.56 : 0.66;
              if (c > thr && y < waterY - 10) solid = false;
            }
            if (solid) m[y * W + x] = 1;
          }
        }
      }
      // floating islands / ledges
      const nIsl = caves ? 4 : islands ? 9 : 5;
      for (let i = 0; i < nIsl; i++) {
        const cx = rand.range(250, W - 250), cy = rand.range(H * 0.15, H * 0.5);
        const rx = rand.range(60, 170), ry = rand.range(18, 45);
        const wob = B.noise1(rand, 8);
        for (let y = (cy - ry * 2) | 0; y < cy + ry * 2; y++) for (let x = (cx - rx) | 0; x < cx + rx; x++) {
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const u = (x - cx) / rx;
          const topY = cy - ry * 0.45 * (1 - u * u) - wob((u + 1) / 2) * 10;
          const botY = cy + ry * (1 - u * u) * (0.8 + wob((u + 1) / 2) * 0.6);
          if (y >= topY && y <= botY) m[y * W + x] = 1;
        }
      }
      // caves mode: add a ceiling
      if (caves) {
        const cn = B.noise1(rand, 12);
        for (let x = 0; x < W; x++) {
          const bot = 40 + cn(x / W) * 140;
          for (let y = 0; y < bot; y++) m[y * W + x] = 1;
        }
      }
      // remove tiny specks
      this.version++;
      this.paint(seed);
    }

    // Build the visual texture from the mask
    paint(seed) {
      const th = this.theme, rand = B.rng(seed ^ 0x9e3779b9);
      const img = this.ctx.createImageData(W, H);
      const d = img.data, m = this.mask;
      const nz = B.noise2(rand, 120, 60), nz2 = B.noise2(rand, 400, 200);
      const topD = new Int16Array(W).fill(999);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!m[i]) { topD[x] = 0; continue; }
          topD[x] = Math.min(topD[x] + 1, 999);
          const td = topD[x];
          const o = i * 4;
          let r, g, b;
          const n = nz(x / 22, y / 22), nn = nz2(x / 6, y / 6);
          if (td <= th.topDepth + ((nn * 4) | 0)) {
            const k = td / (th.topDepth + 3);
            r = B.lerp(th.top[0], th.top2[0], k); g = B.lerp(th.top[1], th.top2[1], k); b = B.lerp(th.top[2], th.top2[2], k);
            r += (nn - 0.5) * 18; g += (nn - 0.5) * 18; b += (nn - 0.5) * 14;
          } else {
            const k = n * 0.7 + nn * 0.3;
            r = B.lerp(th.soil[0], th.soil2[0], k); g = B.lerp(th.soil[1], th.soil2[1], k); b = B.lerp(th.soil[2], th.soil2[2], k);
            if (th.deco === 'alpine') { const s = Math.sin(y / 9 + n * 6) * 8; r += s; g += s; b += s; }
            if (th.deco === 'kitchen') { const s = ((x + y * 0.3) % 40 < 3) ? -18 : 0; r += s; g += s; b += s; }
          }
          // outline against air
          const edge = (x > 0 && !m[i - 1]) || (x < W - 1 && !m[i + 1]) || (y < H - 1 && !m[i + W]) || (y > 0 && !m[i - W]);
          if (edge) { r = th.edge[0]; g = th.edge[1]; b = th.edge[2]; }
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
      this.ctx.putImageData(img, 0, 0);
      this.decorate(rand);
    }

    decorate(rand) {
      const ctx = this.ctx, th = this.theme;
      // pebbles / shells / chunks inside soil
      for (let i = 0; i < 900; i++) {
        const x = rand() * W, y = rand() * H;
        if (!this.solid(x, y) || !this.solid(x, y - 14) || !this.solid(x, y + 6)) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.55;
        if (th.deco === 'beach' && rand() < 0.4) {
          ctx.fillStyle = rand() < 0.5 ? '#fff4e0' : '#f5b8a0';
          ctx.beginPath(); ctx.arc(x, y, 2 + rand() * 3, Math.PI, 0); ctx.fill();
        } else if (th.deco === 'kitchen' && rand() < 0.5) {
          ctx.fillStyle = rand() < 0.5 ? '#f7f1e3' : '#8b3a1c';
          ctx.fillRect(x, y, 2 + rand() * 4, 2 + rand() * 3);
        } else {
          const s = 2 + rand() * 5;
          ctx.fillStyle = `rgba(0,0,0,${0.15 + rand() * 0.2})`;
          ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, rand() * 3, 0, B.TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath(); ctx.ellipse(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.25, 0, 0, B.TAU); ctx.fill();
        }
        ctx.restore();
      }
      // surface decorations (cosmetic, non-solid)
      for (let x = 4; x < W - 4; x += 3) {
        if (rand() > 0.22) continue;
        for (let y = 1; y < H - 1; y++) {
          if (this.solid(x, y) && !this.solid(x, y - 1)) {
            if (rand() < 0.5) this.decoAt(x, y, rand);
            break;
          }
        }
      }
    }

    decoAt(x, y, rand) {
      const ctx = this.ctx, th = this.theme;
      ctx.save();
      if (th.deco === 'garden') {
        ctx.strokeStyle = rand() < 0.5 ? '#3f8f2f' : '#5fb043'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x + k * 2 - 2, y + 1); ctx.quadraticCurveTo(x + k * 2 - 2 + rand() * 4 - 2, y - 4, x + k * 3 - 3, y - 6 - rand() * 4); ctx.stroke(); }
        if (rand() < 0.15) {
          ctx.fillStyle = ['#ff6b8a', '#ffd23f', '#fff', '#b47aff'][(rand() * 4) | 0];
          for (let p = 0; p < 5; p++) { const a = p / 5 * B.TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.5, y - 11 + Math.sin(a) * 2.5, 2, 0, B.TAU); ctx.fill(); }
          ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.arc(x, y - 11, 1.6, 0, B.TAU); ctx.fill();
        }
      } else if (th.deco === 'beach') {
        if (rand() < 0.05) this.palm(x, y, rand);
        else { ctx.strokeStyle = '#7fae4a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand() * 6 - 3, y - 5); ctx.stroke(); }
      } else if (th.deco === 'alpine') {
        if (rand() < 0.06) this.pine(x, y, rand);
      } else if (th.deco === 'kitchen') {
        if (rand() < 0.04) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y - 3, 6, 3, 0, 0, B.TAU); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
    }

    palm(x, y, rand) {
      const ctx = this.ctx, h = 50 + rand() * 30, lean = (rand() - 0.5) * 30;
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + lean * 0.2, y - h * 0.6, x + lean, y - h); ctx.stroke();
      ctx.strokeStyle = '#2f8f3a'; ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        ctx.beginPath(); ctx.moveTo(x + lean, y - h);
        ctx.quadraticCurveTo(x + lean + Math.cos(a) * 22, y - h + Math.sin(a) * 22 - 6, x + lean + Math.cos(a) * 34, y - h + Math.sin(a) * 30 + 10); ctx.stroke();
      }
      ctx.fillStyle = '#6b4a1a'; ctx.beginPath(); ctx.arc(x + lean - 3, y - h + 4, 4, 0, B.TAU); ctx.arc(x + lean + 4, y - h + 5, 4, 0, B.TAU); ctx.fill();
    }

    pine(x, y, rand) {
      const ctx = this.ctx, h = 30 + rand() * 30;
      ctx.fillStyle = '#5a3b22'; ctx.fillRect(x - 2, y - 6, 4, 8);
      for (let i = 0; i < 3; i++) {
        const yy = y - 4 - i * h / 3.2, w = (3 - i) * h / 7;
        ctx.fillStyle = '#2e6b4a'; ctx.beginPath(); ctx.moveTo(x - w, yy); ctx.lineTo(x + w, yy); ctx.lineTo(x, yy - h / 2.4); ctx.fill();
        ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.moveTo(x - w * 0.5, yy - h / 4.8); ctx.lineTo(x + w * 0.5, yy - h / 4.8); ctx.lineTo(x, yy - h / 2.4); ctx.fill();
      }
    }

    carve(cx, cy, r) {
      const m = this.mask, r2 = r * r;
      const x0 = Math.max(0, (cx - r) | 0), x1 = Math.min(W - 1, (cx + r) | 0);
      const y0 = Math.max(0, (cy - r) | 0), y1 = Math.min(H - 1, (cy + r) | 0);
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy, row = y * W;
        for (let x = x0; x <= x1; x++) { const dx = x - cx; if (dx * dx + dy * dy <= r2) m[row + x] = 0; }
      }
      const ctx = this.ctx;
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = this.theme.char;
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, B.TAU); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, B.TAU); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, B.TAU); ctx.fill();
      ctx.restore();
      this.version++;
    }

    // Thin line carve (e.g. bat / punch tunnels are not needed, but blowtorch-like) — unused helper
    girder(cx, cy, ang, len) {
      len = len || 130; const th = 12;
      const ca = Math.cos(ang), sa = Math.sin(ang), m = this.mask;
      const ext = len / 2 + th;
      for (let y = (cy - ext) | 0; y < cy + ext; y++) for (let x = (cx - ext) | 0; x < cx + ext; x++) {
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const dx = x - cx, dy = y - cy;
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if (Math.abs(u) <= len / 2 && Math.abs(v) <= th / 2) m[y * W + x] = 1;
      }
      const ctx = this.ctx;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      B.Art.girderShape(ctx, len, th);
      ctx.restore();
      this.version++;
    }

    // Find a random spot where a bean of radius r fits standing on ground
    findSpawn(rand, r, avoid, minDist, waterY) {
      for (let tries = 0; tries < 4000; tries++) {
        const x = rand.range(80, W - 80);
        // scan from a random height down to find a surface
        let y = rand.range(20, H * 0.6) | 0;
        if (this.solid(x, y)) continue;
        while (y < H && !this.solid(x, y + r + 1)) y++;
        if (y >= waterY - 30) continue;
        if (this.circleHit(x, y, r)) continue;
        // head clearance
        if (this.solid(x, y - r - 14)) continue;
        let ok = true;
        for (const a of avoid) if (B.dist(a.x, a.y, x, y) < minDist) { ok = false; break; }
        if (ok) return { x, y };
      }
      return { x: rand.range(200, W - 200), y: 100 };
    }

    encode() {
      const m = this.mask, out = [];
      let cur = 0, run = 0;
      for (let i = 0; i < m.length; i++) {
        if (m[i] === cur) run++;
        else { out.push(run); cur = m[i]; run = 1; }
      }
      out.push(run);
      return out;
    }
    decode(runs) {
      const m = this.mask; let p = 0, v = 0;
      for (const r of runs) { if (v) m.fill(1, p, p + r); else m.fill(0, p, p + r); p += r; v ^= 1; }
      this.version++;
    }
  }
  B.Terrain = Terrain;
})();
