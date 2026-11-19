// Looping mini previews of the game scenes (lobby tiles, landing hero, queue overlay, rules card).
// They run the real rules from window.DuelEngines with the scene's scripted preview moves. No sound.
(function () {
  const K = window.DuelKit;
  // Engines return live arrays; scenes get snapshots, like the JSON the server sends.
  const snap = (x) => JSON.parse(JSON.stringify(x));

  function mountMini(gameId, host) {
    const def = window.DuelScenes.get(gameId), E = window.DuelEngines?.[gameId];
    if (!def || !E) return null;
    const scene = def.create();
    scene.mount(host, { you: 0, mode: 'preview', mini: true, controlsEl: null, players: [], sound: null, timing: E.anim, send() {} });
    return { def, E, scene };
  }

  // A still frame: the scene at the start of a match.
  function still(gameId, host) {
    const m = mountMini(gameId, host);
    if (!m) return null;
    m.scene.setRound(snap(m.E.publicState(m.E.init(1), 0)));
    return { stop() { m.scene.destroy(); } };
  }

  // Plays scripted rounds until stop(). `rounds` limits how many reveals to play (then resolves).
  function loop(gameId, host, { rounds = Infinity, pause = 500 } = {}) {
    const m = mountMini(gameId, host);
    if (!m) return { stop() {}, done: Promise.resolve() };
    let stopped = false, step = 0, s = m.E.init(1);
    const done = (async () => {
      for (let i = 0; i < rounds && !stopped; i++) {
        const prev = snap(m.E.publicState(s, 0));
        m.scene.setRound(prev);
        await K.sleep(pause);
        if (stopped) break;
        m.scene.setLocked('opp'); m.scene.setLocked('you');
        let moves = m.def.preview(prev, step++);
        try { moves = moves.map((mv, p) => m.E.validateMove(s, p, mv)); }
        catch { moves = [0, 1].map((p) => { const opts = m.E.legalMoves(m.E.publicState(s, p), p); return m.E.validateMove(s, p, opts[Math.floor(Math.random() * opts.length)]); }); }
        const res = m.E.resolveRound(s, moves);
        await m.scene.reveal({ moves, roundWinner: res.roundWinner, state: snap(m.E.publicState(s, 0)), prev });
        if (res.done) s = m.E.init(1);
        await K.sleep(pause);
      }
    })();
    return { done, stop() { stopped = true; m.scene.destroy(); } };
  }

  window.DuelPreview = { still, loop };
})();
