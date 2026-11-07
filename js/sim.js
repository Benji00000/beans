'use strict';
// ---------- Authoritative game simulation (runs on the host only) ----------
(function () {
  const G = 0.2, BR = 10, WIND_ACC = 0.032, FALL_SAFE = 8;
  B.PHYS = { G, BR, WIND_ACC };

  // Generic circle-vs-terrain integration step. Returns hit info or null.
  function physStep(T, o, r, e, fr, g) {
    o.vy += g;
    let sp = Math.hypot(o.vx, o.vy);
    if (sp > 22) { o.vx *= 22 / sp; o.vy *= 22 / sp; sp = 22; }
    const n = Math.max(1, Math.ceil(sp / 2));
    for (let i = 0; i < n; i++) {
      const nx = o.x + o.vx / n, ny = o.y + o.vy / n;
      const h = T.circleHit(nx, ny, r);
      if (!h) { o.x = nx; o.y = ny; continue; }
      const vn = o.vx * h.nx + o.vy * h.ny;
      const hit = { nx: h.nx, ny: h.ny, vn: -vn, x: nx, y: ny };
      if (vn < 0) {
        o.vx -= (1 + e) * vn * h.nx; o.vy -= (1 + e) * vn * h.ny;
        const tx = -h.ny, ty = h.nx, vt = o.vx * tx + o.vy * ty;
        o.vx -= (1 - fr) * vt * tx; o.vy -= (1 - fr) * vt * ty;
      }
      let k = 0;
      while (T.circleHit(o.x, o.y, r) && k < 8) { o.x += h.nx; o.y += h.ny; k++; }
      return hit;
    }
    return null;
  }
  B.physStep = physStep;

  // Projectile flight step shared with the AI predictor. Returns 'hitT' | 'hitB' | 'water' | 'out' | null
  B.projStep = function (T, p, wind, beans, waterY) {
    const grav = p.heavy ? G * 1.25 : G;
    if (p.wind) p.vx += wind * WIND_ACC;
    if (p.impact) {
      p.vy += grav;
      const sp = Math.hypot(p.vx, p.vy), n = Math.max(1, Math.ceil(sp / 2));
      for (let i = 0; i < n; i++) {
        p.x += p.vx / n; p.y += p.vy / n;
        const r = p.r;
        if (T.solid(p.x, p.y) || T.solid(p.x + r, p.y) || T.solid(p.x - r, p.y) || T.solid(p.x, p.y + r) || T.solid(p.x, p.y - r)) return 'hitT';
        if (beans) for (const b of beans) {
          if (!b.alive || b.drowning) continue;
          if (b.id === p.owner && p.age < 12) continue;
          if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (BR + p.r) ** 2) return 'hitB';
        }
      }
    } else {
      if (p.rest) { if (!T.circleHit(p.x, p.y + 2, p.r)) p.rest = false; }
      if (!p.rest) {
        const h = physStep(T, p, p.r, p.bounce, 0.85, grav);
        if (h && h.vn > 1.2) p.bounced = (p.bounced || 0) + 1;
        if (h && Math.hypot(p.vx, p.vy) < 0.4 && h.ny < -0.5) { p.vx = 0; p.vy = 0; p.rest = true; }
      }
    }
    if (p.y > waterY) return 'water';
    if (p.x < -600 || p.x > B.WORLD_W + 600 || p.y < -3000) return 'out';
    return null;
  };

  const DEF = {
    bazooka: { r: 3, impact: true, wind: true, rad: 50, dmg: 50, spin: false },
    homing: { r: 3, impact: true, wind: true, rad: 50, dmg: 50 },
    grenade: { r: 4, bounce: 0.5, rad: 50, dmg: 50, fuse: true },
    cluster: { r: 4, bounce: 0.5, rad: 32, dmg: 25, fuse: true, split: 'clusterlet' },
    clusterlet: { r: 3, impact: true, rad: 26, dmg: 20 },
    plantain: { r: 5, bounce: 0.5, rad: 65, dmg: 60, fuse: true, split: 'plantainslice' },
    plantainslice: { r: 4, impact: true, rad: 60, dmg: 45, spin: true },
    bonnet: { r: 6, bounce: 0.25, rad: 115, dmg: 100, fixedFuse: 180, heavy: true },
    dynamite: { r: 5, bounce: 0.15, rad: 80, dmg: 75, fixedFuse: 300 },
    missile: { r: 3, impact: true, wind: true, rad: 32, dmg: 30 },
  };
  B.PROJ_DEF = DEF;

  class Sim {
    constructor(cfg, terrain) {
      this.cfg = cfg;
      this.T = terrain;
      this.rand = B.rng((cfg.seed * 7 + 13) >>> 0);
      this.t = 0;
      this.events = [];
      this.waterY = B.WORLD_H - 70;
      this.round = 1; this.turnNo = 0; this.sd = false;
      this.wind = 0;
      this.objs = [];
      this.input = { l: 0, r: 0, u: 0, d: 0 };
      this.acts = [];
      this.fireHeld = false;
      this.phase = 'init'; this.timer = 0;
      this.weapon = 'bazooka'; this.fuse = 3; this.power = 0; this.charging = false;
      this.target = null; this.girderAng = 0; this.shotsLeft = 0;
      this.msg = '';
      this.winner = null;

      terrain.generate(cfg.seed, cfg.theme, cfg.style);
      const rand = this.rand;
      this.teams = cfg.teams.map((t, i) => {
        const ammo = {};
        for (const k of B.WEAPON_ORDER) ammo[k] = B.WEAPONS[k].ammo;
        if (cfg.infiniteAmmo) for (const k of B.WEAPON_ORDER) ammo[k] = -1;
        return { i, name: t.name, type: t.type, ctrl: t.ctrl, owner: t.owner || 'host', cpu: t.cpu || 'normal', ammo, next: 0, lastWeapon: 'bazooka', out: false };
      });
      this.beans = [];
      const spots = [];
      let id = 1;
      // interleave spawns so teams are mixed
      const nb = cfg.beansPerTeam;
      for (let j = 0; j < nb; j++) for (let ti = 0; ti < this.teams.length; ti++) {
        const p = terrain.findSpawn(rand, BR, spots, 70, this.waterY);
        spots.push(p);
        const names = cfg.teams[ti].beanNames || [];
        this.beans.push({
          id: id++, team: ti, name: names[j] || ('Bean ' + (j + 1)), x: p.x, y: p.y, vx: 0, vy: 0, hp: cfg.hp,
          facing: p.x < B.WORLD_W / 2 ? 1 : -1, aim: -0.3, st: 'air', alive: true, drowning: false, idx: j, fallY: p.y, hurt: 0,
        });
      }
      // mines & drums
      const nm = cfg.mines ? 8 : 0, nd = cfg.drums ? 5 : 0;
      for (let i = 0; i < nm + nd; i++) {
        const p = terrain.findSpawn(rand, 6, spots, 45, this.waterY);
        spots.push(p);
        this.objs.push(i < nm ? { id: B.uid(), k: 'mine', x: p.x, y: p.y, vx: 0, vy: 0, fuse: -1, rest: false, r: 5 }
          : { id: B.uid(), k: 'drum', x: p.x, y: p.y - 4, vx: 0, vy: 0, fuse: -1, hp: 50, rest: false, r: 9 });
      }
      this.order = this.teams.map(t => t.i);
      this.curTeam = Math.floor(rand() * this.teams.length) - 1;
      if (this.curTeam < 0) this.curTeam = this.teams.length - 1;
      this.curBean = null;
      this.phase = 'settle'; this.settleT = 0; this.firstTurn = true;
    }

    ev(e) { this.events.push(e); }
    txt(x, y, s, c, big) { this.ev({ t: 'txt', x, y, s, c: c || '#fff', big: !!big }); }
    snd(n, v) { this.ev({ t: 'snd', n, v }); }

    get cb() { return this.curBean != null ? this.beans.find(b => b.id === this.curBean) : null; }
    get team() { return this.teams[this.curTeam]; }

    // ---------- input ----------
    setHeld(h) { this.input.l = !!h.l; this.input.r = !!h.r; this.input.u = !!h.u; this.input.d = !!h.d; }
    pushAct(a) { if (this.acts.length < 40) this.acts.push(a); }
    controller() { const t = this.team; return t ? (t.ctrl === 'remote' ? t.owner : t.ctrl === 'cpu' ? 'cpu' : 'host') : null; }

    canUse(w) {
      const t = this.team; if (!t) return false;
      const W = B.WEAPONS[w]; if (!W) return false;
      if (t.ammo[w] === 0) return false;
      if (!this.cfg.infiniteAmmo && W.delay > 0 && this.round <= W.delay) return false;
      return true;
    }
    useAmmo(w) { const t = this.team; if (t.ammo[w] > 0) t.ammo[w]--; }

    aimWorld(b) { return b.facing > 0 ? b.aim : Math.PI - b.aim; }

    grounded(b) { return this.T.circleHit(b.x, b.y + 2, BR) != null; }

    processActs() {
      let fireActDone = false;
      const keep = [];
      for (const a of this.acts) {
        if ((a.a === 'fireDown' || a.a === 'fireUp')) {
          if (fireActDone) { keep.push(a); continue; }
          fireActDone = true;
        }
        this.doAct(a);
      }
      this.acts = keep;
    }

    doAct(a) {
      const b = this.cb;
      if (a.a === 'fireDown') this.fireHeld = true;
      if (a.a === 'fireUp') this.fireHeld = false;
      if (!b || !b.alive) return;
      const ph = this.phase;
      const inTurn = ph === 'turn', canMove = ph === 'turn' || ph === 'retreat';
      switch (a.a) {
        case 'weapon':
          if ((inTurn || ph === 'start') && !this.charging && this.shotsLeft === 0 && B.WEAPONS[a.v] && this.canUse(a.v) && !this.lockWeapon && b.st !== 'rope' && b.st !== 'jet') {
            this.weapon = a.v; this.team.lastWeapon = a.v; this.target = null; this.snd('select');
          }
          break;
        case 'fuse': if (a.v >= 1 && a.v <= 5) { this.fuse = a.v; } break;
        case 'jump':
          if (b.st === 'rope') { this.releaseRope(b); break; }
          if (canMove && this.isStanding(b) && !this.charging) { b.vx = b.facing * 2.3; b.vy = -4; b.st = 'air'; b.fallY = b.y; this.snd('jump'); }
          break;
        case 'backflip':
          if (canMove && this.isStanding(b) && !this.charging) { b.vx = -b.facing * 1.1; b.vy = -5.6; b.st = 'air'; b.fallY = b.y; this.snd('jump', 1.3); }
          break;
        case 'target': this.onTarget(b, a.x, a.y); break;
        case 'fireDown': this.onFireDown(b); break;
        case 'fireUp': if (this.charging) this.releaseCharge(b); break;
      }
    }

    isStanding(b) { return b.st === 'idle' || b.st === 'walk'; }

    onFireDown(b) {
      // detonate goat
      if (this.phase === 'firing') {
        const goat = this.objs.find(o => o.k === 'goat' && o.detonable);
        if (goat) this.explodeObj(goat);
        return;
      }
      if (b.st === 'rope') { this.releaseRope(b); return; }
      if (b.st === 'jet') { b.st = 'air'; b.fallY = b.y; return; }
      if (this.phase !== 'turn') return;
      const w = this.weapon, W = B.WEAPONS[w];
      const paid = (w === 'rope' && this.ropeUsed) || (w === 'jetpack' && this.jetUsed);
      if (!paid && !this.canUse(w) && this.shotsLeft === 0) { this.weapon = 'bazooka'; return; }
      const standing = this.isStanding(b);
      if (w === 'rope') { if (b.st !== 'chute') this.shootHook(b); return; }
      if (w === 'jetpack') { if (standing || b.st === 'air') this.startJet(b); return; }
      if (w === 'parachute') { if (b.st === 'air' || b.st === 'fly') { b.st = 'chute'; this.useAmmo(w); this.snd('chute'); } return; }
      if (!standing) return;
      if (W.aim === 'power') {
        if (W.target && !this.target) { this.txt(b.x, b.y - 40, 'Pick a target first!', '#ffd23f'); return; }
        this.charging = true; this.power = 0; this.snd('charge');
      } else if (w === 'shotgun') this.fireShotgun(b);
      else if (W.aim === 'drop') this.dropThing(b, w);
      else if (W.aim === 'melee') this.melee(b, w);
      else if (W.aim === 'target') this.txt(b.x, b.y - 40, 'Tap/click a target', '#ffd23f');
      else if (w === 'skip') { this.txt(b.x, b.y - 30, 'Zzz…', '#fff'); this.endTurnNow(); }
      else if (w === 'surrender') {
        this.txt(b.x, b.y - 30, 'We give up!', '#fff', true);
        const t = this.team; t.out = true;
        for (const x of this.beans) if (x.team === t.i && x.alive) { x.alive = false; x.st = 'dead'; this.objs.push({ id: B.uid(), k: 'grave', x: x.x, y: x.y, vx: 0, vy: 0, r: 8, team: t.i, rest: false }); this.ev({ t: 'poof', x: x.x, y: x.y }); }
        this.endTurnNow();
      }
    }

    onTarget(b, x, y) {
      if (this.phase !== 'turn') return;
      const w = this.weapon, W = B.WEAPONS[w];
      if (W.target) { this.target = [x, y]; this.snd('select'); return; }
      if (W.aim !== 'target' || !this.canUse(w) || !this.isStanding(b)) return;
      if (w === 'girder') {
        if (B.dist(b.x, b.y, x, y) > 380) { this.txt(x, y, 'Too far!', '#ffd23f'); return; }
        for (const o of this.beans) if (o.alive && B.dist(o.x, o.y, x, y) < 70) {
          // precise check: distance from bean to girder segment
          const ca = Math.cos(this.girderAng), sa = Math.sin(this.girderAng);
          const dx = o.x - x, dy = o.y - y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
          if (Math.abs(u) < 65 + BR && Math.abs(v) < 6 + BR) { this.txt(x, y, 'Blocked!', '#ffd23f'); return; }
        }
        this.T.girder(x, y, this.girderAng, 130);
        this.ev({ t: 'girder', x, y, a: this.girderAng });
        this.useAmmo(w); this.snd('girder');
        for (const o of this.objs) o.rest = false;
        return;
      }
      if (w === 'teleport') {
        if (y > this.waterY - 20 || y < -200 || x < 10 || x > B.WORLD_W - 10 || this.T.circleHit(x, y, BR + 1)) { this.txt(x, y, "Can't go there", '#ffd23f'); return; }
        this.ev({ t: 'tele', x0: b.x, y0: b.y, x1: x, y1: y });
        b.x = x; b.y = y; b.vx = 0; b.vy = 0; b.st = 'air'; b.fallY = y;
        this.useAmmo(w); this.snd('teleport');
        return;
      }
      if (w === 'airstrike') { this.useAmmo(w); this.airstrike(b, x, y); return; }
      if (w === 'coconut') { this.useAmmo(w); this.coconut(b, x); return; }
    }

    beginFiring(w) {
      this.useAmmo(w);
      this.phase = 'firing';
      this.lockWeapon = true;
    }

    releaseCharge(b) {
      this.charging = false;
      const w = this.weapon, p = Math.max(0.06, this.power);
      const ang = this.aimWorld(b);
      const d = DEF[w];
      const sp = 13.5 * p;
      const pr = this.spawnProj(w, b.x + Math.cos(ang) * 12, b.y - 2 + Math.sin(ang) * 12, Math.cos(ang) * sp, Math.sin(ang) * sp, b.id);
      if (d.fuse) pr.fuse = this.fuse * 60;
      if (w === 'homing') pr.homing = this.target.slice();
      this.beginFiring(w);
      this.snd(d.impact ? 'launch' : 'throw');
      this.power = 0;
    }

    spawnProj(w, x, y, vx, vy, owner) {
      const d = DEF[w];
      const p = Object.assign({ id: B.uid(), k: 'proj', w, x, y, vx, vy, owner, age: 0, weapon: true, fuse: -1, bounce: 0, a: Math.atan2(vy, vx) }, d);
      if (d.fixedFuse) p.fuse = d.fixedFuse;
      this.objs.push(p);
      return p;
    }

    fireShotgun(b) {
      if (this.shotsLeft === 0) { this.shotsLeft = 2; this.useAmmo('shotgun'); this.lockWeapon = true; }
      this.shotsLeft--;
      const ang = this.aimWorld(b), ca = Math.cos(ang), sa = Math.sin(ang);
      let x = b.x + ca * 12, y = b.y - 2 + sa * 12, hit = null;
      for (let s = 0; s < 600; s++) {
        x += ca * 2; y += sa * 2;
        if (this.T.solid(x, y)) { hit = 't'; break; }
        for (const o of this.beans) if (o.alive && o.id !== b.id && !o.drowning && (o.x - x) ** 2 + (o.y - y) ** 2 < BR * BR) { hit = o; break; }
        if (hit) break;
        if (x < -100 || x > B.WORLD_W + 100 || y < -500 || y > this.waterY) break;
      }
      this.ev({ t: 'shot', x0: b.x + ca * 14, y0: b.y - 2 + sa * 14, x1: x, y1: y });
      this.snd('shotgun');
      if (hit && hit !== 't') { this.damage(hit, 25, b); hit.vx += ca * 3; hit.vy += sa * 3 - 1.5; hit.st = 'fly'; this.explode(x, y, 12, 0, { quiet: true }); }
      else if (hit) this.explode(x, y, 18, 25, { quiet: true });
      if (this.shotsLeft === 0) { this.phase = 'firing'; }
    }

    dropThing(b, w) {
      if (w === 'dynamite') {
        const p = this.spawnProj('dynamite', b.x + b.facing * 6, b.y, b.facing * 0.6, -1.5, b.id);
        p.fuse = 300; this.snd('fuse');
      } else if (w === 'goat') {
        this.objs.push({ id: B.uid(), k: 'goat', x: b.x + b.facing * 14, y: b.y - 2, vx: 0, vy: 0, dir: b.facing, age: 0, life: 900, rad: 70, dmg: 75, weapon: true, detonable: true, air: true, owner: b.id, blocked: 0 });
        this.snd('goat');
      } else if (w === 'madgoats') {
        for (let i = 0; i < 5; i++) this.objs.push({ id: B.uid(), k: 'goat', x: b.x + b.facing * 10, y: b.y - 4, hidden: i > 0, vx: 0, vy: 0, dir: b.facing, life: 600, rad: 45, dmg: 40, weapon: true, mad: true, air: true, owner: b.id, blocked: 0, age: -i * 28 });
        this.snd('goat'); this.txt(b.x, b.y - 40, 'STAMPEDE!', '#ff5a4e', true);
      }
      this.beginFiring(w);
    }

    melee(b, w) {
      const f = b.facing;
      this.beginFiring(w);
      let hitAny = false;
      for (const o of this.beans) {
        if (!o.alive || o.id === b.id || o.drowning) continue;
        const dx = (o.x - b.x) * f, dy = o.y - b.y;
        if (dx > -4 && dx < 26 && Math.abs(dy) < 22) {
          hitAny = true;
          if (w === 'punch') { this.damage(o, 30, b); o.vx = f * 2.8; o.vy = -7.5; }
          else { const ang = this.aimWorld(b); this.damage(o, 30, b); o.vx = Math.cos(ang) * 12; o.vy = Math.sin(ang) * 12 - 1; }
          o.st = 'fly';
        }
      }
      if (w === 'punch') { b.vy = -6; b.vx = f * 0.6; b.st = 'air'; b.fallY = b.y - 500; b.punching = 30; this.ev({ t: 'punch', id: b.id }); this.snd('punch'); }
      else { this.ev({ t: 'swing', x: b.x + f * 14, y: b.y }); this.snd(hitAny ? 'bat' : 'whiff'); }
      if (hitAny) this.txt(b.x + f * 20, b.y - 30, w === 'bat' ? 'HOME RUN!' : 'POW!', '#ffd23f', true);
    }

    airstrike(b, tx, ty) {
      const dir = tx >= b.x ? 1 : -1;
      const planeY = -60;
      this.phase = 'firing'; this.lockWeapon = true;
      const fallT = Math.sqrt(2 * Math.max(60, ty - planeY) / G);
      for (let i = 0; i < 5; i++) {
        const vx = dir * 3;
        const drift = vx * fallT + 0.5 * this.wind * WIND_ACC * fallT * fallT;
        const sx = tx + (i - 2) * 28 - drift;
        const startX = tx - dir * 1200;
        const wait = Math.max(0, Math.round((sx - startX) / (dir * 9)));
        const p = this.spawnProj('missile', sx, planeY, vx, 0, b.id);
        p.wait = wait;
      }
      this.objs.push({ id: B.uid(), k: 'plane', x: tx - dir * 1200, y: planeY - 10, vx: dir * 9, vy: 0, dir, a: dir, age: 0 });
      this.snd('plane');
    }

    coconut(b, tx) {
      this.phase = 'firing'; this.lockWeapon = true;
      this.objs.push({ id: B.uid(), k: 'coco', x: tx, y: -260, vx: 0, vy: 2, age: 0, count: 0, cool: 0, weapon: true, owner: b.id, a: 0 });
      this.snd('whistle');
    }

    shootHook(b) {
      if (this.objs.some(o => o.k === 'hook')) return;
      if (!this.ropeUsed) { this.useAmmo('rope'); this.ropeUsed = true; }
      const ang = this.aimWorld(b);
      this.objs.push({ id: B.uid(), k: 'hook', x: b.x, y: b.y - 4, vx: Math.cos(ang) * 18, vy: Math.sin(ang) * 18, sx: b.x, sy: b.y, owner: b.id, a: ang });
      this.snd('rope');
    }

    releaseRope(b) {
      this.rope = null; b.st = 'air'; b.fallY = b.y; this.snd('whiff');
    }

    startJet(b) {
      if (!this.jetUsed) { this.useAmmo('jetpack'); this.jetUsed = true; this.jetFuel = 420; }
      if (this.jetFuel <= 0) return;
      b.st = 'jet'; b.vy = Math.min(b.vy, -1.5); this.snd('jet');
    }

    // ---------- damage & explosions ----------
    damage(b, n, src) {
      if (!b.alive || n <= 0) return;
      n = Math.round(n);
      b.hp -= n; b.hurt = 14;
      this.ev({ t: 'dmg', id: b.id, n, x: b.x, y: b.y });
      if (b.id === this.curBean && ['turn', 'firing', 'retreat'].includes(this.phase)) this.curHurt = true;
      if (b.hp > 0) this.snd('ouch', 0.8 + Math.random() * 0.5);
    }

    explode(x, y, rad, dmg, opt) {
      opt = opt || {};
      this.T.carve(x, y, rad);
      this.ev({ t: 'boom', x, y, r: rad });
      if (!opt.quiet) this.snd('boom', rad);
      for (const b of this.beans) {
        if (!b.alive || b.drowning) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        const eff = Math.max(0, d - BR * 0.6);
        if (eff >= rad) continue;
        const frac = 1 - eff / rad;
        if (dmg > 0) this.damage(b, Math.max(1, dmg * frac), null);
        const k = frac * Math.max(dmg, 15) * 0.115;
        let dx = b.x - x, dy = b.y - y - 2; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        b.vx += dx * k; b.vy += dy * k - k * 0.35;
        if (k > 0.5) { b.st = b.st === 'rope' ? 'air' : 'fly'; if (this.rope && b.id === this.curBean) this.rope = null; }
        else if (b.st === 'idle' || b.st === 'walk') b.st = 'air';
        b.fallY = b.y;
      }
      for (const o of this.objs) {
        if (o.dead) continue;
        const d = Math.hypot(o.x - x, o.y - y);
        if (d > rad + 12) continue;
        const frac = 1 - d / (rad + 12);
        if (o.k === 'mine') { if (o.fuse < 0 || o.fuse > 25) o.fuse = 10 + (this.rand() * 25 | 0); }
        if (o.k === 'drum') { o.hp -= dmg * frac; if (o.hp <= 0 && o.fuse < 0) o.fuse = 6; }
        if (o.k === 'crate') { o.dead = true; if (o.ctype === 'weapon') this.later(4, () => this.explode(o.x, o.y, 40, 30)); else this.ev({ t: 'poof', x: o.x, y: o.y }); continue; }
        if (['mine', 'drum', 'grave', 'goat', 'proj'].includes(o.k) && !(o.k === 'proj' && o.impact)) {
          const k = frac * Math.max(dmg, 15) * 0.1;
          let dx = o.x - x, dy = o.y - y; const l = Math.hypot(dx, dy) || 1;
          o.vx += dx / l * k; o.vy += dy / l * k - k * 0.4; o.rest = false; o.air = true;
        }
      }
      for (const b of this.beans) if (b.st === 'idle' || b.st === 'walk') { if (!this.grounded(b)) { b.st = 'air'; b.fallY = b.y; } }
      for (const o of this.objs) o.rest = false;
    }

    later(ticks, fn) { (this.timers = this.timers || []).push({ t: ticks, fn }); }

    explodeObj(o) {
      if (o.dead) return;
      o.dead = true;
      const rad = o.rad || 50, dmg = o.dmg != null ? o.dmg : 50;
      this.explode(o.x, o.y, rad, dmg);
      if (o.split) {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const vx = o.split === 'plantainslice' ? (i - 2) * 1.6 + (this.rand() - 0.5) * 1.5 : (this.rand() - 0.5) * 6;
          const vy = o.split === 'plantainslice' ? -7 - this.rand() * 3 : -3 - this.rand() * 4;
          this.spawnProj(o.split, o.x, o.y - 6, vx, vy, -1).age = 20;
        }
      }
      if (o.w === 'bonnet') this.ev({ t: 'flash' });
    }

    // ---------- turn flow ----------
    endTurnNow() {
      this.charging = false;
      const b = this.cb;
      if (b && (b.st === 'rope' || b.st === 'jet')) { b.st = 'air'; b.fallY = b.y; }
      this.rope = null;
      this.objs = this.objs.filter(o => o.k !== 'hook');
      this.phase = 'settle'; this.settleT = 0; this.ai = null;
    }

    nextTurn() {
      const aliveTeams = this.teams.filter(t => !t.out && this.beans.some(b => b.team === t.i && b.alive));
      for (const t of this.teams) if (!aliveTeams.includes(t)) t.out = true;
      if (aliveTeams.length <= 1) {
        this.phase = 'over'; this.winner = aliveTeams.length ? aliveTeams[0].i : -1; this.curBean = null;
        this.ev({ t: 'over', w: this.winner }); this.snd(this.winner >= 0 ? 'win' : 'boom');
        return;
      }
      let ti = this.curTeam, wrapped = false;
      for (let k = 0; k < this.teams.length; k++) {
        ti = (ti + 1) % this.teams.length;
        if (ti === 0) wrapped = true;
        if (!this.teams[ti].out) break;
      }
      if (wrapped && !this.firstTurn) this.round++;
      this.firstTurn = false;
      this.curTeam = ti;
      const team = this.teams[ti];
      const mine = this.beans.filter(b => b.team === ti);
      let pick = null;
      for (let k = 0; k < mine.length; k++) { const c = mine[(team.next + k) % mine.length]; if (c.alive) { pick = c; team.next = (team.next + k + 1) % mine.length; break; } }
      this.curBean = pick.id;
      this.turnNo++;
      // wind
      const w = this.rand() * 2 - 1; this.wind = Math.sign(w) * Math.pow(Math.abs(w), 1.3);
      // sudden death
      if (this.cfg.sdRound > 0 && this.round > this.cfg.sdRound) {
        if (!this.sd) { this.sd = true; this.ev({ t: 'banner', s: 'SUDDEN DEATH — the tide is rising!' }); this.snd('sd'); }
        else { this.waterY -= 22; }
      }
      // crate
      const crates = this.objs.filter(o => o.k === 'crate').length;
      if (!this.firstTurnCrate && this.cfg.crates && crates < 5 && this.rand() < 0.4) {
        const x = 150 + this.rand() * (B.WORLD_W - 300);
        this.objs.push({ id: B.uid(), k: 'crate', x, y: -40, vx: 0, vy: 0, r: 9, ctype: this.rand() < 0.4 ? 'health' : 'weapon', chute: true, rest: false });
      }
      this.weapon = this.canUse(team.lastWeapon) ? team.lastWeapon : 'bazooka';
      this.shotsLeft = 0; this.power = 0; this.charging = false; this.curHurt = false; this.lockWeapon = false;
      this.ropeUsed = false; this.jetUsed = false; this.jetFuel = 0; this.rope = null; this.target = null;
      this.acts = []; this.fireHeld = false; this.input = { l: 0, r: 0, u: 0, d: 0 };
      this.phase = 'start'; this.timer = 70;
      this.ai = null;
      this.ev({ t: 'turn', team: ti, bean: pick.id });
      this.snd('turn');
    }

    worldBusy() {
      for (const o of this.objs) {
        if (o.dead) continue;
        if (o.k === 'proj' || o.k === 'goat' || o.k === 'coco' || o.k === 'hook') return true;
        if ((o.k === 'mine' || o.k === 'drum') && o.fuse >= 0) return true;
        if ((o.k === 'mine' || o.k === 'drum' || o.k === 'grave') && !o.rest) return true;
      }
      if (this.timers && this.timers.length) return true;
      for (const b of this.beans) {
        if (!b.alive) { if (b.drowning && b.sinkT > 0) return true; continue; }
        if (!(b.st === 'idle' || b.st === 'walk')) return true;
      }
      return false;
    }
    weaponBusy() {
      return this.objs.some(o => !o.dead && o.weapon) || (this.timers && this.timers.length > 0);
    }

    // ---------- main tick ----------
    step() {
      this.t++;
      this.processActs();
      if (this.timers) {
        for (const tm of this.timers) tm.t--;
        const due = this.timers.filter(t => t.t <= 0); this.timers = this.timers.filter(t => t.t > 0);
        for (const t of due) t.fn();
      }
      const b = this.cb;
      if (this.team && this.team.ctrl === 'cpu' && b && (this.phase === 'turn' || this.phase === 'firing' || this.phase === 'retreat')) {
        if (!this.ai) this.ai = B.AI.controller(this, b);
        this.ai.tick();
      }
      switch (this.phase) {
        case 'start':
          if (--this.timer <= 0) { this.phase = 'turn'; this.timer = this.cfg.turnTime * 60; }
          break;
        case 'turn':
          if (this.charging) {
            this.power += 1 / 95;
            if (this.power >= 1) { this.power = 1; this.releaseCharge(b); }
          }
          if (--this.timer <= 0) { this.txt(b.x, b.y - 30, "Time's up!", '#fff'); this.endTurnNow(); }
          else if (this.curHurt) this.endTurnNow();
          else if (this.timer === 300 || this.timer === 240 || this.timer === 180 || this.timer === 120 || this.timer === 60) this.snd('tick');
          if (this.shotsLeft > 0 && this.phase === 'turn' && this.timer > 0) { /* shotgun: second shot allowed */ }
          break;
        case 'firing':
          if (!this.weaponBusy()) {
            if (this.curHurt || !b || !b.alive) this.endTurnNow();
            else if (this.shotsLeft > 0) this.phase = 'turn';
            else { this.phase = 'retreat'; this.timer = 180; }
          }
          break;
        case 'retreat':
          if (--this.timer <= 0 || this.curHurt) this.endTurnNow();
          break;
        case 'settle':
          this.settleT++;
          if (!this.worldBusy() || this.settleT > 900) {
            const dying = this.beans.find(x => x.alive && x.hp <= 0 && !x.drowning);
            if (dying) { this.phase = 'deaths'; this.dying = dying.id; this.timer = 55; this.ev({ t: 'dying', id: dying.id }); this.txt(dying.x, dying.y - 26, B.pick(['Bye bye!', 'Oh beans…', 'Spilt!', 'Nooo!', 'Tin time…']), '#fff'); }
            else this.nextTurn();
          }
          break;
        case 'deaths': {
          const d = this.beans.find(x => x.id === this.dying);
          if (--this.timer <= 0) {
            if (d && d.alive) {
              d.alive = false; d.st = 'dead'; d.hp = 0;
              this.explode(d.x, d.y, 26, 15);
              this.objs.push({ id: B.uid(), k: 'grave', x: d.x, y: d.y - 4, vx: 0, vy: -2, r: 8, team: d.team, rest: false });
            }
            this.phase = 'settle'; this.settleT = 0;
          }
          break;
        }
      }
      this.updateBeans();
      this.updateObjs();
      this.objs = this.objs.filter(o => !o.dead);
      if (this.phase === 'turn' && b && b.st === 'jet' && this.jetFuel <= 0) { b.st = 'air'; b.fallY = b.y; }
    }

    updateBeans() {
      const T = this.T, cur = this.cb, inp = this.input;
      const ctlPhase = this.phase === 'turn' || this.phase === 'retreat';
      for (const b of this.beans) {
        if (b.hurt > 0) b.hurt--;
        if (!b.alive) {
          if (b.drowning && b.sinkT > 0) { b.sinkT--; b.y += 0.7; }
          continue;
        }
        const isCur = cur && b.id === cur.id && ctlPhase;
        if (b.st === 'walk') b.st = 'idle';
        if (b.st === 'idle') {
          if (!T.circleHit(b.x, b.y + 2, BR)) { b.st = 'air'; b.vx = 0; b.vy = 0; b.fallY = b.y; }
          else if (isCur && !this.charging) {
            if (inp.u && !this.isGirder()) b.aim = Math.max(-Math.PI / 2, b.aim - 0.028);
            if (inp.d && !this.isGirder()) b.aim = Math.min(Math.PI / 2, b.aim + 0.028);
            const dir = inp.l ? -1 : inp.r ? 1 : 0;
            if (dir) {
              if (b.facing !== dir) { b.facing = dir; b.walkAcc = -6; }
              b.walkAcc = (b.walkAcc || 0) + 1;
              if (b.walkAcc >= 1) { b.walkAcc -= 1; this.walk(b, dir, BR, 7); }
              b.st = b.st === 'air' ? 'air' : 'walk';
            }
          } else if (isCur && this.charging) {
            if (inp.u) b.aim = Math.max(-Math.PI / 2, b.aim - 0.02);
            if (inp.d) b.aim = Math.min(Math.PI / 2, b.aim + 0.02);
          }
          if (this.isGirder() && isCur) { if (inp.u) this.girderAng -= 0.03; if (inp.d) this.girderAng += 0.03; }
        } else if (b.st === 'air' || b.st === 'fly') {
          if (b.punching > 0) b.punching--;
          const h = physStep(T, b, BR, b.st === 'fly' ? 0.35 : 0.15, b.st === 'fly' ? 0.82 : 0.6, G);
          if (Math.abs(b.x - (b.px || 0)) + Math.abs(b.y - (b.py || 0)) < 0.25) { b.stuckT = (b.stuckT || 0) + 1; if (b.stuckT > 30) { b.st = 'idle'; b.vx = b.vy = 0; b.stuckT = 0; } } else b.stuckT = 0;
          b.px = b.x; b.py = b.y;
          if (h) {
            if (b.st === 'air' && h.vn > FALL_SAFE && b.y - b.fallY > 40) {
              this.damage(b, Math.round((h.vn - FALL_SAFE) * 7) + 4, null);
              if (b.id === this.curBean && ['turn', 'firing', 'retreat'].includes(this.phase)) this.curHurt = true;
            }
            if (h.ny < -0.45 && Math.hypot(b.vx, b.vy) < (b.st === 'fly' ? 1.1 : 2.2)) { b.vx = 0; b.vy = 0; b.st = 'idle'; }
            else if (b.st === 'air' && h.ny < -0.6) { b.vx *= 0.3; b.vy = 0; b.st = 'idle'; }
          }
        } else if (b.st === 'chute') {
          b.vy = Math.min(b.vy, 1.3);
          b.vx += (this.wind * 2.2 - b.vx) * 0.03;
          const h = physStep(T, b, BR, 0.05, 0.5, 0.03);
          if (h && h.ny < -0.3) { b.vx = 0; b.vy = 0; b.st = 'idle'; }
          if (Math.abs(b.x - (b.px || 0)) + Math.abs(b.y - (b.py || 0)) < 0.2) { if (++b.stuckT > 30) { b.st = 'idle'; b.vx = b.vy = 0; b.stuckT = 0; } } else b.stuckT = 0;
          b.px = b.x; b.py = b.y;
          if (isCur && (inp.l || inp.r)) b.vx += inp.l ? -0.03 : 0.03;
        } else if (b.st === 'jet') {
          let th = 0;
          if (isCur || this.phase === 'turn') {
            if (inp.u) { b.vy -= 0.36; th = 1; }
            if (inp.l) { b.vx -= 0.1; th = 1; b.facing = -1; }
            if (inp.r) { b.vx += 0.1; th = 1; b.facing = 1; }
            if (inp.d) b.vy += 0.05;
          }
          if (th) this.jetFuel--;
          b.thrust = th;
          b.vx = B.clamp(b.vx * 0.99, -4, 4); b.vy = B.clamp(b.vy, -4, 7);
          const h = physStep(T, b, BR, 0.1, 0.7, G);
          if (h && h.ny < -0.4) { b.vy = Math.min(b.vy, 0); b.vx *= 0.6; }
          if (this.phase !== 'turn' && this.phase !== 'retreat') { b.st = 'air'; b.fallY = b.y; }
        } else if (b.st === 'rope') {
          const R = this.rope;
          if (!R) { b.st = 'air'; b.fallY = b.y; continue; }
          b.vy += G;
          if (isCur) {
            if (inp.l) { b.vx -= 0.11; b.facing = -1; }
            if (inp.r) { b.vx += 0.11; b.facing = 1; }
            if (inp.u) R.len = Math.max(18, R.len - 2.6);
            if (inp.d) R.len = Math.min(440, R.len + 2.6);
          }
          const sp = Math.hypot(b.vx, b.vy); if (sp > 13) { b.vx *= 13 / sp; b.vy *= 13 / sp; }
          const ox = b.x, oy = b.y;
          b.x += b.vx; b.y += b.vy;
          let dx = b.x - R.ax, dy = b.y - R.ay, d = Math.hypot(dx, dy) || 1;
          if (d > R.len) {
            b.x = R.ax + dx / d * R.len; b.y = R.ay + dy / d * R.len;
            const vr = (b.vx * dx + b.vy * dy) / d;
            if (vr > 0) { b.vx -= vr * dx / d; b.vy -= vr * dy / d; }
          }
          const h = T.circleHit(b.x, b.y, BR);
          if (h) {
            const vn = b.vx * h.nx + b.vy * h.ny;
            if (vn < 0) { b.vx -= 1.4 * vn * h.nx; b.vy -= 1.4 * vn * h.ny; }
            b.vx *= 0.9; b.vy *= 0.9;
            let k = 0; while (T.circleHit(b.x, b.y, BR) && k < 8) { b.x += h.nx; b.y += h.ny; k++; }
            if (T.circleHit(b.x, b.y, BR)) { b.x = ox; b.y = oy; }
          }
          dx = b.x - R.ax; dy = b.y - R.ay;
          b.ropeAng = Math.atan2(-dx, dy);
          if (!this.T.solid(R.ax + R.nx, R.ay + R.ny) && !this.T.circleHit(R.ax, R.ay, 3)) { this.releaseRope(b); }
        }
        // water / bounds
        if (b.y > this.waterY + 4 || b.x < -300 || b.x > B.WORLD_W + 300) this.drown(b);
        // crate pickup
        if (b.alive) for (const o of this.objs) {
          if (o.k === 'crate' && !o.dead && Math.abs(o.x - b.x) < 18 && Math.abs(o.y - b.y) < 20) {
            o.dead = true;
            if (o.ctype === 'health') { b.hp += 25; this.ev({ t: 'heal', id: b.id, n: 25 }); this.snd('crate'); }
            else {
              const w = B.pick(B.CRATE_WEAPONS, this.rand); const t = this.teams[b.team];
              if (t.ammo[w] >= 0) t.ammo[w]++;
              this.txt(b.x, b.y - 30, B.WEAPONS[w].name + '!', '#ffd23f', true); this.snd('crate');
            }
          }
        }
        // mine proximity
        if (b.alive) for (const o of this.objs) {
          if (o.k === 'mine' && o.fuse < 0 && !o.dead && this.t > 60 && Math.abs(o.x - b.x) < 30 && Math.abs(o.y - b.y) < 30) {
            o.fuse = 120; this.snd('beep'); this.txt(o.x, o.y - 16, '!', '#ff3030', true);
          }
        }
      }
    }

    isGirder() { return this.weapon === 'girder'; }

    walk(o, dir, r, lift) {
      const T = this.T, nx = o.x + dir;
      for (let up = 0; up <= lift; up++) {
        if (!T.circleHit(nx, o.y - up, r)) {
          o.x = nx; o.y -= up;
          let down = 0;
          while (down < lift + 1 && !T.circleHit(o.x, o.y + 1, r)) { o.y++; down++; }
          if (down > lift) { o.st = o.st === undefined ? undefined : 'air'; o.vx = dir * 0.6; o.vy = 0; o.fallY = o.y; o.air = true; }
          return true;
        }
      }
      return false;
    }

    drown(b) {
      if (!b.alive) return;
      b.alive = false; b.drowning = true; b.sinkT = 90; b.hp = 0; b.st = 'drown';
      this.ev({ t: 'splash', x: b.x, y: this.waterY, big: true });
      this.txt(b.x, this.waterY - 30, B.pick(['Glub glub…', 'Soggy bean!', 'Sinking!', 'Bean soup…']), '#bfe6ff');
      this.snd('splash');
      if (b.id === this.curBean && ['turn', 'firing', 'retreat', 'start'].includes(this.phase)) { this.curHurt = true; if (this.phase !== 'firing') this.endTurnNow(); }
    }

    updateObjs() {
      const T = this.T;
      for (const o of this.objs) {
        if (o.dead) continue;
        switch (o.k) {
          case 'proj': {
            if (o.wait > 0) { o.wait--; o.hidden = true; break; }
            o.hidden = false;
            o.age++;
            if (o.homing && o.age > 35 && o.age < 260) {
              const dx = o.homing[0] - o.x, dy = o.homing[1] - o.y, l = Math.hypot(dx, dy) || 1;
              o.vx += (dx / l * 8 - o.vx) * 0.07; o.vy += (dy / l * 8 - o.vy) * 0.07 - G;
              o.wind = false;
              if (o.age % 4 === 0) this.ev({ t: 'trail', x: o.x, y: o.y, c: 'spark' });
            } else if (o.homing && o.age >= 260) o.wind = true;
            const r = B.projStep(T, o, this.wind, this.beans, this.waterY);
            if (o.impact) o.a = Math.atan2(o.vy, o.vx); else o.a += o.vx * 0.12;
            if (o.impact && o.age % 2 === 0) this.ev({ t: 'trail', x: o.x, y: o.y, c: 'smoke' });
            if (o.fuse > 0) {
              o.fuse--;
              if (o.w === 'bonnet' && o.fuse === 50) this.txt(o.x, o.y - 24, 'IRIE!', '#ffd23f', true);
              if (o.fuse === 0) { this.explodeObj(o); break; }
            }
            if (o.bounced && !o.impact && o.lastB !== o.bounced) { o.lastB = o.bounced; this.snd('bounce'); }
            if (r === 'hitT' || r === 'hitB') this.explodeObj(o);
            else if (r === 'water') { o.dead = true; this.ev({ t: 'splash', x: o.x, y: this.waterY }); this.snd('splash'); }
            else if (r === 'out') o.dead = true;
            break;
          }
          case 'hook': {
            const b = this.beans.find(x => x.id === o.owner);
            const n = 6;
            let attached = false;
            for (let i = 0; i < n; i++) {
              o.x += o.vx / n; o.y += o.vy / n;
              if (T.solid(o.x, o.y)) { attached = true; break; }
            }
            if (attached && b && b.alive) {
              o.dead = true;
              const d = Math.hypot(b.x - o.x, b.y - o.y);
              const l = Math.hypot(o.vx, o.vy);
              this.rope = { ax: o.x - o.vx / l * 1, ay: o.y - o.vy / l * 1, len: Math.max(18, d), nx: o.vx / l * 3, ny: o.vy / l * 3 };
              if (b.st !== 'rope') { if (b.st === 'idle' || b.st === 'walk') { b.vx = 0; b.vy = 0; } b.st = 'rope'; }
              this.snd('thunk');
            } else if (!b || Math.hypot(o.x - b.x, o.y - b.y) > 420 || o.y > this.waterY) o.dead = true;
            break;
          }
          case 'goat': this.goatStep(o); break;
          case 'coco': {
            o.age++; o.a += 0.1;
            o.vy = Math.min(o.vy + G * 1.3, 11);
            const n = Math.ceil(o.vy / 2);
            if (o.cool > 0) o.cool--;
            for (let i = 0; i < n; i++) {
              o.y += o.vy / n;
              if (o.cool > 0) continue;
              let hit = T.circleHit(o.x, o.y, 12);
              if (!hit) for (const b of this.beans) if (b.alive && !b.drowning && Math.hypot(b.x - o.x, b.y - o.y) < 22) hit = true;
              if (hit) {
                this.explode(o.x, o.y + 6, 58, 50); o.count++; o.vy = 1.5; o.cool = 5;
                if (o.count >= 14) o.dead = true;
                break;
              }
            }
            if (o.y > this.waterY) { o.dead = true; this.ev({ t: 'splash', x: o.x, y: this.waterY, big: true }); this.snd('splash'); }
            break;
          }
          case 'plane': o.x += o.vx; o.age++; if (o.age > 400) o.dead = true; break;
          case 'mine': case 'drum': case 'grave': case 'crate': {
            if (o.k === 'crate' && o.chute && !o.rest) { o.vy = Math.min(o.vy, 1.6); o.vx += (this.wind * 1.5 - o.vx) * 0.02; }
            if (o.rest) { if (this.t % 6 === 0 && !T.circleHit(o.x, o.y + 2, o.r)) o.rest = false; }
            if (!o.rest) {
              const h = physStep(T, o, o.r, o.k === 'grave' ? 0.2 : 0.3, 0.75, o.k === 'crate' && o.chute ? 0.04 : G);
              if (h && h.ny < -0.4 && Math.hypot(o.vx, o.vy) < 0.8) { o.vx = 0; o.vy = 0; o.rest = true; if (o.k === 'crate') o.chute = false; }
              if (Math.abs(o.x - (o.px || 0)) + Math.abs(o.y - (o.py || 0)) < 0.2) { if (++o.stuckT > 30) { o.vx = o.vy = 0; o.rest = true; o.stuckT = 0; if (o.k === 'crate') o.chute = false; } } else o.stuckT = 0;
              o.px = o.x; o.py = o.y;
            }
            if (o.fuse > 0) { o.fuse--; if (o.fuse === 0) { o.dead = true; if (o.k === 'mine') this.explode(o.x, o.y, 48, 45); else { this.explode(o.x, o.y, 70, 50); this.ev({ t: 'fire', x: o.x, y: o.y }); } } }
            if (o.y > this.waterY + 6) { o.dead = true; this.ev({ t: 'splash', x: o.x, y: this.waterY }); }
            if (o.x < -200 || o.x > B.WORLD_W + 200) o.dead = true;
            break;
          }
        }
      }
    }

    goatStep(o) {
      const T = this.T, r = 7;
      o.age++;
      o.hidden = o.age < 0;
      if (o.age < 0) return;
      if (o.age > o.life) { this.explodeObj(o); return; }
      if (o.mad) for (const b of this.beans) if (b.alive && !b.drowning && b.id !== o.owner && Math.hypot(b.x - o.x, b.y - o.y) < 16) { this.explodeObj(o); return; }
      if (!o.air) {
        if (!T.circleHit(o.x, o.y + 2, r)) { o.air = true; o.vx = o.dir * 1; o.vy = 0; }
        else {
          const moved = this.walk(o, o.dir, r, 7) && this.walk(o, o.dir, r, 7);
          if (!moved) {
            o.blocked++;
            if (o.mad) { this.explodeObj(o); return; }
            o.vy = -4.6; o.vx = o.dir * 1.8; o.air = true;
            if (o.blocked > 3) { o.dir = -o.dir; o.blocked = 0; }
          } else if (o.age % 80 === 40 && !o.mad) { o.vy = -3.4; o.vx = o.dir * 2; o.air = true; this.snd('bleat'); }
        }
      } else {
        const h = physStep(T, o, r, 0.2, 0.9, G);
        if (h && h.ny < -0.4 && o.vy >= -0.5) { o.vx = 0; o.vy = 0; o.air = false; }
        if (Math.abs(o.x - (o.px || 0)) + Math.abs(o.y - (o.py || 0)) < 0.2) { if (++o.stuckT > 20) { o.air = false; o.vx = o.vy = 0; o.stuckT = 0; } } else o.stuckT = 0;
        o.px = o.x; o.py = o.y;
      }
      if (o.y > this.waterY) { o.dead = true; this.ev({ t: 'splash', x: o.x, y: this.waterY }); this.snd('splash'); }
      if (o.x < -100 || o.x > B.WORLD_W + 100) o.dead = true;
    }

    focus() {
      for (const o of this.objs) if (!o.dead && !o.hidden && (o.k === 'proj' || o.k === 'goat' || o.k === 'coco') && o.age >= 0) return [o.x, o.y];
      if (this.phase === 'deaths') { const d = this.beans.find(x => x.id === this.dying); if (d) return [d.x, d.y]; }
      if (this.phase === 'settle') {
        let best = null, bs = 0.5;
        for (const b of this.beans) if (b.alive && !(b.st === 'idle' || b.st === 'walk')) { const s = Math.hypot(b.vx, b.vy) + 1; if (s > bs) { bs = s; best = b; } }
        if (best) return [best.x, best.y];
        return null;
      }
      const c = this.cb; if (c) return [c.x, c.y];
      return null;
    }

    // Compact view for rendering & networking
    view() {
      const r1 = (v) => Math.round(v * 10) / 10;
      const team = this.team;
      return {
        t: this.t, ph: this.phase, tm: Math.ceil(Math.max(0, this.timer) / 60), wind: r1(this.wind * 100) / 100, wy: this.waterY, rd: this.round, sd: this.sd,
        ct: this.curTeam, cb: this.curBean, ctl: this.controller(),
        w: this.weapon, pw: Math.round(this.power * 100) / 100, ch: this.charging, fz: this.fuse, tg: this.target, ga: Math.round(this.girderAng * 100) / 100, sl: this.shotsLeft,
        jf: this.jetUsed ? Math.max(0, this.jetFuel) : -1,
        am: team ? team.ammo : null, out: this.teams.map(t => t.out ? 1 : 0),
        bs: this.beans.map(b => [b.id, r1(b.x), r1(b.y), Math.max(0, b.hp), b.facing, Math.round(b.aim * 100) / 100, b.st, b.alive ? 1 : 0, r1(b.vx), b.thrust ? 1 : 0, Math.round((b.ropeAng || 0) * 100) / 100, b.hurt]),
        os: this.objs.filter(o => !o.hidden).map(o => [o.id, o.k, r1(o.x), r1(o.y), Math.round((o.a || 0) * 100) / 100, o.w || o.ctype || (o.k === 'goat' ? o.dir * (o.mad ? 2 : 1) : o.team != null ? o.team : ''), o.fuse > 0 ? Math.ceil(o.fuse / 60) : 0, o.chute ? 1 : 0]),
        rope: this.rope ? [r1(this.rope.ax), r1(this.rope.ay)] : null,
        fc: this.focus(), win: this.winner,
      };
    }
  }
  B.pick = (arr, rand) => arr[Math.floor((rand || Math.random)() * arr.length)];
  B.Sim = Sim;
})();
