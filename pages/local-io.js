// The static build's stand-in for socket.io (GitHub Pages, tools/build-pages.js): the game server's own modules
// (server/arena.js and everything it needs, bundled into js/local-server.js) run in this page, and this file connects
// the site to them with the same on / emit / ack calls socket.io offers. Every message is copied through JSON and
// delivered on a later task, as over a real connection, so the client and the "server" never share objects.
(function () {
  'use strict';
  const later = (fn) => setTimeout(fn, 0);
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const rooms = new Map();      // room -> Set of server-side sockets
  let nextId = 1;

  function makeEmitter() {
    const handlers = new Map();
    return {
      on(ev, fn) { if (!handlers.has(ev)) handlers.set(ev, []); handlers.get(ev).push(fn); return this; },
      off(ev, fn) { const l = handlers.get(ev); if (l) handlers.set(ev, fn ? l.filter((f) => f !== fn) : []); return this; },
      fire(ev, args) { for (const fn of handlers.get(ev) || []) { try { fn(...args); } catch (e) { console.error(ev, e); } } },
    };
  }

  // the server's side of io: io.to(room).emit and io.emit
  const server = {
    to(room) { return { emit: (ev, data) => { for (const s of rooms.get(room) || []) s._deliver(ev, data); } }; },
    emit(ev, data) { const all = new Set(); for (const set of rooms.values()) for (const s of set) all.add(s); for (const s of all) s._deliver(ev, data); },
  };

  window.io = function io(opts = {}) {
    const arena = window.LocalServer && window.LocalServer.arena;
    const id = `local-${nextId++}`;
    const client = makeEmitter();
    const srv = makeEmitter();
    const joined = new Set();
    const serverSocket = {
      id,
      handshake: { auth: copy(opts.auth || {}), address: 'local' },
      conn: { remoteAddress: 'local' },
      join(room) { if (!rooms.has(room)) rooms.set(room, new Set()); rooms.get(room).add(serverSocket); joined.add(room); },
      leave(room) { rooms.get(room)?.delete(serverSocket); joined.delete(room); },
      on: srv.on, off: srv.off,
      emit(ev, data) { serverSocket._deliver(ev, data); },
      disconnect() { clientSocket.disconnect(); },
      _deliver(ev, data) { const d = copy(data); later(() => client.fire(ev, [d])); },
    };
    const clientSocket = {
      id, connected: false,
      on(ev, fn) { client.on(ev, fn); return clientSocket; },
      off(ev, fn) { client.off(ev, fn); return clientSocket; },
      emit(ev, data, ack) {
        if (typeof data === 'function') { ack = data; data = undefined; }
        const d = copy(data);
        const reply = typeof ack === 'function' ? (r) => { const rc = copy(r); later(() => ack(rc)); } : undefined;
        later(() => srv.fire(ev, [d, reply]));
        return clientSocket;
      },
      disconnect() {
        if (!clientSocket.connected) return clientSocket;
        clientSocket.connected = false;
        for (const r of joined) rooms.get(r)?.delete(serverSocket);
        later(() => { srv.fire('disconnect', ['client namespace disconnect']); client.fire('disconnect', ['io client disconnect']); });
        return clientSocket;
      },
    };
    later(() => {
      if (!arena) { console.error('local server missing'); return; }
      arena.onConnect(serverSocket);
      clientSocket.connected = true;
      client.fire('connect', []);
    });
    return clientSocket;
  };

  if (window.LocalServer) window.LocalServer.arena.init(server);
})();
