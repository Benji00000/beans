'use strict';
// ---------- Networking: PeerJS (WebRTC) with a BroadcastChannel test transport ----------
(function () {
  const PREFIX = 'beansjm-';
  const CHUNK = 12000;
  const local = /[?&]net=local/.test(location.search);

  function wrap(sendRaw) {
    const c = { handlers: { data: [], close: [] }, parts: {} };
    c.on = (ev, fn) => { c.handlers[ev].push(fn); return c; };
    c.emit = (ev, x) => { for (const f of c.handlers[ev]) try { f(x); } catch (e) { console.error(e); } };
    c.send = (obj) => {
      const s = JSON.stringify(obj);
      if (s.length <= CHUNK) return sendRaw(s);
      const id = Math.random().toString(36).slice(2, 8), n = Math.ceil(s.length / CHUNK);
      for (let i = 0; i < n; i++) sendRaw('#' + JSON.stringify({ id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
    };
    c.recv = (s) => {
      if (typeof s !== 'string') return;
      if (s[0] === '#') {
        const p = JSON.parse(s.slice(1));
        const buf = c.parts[p.id] = c.parts[p.id] || [];
        buf[p.i] = p.d;
        if (buf.filter(x => x != null).length === p.n) { delete c.parts[p.id]; c.emit('data', JSON.parse(buf.join(''))); }
        return;
      }
      c.emit('data', JSON.parse(s));
    };
    return c;
  }

  const Net = B.Net = { local };

  // Host a room. cb.onConn(conn) for each player; cb.onReady(code); cb.onError(msg)
  Net.host = function (code, cb) {
    if (local) {
      const ch = new BroadcastChannel('beans-' + code), conns = {};
      ch.onmessage = (m) => {
        const d = m.data;
        if (d.to !== 'host') return;
        if (d.type === 'hello') {
          const c = wrap((s) => ch.postMessage({ to: d.from, from: 'host', s }));
          c.id = d.from; c.close = () => { ch.postMessage({ to: d.from, from: 'host', type: 'bye' }); delete conns[d.from]; c.emit('close'); };
          conns[d.from] = c;
          ch.postMessage({ to: d.from, from: 'host', type: 'welcome' });
          cb.onConn(c);
        } else if (d.type === 'bye') { const c = conns[d.from]; if (c) { delete conns[d.from]; c.emit('close'); } }
        else if (conns[d.from]) conns[d.from].recv(d.s);
      };
      setTimeout(() => cb.onReady(code), 50);
      return { destroy() { for (const k in conns) ch.postMessage({ to: k, from: 'host', type: 'bye' }); ch.close(); } };
    }
    const peer = new window.Peer(PREFIX + code, { debug: 1 });
    peer.on('open', () => cb.onReady(code));
    peer.on('connection', (dc) => {
      const c = wrap((s) => { try { dc.send(s); } catch (e) { } });
      c.id = dc.peer;
      c.close = () => { try { dc.close(); } catch (e) { } };
      dc.on('open', () => cb.onConn(c));
      dc.on('data', (s) => c.recv(s));
      dc.on('close', () => c.emit('close'));
      dc.on('error', () => c.emit('close'));
    });
    peer.on('error', (e) => cb.onError(e.type === 'unavailable-id' ? 'taken' : (e.type || 'error'), e));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
    return { destroy() { try { peer.destroy(); } catch (e) { } } };
  };

  // Join a room. Returns promise of conn.
  Net.join = function (code, cb) {
    if (local) {
      const ch = new BroadcastChannel('beans-' + code), me = 'p' + Math.random().toString(36).slice(2, 8);
      const c = wrap((s) => ch.postMessage({ to: 'host', from: me, s }));
      c.id = me;
      c.close = () => { ch.postMessage({ to: 'host', from: me, type: 'bye' }); ch.close(); };
      let ok = false;
      ch.onmessage = (m) => {
        const d = m.data; if (d.to !== me) return;
        if (d.type === 'welcome') { ok = true; cb.onOpen(c); }
        else if (d.type === 'bye') c.emit('close');
        else c.recv(d.s);
      };
      ch.postMessage({ to: 'host', from: me, type: 'hello' });
      setTimeout(() => { if (!ok) cb.onError('peer-unavailable'); }, 2500);
      return { destroy() { c.close(); } };
    }
    const peer = new window.Peer(undefined, { debug: 1 });
    let opened = false;
    peer.on('open', (id) => {
      const dc = peer.connect(PREFIX + code, { serialization: 'raw', reliable: true });
      const c = wrap((s) => { try { dc.send(s); } catch (e) { } });
      c.id = id;
      c.close = () => { try { dc.close(); peer.destroy(); } catch (e) { } };
      dc.on('open', () => { opened = true; cb.onOpen(c); });
      dc.on('data', (s) => c.recv(s));
      dc.on('close', () => c.emit('close'));
      dc.on('error', () => c.emit('close'));
      setTimeout(() => { if (!opened) cb.onError('timeout'); }, 15000);
    });
    peer.on('error', (e) => { if (!opened) cb.onError(e.type || 'error', e); });
    return { destroy() { try { peer.destroy(); } catch (e) { } } };
  };
})();
