// Shared toolkit for game scenes. No build step: plain script, exposes window.DuelKit and window.DuelScenes.
//
// ---------------------------------------------------------------------------------------------
// SCENE CONTRACT (public/js/scenes/<gameId>.js)
//   DuelScenes.register('<gameId>', {
//     create() -> scene,
//     preview(pubState, step) -> [move0, move1]    // scripted moves for looping mini previews
//     keyRule: 'one short sentence'                 // shown in the "How to play" splash
//     safeBottom: 0.18                              // fraction of the frame's height, from the bottom, that the
//                                                   // match controls panel may cover (nothing key there: no
//                                                   // hands, ball, guns). The match screen sizes the scene so
//                                                   // the panel never covers more.
//     safeCorner: 0.3                               // the same for the bottom-RIGHT corner, when the panel sits
//                                                   // there (optional; falls back to safeBottom)
//     controls: 'corner'                            // optional: the panel sits in the bottom-right corner
//                                                   // (Penalty); otherwise it is centered
//     shortcuts: [['1', 'Rock'], …]                 // keyboard shortcuts, listed in the match "?" sheet (the
//                                                   // panel shows no key badges)
//     hud(state, you) -> {                          // the game's own pieces in the top scoreboard (scenes/hud.js);
//       round: 'Kick 2/5', phase?: 'Keep one',      // pure: called with any publicState (the score itself is
//       note?: 'first to 3', alert?: bool,          // always state.score)
//       you: { role?: 'kick'|'keep'|'point'|'look', marks?: ['goal'|'miss'|'todo'|'|'], ammo?: [n, max] },
//       opp: { … the same },
//     }
//   })
// The SCOREBOARD (names, avatars, score, round, timer, the game's pieces) is NOT part of the scene: it lives in the
// match top bar (public/js/scenes/hud.js, styled in game-ui.css). Scenes draw no name tags, no "thinking…" bubbles
// and no scoreboards of their own; they feed the bar through ctx.hud.
// scene methods:
//   mount(container, ctx)
//     container: empty HTMLElement. The scene calls kit.base(container, ctx, ...) to build its frame.
//     ctx = {
//       you: 0|1                     my index in server states
//       players: [{ name, ai, look: { skin, hair, hairColor, shirt } }, ...]   by server index
//       mode: 'pvp'|'demo'|'tutorial'|'preview'|'dev'
//       mini: bool                   preview in a tile, hero or queue: no controls, no sound, no hud
//       controlsEl: HTMLElement|null where the scene renders its own controls with K.buttons() (null when mini)
//       send(move)                   called when the player taps a control
//       allow(move) -> bool          optional extra filter (tutorials) on top of legal moves
//       sound: DuelSound            play(name), haptic(pattern)
//       timing: { reveal, phase?, duelOver? }   animation budgets in ms; a reveal must fit its budget
//       hud: null | {                the top scoreboard (null in minis and previews):
//         set(state)                 score, round and the def.hud() pieces from a publicState: call it in
//                                    setRound and when the reveal shows the point (and at its end)
//         pulse('you'|'opp')         the side that just scored lights up
//         ammo('you'|'opp', n, max)  live ammo (Shootout: in step with the reload / shot animation)
//         status(side, 'thinking'|'locked'|'')   set by the app / tutorial runner, not by scenes
//       }
//     }
//   setRound(state)    publicState at the start of a step: reset poses, enable legal controls, ctx.hud?.set(state).
//   setLocked(who)     'you'|'opp'. The locked character does NOT move (no pose change in any game, no leaks):
//                      the HUD check mark is the sign. The scene may show your own pick only on your side.
//   reveal(r) -> Promise   r = { moves: [m0, m1], roundWinner, state (after), prev (before) }
//                      Plays exactly these moves, big punch text, updates the HUD. Fits ctx.timing.
//   end(r) -> Promise  r = { winner: 0|1|null }: celebration and reaction, about 1.2 s.
//   setControlsEnabled(bool)
//   target(name) -> Element|null   element a tutorial coach mark points to (documented per scene; the tutorial
//                      runner asks the HUD first: 'score', 'phase', 'role', 'ammo-you', 'scout', …)
//   destroy()
// One layout everywhere (desktop and phones, which play in landscape): the 1600x900 viewBox (K.SIZE).
// Your character is ALWAYS on the left (Penalty has no sides: the kicker stands in front).
// ---------------------------------------------------------------------------------------------
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reducedMQ.matches || document.documentElement.classList.contains('reduce-motion');
  // Colors are theme tokens (CSS custom properties from /css/theme.css), never hex values: switching the theme
  // re-colors every running scene at once. el() puts them into style="", because SVG presentation attributes
  // don't accept var().
  const v = (name) => `var(--${name})`;
  const C = {
    ink: v('bg'), ink2: v('surface-1'), ink3: v('surface-2'), line: v('line'), paper: v('text'), dim: v('text-2'), muted: v('muted'),
    you: v('player'), opp: v('opponent'), gold: v('money'), danger: v('danger'),
    outline: v('outline'), figDark: v('fig-dark'), figMid: v('fig-mid'), flash: v('flash'), shadow: v('shadow'),
  };
  const mix = (color, pct, other = 'transparent') => `color-mix(in srgb, ${color} ${pct}%, ${other})`;
  const SIZE = { W: 1600, H: 900 };

  // ---------------- SVG building ----------------
  const PAINT = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'color']);
  // Sets a paint property; token colors go into the style, plain values stay attributes.
  function paint(node, prop, value) {
    if (!node) return node;
    if (/var\(|color-mix\(/.test(String(value))) { node.style.setProperty(prop, value); node.removeAttribute(prop); }
    else { node.style.removeProperty(prop); node.setAttribute(prop, value); }
    return node;
  }
  function el(tag, attrs = {}, ...children) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (PAINT.has(k)) paint(e, k, v); else e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }
  const g = (attrs, ...children) => el('g', attrs, ...children);
  // Sets the pivot of a part in user units, so rotate() turns it around a joint.
  const pivot = (node, x, y) => { node.style.transformBox = 'view-box'; node.style.transformOrigin = `${x}px ${y}px`; return node; };
  const show = (node, on) => { if (node) node.style.display = on ? '' : 'none'; };

  // ---------------- animation (Web Animations API) ----------------
  const speed = () => (reduced() ? 0.35 : 1);
  function anim(node, keyframes, opts = {}) {
    if (!node) return Promise.resolve();
    const a = node.animate(keyframes, { fill: 'forwards', easing: 'ease-out', ...opts, duration: Math.max(1, (opts.duration ?? 300) * speed()), delay: (opts.delay || 0) * speed() });
    return a.finished.then(() => a, () => a);
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed()));
  // Ends every running animation on a node and its children, keeping the end state.
  function settle(node) { node?.getAnimations?.({ subtree: true }).forEach((a) => { try { a.finish(); } catch { a.cancel(); } }); }
  function clear(node) { node?.getAnimations?.({ subtree: true }).forEach((a) => a.cancel()); }
  function loop(node, keyframes, opts = {}) {
    if (!node || reduced()) return null;
    return node.animate(keyframes, { iterations: Infinity, easing: 'ease-in-out', ...opts });
  }
  // Screen shake / camera nudge: skipped for reduced motion.
  function shake(node, strength = 10) {
    if (!node || reduced()) return Promise.resolve();
    const s = strength;
    return anim(node, [{ transform: 'translate(0,0)' }, { transform: `translate(${s}px,${-s / 2}px)` }, { transform: `translate(${-s}px,${s / 2}px)` }, { transform: `translate(${s / 2}px,${s}px)` }, { transform: 'translate(0,0)' }], { duration: 260, fill: 'none' });
  }
  // Scales a list of step durations so they fit a budget in ms.
  function fit(steps, budget) {
    const total = steps.reduce((a, b) => a + b, 0);
    const f = budget && total > budget ? budget / total : 1;
    return steps.map((s) => Math.round(s * f));
  }

  // ---------------- frame: background art + svg + html overlay ----------------
  // Background: the scene's code-drawn art (DuelArt.bg[name], public/js/scenes/art*.js) in its own SVG behind the
  // action, on the same 1600x900 viewBox; until the art module has loaded, a token color stands in. The colored light
  // (player / opponent glow) is a separate layer on top, see glow().
  function background(frame, name) {
    const bg = document.createElement('div');
    bg.className = `scene-bg scene-bg--${name}`;
    const paint = window.DuelArt?.bg?.[name];
    if (paint) {
      const svg = el('svg', { viewBox: `0 0 ${SIZE.W} ${SIZE.H}`, preserveAspectRatio: 'xMidYMid slice', class: 'scene-bg-art', 'aria-hidden': 'true' });
      svg.append(paint(window.DuelKit));
      bg.append(svg);
      bg.classList.add('has-img');
    }
    frame.append(bg);
    return bg;
  }

  function base(container, ctx, { bg }) {
    const { W, H } = SIZE;
    container.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = `scene-frame${ctx.mini ? ' is-mini' : ''}`;
    frame.style.aspectRatio = `${W} / ${H}`;
    container.append(frame);
    background(frame, bg);
    const glowEl = document.createElement('div');
    glowEl.className = 'scene-glow';
    glowEl.innerHTML = '<i class="glow-you"></i><i class="glow-opp"></i>';
    frame.append(glowEl);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'scene-svg', 'aria-hidden': 'true' });
    const camera = g({ class: 'camera' });
    // amb / ambFront: ambient scene elements (clouds, crowd, tumbleweed…) behind and in front of the characters;
    // their transform is free (put moving pieces inside them, not on them).
    const layers = { amb: g({ class: 'amb' }), back: g({}), mid: g({}), front: g({}), ambFront: g({ class: 'amb-front' }) };
    camera.append(layers.amb, layers.back, layers.mid, layers.front, layers.ambFront);
    svg.append(camera);
    frame.append(svg);
    const overlay = document.createElement('div');
    overlay.className = 'scene-overlay';
    frame.append(overlay);
    const b = { frame, svg, camera, layers, overlay, glowEl, W, H, bgEl: frame.querySelector('.scene-bg') };
    glow(b, { you: [W * 0.12, H * 0.62], opp: [W * 0.88, H * 0.62] });
    return b;
  }

  // ---------------- the YOU arrow ----------------
  // A marker over YOUR character (never the opponent's): the blue "YOU" pill (--player, the dark outline, the text in
  // the text color) over a small blue down arrow, the same marker in every game. It drops in and
  // bobs a few times, then fades out (reduced motion: it only fades in and out, no movement). Pointer-transparent and
  // never awaited, so it never holds up a round or the timer; it sits above the head, clear of the face and the
  // controls. at = [x, y] of the arrow's tip in the layer's units.
  function youShape() {
    const w = 70, h = 30, aw = 14, ah = 12;
    const arrow = el('path', { d: `M${-aw} ${-ah - 2}L${aw} ${-ah - 2}L0 0Z` });
    Object.assign(arrow.style, { fill: C.you, stroke: C.ink, strokeWidth: 4, strokeLinejoin: 'round' });
    const pill = el('rect', { x: -w / 2, y: -ah - 6 - h, width: w, height: h, rx: h / 2 });
    Object.assign(pill.style, { fill: C.you, stroke: C.ink, strokeWidth: 3 });
    const label = el('text', { x: 0, y: -ah - 6 - h / 2, 'font-size': 18, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'YOU');
    Object.assign(label.style, { fill: C.paper, fontFamily: 'Fredoka, sans-serif', fontWeight: 700, letterSpacing: '.04em' });
    return g({}, arrow, g({ class: 'you-tag' }, pill, label));
  }
  function youArrow(layer, at, { ms = 2500, scale = 1, still = false, keep = false } = {}) {
    if (!layer || !at) return null;
    const bob = g({}, youShape()), node = g({ class: 'you-arrow', 'pointer-events': 'none', transform: `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})${scale !== 1 ? ` scale(${scale})` : ''}` }, bob);
    node.style.pointerEvents = 'none';
    layer.append(node);
    if (still) return node;
    // the element's own animate (not anim()): reduced motion must not shorten the time to a flash
    node.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' })
      .finished.then(() => { if (!keep) node.remove(); }, () => {});   // keep: it stays (invisible) for a coach mark
    if (!reduced()) {
      const d = -8;
      bob.animate([{ transform: 'translate(0px,-18px)' }, { transform: 'translate(0px,0px)', offset: 0.1 },
        ...[0.24, 0.38, 0.52, 0.66, 0.8].map((o, i) => ({ transform: `translate(0px,${i % 2 ? 0 : d}px)`, offset: o })),
        { transform: 'translate(0px,0px)' }], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
    }
    return node;
  }
  // The YOU arrow over a rig: centered on its head, its tip just above the top of what is drawn (the hair),
  // measured on the rendered rig so every hairstyle fits; an estimate before layout.
  function youMark(layer, rig, opts = {}) {
    if (!layer || !rig || opts.mini) return null;
    const [hx, hy] = rig.headPoint();
    let top = hy - 150 * (rig.placeAt?.[2] || 1);
    try {
      const box = rig.root.getBoundingClientRect(), m = layer.getScreenCTM()?.inverse();
      if (m && box.height > 0) top = new DOMPoint(box.left, box.top).matrixTransform(m).y;
    } catch { /* not laid out: keep the estimate */ }
    return youArrow(layer, [hx, top - 8], opts);
  }

  // At the start of a minigame (a scene's mount): the YOU arrow over your character once the scene is laid out (two
  // frames later, so the rig's box is measured). Nothing in the minis; nothing if the scene is gone by then.
  function youStart(b, rig, ctx = {}, opts = {}) {
    if (ctx.mini || !b || !rig) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (b.svg.isConnected) youMark(b.layers.front, rig, opts); }));
  }

  // Moves the two colored lights (viewBox units): the player's glow and the opponent's glow.
  function glow(b, { you, opp }) {
    const [gy, go] = b.glowEl.children;
    if (you) { gy.style.left = `${(you[0] / b.W) * 100}%`; gy.style.top = `${(you[1] / b.H) * 100}%`; }
    if (opp) { go.style.left = `${(opp[0] / b.W) * 100}%`; go.style.top = `${(opp[1] / b.H) * 100}%`; }
  }

  // Position of an overlay element in viewBox units.
  function place(node, b, x, y) { node.style.left = `${(x / b.W) * 100}%`; node.style.top = `${(y / b.H) * 100}%`; return node; }

  // ---------------- overlay pieces: punch text, "+1", labels (no name tags: the scoreboard is in the top bar) ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Big punchy text in the middle of the scene ("GOAL!", "BANG!"). who: 'you'|'opp'|'' (color).
  function punch(b, text, { who = '', x = b.W / 2, y = b.H * 0.42, hold = 600, size = '' } = {}) {
    const d = document.createElement('div');
    d.className = `scene-punch ${who} ${size}`;
    d.textContent = text;
    b.overlay.append(place(d, b, x, y));
    return anim(d, [
      { transform: 'translate(-50%,-38%) scale(.86)', opacity: 0, letterSpacing: '.04em' },
      { transform: 'translate(-50%,-50%) scale(1.03)', opacity: 1, letterSpacing: '-.03em', offset: 0.3 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.55 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.85 },
      { transform: 'translate(-50%,-58%) scale(.98)', opacity: 0 },
    ], { duration: hold + 380, easing: 'cubic-bezier(.2,.8,.3,1)' }).then(() => d.remove());
  }

  // "+1" (or any short text) floating up from a point in the side's color.
  function floatText(b, text, x, y, who = '', ms = 900) {
    const d = document.createElement('div');
    d.className = `scene-plus ${who}`;
    d.textContent = text;
    b.overlay.append(place(d, b, x, y));
    return anim(d, [
      { transform: 'translate(-50%,-30%) scale(.8)', opacity: 0 },
      { transform: 'translate(-50%,-80%) scale(1)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-170%) scale(1)', opacity: 0 },
    ], { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' }).then(() => d.remove());
  }

  function label(b, x, y, cls = '') {
    const d = document.createElement('div');
    d.className = `scene-label ${cls}`;
    b.overlay.append(place(d, b, x, y));
    return d;
  }

  // ---------------- controls ----------------
  // items: [{ v, label, icon (markup), key, cls }]. Returns { root, buttons, enable(fn), disable(), mark(v),
  // press(v), button(v), setPrompt(text) }.
  // Markup: a prompt chip ("Choose your move.") over a rounded panel of big icon buttons. On the match screen the
  // panel is an overlay at the bottom of the scene, centered or in the bottom-right corner (game-ui.css). The panel's
  // data-state follows the buttons: 'open' (something to pick), 'locked' (a pick is pressed and everything is
  // disabled: the pick stays highlighted with a lock, the others dim) or 'off' (waiting); the chip text follows it.
  // No key badges on the buttons: the keyboard shortcuts (K.keys) still work, the match "?" sheet lists them
  // (def.shortcuts) and each button carries aria-keyshortcuts.
  // opts: prompt = the chip's short line (title is an older name for it), hint = the longer line next to it (desktop).
  function buttons(ctx, items, { cls = '', hint = 'Your move locks in when you tap it.', title = '', prompt = '' } = {}) {
    if (!ctx.controlsEl) return null;
    const root = document.createElement('div');
    root.className = `scene-controls ${cls}`;
    root.dataset.state = 'off';
    let ask = prompt || title || 'Choose your move.';
    root.innerHTML = `<div class="ctl-chip"><span class="ctl-prompt" aria-live="polite"></span>${hint ? `<span class="ctl-sub hint">${esc(hint)}</span>` : ''}</div>
      <div class="ctl-panel" tabindex="-1"><div class="ctl-row ${cls}" role="group" aria-label="Your move">${items.map((it) => `
      <button class="ctl ${it.cls || ''}" data-v="${esc(it.v)}" aria-label="${esc(it.label)}"${it.key ? ` aria-keyshortcuts="${esc(it.key)}"` : ''}>
        ${it.icon ? `<span class="ctl-icon">${it.icon}</span>` : ''}<span class="ctl-label">${esc(it.label)}</span><span class="ctl-lock" aria-hidden="true">${window.DuelIcons?.svg?.('lock') || ''}</span>
      </button>`).join('')}</div></div>`;
    ctx.controlsEl.innerHTML = '';
    ctx.controlsEl.append(root);
    const list = [...root.querySelectorAll('.ctl')];
    const promptEl = root.querySelector('.ctl-prompt');
    const sync = (force) => {
      const open = list.some((bt) => !bt.disabled), picked = list.some((bt) => bt.getAttribute('aria-pressed') === 'true');
      const state = open ? 'open' : picked ? 'locked' : 'off';
      if (!force && root.dataset.state === state && promptEl.textContent) return;
      root.dataset.state = state;
      promptEl.textContent = state === 'open' ? ask : state === 'locked' ? 'Locked in!' : 'Get ready…';
    };
    sync();
    new MutationObserver(() => sync()).observe(root, { subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed'] });
    const api = {
      root, buttons: list, onPick: null,
      // a new prompt (Penalty: "Pick a target" / "Pick a dive" as the roles switch)
      setPrompt(text) { ask = text || ask; sync(true); },
      enable(isLegal = () => true) {
        list.forEach((bt) => {
          const v = items.find((i) => String(i.v) === bt.dataset.v).v;
          bt.disabled = !(isLegal(v) && (ctx.allow ? ctx.allow(v) : true));
          bt.setAttribute('aria-pressed', 'false');
        });
        // a keyboard player whose focus waited on the panel gets it back on the first legal move
        if (root.querySelector('.ctl-panel') === document.activeElement) list.find((bt) => !bt.disabled)?.focus({ preventScroll: true });
      },
      disable() { list.forEach((bt) => { bt.disabled = true; }); },
      mark(v) { list.forEach((bt) => bt.setAttribute('aria-pressed', String(bt.dataset.v === String(v)))); },
      press(v) { const bt = list.find((x) => x.dataset.v === String(v) && !x.disabled); if (bt) bt.click(); },
      button(v) { return list.find((x) => x.dataset.v === String(v)) || null; },
    };
    list.forEach((bt) => {
      bt.addEventListener('pointerenter', () => ctx.sound?.play('ui-hover', { volume: 0.4 }));
      bt.addEventListener('click', () => {
        if (bt.disabled) return;
        const v = items.find((i) => String(i.v) === bt.dataset.v).v;
        ctx.sound?.play('ui-click');
        api.mark(v);
        // keep keyboard focus in the panel (a disabled button would drop it to the page)
        const hadFocus = root.contains(document.activeElement);
        api.disable();
        if (hadFocus) root.querySelector('.ctl-panel')?.focus({ preventScroll: true });
        api.onPick?.(v);
      });
    });
    return api;
  }

  // Keyboard shortcuts for a scene; returns an unbind function.
  function keys(map, handler) {
    const on = (e) => {
      if (e.target.closest?.('input, textarea, dialog[open]') || document.querySelector('dialog[open]')) return;
      const v = map[e.key];
      if (v === undefined) return;
      e.preventDefault();
      handler(v);
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }

  // ---------------- shared drawings ----------------
  const stroke = { stroke: C.outline, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  // Hand icons for controls: the character hands/paws of your team (public/js/figures/rig.js). They repaint themselves
  // when the team changes.
  const handIcon = (gesture) => window.DuelFigures?.handIcon(gesture) || '';
  const icons = {
    rock: () => handIcon('rock'), paper: () => handIcon('paper'), scissors: () => handIcon('scissors'),
    left: '<svg viewBox="0 0 48 48" class="ico"><path d="M29 11 L16 24 L29 37" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 48 48" class="ico"><path d="M19 11 L32 24 L19 37" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 48 48" class="ico"><path d="M11 19 L24 32 L37 19" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Burst of small shards around a point (money color for wins). Cheap: a handful of nodes.
  function burst(layer, x, y, color = C.gold, n = 10, r = 140) {
    if (reduced()) return Promise.resolve();
    const parts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const p = el('rect', { x: x - 3, y: y - 12, width: 6, height: 24, rx: 3, fill: color });
      layer.append(p);
      return anim(p, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }], { duration: 650 }).then(() => p.remove());
    });
    return Promise.all(parts);
  }

  // A short white flash (the "snap" of a reveal). r in viewBox units.
  function flash(layer, x, y, r = 150, ms = 200) {
    const inner = g({}, el('circle', { r, fill: C.flash, opacity: 0.18 }), el('circle', { r: r * 0.55, fill: C.flash, opacity: 0.45 }));
    const node = g({ transform: `translate(${x} ${y})` }, inner);
    layer.append(node);
    return anim(inner, [{ transform: 'scale(.55)', opacity: 1 }, { transform: 'scale(1.15)', opacity: 0 }], { duration: ms, easing: 'ease-out' }).then(() => node.remove());
  }

  // RPS outcome effects (DuelArt.fx, drawn in code): 'rock' shards, 'scissors' slashes, 'paper' sweep, 'clash'
  // sparks. A soft glow in `color` (a token) sits under the effect; rot turns it toward the loser.
  const FX_MOTION = {
    rock: [{ transform: 'scale(.35)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.18)', opacity: 0 }],
    scissors: [{ transform: 'rotate(-10deg) scale(.85)', opacity: 0 }, { transform: 'rotate(0deg) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'rotate(2deg) scale(1.04)', opacity: 1, offset: 0.6 }, { transform: 'rotate(4deg) scale(1.08)', opacity: 0 }],
    paper: [{ transform: 'rotate(-70deg) scale(.8)', opacity: 0 }, { transform: 'rotate(-10deg) scale(1)', opacity: 1, offset: 0.45 }, { transform: 'rotate(8deg) scale(1.05)', opacity: 0 }],
    clash: [{ transform: 'rotate(0deg) scale(.2)', opacity: 1 }, { transform: 'rotate(25deg) scale(1)', opacity: 1, offset: 0.4 }, { transform: 'rotate(45deg) scale(1.25)', opacity: 0 }],
  };
  function fx(layer, kind, x, y, { size = 420, rot = 0, color = C.flash, ms = 650 } = {}) {
    const art = window.DuelArt?.fx?.[kind]?.(size, window.DuelKit) || null;
    const inner = g({}, el('circle', { r: size * 0.32, fill: color, opacity: 0.22 }), art);
    const node = g({ transform: `translate(${x} ${y}) rotate(${rot})` }, inner);
    layer.append(node);
    return anim(inner, FX_MOTION[kind], { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' }).then(() => node.remove());
  }

  // ---------------- art elements (DuelArt.el: { name: { w, h, ax, ay, draw(K) } }, anchor in element units) ----------------
  // Each element is drawn in code inside its own w x h box; (ax, ay) is its anchor (the bottom center for things that
  // stand, else the center). sprite() places it so its anchor sits at (x, y).
  const spriteInfo = (name) => { const a = window.DuelArt?.el?.[name]; return a ? { w: a.w, h: a.h, ax: a.ax, ay: a.ay } : null; };
  const sprReady = Promise.resolve({});
  // A code-drawn element placed so its anchor sits at (x, y). Returns a <g> (move/rotate/scale it freely: its origin
  // IS the anchor). opts: scale (1 = element units), rot (deg), flip (mirror horizontally around the anchor), opacity.
  function sprite(layer, name, { x = 0, y = 0, scale = 1, rot = 0, flip = false, opacity, cls } = {}) {
    const holder = g({});
    const inner = g({ transform: `scale(${flip ? -scale : scale} ${scale})` }, holder);
    const node = g({ transform: `translate(${x} ${y}) rotate(${rot})`, class: cls, opacity }, inner);
    const fill = (n) => {
      holder.innerHTML = '';
      const a = window.DuelArt?.el?.[n];
      if (!a) return;
      holder.setAttribute('transform', `translate(${-a.ax} ${-a.ay})`);
      holder.append(a.draw(window.DuelKit));
    };
    fill(name);
    node.setSprite = fill;
    node.inner = inner;
    layer?.append(node);
    return node;
  }

  // ---------------- scene life: timers and loops that end with the scene ----------------
  // const life = K.life(); life.timeout(fn, ms); life.every(ms, fn, jitter); life.add(animationOrFn); life.stop()
  // Ambient motion should go through life.every / K.loop so destroy() (life.stop()) ends it. Nothing ambient runs
  // under reduced motion (every() and loop() are no-ops then) or in mini previews (pass { mini: true }).
  // every(ms, fn, jitter, { calm: true }): the approved exceptions that stay alive (calmer) under reduced motion (the
  // Shootout tumbleweed, the vulture, the meadow bugs, the gnats); still never in minis. life.mini = the mini flag.
  function life({ mini = false } = {}) {
    const timers = new Set(), stops = new Set();
    let dead = false;
    const api = {
      mini,
      timeout(fn, ms) { if (dead) return null; const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; },
      every(ms, fn, jitter = 0, { calm = false } = {}) {
        if ((reduced() && !calm) || mini) return null;
        const tick = () => { if (dead) return; if (!document.hidden) fn(); api.timeout(tick, ms + Math.random() * jitter); };
        return api.timeout(tick, ms * 0.3 + Math.random() * jitter);
      },
      add(x) { if (x) stops.add(x); return x; },
      stop() { dead = true; timers.forEach(clearTimeout); timers.clear(); stops.forEach((x) => { try { typeof x === 'function' ? x() : x.cancel(); } catch { /* gone */ } }); stops.clear(); },
      get dead() { return dead; },
    };
    return api;
  }

  // (No pointer / tilt parallax: moving the background art under characters that stand on it made the whole scene
  // swim with the mouse. The world stays put; ambient life moves inside it.)

  // ---------------- distant birds: little code-drawn silhouettes crossing the sky now and then ----------------
  // farBirds(b, life, layer, { band: [y0, y1], size, every, jitter, max }): every `every` ms (+ jitter) a group of 1..max
  // birds flies across the band (left to right or back), flapping (two wing shapes switched), small and soft (a
  // background detail). Through life.every: none under reduced motion or in minis.
  function farBird(size) {
    const up = 'M-7 1Q-3.5 -4 0 0.5Q3.5 -4 7 1', down = 'M-7 -1Q-3.5 3 0 0.5Q3.5 3 7 -1';
    const style = `fill:none;stroke:var(--fig-dark);stroke-width:${(1.8).toFixed(1)};stroke-linecap:round;stroke-linejoin:round`;
    const a = el('path', { d: up, style }), bb = el('path', { d: down, style });
    const node = g({ transform: `scale(${size})`, opacity: 0.75 }, a, bb);
    const ms = 260 + Math.random() * 120;
    a.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: ms, iterations: Infinity, easing: 'linear' });
    bb.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: ms, iterations: Infinity, easing: 'linear' });
    return node;
  }
  function farBirds(b, life, layer, { band = [60, 200], size = 1, every = 22000, jitter = 12000, max = 3 } = {}) {
    if (!life || !layer) return;
    life.every(every, () => {
      const n = 1 + Math.floor(Math.random() * max), ltr = Math.random() < 0.5, y = band[0] + Math.random() * (band[1] - band[0]);
      const dur = 11000 + Math.random() * 5000, dx = b.W + 200;
      for (let i = 0; i < n; i++) {
        const wrap = g({ transform: `translate(${ltr ? -100 : b.W + 100} ${(y + (i % 2 ? 10 : -6) * (i ? 1 : 0)).toFixed(0)})` });
        const fly = g({});
        wrap.append(fly);
        fly.append(farBird(size * (0.85 + Math.random() * 0.3)));
        layer.append(wrap);
        const lag = i * (24 + Math.random() * 18), dir = ltr ? 1 : -1;
        fly.animate([
          { transform: `translate(${-dir * lag}px,0px)` },
          { transform: `translate(${dir * (dx / 2 - lag)}px,${(-10 - Math.random() * 14).toFixed(0)}px)`, offset: 0.5 },
          { transform: `translate(${dir * (dx - lag)}px,${(Math.random() * 12).toFixed(0)}px)` },
        ], { duration: dur, easing: 'linear', fill: 'both' }).finished.then(() => wrap.remove(), () => wrap.remove());
      }
    }, jitter);
  }

  // ---------------- gnats: a tiny swarm buzzing in small loops (a background corner detail) ----------------
  // gnats(life, layer, { at: [x, y], n, size, r }): n gnats (a dark dot with a pale flickering wing) each loop a small
  // figure-eight of radius ~r around `at`, the swarm drifting a little. Started with the scene's life (nothing in
  // minis) and ended by life.stop(). Approved reduced-motion exception (like the Shootout tumbleweed): they stay but
  // calmer: one fewer, half the loop, about 2.5x slower, a slow wing flicker. Nodes: 1 group + 3 per gnat.
  function gnats(life, layer, { at = [0, 0], n = 3, size = 1, r = 14 } = {}) {
    if (!life || life.mini || !layer) return null;
    const calm = reduced(), count = calm ? Math.max(1, n - 1) : n, R = r * (calm ? 0.5 : 1), slow = calm ? 2.5 : 1;
    const swarm = g({ class: 'gnats', transform: `translate(${at[0]} ${at[1]})` });
    const add = (a) => life.add(a);
    for (let i = 0; i < count; i++) {
      const wing = el('ellipse', { cx: -0.8, cy: -2.2, rx: 2.6, ry: 1.5, style: 'fill:var(--flash);opacity:.75' });
      const dot = el('circle', { r: 1.9, style: 'fill:var(--fig-dark)' });
      const fly = g({}, g({ transform: `scale(${size})` }, wing, dot));
      swarm.append(fly);
      // a figure-eight with its own size, tilt and phase, sampled (linear between the samples)
      const ax = R * (0.7 + Math.random() * 0.6), ay = R * (0.4 + Math.random() * 0.4), ph = Math.random() * Math.PI * 2, tilt = (Math.random() - 0.5) * 1.2;
      const N = 16, kf = [];
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * Math.PI * 2, x = ax * Math.sin(t + ph), y = ay * Math.sin(2 * (t + ph));
        kf.push({ transform: `translate(${(x * Math.cos(tilt) - y * Math.sin(tilt)).toFixed(1)}px,${(x * Math.sin(tilt) + y * Math.cos(tilt)).toFixed(1)}px)` });
      }
      add(fly.animate(kf, { duration: (900 + Math.random() * 700) * slow, iterations: Infinity, easing: 'linear', delay: -Math.random() * 2000 }));
      add(wing.animate([{ opacity: 0.8 }, { opacity: 0.15 }], { duration: calm ? 240 : 60, iterations: Infinity, direction: 'alternate' }));
    }
    // the swarm itself wanders a little
    const dx = R * 0.9, dy = R * 0.5;
    add(swarm.animate([{ transform: `translate(${at[0]}px,${at[1]}px)` }, { transform: `translate(${at[0] + dx}px,${at[1] - dy}px)` },
      { transform: `translate(${at[0] - dx * 0.4}px,${at[1] + dy}px)` }, { transform: `translate(${at[0]}px,${at[1]}px)` }],
    { duration: 7000 * slow, iterations: Infinity, easing: 'ease-in-out' }));
    layer.append(swarm);
    return swarm;
  }

  window.DuelKit = { farBirds, gnats, C, SIZE, el, g, pivot, youArrow, youMark, youStart, show, anim, sleep, settle, clear, loop, shake, fit, base, place, glow, punch, floatText, label, buttons, keys, handIcon, icons, burst, flash, fx, reduced, esc, stroke, paint, mix, sprite, spriteInfo, sprReady, life };

  // ---------------- registry ----------------
  const registry = {};
  window.DuelScenes = {
    register(id, def) { registry[id] = def; },
    get(id) { return registry[id]; },
    list() { return Object.keys(registry); },
  };
})();
