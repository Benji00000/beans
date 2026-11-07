'use strict';
// ---------- Shared helpers ----------
const B = window.B = window.B || {};

B.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
B.lerp = (a, b, t) => a + (b - a) * t;
B.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
B.TAU = Math.PI * 2;

// Seeded RNG (mulberry32)
B.rng = function (seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + f() * (b - a);
  f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
};

// 1D value noise with octaves
B.noise1 = function (rand, n) {
  const pts = [];
  for (let i = 0; i < n + 2; i++) pts.push(rand());
  return function (x) { // x in [0,1]
    const fx = x * n, i = Math.floor(fx), t = fx - i;
    const s = t * t * (3 - 2 * t);
    return B.lerp(pts[i] || 0, pts[i + 1] || 0, s);
  };
};

// 2D value noise
B.noise2 = function (rand, gw, gh) {
  const g = new Float32Array((gw + 2) * (gh + 2));
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const W = gw + 2;
  return function (x, y) { // x,y in grid units
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i0 = ((iy % (gh + 1)) + (gh + 1)) % (gh + 1), j0 = ((ix % (gw + 1)) + (gw + 1)) % (gw + 1);
    const a = g[i0 * W + j0], b = g[i0 * W + j0 + 1], c = g[(i0 + 1) * W + j0], d = g[(i0 + 1) * W + j0 + 1];
    return B.lerp(B.lerp(a, b, sx), B.lerp(c, d, sx), sy);
  };
};

B.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
B.uid = (() => { let n = 1; return () => n++; })();

B.roomCode = function () {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};

B.escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Bean types = team identities
B.BEAN_TYPES = [
  { id: 'kidney', name: 'Kidney', body: '#b3322f', shade: '#7d1f1d', hi: '#e06a5f', team: '#ff5a4e' },
  { id: 'pinto', name: 'Pinto', body: '#d9a877', shade: '#a8774a', hi: '#f2cfa5', team: '#ffb347', speckle: '#8a4f2a' },
  { id: 'lima', name: 'Lima', body: '#a9cf6a', shade: '#76a03d', hi: '#d4ef9e', team: '#7ee05b' },
  { id: 'blackeye', name: 'Black-Eyed', body: '#efe6d2', shade: '#c5b89c', hi: '#ffffff', team: '#e9e3ff', eyeSpot: '#1c1c1c' },
  { id: 'coffee', name: 'Coffee', body: '#6b4226', shade: '#422716', hi: '#9a6a46', team: '#c68b59', crease: true },
  { id: 'jelly', name: 'Jelly', body: '#c44fd6', shade: '#8a2c99', hi: '#ef9cff', team: '#ff7af0', glossy: true },
  { id: 'baked', name: 'Baked', body: '#e07b2c', shade: '#a8521a', hi: '#ffb070', team: '#ff9a3c' },
  { id: 'edamame', name: 'Edamame', body: '#5fae48', shade: '#3c7a2c', hi: '#9fdc84', team: '#4fd1c5' },
];
B.beanType = (id) => B.BEAN_TYPES.find(t => t.id === id) || B.BEAN_TYPES[0];

B.TEAM_NAMES = {
  kidney: 'Kidney Krew', pinto: 'Pinto Posse', lima: 'Lima Legion', blackeye: 'Black-Eyed Brigade',
  coffee: 'Coffee Club', jelly: 'Jelly Gang', baked: 'Baked Bunch', edamame: 'Edamame Army'
};
B.BEAN_NAMES = ['Kev', 'Lil Bean', 'Sprout', 'Pod', 'Mungo', 'Garbanzo', 'Fava', 'Legume', 'Chickpea', 'Butterbean',
  'Bumpy', 'Rajma', 'Frijol', 'Haricot', 'Navy', 'Adzuki', 'Cannellini', 'Borlotti', 'Lentil', 'Soya',
  'Runner', 'Cocoa', 'Vanilla', 'Jumbie', 'Ackee', 'Boonoonoonoos', 'Duppy', 'Bammy', 'Festival', 'Callaloo'];
B.assignBeanNames = function (cfg, rand) {
  const all = B.makeBeanNames(cfg.beansPerTeam * cfg.teams.length, rand);
  cfg.teams.forEach((t, i) => { t.beanNames = all.slice(i * cfg.beansPerTeam, (i + 1) * cfg.beansPerTeam); });
};
B.makeBeanNames = function (n, rand) {
  const pool = B.BEAN_NAMES.slice();
  const out = [];
  for (let i = 0; i < n; i++) { if (!pool.length) pool.push(...B.BEAN_NAMES.map(x => x + ' II')); out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]); }
  return out;
};
