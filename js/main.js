'use strict';
// ---------- App: menus, lobby, game loop glue ----------
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const canvas = $('#game');
  const isTouch = ('ontouchstart' in window) || matchMedia('(pointer:coarse)').matches;
  if (isTouch) document.body.classList.add('touch');

  const App = B.App = {
    mode: 'title', role: null, // role: 'local' | 'host' | 'client' | 'demo'
    sim: null, terrain: null, renderer: null, meta: null,
    conns: new Map(), net: null, conn: null, myId: 'host', code: null,
    teams: [], settings: null, paused: false, previewSeed: 0, lastView: null,
  };

  const SETTINGS_DEFAULT = { theme: 'garden', style: 'hills', beansPerTeam: 4, hp: 100, turnTime: 45, sdRound: 10, mines: true, drums: true, crates: true, infiniteAmmo: false };
  function loadPrefs() { try { return JSON.parse(localStorage.getItem('beans.prefs') || '{}'); } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem('beans.prefs', JSON.stringify(Object.assign(loadPrefs(), p))); } catch (e) { } }

  function toast(s, ms) { const t = $('#toast'); t.textContent = s; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms || 2200); }
  function show(id) { for (const s of ['#title', '#setup', '#join', '#lobby', '#pause', '#over', '#help', '#wmenu']) $(s).classList.add('hidden'); if (id) $(id).classList.remove('hidden'); }

  // ---------- mini bean painter ----------
  function paintBean(cv, type, aim) {
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const s = cv.width / 40; c.setTransform(s, 0, 0, s, 0, 0);
    B.Art.bean(c, { id: 3, x: 20, y: 21, type, facing: 1, aim: aim || -0.2, state: 'idle', hp: 100 }, 0);
  }
  function paintIcon(cv, icon) {
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const s = cv.width / 28; c.setTransform(s, 0, 0, s, cv.width / 2, cv.height / 2);
    try { B.Art.icons[icon](c, 0); } catch (e) { }
  }

  // ---------- title demo ----------
  function startDemo() {
    App.sim = null; App.renderer = null;
    const rand = B.rng(Date.now() & 0xffffff);
    const types = B.BEAN_TYPES.slice().sort(() => rand() - 0.5);
    const cfg = Object.assign({}, SETTINGS_DEFAULT, {
      seed: (Math.random() * 1e9) | 0, theme: B.pick(Object.keys(B.THEMES)), style: B.pick(['hills', 'islands', 'hills']),
      beansPerTeam: 3, hp: 60, turnTime: 15, mines: true, drums: true, crates: false, sdRound: 4,
      teams: [0, 1].map(i => ({ name: B.TEAM_NAMES[types[i].id], type: types[i].id, ctrl: 'cpu', cpu: 'hard' })),
    });
    B.assignBeanNames(cfg, rand);
    beginHostGame(cfg, true);
    App.demo = true;
    App.renderer.userZoom = 0.7;
    App.renderer.hideHud = true;
  }

  // ---------- setup screen ----------
  function newTeam(ctrl, extra) {
    const used = new Set(App.teams.map(t => t.type));
    const type = (B.BEAN_TYPES.find(t => !used.has(t.id)) || B.BEAN_TYPES[0]).id;
    return Object.assign({ name: B.TEAM_NAMES[type], type, ctrl, cpu: 'normal', owner: 'host' }, extra || {});
  }

  function openSetup(role) {
    App.role = role; App.mode = 'setup';
    const prefs = loadPrefs();
    App.settings = Object.assign({}, SETTINGS_DEFAULT, prefs.settings || {});
    App.teams = [];
    App.teams.push(newTeam('human', { name: prefs.teamName || B.TEAM_NAMES.kidney, type: prefs.teamType || 'kidney' }));
    if (role === 'local') App.teams.push(newTeam('cpu'));
    $('#setupTitle').textContent = role === 'host' ? 'Host Online Game' : 'Local Match';
    $('#roomBox').classList.toggle('hidden', role !== 'host');
    $('#setupNote').textContent = role === 'host' ? 'Friends join with the code. You can add CPU or same-device players too.' : 'Players on this device take turns. Add CPU beans to fill out the battle.';
    syncSettingsUI();
    renderTeams();
    newPreview();
    show('#setup');
    if (role === 'host') startHosting();
  }

  function syncSettingsUI() {
    const s = App.settings;
    $('#sTheme').value = s.theme; $('#sStyle').value = s.style; $('#sBeans').value = String(s.beansPerTeam); $('#sHp').value = String(s.hp);
    $('#sTurn').value = String(s.turnTime); $('#sSd').value = String(s.sdRound);
    $$('[data-tog]').forEach(b => b.classList.toggle('on', !!s[b.dataset.tog]));
  }
  function readSettingsUI() {
    const s = App.settings;
    s.theme = $('#sTheme').value; s.style = $('#sStyle').value; s.beansPerTeam = +$('#sBeans').value; s.hp = +$('#sHp').value;
    s.turnTime = +$('#sTurn').value; s.sdRound = +$('#sSd').value;
    savePrefs({ settings: s });
    broadcastLobby();
  }
  ['#sBeans', '#sHp', '#sTurn', '#sSd'].forEach(id => $(id).addEventListener('change', readSettingsUI));
  ['#sTheme', '#sStyle'].forEach(id => $(id).addEventListener('change', () => { readSettingsUI(); newPreview(true); }));
  $$('[data-tog]').forEach(b => b.addEventListener('click', () => { App.settings[b.dataset.tog] = !App.settings[b.dataset.tog]; b.classList.toggle('on'); readSettingsUI(); }));
  $('#shuffle').addEventListener('click', () => newPreview());

  let previewTerrain = null, previewTimer = 0;
  function newPreview(keepSeed) {
    if (!keepSeed) App.previewSeed = (Math.random() * 1e9) | 0;
    const cv = $('#preview'), c = cv.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, cv.width, cv.height);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTerrain = previewTerrain || new B.Terrain();
      const s = App.settings;
      previewTerrain.generate(App.previewSeed, s.theme, s.style);
      previewTerrain.genKey = App.previewSeed + ':' + s.theme + ':' + s.style;
      const th = previewTerrain.theme;
      const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
      c.drawImage(previewTerrain.canvas, 0, 0, cv.width, cv.height);
      c.fillStyle = th.water; c.globalAlpha = 0.8; c.fillRect(0, cv.height * (B.WORLD_H - 70) / B.WORLD_H, cv.width, cv.height); c.globalAlpha = 1;
    }, 30);
  }

  const CTRL_OPTS = [['human', 'Player'], ['cpu:easy', 'CPU · Easy'], ['cpu:normal', 'CPU · Normal'], ['cpu:hard', 'CPU · Hard']];
  function renderTeams() {
    const el = $('#teamList'); el.innerHTML = '';
    App.teams.forEach((t, i) => {
      const row = document.createElement('div'); row.className = 'team-row';
      const chip = document.createElement('canvas'); chip.width = 88; chip.height = 88; chip.className = 'bean-chip'; chip.title = 'Change bean';
      paintBean(chip, t.type);
      const remote = t.ctrl === 'remote';
      if (!remote) chip.addEventListener('click', () => { cycleType(t); renderTeams(); broadcastLobby(); });
      row.appendChild(chip);
      const inp = document.createElement('input'); inp.value = t.name; inp.maxLength = 20; inp.disabled = remote;
      inp.addEventListener('input', () => { t.name = inp.value.slice(0, 20) || 'Beans'; if (i === 0) savePrefs({ teamName: t.name }); broadcastLobby(); });
      row.appendChild(inp);
      if (remote) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = '🌐 Online'; row.appendChild(tag); }
      else {
        const sel = document.createElement('select');
        for (const [v, l] of CTRL_OPTS) { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); }
        sel.value = t.ctrl === 'cpu' ? 'cpu:' + t.cpu : 'human';
        sel.addEventListener('change', () => { const [c, d] = sel.value.split(':'); t.ctrl = c; if (d) t.cpu = d; broadcastLobby(); });
        row.appendChild(sel);
      }
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = remote ? 'Kick' : 'Remove';
      x.disabled = App.teams.length <= 1 && !remote;
      x.addEventListener('click', () => {
        if (remote) { const c = App.conns.get(t.owner); if (c) { c.send({ k: 'kicked' }); setTimeout(() => c.close(), 100); } }
        App.teams.splice(i, 1); renderTeams(); broadcastLobby();
      });
      row.appendChild(x);
      el.appendChild(row);
    });
    $('#addHuman').disabled = $('#addCpu').disabled = App.teams.length >= 6;
    $('#startBtn').disabled = App.teams.length < 2;
  }
  function cycleType(t) {
    const used = new Set(App.teams.filter(x => x !== t).map(x => x.type));
    let i = B.BEAN_TYPES.findIndex(x => x.id === t.type);
    for (let k = 0; k < B.BEAN_TYPES.length; k++) { i = (i + 1) % B.BEAN_TYPES.length; if (!used.has(B.BEAN_TYPES[i].id)) break; }
    const oldDefault = Object.values(B.TEAM_NAMES).includes(t.name);
    t.type = B.BEAN_TYPES[i].id;
    if (oldDefault) t.name = B.TEAM_NAMES[t.type];
    if (App.teams[0] === t) savePrefs({ teamType: t.type, teamName: t.name });
  }
  $('#addHuman').addEventListener('click', () => { App.teams.push(newTeam('human')); renderTeams(); broadcastLobby(); });
  $('#addCpu').addEventListener('click', () => { App.teams.push(newTeam('cpu')); renderTeams(); broadcastLobby(); });

  // ---------- hosting ----------
  function startHosting(retry) {
    const code = B.roomCode();
    App.code = code;
    $('#roomCode').textContent = code;
    $('#netStatus').textContent = 'Opening room…';
    if (App.net) App.net.destroy();
    App.net = B.Net.host(code, {
      onReady: () => { $('#netStatus').textContent = 'Room open — share the code or link. Players appear above as they join.'; },
      onError: (type) => {
        if (type === 'taken' && (retry || 0) < 3) return startHosting((retry || 0) + 1);
        $('#netStatus').textContent = 'Network problem (' + type + '). Check your connection and try again.';
      },
      onConn: (c) => {
        App.conns.set(c.id, c);
        c.on('data', (m) => onHostMsg(c, m));
        c.on('close', () => onHostClose(c));
      },
    });
  }
  function inviteLink() { return location.origin + location.pathname + (B.Net.local ? location.search : '') + '#join=' + App.code; }
  $('#copyLink').addEventListener('click', async () => {
    const link = inviteLink();
    try {
      if (navigator.share && isTouch) await navigator.share({ title: 'Beans', text: 'Join my Beans game! Room ' + App.code, url: link });
      else { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
    } catch (e) { toast(link, 5000); }
  });

  function lobbyPayload() {
    return { k: 'lobby', code: App.code, teams: App.teams.map(t => ({ name: t.name, type: t.type, ctrl: t.ctrl, cpu: t.cpu, owner: t.owner })), settings: App.settings };
  }
  function broadcastLobby() {
    if (App.role !== 'host' || App.mode !== 'setup') return;
    const p = lobbyPayload();
    for (const c of App.conns.values()) c.send(p);
  }

  function onHostMsg(c, m) {
    if (m.k === 'hello') {
      if (App.mode !== 'setup') { c.send({ k: 'busy' }); return; }
      if (App.teams.length >= 6) { c.send({ k: 'full' }); return; }
      if (App.teams.some(t => t.owner === c.id)) return;
      const used = new Set(App.teams.map(t => t.type));
      let type = B.BEAN_TYPES.some(t => t.id === m.type) && !used.has(m.type) ? m.type : (B.BEAN_TYPES.find(t => !used.has(t.id)) || B.BEAN_TYPES[0]).id;
      App.teams.push({ name: String(m.name || 'Guest Beans').slice(0, 20), type, ctrl: 'remote', owner: c.id, cpu: 'normal' });
      renderTeams(); broadcastLobby();
      c.send({ k: 'welcome', id: c.id });
      toast((m.name || 'A player') + ' joined!');
      B.Sound.play('crate');
    } else if (m.k === 'team') {
      const t = App.teams.find(t => t.owner === c.id); if (!t || App.mode !== 'setup') return;
      if (m.name) t.name = String(m.name).slice(0, 20);
      if (m.type && B.BEAN_TYPES.some(x => x.id === m.type) && !App.teams.some(x => x !== t && x.type === m.type)) t.type = m.type;
      renderTeams(); broadcastLobby();
    } else if (m.k === 'h' && App.sim) {
      if (App.sim.controller() === c.id) App.sim.setHeld(m.h);
    } else if (m.k === 'a' && App.sim) {
      if (App.sim.controller() === c.id && m.a && typeof m.a.a === 'string') App.sim.pushAct(m.a);
    }
  }
  function onHostClose(c) {
    App.conns.delete(c.id);
    if (App.mode === 'setup') {
      const i = App.teams.findIndex(t => t.owner === c.id);
      if (i >= 0) { toast(App.teams[i].name + ' left'); App.teams.splice(i, 1); renderTeams(); broadcastLobby(); }
    } else if (App.sim) {
      for (const t of App.sim.teams) if (t.ctrl === 'remote' && t.owner === c.id) {
        t.ctrl = 'cpu'; t.cpu = 'normal';
        const mt = App.meta.teams[t.i]; mt.ctrl = 'cpu';
        App.sim.ev({ t: 'banner', s: t.name + ' disconnected', sub: 'A CPU bean takes over', c: '#ff7a59' });
        if (App.sim.curTeam === t.i) App.sim.ai = null;
      }
      broadcast({ k: 'meta', meta: App.meta });
    }
  }
  function broadcast(m) { for (const c of App.conns.values()) c.send(m); }

  // ---------- start game (host/local) ----------
  $('#startBtn').addEventListener('click', () => {
    if (App.teams.length < 2) return;
    readSettingsUI();
    const rand = B.rng(App.previewSeed ^ 0x55aa);
    const cfg = Object.assign({}, App.settings, {
      seed: App.previewSeed,
      teams: App.teams.map(t => ({ name: t.name || 'Beans', type: t.type, ctrl: t.ctrl, cpu: t.cpu, owner: t.owner })),
    });
    B.assignBeanNames(cfg, rand);
    App.lastCfg = cfg;
    beginHostGame(cfg, false);
  });

  function buildMeta(sim, cfg) {
    const beans = {};
    for (const b of sim.beans) beans[b.id] = { name: b.name, team: b.team };
    return { seed: cfg.seed, theme: cfg.theme, teams: sim.teams.map(t => ({ name: t.name, type: t.type, ctrl: t.ctrl, owner: t.owner, maxHp: cfg.hp * cfg.beansPerTeam })), beans };
  }

  function beginHostGame(cfg, demo) {
    stopGame(true);
    App.demo = !!demo;
    if (!demo) { App.role = App.role === 'host' ? 'host' : 'local'; App.mode = 'game'; }
    let terrain = previewTerrain && previewTerrain.genKey === cfg.seed + ':' + cfg.theme + ':' + cfg.style && !demo ? previewTerrain : new B.Terrain();
    if (terrain === previewTerrain) previewTerrain = null;
    const sim = new B.Sim(cfg, terrain);
    App.sim = sim; App.terrain = terrain;
    App.meta = buildMeta(sim, cfg);
    App.renderer = new B.Renderer(canvas, terrain, App.meta, { smooth: false, myId: 'host' });
    App.renderer.mobile = isTouch && window.innerWidth < 900;
    App.renderer.setView(sim.view());
    App.netEv = [];
    if (App.role === 'host' && !demo) {
      const runs = terrain.encode();
      broadcast({ k: 'start', cfg, runs, meta: App.meta });
    }
    if (!demo) { show(null); enterGameUI(); } else { $('#hud').classList.add('hidden'); $('#touch').classList.remove('show'); $('#turnHint').textContent = ''; }
    App.acc = 0; App.netTick = 0;
  }

  function stopNet() {
    if (App.net) { App.net.destroy(); App.net = null; }
    for (const c of App.conns.values()) try { c.close(); } catch (e) { }
    App.conns.clear();
    if (App.conn) { try { App.conn.close(); } catch (e) { } App.conn = null; }
  }
  function stopGame(keepNet) {
    App.demo = false;
    App.sim = null; App.renderer = null; App.lastView = null; App.paused = false; App.overShown = false;
    if (!keepNet) stopNet();
  }

  // ---------- joining ----------
  let joinType = 'pinto';
  function openJoin(code) {
    stopNet();
    App.role = 'client'; App.mode = 'join';
    const prefs = loadPrefs();
    joinType = prefs.teamType || 'pinto';
    $('#jCode').value = (code || '').toUpperCase();
    $('#jName').value = prefs.teamName || B.TEAM_NAMES[joinType];
    paintBean($('#jBean'), joinType);
    $('#jStatus').textContent = ''; $('#jStatus').className = 'status';
    $('#jGo').disabled = false;
    show('#join');
    setTimeout(() => (code ? $('#jName') : $('#jCode')).focus(), 50);
  }
  $('#jBean').addEventListener('click', () => {
    const i = B.BEAN_TYPES.findIndex(t => t.id === joinType);
    const wasDefault = Object.values(B.TEAM_NAMES).includes($('#jName').value);
    joinType = B.BEAN_TYPES[(i + 1) % B.BEAN_TYPES.length].id;
    if (wasDefault) $('#jName').value = B.TEAM_NAMES[joinType];
    paintBean($('#jBean'), joinType);
  });
  $('#jCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#jCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#jGo').click(); });
  $('#jName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#jGo').click(); });
  $('#jGo').addEventListener('click', () => {
    const code = $('#jCode').value.trim().toUpperCase();
    if (code.length !== 4) { setJoinStatus('Enter the 4-letter room code.', true); return; }
    const name = ($('#jName').value.trim() || B.TEAM_NAMES[joinType]).slice(0, 20);
    savePrefs({ teamName: name, teamType: joinType });
    setJoinStatus('Connecting to room ' + code + '…');
    $('#jGo').disabled = true;
    B.Sound.unlock();
    if (App.net) App.net.destroy();
    App.code = code;
    App.net = B.Net.join(code, {
      onOpen: (c) => {
        App.conn = c; App.myId = c.id;
        c.on('data', onClientMsg);
        c.on('close', () => onClientClose());
        c.send({ k: 'hello', name, type: joinType });
        setJoinStatus('Connected! Joining…');
      },
      onError: (type) => {
        $('#jGo').disabled = false;
        setJoinStatus(type === 'peer-unavailable' ? "Couldn't find room " + code + '. Check the code with your host.' : 'Connection failed (' + type + '). Try again.', true);
      },
    });
  });
  function setJoinStatus(s, err) { $('#jStatus').textContent = s; $('#jStatus').className = 'status' + (err ? ' err' : ''); }

  function onClientMsg(m) {
    switch (m.k) {
      case 'welcome': App.myId = m.id || App.myId; break;
      case 'lobby':
        if (App.mode === 'game') return;
        App.mode = 'lobby';
        renderClientLobby(m); show('#lobby');
        break;
      case 'full': setJoinStatus('That room is full.', true); $('#jGo').disabled = false; break;
      case 'busy': setJoinStatus('That game has already started.', true); $('#jGo').disabled = false; break;
      case 'kicked': toast('The host removed you from the room.'); toTitle(); break;
      case 'start': beginClientGame(m); break;
      case 's': if (App.mode === 'game' && App.renderer) { for (const e of m.ev) clientEvent(e); App.renderer.setView(m.v); App.lastView = m.v; } break;
      case 'meta': if (App.renderer) { App.meta.teams = m.meta.teams; App.renderer.meta.teams = m.meta.teams; } break;
      case 'end': toast('The host ended the game.'); toTitle(); break;
    }
  }
  function onClientClose() {
    if (App.role !== 'client') return;
    App.conn = null;
    toast('Lost connection to the host.', 3500);
    toTitle();
  }
  function renderClientLobby(m) {
    $('#lCode').textContent = m.code;
    const el = $('#lTeams'); el.innerHTML = '';
    for (const t of m.teams) {
      const row = document.createElement('div'); row.className = 'team-row'; row.style.gridTemplateColumns = '44px 1fr auto';
      const chip = document.createElement('canvas'); chip.width = 88; chip.height = 88; chip.className = 'bean-chip'; paintBean(chip, t.type);
      const mine = t.ctrl === 'remote' && t.owner === App.myId;
      if (mine) { chip.style.cursor = 'pointer'; chip.title = 'Change bean'; chip.addEventListener('click', () => { const used = new Set(m.teams.filter(x => x !== t).map(x => x.type)); let i = B.BEAN_TYPES.findIndex(x => x.id === t.type); for (let k = 0; k < 8; k++) { i = (i + 1) % 8; if (!used.has(B.BEAN_TYPES[i].id)) break; } joinType = B.BEAN_TYPES[i].id; savePrefs({ teamType: joinType }); App.conn.send({ k: 'team', type: joinType }); }); }
      row.appendChild(chip);
      const nm = document.createElement('div'); nm.style.fontWeight = '800'; nm.textContent = t.name + (mine ? ' (you)' : '');
      row.appendChild(nm);
      const tag = document.createElement('span'); tag.className = 'tag';
      tag.textContent = t.ctrl === 'cpu' ? 'CPU · ' + t.cpu : t.ctrl === 'remote' ? '🌐 Online' : t.owner === 'host' ? '🏠 Host' : 'Player';
      if (t.ctrl === 'cpu') tag.style.background = '#7a6250';
      row.appendChild(tag);
      el.appendChild(row);
    }
    const s = m.settings;
    $('#lSettings').textContent = `${B.THEMES[s.theme].name} · ${({ hills: 'Hills', islands: 'Islands', caves: 'Caverns' })[s.style]} · ${s.beansPerTeam} beans · ${s.hp} HP · ${s.turnTime}s turns${s.mines ? ' · mines' : ''}${s.crates ? ' · crates' : ''}${s.infiniteAmmo ? ' · ∞ ammo' : ''}`;
  }

  function beginClientGame(m) {
    stopGame(true);
    App.demo = false;
    App.role = 'client'; App.mode = 'game';
    const terrain = new B.Terrain();
    terrain.theme = B.THEMES[m.cfg.theme] || B.THEMES.garden;
    terrain.decode(m.runs);
    terrain.paint(m.cfg.seed);
    App.terrain = terrain; App.meta = m.meta;
    App.renderer = new B.Renderer(canvas, terrain, m.meta, { smooth: true, myId: App.myId });
    App.renderer.mobile = isTouch && window.innerWidth < 900;
    show(null); enterGameUI();
  }

  function clientEvent(e) {
    if (e.t === 'boom') App.terrain.carve(e.x, e.y, e.r);
    else if (e.t === 'girder') App.terrain.girder(e.x, e.y, e.a, 130);
    cosmetic(e);
  }
  function cosmetic(e) {
    if (e.t === 'snd') { if (!App.demo) B.Sound.play(e.n, e.v); return; }
    if (App.renderer) App.renderer.event(e);
    if (e.t === 'over' && !App.demo) setTimeout(showOver, 3200);
  }

  // ---------- in-game UI ----------
  function enterGameUI() {
    $('#hud').classList.remove('hidden');
    $('#touch').classList.add('show');
    $('#soundBtn').textContent = B.Sound.muted ? '🔇' : '🔊';
    App.lastChip = '';
  }
  function view() { return App.role === 'client' ? App.lastView : App.renderer && App.renderer.view; }
  function myTurn() {
    const v = view(); if (!v || App.mode !== 'game' || App.paused) return false;
    if (App.demo) return false;
    if (App.role === 'client') return v.ctl === App.myId;
    return v.ctl === 'host';
  }
  function sendAct(a) {
    if (!myTurn()) return;
    if (App.role === 'client') App.conn && App.conn.send({ k: 'a', a });
    else App.sim.pushAct(a);
  }
  function sendHeld(h) {
    if (App.role === 'client') { if (App.conn) App.conn.send({ k: 'h', h }); }
    else if (App.sim && myTurn()) App.sim.setHeld(h);
  }

  const input = new B.Input(canvas, {
    held: (h) => { if (myTurn()) sendHeld(h); },
    act: (a) => {
      if (App.mode !== 'game') return;
      if (a.a === 'fuse') { const v = view(); if (v && B.WEAPONS[v.w] && B.WEAPONS[v.w].fuse) toast('Fuse: ' + a.v + ' s', 900); }
      sendAct(a);
    },
    target: (sx, sy) => {
      if (App.mode !== 'game' || !App.renderer) return;
      const v = view(); if (!v || !myTurn()) return;
      const W = B.WEAPONS[v.w];
      if (W && (W.aim === 'target' || W.target)) { const [x, y] = App.renderer.screenToWorld(sx, sy); sendAct({ a: 'target', x: Math.round(x), y: Math.round(y) }); }
    },
    pan: (dx, dy) => { if (App.renderer && App.mode === 'game') App.renderer.pan(dx, dy); },
    zoom: (f) => { if (App.renderer && App.mode === 'game') App.renderer.zoomBy(f); },
    hover: (sx, sy) => { if (App.renderer) App.renderer.mouseWorld = App.renderer.screenToWorld(sx, sy); },
    menu: () => { if (App.mode === 'game' && !App.demo) toggleWeaponMenu(); },
    pause: () => { if (!$('#wmenu').classList.contains('hidden')) { show(null); return; } if (App.mode === 'game' && !App.demo) togglePause(); },
    mute: () => toggleSound(),
  });

  function toggleSound() { const m = B.Sound.toggle(); $('#soundBtn').textContent = m ? '🔇' : '🔊'; }
  $('#soundBtn').addEventListener('click', () => { B.Sound.unlock(); toggleSound(); });
  $('#pauseBtn').addEventListener('click', () => togglePause());
  $('#wchip').addEventListener('click', (e) => {
    const v = view();
    if (e.target.classList.contains('fz') && v && B.WEAPONS[v.w].fuse) { sendAct({ a: 'fuse', v: v.fz % 5 + 1 }); return; }
    toggleWeaponMenu();
  });

  function togglePause() {
    if (!$('#pause').classList.contains('hidden')) { show(null); App.paused = false; return; }
    App.paused = App.role === 'local';
    $('#pNote').textContent = App.role === 'local' ? '' : 'Online games keep running while this menu is open.';
    show('#pause');
  }
  $('#resumeBtn').addEventListener('click', () => { show(null); App.paused = false; });
  $('#pHelp').addEventListener('click', () => { App.helpReturn = '#pause'; show('#help'); });
  $('#quitBtn').addEventListener('click', () => { if (App.role === 'host') broadcast({ k: 'end' }); toTitle(); });

  function toggleWeaponMenu() {
    if (!$('#wmenu').classList.contains('hidden')) { show(null); return; }
    const v = view(); if (!v) return;
    buildWeaponMenu(v);
    show('#wmenu');
  }
  $('#wClose').addEventListener('click', () => show(null));
  $('#wmenu').addEventListener('click', (e) => { if (e.target.id === 'wmenu') show(null); });

  function buildWeaponMenu(v) {
    const g = $('#wgrid'); g.innerHTML = '';
    const mine = myTurn();
    const am = v.am || {};
    const desc = $('#wdesc');
    const setDesc = (k) => { const W = B.WEAPONS[k]; desc.innerHTML = `<b>${W.name}</b>${B.escapeHtml(W.desc)}`; };
    setDesc(v.w);
    for (const k of B.WEAPON_ORDER) {
      const W = B.WEAPONS[k];
      const cell = document.createElement('button'); cell.className = 'wcell';
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 72; paintIcon(cv, W.icon);
      cell.appendChild(cv);
      const a = am[k];
      const ammoTxt = a === -1 || a == null ? '∞' : String(a);
      const sp = document.createElement('span'); sp.className = 'am'; sp.textContent = ammoTxt; cell.appendChild(sp);
      const settings = App.lastCfg || {};
      const delayed = W.delay > 0 && v.rd <= W.delay && !(App.meta && App.meta.inf);
      if (k === v.w) cell.classList.add('sel');
      if (a === 0) cell.classList.add('off');
      if (delayed && a !== -1) { const l = document.createElement('div'); l.className = 'lock'; l.textContent = 'Round ' + (W.delay + 1); cell.appendChild(l); }
      cell.addEventListener('mouseenter', () => setDesc(k));
      cell.addEventListener('click', () => {
        setDesc(k);
        if (!mine) { toast("It's not your turn"); return; }
        if (a === 0 || (delayed && a !== -1)) { toast(W.name + (a === 0 ? ' — none left' : ' unlocks in round ' + (W.delay + 1))); return; }
        sendAct({ a: 'weapon', v: k });
        show(null);
        if (W.aim === 'target' || W.target) toast(isTouch ? 'Tap the map to choose a target' : 'Click the map to choose a target', 1800);
      });
      g.appendChild(cell);
    }
  }

  function updateHudDom(v) {
    if (!v) return;
    const W = B.WEAPONS[v.w];
    const key = v.w + '|' + v.fz;
    if (App.lastChip !== key) {
      App.lastChip = key;
      paintIcon($('#wchip canvas'), W.icon);
      $('#wchip .nm').textContent = W.name;
      const fz = $('#wchip .fz'); fz.classList.toggle('hidden', !W.fuse); fz.textContent = v.fz + 's';
    }
    const mine = myTurn();
    $('#wchip').classList.toggle('locked', !mine);
    $('#touch').classList.toggle('show', App.mode === 'game' && !App.demo);
    $('#touch').style.opacity = mine ? '1' : '0.35';
    let hint = '';
    const team = App.meta.teams[v.ct];
    if (v.ph === 'over') hint = '';
    else if (mine && v.ph === 'turn') {
      if (W.aim === 'target' && !W.utility) hint = (isTouch ? 'Tap' : 'Click') + ' a target';
      else if (W.target && !v.tg) hint = (isTouch ? 'Tap' : 'Click') + ' a target, then fire';
      else if (v.w === 'girder') hint = (isTouch ? 'Tap' : 'Click') + ' to place · ▲▼ rotate';
      else if (v.w === 'teleport') hint = (isTouch ? 'Tap' : 'Click') + ' where to beam';
      else if (v.sl > 0) hint = 'One more shot!';
    } else if (mine && v.ph === 'retreat') hint = 'Run for cover!';
    else if (!mine && team && (v.ph === 'turn' || v.ph === 'start')) hint = team.ctrl === 'cpu' ? team.name + ' (CPU) is thinking…' : team.name + "'s turn";
    if ($('#turnHint').textContent !== hint) $('#turnHint').textContent = hint;
  }

  function showOver() {
    if (App.mode !== 'game' || App.overShown) return;
    App.overShown = true;
    $('#againBtn').classList.toggle('hidden', App.role === 'client');
    show('#over');
  }
  $('#againBtn').addEventListener('click', () => {
    if (!App.lastCfg) return toTitle();
    const cfg = Object.assign({}, App.lastCfg, { seed: (Math.random() * 1e9) | 0 });
    const rand = B.rng(cfg.seed);
    cfg.teams = cfg.teams.filter(t => t.ctrl !== 'remote' || App.conns.has(t.owner)).map(t => Object.assign({}, t));
    B.assignBeanNames(cfg, rand);
    if (cfg.teams.length < 2) { toast('Not enough teams for a rematch'); return; }
    App.lastCfg = cfg;
    beginHostGame(cfg, false);
  });
  $('#titleBtn').addEventListener('click', () => { if (App.role === 'host') broadcast({ k: 'end' }); toTitle(); });

  function toTitle() {
    stopGame();
    App.mode = 'title'; App.role = null;
    history.replaceState(null, '', location.pathname + location.search);
    show('#title');
    $('#hud').classList.add('hidden'); $('#touch').classList.remove('show'); $('#turnHint').textContent = '';
    startDemo();
    App.mode = 'title';
  }

  // ---------- menu buttons ----------
  $('#quickBtn').addEventListener('click', () => {
    B.Sound.unlock();
    const prefs = loadPrefs();
    App.role = 'local';
    const myType = prefs.teamType || 'kidney';
    const other = B.pick(B.BEAN_TYPES.filter(t => t.id !== myType)).id;
    const seed = (Math.random() * 1e9) | 0, rand = B.rng(seed);
    const cfg = Object.assign({}, SETTINGS_DEFAULT, (prefs.settings || {}), {
      seed, theme: B.pick(Object.keys(B.THEMES)), style: B.pick(['hills', 'hills', 'islands', 'caves']),
      teams: [
        { name: prefs.teamName || B.TEAM_NAMES[myType], type: myType, ctrl: 'human', owner: 'host' },
        { name: B.TEAM_NAMES[other], type: other, ctrl: 'cpu', cpu: 'normal' },
      ],
    });
    cfg.beansPerTeam = 4;
    B.assignBeanNames(cfg, rand);
    App.lastCfg = cfg;
    beginHostGame(cfg, false);
  });
  $('#localBtn').addEventListener('click', () => { B.Sound.unlock(); openSetup('local'); });
  const offline = () => { if (!B.NO_ONLINE) return false; toast('Online play works on the real site: beans.benji.com.jm', 3500); return true; };
  $('#hostBtn').addEventListener('click', () => { if (offline()) return; B.Sound.unlock(); openSetup('host'); });
  $('#joinBtn').addEventListener('click', () => { if (offline()) return; openJoin(''); });
  $('#helpBtn').addEventListener('click', () => { App.helpReturn = '#title'; show('#help'); });
  $('#helpClose').addEventListener('click', () => show(App.helpReturn === '#pause' ? '#pause' : App.mode === 'title' ? '#title' : null));
  $$('[data-back]').forEach(b => b.addEventListener('click', () => { if (App.role === 'host') broadcast({ k: 'end' }); toTitle(); }));

  window.addEventListener('resize', () => { if (App.renderer) { App.renderer.resize(); App.renderer.mobile = isTouch && window.innerWidth < 900; } });

  // ---------- main loop ----------
  let last = performance.now();
  let lastCtl = null;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = Math.min(0.1, (now - last) / 1000); last = now;
    const R = App.renderer;
    if (!R) return;
    if (App.sim && !App.paused) {
      const sim = App.sim;
      App.acc += dt;
      let steps = 0;
      while (App.acc >= 1 / 60 && steps < 6) {
        sim.step();
        const live = App.role === 'host' && !App.demo;
        for (const e of sim.events) { cosmetic(e); if (live) App.netEv.push(e); }
        sim.events.length = 0;
        App.acc -= 1 / 60; steps++;
        if (live && ++App.netTick % 2 === 0) {
          broadcast({ k: 's', v: sim.view(), ev: App.netEv });
          App.netEv = [];
        }
      }
      if (steps >= 6) App.acc = 0;
      R.setView(sim.view());
      if (App.demo && sim.phase === 'over') { if (!App.demoEnd) App.demoEnd = now; else if (now - App.demoEnd > 4000) { App.demoEnd = 0; startDemo(); return; } }
    }
    const v = view();
    if (v) {
      const ctl = v.ctl;
      if (ctl !== lastCtl) { lastCtl = ctl; if (myTurn()) sendHeld(input.held); }
      if (!App.demo) updateHudDom(v);
    }
    R.frame(dt);
  }
  requestAnimationFrame(loop);

  // ---------- boot ----------
  const m = location.hash.match(/join=([A-Za-z0-9]{4})/);
  startDemo();
  App.mode = 'title';
  if (m && !B.NO_ONLINE) openJoin(m[1]); else show('#title');
})();
