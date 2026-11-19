// Interactive tutorials: the real scene module in a sandbox (no server, no timer, a scripted opponent),
// real rules from window.DuelEngines, and coach marks (spotlight + bubble + pulsing arrow) on the real controls.
// DuelTutorial.start(gameId, { host, controlsEl, timing, sound, onFinish(status), showScout(tells), hud, players })
//   status: 'done' | 'skipped'
//   hud: the top scoreboard (DuelHud.bind(), null in the scene lab without one): the scene feeds it as in a match, the
//   runner sets the "thinking… / locked in" badges, and coach marks look for their target there first ('score',
//   'phase', 'role', 'ammo-you', 'scout', …), then in the scene. players: [me, Coach Bot] (real names, looks).
(function () {
  const K = window.DuelKit;
  // Engines return live arrays; scenes get snapshots, like the JSON the server sends.
  const snap = (x) => JSON.parse(JSON.stringify(x));
  const OTHER = { left: 'right', right: 'left', center: 'left' };
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

  // ---------------- wording ----------------
  // Every string lives in public/js/tutorial-text.js (window.DuelTutorialText, generated from docs/TUTORIAL-TEXT.md by
  // `npm run tutorial-text`); T(id, vars) fills its {placeholders}. A page that loads this file without the texts first
  // (the scene lab) gets them loaded here, long before anyone starts a tutorial.
  if (!window.DuelTutorialText && document.currentScript?.src) {
    const tag = document.createElement('script');
    tag.src = new URL('tutorial-text.js', document.currentScript.src).href;
    document.head.append(tag);
  }
  const T = (id, vars) => {
    const text = window.DuelTutorialText?.[id];
    if (text == null) { console.error('tutorial: no text for', id); return id; }
    return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
  };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ---------------- coach marks ----------------
  function coachLayer() {
    const root = document.createElement('div');
    root.className = 'coach';
    root.innerHTML = `<div class="coach-spot"></div><div class="coach-arrow" aria-hidden="true"></div>
      <div class="coach-bubble" role="dialog" aria-live="polite"><img class="coach-cover" alt="" hidden><p class="coach-text"></p>
        <div class="coach-row"><span class="coach-steps"></span><button class="btn btn-ghost coach-skip">${esc(T('ui.skip'))}</button><button class="btn btn-primary coach-next">${esc(T('ui.next'))}</button></div></div>`;
    document.body.append(root);
    return root;
  }

  // Places the spotlight on the target and the bubble above or below it, never on top of it.
  function point(layer, target, text, { next = false, step = '', cover = null } = {}) {
    const spot = layer.querySelector('.coach-spot'), arrow = layer.querySelector('.coach-arrow'), bubble = layer.querySelector('.coach-bubble');
    const img = layer.querySelector('.coach-cover');
    img.hidden = !cover;
    if (cover) img.src = cover;
    layer.querySelector('.coach-text').textContent = text;
    layer.querySelector('.coach-steps').textContent = step;
    layer.querySelector('.coach-next').hidden = !next;
    layer.classList.toggle('has-target', !!target);
    const place = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const bw = Math.min(360, vw - 24);
      bubble.style.width = `${bw}px`;
      if (!target || !target.isConnected) {
        spot.style.display = 'none'; arrow.style.display = 'none';
        bubble.style.left = `${(vw - bw) / 2}px`; bubble.style.top = `${Math.max(12, vh * 0.18)}px`;
        return;
      }
      const r = target.getBoundingClientRect(), pad = 8;
      Object.assign(spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      const bh = bubble.offsetHeight || 110;
      const above = r.top - pad - 46 - bh >= 8;
      const top = above ? r.top - pad - 46 - bh : Math.min(vh - bh - 8, r.bottom + pad + 46);
      const left = Math.max(12, Math.min(vw - bw - 12, r.left + r.width / 2 - bw / 2));
      Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
      Object.assign(arrow.style, { display: 'block', left: `${r.left + r.width / 2 - 14}px`, top: above ? `${r.top - pad - 40}px` : `${r.bottom + pad + 10}px` });
      arrow.classList.toggle('up', !above);
    };
    place();
    requestAnimationFrame(place);
    layer._place = place;
  }

  // ---------------- runner ----------------
  function start(gameId, opts) {
    const def = window.DuelScenes.get(gameId), E = window.DuelEngines[gameId];
    const sound = opts.sound || window.DuelSound;
    const layer = coachLayer();
    const scene = def.create();
    let pick = null, finished = false;
    const ctx = {
      you: 0, mode: 'tutorial', mini: false, controlsEl: opts.controlsEl,
      players: opts.players || [{ id: null, name: T('ui.guest-name') }, { id: null, name: T('ui.coach-name'), ai: true }],
      sound, timing: opts.timing || E.anim, allow: null, hud: opts.hud || null,
      send: (m) => { const p = pick; pick = null; p?.(m); },
    };
    // a coach-mark target: the scoreboard's pieces first, then the scene's
    const target = (name) => (name ? ctx.hud?.target?.(name) || scene.target(name) : null);
    scene.mount(opts.host, ctx);
    const s = E.init(1);
    const onResize = () => layer._place?.();
    window.addEventListener('resize', onResize);

    function finish(status) {
      if (finished) return;
      finished = true;
      window.removeEventListener('resize', onResize);
      layer.remove();
      scene.destroy();
      opts.onFinish?.(status);
    }
    layer.querySelector('.coach-skip').addEventListener('click', () => finish('skipped'));

    let n = 0;
    const total = SCRIPTS[gameId].steps;
    const counter = () => T('ui.counter', { n: Math.min(++n, total), total });

    // Waits for "Next" on a note (textId: a key of DuelTutorialText).
    const note = (textId, targetName) => new Promise((res) => {
      if (finished) return res();
      point(layer, target(targetName), T(textId), { next: true, step: counter() });
      layer.querySelector('.coach-next').onclick = () => { sound?.play('ui-click'); res(); };
    });

    // One step: the player taps a real control, the scripted opponent answers, the scene reveals. say / after: text IDs.
    async function turn({ say, target: to, allow, opp, after, afterTarget }) {
      if (finished) return null;
      const prev = snap(E.publicState(s, 0));
      ctx.allow = allow ? (m) => allow(m, prev) : null;
      ctx.hud?.status('you', 'thinking'); ctx.hud?.status('opp', 'thinking');
      scene.setRound(prev);
      point(layer, target(to), T(say), { step: counter() });
      const mine = await new Promise((res) => { pick = res; });
      if (finished) return null;
      layer.classList.add('waiting');
      ctx.hud?.status('you', 'locked');
      scene.setLocked('you');
      await K.sleep(350);
      ctx.hud?.status('opp', 'locked');
      scene.setLocked('opp');
      ctx.hud?.status('you', ''); ctx.hud?.status('opp', '');
      const theirs = opp(prev, mine);
      const moves = [E.validateMove(s, 0, mine), E.validateMove(s, 1, theirs)];
      const res = E.resolveRound(s, moves);
      await scene.reveal({ moves, roundWinner: res.roundWinner, state: snap(E.publicState(s, 0)), prev });
      layer.classList.remove('waiting');
      if (after) await note(after, afterTarget);
      return res;
    }

    const api = { E, s, scene, turn, note, target };
    // Intro card with the game's cover (public/covers/<game>.webp), when one is rendered.
    const intro = () => new Promise((res) => {
      if (finished || !opts.cover) return res();
      point(layer, null, T('ui.intro', { keyRule: def.keyRule || '' }).trim(), { next: true, step: T('ui.intro-step'), cover: opts.cover });
      layer.querySelector('.coach-next').onclick = () => { sound?.play('ui-click'); res(); };
    });
    (async () => {
      try {
        await intro();
        await SCRIPTS[gameId].run(api);
        if (!finished) { sound?.play('ui-win-match'); finish('done'); }
      } catch (e) { console.error('tutorial', e); finish('skipped'); }
    })();
    return { stop: () => finish('skipped') };
  }

  const SAMPLE_TELLS = {
    enough: true, minMatches: 10, sample: { matches: 24, moves: 117 },
    distribution: { rock: 46, paper: 31, scissors: 23 }, repeatAfterWin: 64, afterWin: 39, switchAfterLoss: 71, afterLoss: 35, opening: 'rock',
  };

  // Scripted lessons. The opponent's moves are picked after yours so every key rule is shown once.
  const only = (v) => (m) => m === v;
  const SCRIPTS = {
    penalty: {
      steps: 4,
      async run({ turn, note }) {
        await turn({ say: 'penalty.1', target: 'you-marker', opp: (p, mine) => OTHER[mine] || 'left', after: 'penalty.1.after' });
        await turn({ say: 'penalty.2', target: 'goal', opp: (p, mine) => mine, after: 'penalty.2.after' });
        await turn({ say: 'penalty.3', target: 'goal', opp: (p, mine) => mine, after: 'penalty.3.after' });
        await note('penalty.4', 'scoreboard');
      },
    },
    shootout: {
      steps: 9,
      async run({ turn, note }) {
        await turn({ say: 'shootout.1', target: 'reload', allow: only('reload'), opp: () => 'reload' });
        await turn({ say: 'shootout.2', target: 'shoot', allow: only('shoot'), opp: () => 'reload', after: 'shootout.2.after' });
        await turn({ say: 'shootout.3', target: 'reload', allow: only('reload'), opp: () => 'reload' });
        await turn({ say: 'shootout.4', target: 'shoot', allow: only('shoot'), opp: () => 'block', after: 'shootout.4.after' });
        for (let i = 0; i < 3; i++) await turn({ say: ['shootout.5', 'shootout.6', 'shootout.7'][i], target: 'ammo-you', allow: only('reload'), opp: () => 'block' });
        await turn({ say: 'shootout.8', target: 'blast', allow: only('blast'), opp: () => 'block', after: 'shootout.8.after' });
        await note('shootout.9', 'ammo-opp');
      },
    },
    rps: {
      steps: 6,
      async run({ turn, note, target }) {
        await turn({ say: 'rps.1', target: 'rock', allow: only('rock'), opp: () => 'scissors', after: 'rps.1.after' });
        await turn({ say: 'rps.2', target: 'scissors', allow: only('scissors'), opp: () => 'paper', after: 'rps.2.after' });
        await turn({ say: 'rps.3', target: 'paper', allow: only('paper'), opp: () => 'rock', after: 'rps.3.after' });
        await turn({ say: 'rps.4', target: 'paper', opp: (p, mine) => mine, after: 'rps.4.after' });
        const scout = target('scout');
        await note('rps.5', scout ? 'scout' : null);
        scout?.click();
        await note('rps.6');
      },
    },
    rps_minus_one: {
      steps: 6,
      async run({ turn, note }) {
        let mine;
        await turn({ say: 'rps_minus_one.1', target: 'rock', opp: (p, pair) => { mine = pair; const o = [...new Set(pair.map((h) => BEATS[h]))]; return o.length === 2 ? o : [BEATS[pair[0]], pair[0]]; } });
        await turn({ say: 'rps_minus_one.2', target: 'keep-0', opp: (p, kept) => (p.pairs[1].includes(BEATS[kept]) ? BEATS[kept] : p.pairs[1][0]), after: 'rps_minus_one.2.after' });
        await turn({ say: 'rps_minus_one.3', target: 'rock', opp: (p, pair) => { const o = [...new Set(pair.map((h) => COUNTER[h]))]; return o.length === 2 ? o : [COUNTER[pair[0]], pair[0]]; } });
        await turn({ say: 'rps_minus_one.4', target: 'keep-0', opp: (p, kept) => (p.pairs[1].includes(COUNTER[kept]) ? COUNTER[kept] : p.pairs[1][0]), after: 'rps_minus_one.4.after' });
        await note('rps_minus_one.5', 'phase');
        void mine;
      },
    },
  };

  window.DuelTutorial = { start, SAMPLE_TELLS, games: Object.keys(SCRIPTS) };
})();
