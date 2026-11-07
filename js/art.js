'use strict';
// ---------- Cartoon drawing routines ----------
(function () {
  const A = B.Art = {};
  const OUT = '#1d1410';

  function beanPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0.5, -12.5);
    ctx.bezierCurveTo(7.5, -12.5, 9.6, -5, 8.8, 1);
    ctx.bezierCurveTo(8, 8, 4, 11.5, -0.5, 11.5);
    ctx.bezierCurveTo(-6.5, 11.5, -9.2, 7, -8.6, 1.5);
    ctx.bezierCurveTo(-8.2, -1.5, -5, -2.5, -5.6, -6);
    ctx.bezierCurveTo(-6.2, -10.5, -4, -12.5, 0.5, -12.5);
    ctx.closePath();
  }
  A.beanPath = beanPath;

  // b: {x,y,type,facing,aim,state,t,id,hp,active,blink, weapon}
  A.bean = function (ctx, b, time) {
    const T = B.beanType(b.type);
    const f = b.facing || 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    let sx = 1, sy = 1, rot = 0, bob = 0;
    const st = b.state;
    if (st === 'walk') { const p = Math.sin(time * 0.35 + b.id); sy = 1 + p * 0.07; sx = 1 - p * 0.05; bob = -Math.abs(p) * 2; }
    else if (st === 'air' || st === 'jet') { sy = 1.06; sx = 0.95; rot = B.clamp((b.vx || 0) * 0.06, -0.5, 0.5); }
    else if (st === 'fly') { rot = time * 0.3 * f; }
    else if (st === 'idle') { const p = Math.sin(time * 0.05 + b.id * 3); sy = 1 + p * 0.025; sx = 1 - p * 0.02; }
    else if (st === 'rope') { rot = (b.ropeAng || 0); }
    ctx.translate(0, bob);
    ctx.rotate(rot);
    ctx.scale(f * sx, sy);

    // jetpack behind
    if (st === 'jet') A.jetpack(ctx, b.thrust, time);

    // shadowed body
    beanPath(ctx);
    const g = ctx.createLinearGradient(-8, -10, 8, 10);
    g.addColorStop(0, T.hi); g.addColorStop(0.45, T.body); g.addColorStop(1, T.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    if (T.speckle) {
      ctx.fillStyle = T.speckle;
      const r = B.rng(b.id * 977 + 5);
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse(r.range(-8, 8), r.range(-11, 11), r.range(0.8, 2.2), r.range(0.6, 1.4), r() * 3, 0, B.TAU); ctx.fill(); }
    }
    if (T.eyeSpot) { ctx.fillStyle = T.eyeSpot; ctx.beginPath(); ctx.ellipse(-5.5, -3, 3.4, 4.2, 0.2, 0, B.TAU); ctx.fill(); ctx.fillStyle = '#c4473a'; ctx.beginPath(); ctx.ellipse(-5.5, -3, 1.2, 1.6, 0.2, 0, B.TAU); ctx.fill(); }
    if (T.crease) { ctx.strokeStyle = 'rgba(30,15,5,0.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-1, -12); ctx.bezierCurveTo(-3, -4, 1, 4, -1, 12); ctx.stroke(); }
    ctx.fillStyle = T.glossy ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(-2, -8, 2.2, 3.5, -0.4, 0, B.TAU); ctx.fill();
    if (b.hurt > 0) { ctx.fillStyle = `rgba(255,255,255,${b.hurt / 20})`; ctx.fillRect(-12, -14, 24, 28); }
    if (b.frozen) { ctx.fillStyle = 'rgba(150,210,255,0.4)'; ctx.fillRect(-12, -14, 24, 28); }
    ctx.restore();
    beanPath(ctx); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();

    // eyes look along aim
    const aimA = b.aim || 0; // -PI/2 up ... +PI/2 down, in facing space
    const lx = Math.cos(aimA) * 1.4, ly = Math.sin(aimA) * 1.4;
    const blink = b.blink;
    for (const [ex, ey, er] of [[2.2, -6.5, 3.3], [6.6, -5.5, 2.9]]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, B.TAU); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = OUT; ctx.stroke();
      if (blink) { ctx.fillStyle = T.body; ctx.beginPath(); ctx.arc(ex, ey, er, 0, B.TAU); ctx.fill(); ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(ex - er, ey); ctx.lineTo(ex + er, ey); ctx.stroke(); }
      else if (st === 'fly' || b.dizzy) { ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex - 1.5, ey - 1.5); ctx.lineTo(ex + 1.5, ey + 1.5); ctx.moveTo(ex + 1.5, ey - 1.5); ctx.lineTo(ex - 1.5, ey + 1.5); ctx.stroke(); }
      else { ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(ex + lx, ey + ly, er * 0.45, 0, B.TAU); ctx.fill(); }
    }
    // mouth
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath();
    if (b.hp < 30 || st === 'fly') { ctx.arc(4.5, 2.5, 1.8, Math.PI * 1.1, Math.PI * 1.9); }
    else { ctx.arc(4.5, -0.5, 2.2, 0.25, Math.PI - 0.6); }
    ctx.stroke();
    // little cheeks
    ctx.fillStyle = 'rgba(255,120,120,0.35)'; ctx.beginPath(); ctx.arc(7.2, -1, 1.5, 0, B.TAU); ctx.fill();

    // held weapon (unscaled direction)
    if (b.weapon && (st === 'idle' || st === 'aim')) A.held(ctx, b.weapon, aimA);
    ctx.restore();

    // parachute above (world aligned)
    if (st === 'chute') A.parachute(ctx, b.x, b.y - 14, T.team, time);
  };

  A.held = function (ctx, w, aim) {
    ctx.save();
    ctx.translate(2, 2);
    ctx.rotate(aim);
    const icon = B.WEAPONS[w] && B.WEAPONS[w].icon;
    if (icon === 'bazooka' || icon === 'homing') {
      ctx.fillStyle = icon === 'homing' ? '#3d6fd6' : '#5b6b3a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(-6, -3, 22, 6, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.fillRect(14, -3.5, 3, 7);
    } else if (icon === 'shotgun') {
      ctx.fillStyle = '#6b3f1f'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(-5, -1, 9, 4, 1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#444'; ctx.fillRect(3, -2, 15, 3); ctx.strokeRect(3, -2, 15, 3);
    } else if (icon === 'bat') {
      ctx.rotate(-0.8); ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(18, -3.5); ctx.lineTo(18, 3.5); ctx.lineTo(0, 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (icon && A.icons[icon] && !['rope', 'jetpack', 'girder', 'teleport', 'parachute', 'skip', 'surrender', 'airstrike', 'coconut', 'madgoats'].includes(icon)) {
      ctx.translate(11, 0); ctx.rotate(-aim); ctx.scale(0.6, 0.6); A.icons[icon](ctx, 0);
    } else if (icon === 'airstrike' || icon === 'coconut' || icon === 'madgoats' || icon === 'teleport' || icon === 'girder') {
      ctx.rotate(-aim); ctx.translate(9, -2); ctx.fillStyle = '#333'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(-2, -5, 7, 10, 1.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e33'; ctx.beginPath(); ctx.arc(1.5, -3, 1.4, 0, B.TAU); ctx.fill();
      ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(3, -5); ctx.lineTo(4, -10); ctx.stroke();
    }
    ctx.restore();
  };

  A.jetpack = function (ctx, thrust, time) {
    ctx.fillStyle = '#9aa4b0'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(-13, -7, 7, 14, 2); ctx.fill(); ctx.stroke();
    if (thrust) {
      const l = 8 + Math.random() * 6;
      ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.moveTo(-12.5, 7); ctx.lineTo(-9.5, 7 + l); ctx.lineTo(-6.5, 7); ctx.fill();
      ctx.fillStyle = '#ff6a00'; ctx.beginPath(); ctx.moveTo(-11.5, 7); ctx.lineTo(-9.5, 7 + l * 0.6); ctx.lineTo(-7.5, 7); ctx.fill();
    }
  };

  A.parachute = function (ctx, x, y, col, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.05) * 0.08);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-18, -26); ctx.moveTo(6, 0); ctx.lineTo(18, -26); ctx.moveTo(0, 0); ctx.lineTo(0, -32); ctx.stroke();
    ctx.fillStyle = col; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-22, -24); ctx.quadraticCurveTo(0, -52, 22, -24);
    ctx.quadraticCurveTo(16, -28, 11, -24); ctx.quadraticCurveTo(5.5, -28, 0, -24); ctx.quadraticCurveTo(-5.5, -28, -11, -24); ctx.quadraticCurveTo(-16, -28, -22, -24);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-11, -25); ctx.quadraticCurveTo(-6, -46, 0, -38); ctx.lineTo(0, -25); ctx.fill();
    ctx.restore();
  };

  // Bean tin can gravestone
  A.tin = function (ctx, x, y, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#c9ccd2'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-8, -18); ctx.lineTo(-8, 0); ctx.ellipse(0, 0, 8, 2.8, 0, Math.PI, 0, true); ctx.lineTo(8, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-7.3, -14, 14.6, 10);
    ctx.fillStyle = '#7a2b14'; ctx.beginPath(); ctx.ellipse(0, -9, 3.5, 2.2, 0.3, 0, B.TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BEANS', 0, -4.8);
    ctx.fillStyle = '#e6e8ec'; ctx.beginPath(); ctx.ellipse(0, -18, 8, 2.8, 0, 0, B.TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, -18, 5.5, 1.6, 0, 0, B.TAU); ctx.stroke();
    ctx.restore();
  };

  A.girderShape = function (ctx, len, th) {
    ctx.fillStyle = '#c0632b'; ctx.strokeStyle = '#5a2a10'; ctx.lineWidth = 1.5;
    ctx.fillRect(-len / 2, -th / 2, len, th); ctx.strokeRect(-len / 2, -th / 2, len, th);
    ctx.beginPath();
    for (let x = -len / 2; x < len / 2 - 4; x += 12) { ctx.moveTo(x, -th / 2); ctx.lineTo(x + 6, th / 2); ctx.lineTo(x + 12, -th / 2); }
    ctx.stroke();
    ctx.fillStyle = '#5a2a10';
    for (let x = -len / 2 + 4; x < len / 2; x += 12) { ctx.beginPath(); ctx.arc(x, -th / 2 + 2.5, 1, 0, B.TAU); ctx.arc(x, th / 2 - 2.5, 1, 0, B.TAU); ctx.fill(); }
  };

  // ---- icons/sprites (centered, ~ radius 10) ----
  const I = A.icons = {};
  I.bazooka = (c) => { // rocket
    c.fillStyle = '#d64545'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(6, -4, -6, -3.5); c.lineTo(-6, 3.5); c.quadraticCurveTo(6, 4, 10, 0); c.fill(); c.stroke();
    c.fillStyle = '#555'; c.beginPath(); c.moveTo(-5, -3); c.lineTo(-10, -7); c.lineTo(-9, -1); c.closePath(); c.moveTo(-5, 3); c.lineTo(-10, 7); c.lineTo(-9, 1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(2, -3, 2, 6);
  };
  I.homing = (c) => {
    c.fillStyle = '#3d6fd6'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(10, 0); c.quadraticCurveTo(6, -4, -6, -3.5); c.lineTo(-6, 3.5); c.quadraticCurveTo(6, 4, 10, 0); c.fill(); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-5, -3); c.lineTo(-10, -7); c.lineTo(-9, -1); c.closePath(); c.moveTo(-5, 3); c.lineTo(-10, 7); c.lineTo(-9, 1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(4, 0, 1.6, 0, B.TAU); c.fill();
  };
  I.grenade = (c) => {
    c.fillStyle = '#4f7a35'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.ellipse(0, 1.5, 6.5, 7.5, 0, 0, B.TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.moveTo(-6, 1.5); c.lineTo(6, 1.5); c.moveTo(0, -6); c.lineTo(0, 9); c.stroke();
    c.fillStyle = '#999'; c.strokeStyle = OUT; c.fillRect(-2.5, -8.5, 5, 3.5); c.strokeRect(-2.5, -8.5, 5, 3.5);
    c.beginPath(); c.arc(4.5, -7.5, 2.5, 0, B.TAU); c.stroke();
  };
  I.cluster = (c) => {
    c.fillStyle = '#c78d2a'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.ellipse(0, 1.5, 6.5, 7.5, 0, 0, B.TAU); c.fill(); c.stroke();
    c.fillStyle = '#6b4a10'; for (const [x, y] of [[-2.5, -1], [2.5, -1], [0, 3], [-3, 5], [3, 5]]) { c.beginPath(); c.arc(x, y, 1.4, 0, B.TAU); c.fill(); }
    c.fillStyle = '#999'; c.fillRect(-2.5, -8.5, 5, 3.5); c.strokeRect(-2.5, -8.5, 5, 3.5);
  };
  I.clusterlet = (c) => { c.fillStyle = '#c78d2a'; c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 3, 0, B.TAU); c.fill(); c.stroke(); };
  I.plantain = (c) => {
    c.fillStyle = '#f2c230'; c.strokeStyle = OUT; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-9, -4); c.quadraticCurveTo(0, 12, 10, -5); c.quadraticCurveTo(0, 5, -9, -4); c.fill(); c.stroke();
    c.fillStyle = '#3a2a10'; c.beginPath(); c.arc(-9, -4, 1.6, 0, B.TAU); c.arc(10, -5, 1.6, 0, B.TAU); c.fill();
    c.fillStyle = '#6aa53a'; c.fillRect(9, -8, 2.5, 3);
  };
  I.plantainslice = (c) => {
    c.fillStyle = '#e8a52a'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.arc(0, 0, 4.5, 0, B.TAU); c.fill(); c.stroke();
    c.fillStyle = '#ffe28a'; c.beginPath(); c.arc(0, 0, 2.6, 0, B.TAU); c.fill();
  };
  I.bonnet = (c) => { // scotch bonnet pepper
    c.fillStyle = '#ff7a10'; c.strokeStyle = OUT; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-8, -2); c.bezierCurveTo(-9, 6, -3, 9, 0, 6); c.bezierCurveTo(3, 9, 9, 6, 8, -2); c.bezierCurveTo(6, -6, -6, -6, -8, -2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-4, 0, 1.6, 3, 0.3, 0, B.TAU); c.fill();
    c.fillStyle = '#3e8a2a'; c.beginPath(); c.moveTo(-4, -4.5); c.quadraticCurveTo(0, -8, 4, -4.5); c.fill(); c.stroke();
    c.strokeStyle = '#3e8a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(1, -10, 4, -11); c.stroke();
  };
  I.dynamite = (c) => {
    c.fillStyle = '#d23a2a'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.roundRect(-3.5, -7, 7, 15, 1.5); c.fill(); c.stroke();
    c.fillStyle = '#f4e1b0'; c.fillRect(-3.5, -1.5, 7, 3);
    c.strokeStyle = '#555'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -7); c.quadraticCurveTo(3, -10, 2, -12); c.stroke();
    c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(2, -12.5, 1.8, 0, B.TAU); c.fill();
  };
  I.shotgun = (c) => {
    c.fillStyle = '#6b3f1f'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-10, 1); c.lineTo(-3, -1); c.lineTo(-3, 3); c.lineTo(-10, 5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#555'; c.fillRect(-3, -2, 14, 3); c.strokeRect(-3, -2, 14, 3);
    c.fillStyle = '#333'; c.fillRect(-2, 1, 7, 2.5);
  };
  I.punch = (c) => {
    c.fillStyle = '#f4c08a'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.roundRect(-6, -6, 12, 11, 4); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-6, -2); c.lineTo(6, -2); c.moveTo(-2, -6); c.lineTo(-2, -2); c.moveTo(2, -6); c.lineTo(2, -2); c.stroke();
    c.fillStyle = '#ff7a10'; c.beginPath(); c.moveTo(-5, 6); c.quadraticCurveTo(0, 14, 5, 6); c.quadraticCurveTo(0, 9, -5, 6); c.fill();
  };
  I.bat = (c) => {
    c.save(); c.rotate(-0.7); c.fillStyle = '#c99a5b'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-10, -1.5); c.lineTo(9, -4); c.quadraticCurveTo(12, 0, 9, 4); c.lineTo(-10, 1.5); c.closePath(); c.fill(); c.stroke(); c.restore();
  };
  I.airstrike = (c) => {
    c.fillStyle = '#7a8b99'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(0, 0, 10, 3, 0, 0, B.TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-2, 0); c.lineTo(-6, -8); c.lineTo(-2, -8); c.lineTo(3, 0); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-8, 0); c.lineTo(-11, -5); c.lineTo(-8, -5); c.lineTo(-5, 0); c.fill(); c.stroke();
    c.fillStyle = '#9fe0ff'; c.beginPath(); c.ellipse(6, -1, 2.5, 1.5, 0, 0, B.TAU); c.fill();
  };
  I.missile = (c) => {
    c.fillStyle = '#333'; c.strokeStyle = OUT; c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, 0, 6, 2.5, 0, 0, B.TAU); c.fill();
    c.fillStyle = '#d64545'; c.beginPath(); c.moveTo(6, 0); c.lineTo(3, -2.4); c.lineTo(3, 2.4); c.fill();
  };
  I.goat = (c, t) => {
    t = t || 0; const leg = Math.sin(t * 0.4) * 2;
    c.strokeStyle = OUT; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-5, 3); c.lineTo(-5 + leg, 9); c.moveTo(5, 3); c.lineTo(5 - leg, 9); c.moveTo(-2, 3); c.lineTo(-2 - leg, 9); c.moveTo(2, 3); c.lineTo(2 + leg, 9); c.stroke();
    c.fillStyle = '#f0e8dc'; c.lineWidth = 1.3;
    c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, B.TAU); c.fill(); c.stroke();
    c.fillStyle = '#8a6a4a'; c.beginPath(); c.ellipse(-2, -1, 3, 2, 0, 0, B.TAU); c.fill();
    c.fillStyle = '#e8ddcf'; c.beginPath(); c.ellipse(9, -4, 4, 3, 0.4, 0, B.TAU); c.fill(); c.stroke();
    c.strokeStyle = '#6b5a40'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(8, -6); c.quadraticCurveTo(6, -11, 3, -10); c.stroke();
    c.fillStyle = OUT; c.beginPath(); c.arc(10, -5, 0.9, 0, B.TAU); c.fill();
    c.fillStyle = '#d8ccb8'; c.beginPath(); c.moveTo(11, -2); c.lineTo(12, 2); c.lineTo(10, -1); c.fill();
  };
  I.madgoats = (c, t) => { c.save(); c.translate(-4, 2); c.scale(0.7, 0.7); I.goat(c, t); c.restore(); c.save(); c.translate(4, -3); c.scale(0.8, 0.8); I.goat(c, t); c.restore(); c.fillStyle = '#d22'; c.font = 'bold 9px sans-serif'; c.fillText('!', 6, -7); };
  I.coconut = (c) => {
    c.fillStyle = '#8a8f94'; c.strokeStyle = OUT; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, 9, 0, B.TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, 9, i * 1.6, i * 1.6 + 0.8); c.stroke(); }
    c.fillStyle = '#3a3a3a'; for (const [x, y] of [[-2.5, -2], [2.5, -2], [0, 2]]) { c.beginPath(); c.arc(x, y, 1.6, 0, B.TAU); c.fill(); }
  };
  I.rope = (c) => {
    c.strokeStyle = '#a07a40'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-9, 9); c.bezierCurveTo(-2, 0, -10, -4, 0, -4); c.stroke();
    c.strokeStyle = '#888'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -4); c.lineTo(6, -8); c.moveTo(6, -8); c.lineTo(9, -5); c.moveTo(6, -8); c.lineTo(5, -12); c.stroke();
  };
  I.hook = (c) => { c.strokeStyle = '#888'; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, 0); c.lineTo(3, 0); c.lineTo(5, -3); c.moveTo(3, 0); c.lineTo(5, 3); c.stroke(); };
  I.jetpack = (c) => {
    c.fillStyle = '#9aa4b0'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.roundRect(-7, -8, 6, 14, 2); c.fill(); c.stroke(); c.beginPath(); c.roundRect(1, -8, 6, 14, 2); c.fill(); c.stroke();
    c.fillStyle = '#ff9a1a'; c.beginPath(); c.moveTo(-6, 6); c.lineTo(-4, 11); c.lineTo(-2, 6); c.moveTo(2, 6); c.lineTo(4, 11); c.lineTo(6, 6); c.fill();
  };
  I.girder = (c) => { c.save(); c.rotate(-0.4); A.girderShape(c, 22, 7); c.restore(); };
  I.teleport = (c, t) => {
    t = t || 0; c.strokeStyle = '#8a4dff'; c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 0, 9 - i * 3, 4 - i, (t * 0.05 + i) % B.TAU, 0, B.TAU); c.stroke(); }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 2, 0, B.TAU); c.fill();
  };
  I.parachute = (c) => { c.save(); c.scale(0.45, 0.45); A.parachute(c, 0, 18, '#ff5a4e', 0); c.restore(); };
  I.skip = (c) => { c.fillStyle = '#5a6b80'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('Zz', 0, 4); };
  I.surrender = (c) => {
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, 10); c.lineTo(-6, -10); c.stroke();
    c.fillStyle = '#fff'; c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.moveTo(-6, -10); c.quadraticCurveTo(2, -13, 9, -9); c.quadraticCurveTo(3, -5, 9, -1); c.quadraticCurveTo(2, -4, -6, -1); c.fill(); c.stroke();
  };
  I.mine = (c, t) => {
    c.fillStyle = '#3a3a3a'; c.strokeStyle = OUT; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(0, 1, 6, 3.5, 0, 0, B.TAU); c.fill(); c.stroke();
    c.fillStyle = ((t || 0) % 40 < 20) ? '#ff3030' : '#601010'; c.beginPath(); c.arc(0, -2, 1.6, 0, B.TAU); c.fill();
  };
  I.drum = (c) => {
    c.fillStyle = '#c23a2a'; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.roundRect(-7, -10, 14, 20, 2); c.fill(); c.stroke();
    c.strokeStyle = '#7d1f12'; c.beginPath(); c.moveTo(-7, -4); c.lineTo(7, -4); c.moveTo(-7, 4); c.lineTo(7, 4); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(0, -3); c.lineTo(3, 2); c.lineTo(-3, 2); c.fill();
  };
  I.crate = (c, kind) => {
    c.fillStyle = kind === 'health' ? '#f4f4f4' : '#b07a3e'; c.strokeStyle = OUT; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(-9, -9, 18, 18, 2); c.fill(); c.stroke();
    if (kind === 'health') { c.fillStyle = '#e22'; c.fillRect(-2.5, -6.5, 5, 13); c.fillRect(-6.5, -2.5, 13, 5); }
    else { c.strokeStyle = '#6b4520'; c.beginPath(); c.moveTo(-9, -9); c.lineTo(9, 9); c.moveTo(9, -9); c.lineTo(-9, 9); c.stroke(); c.fillStyle = '#ffd23f'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.fillText('?', 0, 4); }
  };
  I.plane = (c) => {
    c.fillStyle = '#4a7a3a'; c.strokeStyle = OUT; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(0, 0, 30, 7, 0, 0, B.TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-4, 0); c.lineTo(-14, 16); c.lineTo(-6, 16); c.lineTo(8, 0); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-22, -2); c.lineTo(-30, -14); c.lineTo(-24, -14); c.lineTo(-16, -2); c.fill(); c.stroke();
    c.fillStyle = '#9fe0ff'; c.beginPath(); c.ellipse(16, -3, 7, 3.5, 0, 0, B.TAU); c.fill(); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(-4, 0, 3, 0, B.TAU); c.fill();
    c.fillStyle = '#111'; c.fillRect(-12, -1, 3, 2);
  };
})();
