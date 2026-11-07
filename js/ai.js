'use strict';
// ---------- CPU bean brains ----------
(function () {
  const { BR } = B.PHYS;
  const NOISE = { easy: [0.16, 0.14], normal: [0.05, 0.05], hard: [0.012, 0.012] };

  function estDamage(x, y, rad, dmg, b) {
    const d = Math.hypot(b.x - x, b.y - y), eff = Math.max(0, d - BR * 0.6);
    if (eff >= rad) return 0;
    return Math.max(1, dmg * (1 - eff / rad));
  }

  function scoreBlast(sim, me, x, y, rad, dmg, waterBonusDir) {
    let s = 0;
    for (const b of sim.beans) {
      if (!b.alive || b.drowning) continue;
      const d = estDamage(x, y, rad, dmg, b);
      if (!d) continue;
      if (b.team === me.team) s -= (b.id === me.id ? 2.2 : 1.4) * Math.min(d, b.hp) + (d >= b.hp ? 40 : 0);
      else {
        s += Math.min(d, b.hp) + (d >= b.hp ? 30 : 0);
        // bonus when enemy is near the water or the map edge
        if (b.y > sim.waterY - 120) s += 8;
      }
    }
    return s;
  }

  function predict(sim, me, w, facing, aim, power, fuseSec) {
    const d = B.PROJ_DEF[w];
    const ang = facing > 0 ? aim : Math.PI - aim;
    const sp = 13.5 * power;
    const p = Object.assign({ x: me.x + Math.cos(ang) * 12, y: me.y - 2 + Math.sin(ang) * 12, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, owner: me.id, age: 0, bounce: 0, fuse: -1 }, d);
    if (d.fuse) p.fuse = fuseSec * 60;
    if (d.fixedFuse) p.fuse = d.fixedFuse;
    for (let i = 0; i < 520; i++) {
      p.age++;
      const r = B.projStep(sim.T, p, sim.wind, sim.beans, sim.waterY);
      if (p.fuse > 0 && --p.fuse === 0) return p;
      if (r === 'hitT' || r === 'hitB') return p;
      if (r) return null;
    }
    return null;
  }

  function* planner(sim, me, budget) {
    const tired = () => performance.now() > budget.until;
    const team = sim.teams[me.team];
    const enemies = sim.beans.filter(b => b.alive && !b.drowning && b.team !== me.team);
    let best = { score: 4, kind: 'skip' };
    const consider = (c) => { if (c.score > best.score) best = c; };

    // melee & close range
    for (const e of enemies) {
      const dx = e.x - me.x, dy = e.y - me.y;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 20) {
        const f = dx >= 0 ? 1 : -1;
        const nearWater = e.y > sim.waterY - 220;
        if (sim.canUse('bat')) consider({ kind: 'melee', w: 'bat', facing: f, aim: nearWater ? -0.2 : -0.7, score: Math.min(30, e.hp) + (e.hp <= 30 ? 30 : 0) + (nearWater ? 25 : 5) });
        consider({ kind: 'melee', w: 'punch', facing: f, aim: 0, score: Math.min(30, e.hp) + (e.hp <= 30 ? 30 : 0) });
      }
      if (Math.abs(dx) < 45 && Math.abs(dy) < 25 && sim.canUse('dynamite')) {
        consider({ kind: 'drop', w: 'dynamite', facing: dx >= 0 ? 1 : -1, score: scoreBlast(sim, { ...me, x: me.x + 999 }, e.x, e.y, 80, 75) * 0.8, flee: dx >= 0 ? -1 : 1 });
      }
    }
    yield;
    // shotgun line of sight
    for (const e of enemies) {
      const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy);
      if (d > 650) continue;
      const ang = Math.atan2(dy, dx);
      let clear = true;
      for (let s = 14; s < d - BR; s += 3) { if (sim.T.solid(me.x + Math.cos(ang) * s, me.y - 2 + Math.sin(ang) * s)) { clear = false; break; } }
      if (!clear) continue;
      const facing = dx >= 0 ? 1 : -1;
      const aim = facing > 0 ? ang : Math.PI - ang;
      const aimN = Math.atan2(Math.sin(aim), Math.cos(aim));
      if (aimN < -Math.PI / 2 || aimN > Math.PI / 2) continue;
      consider({ kind: 'shotgun', w: 'shotgun', facing, aim: aimN, score: Math.min(50, e.hp) * 0.9 + (e.hp <= 50 ? 25 : 0) });
    }
    yield;
    // airstrike on exposed targets
    if (sim.canUse('airstrike')) {
      for (const e of enemies) {
        let roof = false;
        for (let y = e.y - 20; y > e.y - 400 && y > 0; y -= 4) if (sim.T.solid(e.x, y)) { roof = true; break; }
        if (roof) continue;
        let s = 0;
        for (let i = -2; i <= 2; i++) s += scoreBlast(sim, me, e.x + i * 28, e.y, 32, 30) * 0.45;
        consider({ kind: 'target', w: 'airstrike', tx: e.x, ty: e.y, score: s });
      }
    }
    yield;
    // ballistic search
    const weapons = ['bazooka', 'grenade'];
    if (sim.canUse('cluster')) weapons.push('cluster');
    if (sim.canUse('plantain')) weapons.push('plantain');
    if (sim.canUse('bonnet')) weapons.push('bonnet');
    let n = 0;
    for (const w of weapons) {
      const d = B.PROJ_DEF[w];
      const fuses = w === 'grenade' ? [2, 3] : d.fuse ? [3] : [3];
      const value = w === 'bazooka' || w === 'grenade' ? 1 : 0.8;
      const da = d.impact ? 0.06 : 0.09, dk = d.impact ? 5 : 7;
      for (const facing of [1, -1]) for (const fz of fuses) {
        for (let aim = -1.5; aim <= 1.0; aim += da) {
          for (let k = 26; k <= 95; k += dk) {
            const power = k / 95;
            const p = predict(sim, me, w, facing, aim, power, fz);
            if (p) {
              const s = scoreBlast(sim, me, p.x, p.y, d.rad, d.dmg) * value;
              if (s > 0) consider({ kind: 'power', w, facing, aim, power: k / 95, fuse: fz, score: s, hit: [p.x, p.y] });
            }
            if (tired()) yield;
          }
        }
      }
    }
    // homing missile if nothing great
    if (best.score < 25 && sim.canUse('homing') && enemies.length) {
      const e = enemies.reduce((a, b) => Math.hypot(a.x - me.x, a.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? a : b);
      const f = e.x >= me.x ? 1 : -1;
      consider({ kind: 'power', w: 'homing', facing: f, aim: -0.9, power: 0.6, score: 26, tx: e.x, ty: e.y });
    }
    return best;
  }

  B.AI = {
    controller(sim, me) {
      const lvl = sim.team.cpu || 'normal';
      const noise = NOISE[lvl] || NOISE.normal;
      let gen = null, plan = null, stage = 'think', wait = 40, walkT = 0, tries = 0, fleeT = 0;
      const budget = { until: 0 };
      const held = { l: 0, r: 0, u: 0, d: 0 };
      const push = (a) => sim.pushAct(a);
      const ctl = {
        tick() {
          const b = sim.cb;
          if (!b || b.id !== me.id || !b.alive) { sim.setHeld({}); return; }
          held.l = held.r = held.u = held.d = 0;
          if (sim.phase === 'retreat') {
            if (plan && plan.flee) { if (plan.flee < 0) held.l = 1; else held.r = 1; if (fleeT++ % 50 === 0) push({ a: 'jump' }); }
            sim.setHeld(held); return;
          }
          if (sim.phase !== 'turn') { sim.setHeld(held); return; }
          if (wait > 0) { wait--; sim.setHeld(held); return; }
          if (stage === 'think') {
            if (!gen) gen = planner(sim, me, budget);
            budget.until = performance.now() + 4;
            const r = gen.next();
            if (r.done) {
              plan = r.value; gen = null;
              if (plan.kind === 'skip' && tries < 1) {
                // walk toward nearest enemy, then think again
                const en = sim.beans.filter(x => x.alive && x.team !== me.team);
                if (en.length) {
                  const e = en.reduce((a, c) => Math.abs(a.x - me.x) < Math.abs(c.x - me.x) ? a : c);
                  plan = { kind: 'walk', dir: e.x > me.x ? 1 : -1 };
                  walkT = 150; tries++; stage = 'walk';
                }
              } else if (plan.kind === 'skip') {
                plan = { kind: 'power', w: 'bazooka', facing: me.facing, aim: -0.8, power: 0.7, score: 0 };
                stage = 'prep';
              } else stage = 'prep';
              if (plan.aim != null) { plan.aim += (Math.random() - 0.5) * 2 * noise[0]; plan.aim = B.clamp(plan.aim, -Math.PI / 2, Math.PI / 2); }
              if (plan.power != null) { plan.power = B.clamp(plan.power + (Math.random() - 0.5) * 2 * noise[1], 0.15, 1); }
              if (plan.tx != null) { plan.tx += (Math.random() - 0.5) * noise[0] * 300; }
              wait = 15;
            }
          } else if (stage === 'walk') {
            if (plan.dir < 0) held.l = 1; else held.r = 1;
            if (walkT % 45 === 0) {
              // jump if blocked
              if (me.lastX != null && Math.abs(me.lastX - me.x) < 2) push({ a: 'jump' });
              me.lastX = me.x;
            }
            if (--walkT <= 0 || me.y > sim.waterY - 40) { stage = 'think'; wait = 20; }
          } else if (stage === 'prep') {
            if (sim.weapon !== plan.w) { push({ a: 'weapon', v: plan.w }); wait = 12; }
            else if (plan.fuse && sim.fuse !== plan.fuse) push({ a: 'fuse', v: plan.fuse });
            else if (plan.facing && me.facing !== plan.facing) { if (plan.facing < 0) held.l = 1; else held.r = 1; }
            else if (plan.aim != null && Math.abs(me.aim - plan.aim) > 0.03) { if (me.aim > plan.aim) held.u = 1; else held.d = 1; }
            else stage = 'fire';
          } else if (stage === 'fire') {
            if (plan.kind === 'power') {
              if (plan.w === 'homing' && !sim.target) { push({ a: 'target', x: plan.tx, y: plan.ty }); }
              else if (!sim.charging) { push({ a: 'fireDown' }); stage = 'charging'; }
            } else if (plan.kind === 'target') { push({ a: 'target', x: plan.tx, y: plan.ty }); stage = 'done'; }
            else if (plan.kind === 'shotgun') { push({ a: 'fireDown' }); push({ a: 'fireUp' }); stage = 'shot2'; wait = 70; }
            else { push({ a: 'fireDown' }); push({ a: 'fireUp' }); stage = 'done'; }
          } else if (stage === 'charging') {
            if (sim.power >= plan.power - 1e-6 || !sim.charging) { push({ a: 'fireUp' }); stage = 'done'; }
          } else if (stage === 'shot2') {
            if (sim.shotsLeft > 0) { push({ a: 'fireDown' }); push({ a: 'fireUp' }); }
            stage = 'done';
          }
          sim.setHeld(held);
        }
      };
      return ctl;
    }
  };
})();
