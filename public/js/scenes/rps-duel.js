// Shared staging for Rock Paper Scissors and RPS Minus One: a table duel in a calm room (the code-drawn background
// 'rps-table' in art-rps.js: two wooden chairs facing each other across a small pedestal table). Each player SITS on
// a chair (rig pose field sit: 1) and plays their hands over the table. A side view (the one layout, phones too): you
// on the left chair, the opponent on the right one (a mirrored rig), both turned toward the table (3/4). The hands
// come from the two sides and meet over the middle of the table.
// Arms: the FAR arm (a2, on the table side) comes out from behind the torso and plays over the table; the NEAR arm
// (a1) rests its hand on the lap. Minus One: both arms reach toward the table, the far one the upper hand, the near
// one the lower hand (SLOTS: which arm shows a pair's slot).
// Layers: the chairs and the table are painted in the background; they line up with the seat points below.
//
// Gesture hands: the rig draws ready (the pumping fist) / rock / paper / scissors in code; rig.bigHands() makes the
// playing arms' gestures big. Poses are data per side (poses()): h1/h2 = 'ready' | 'rock' | 'paper' | 'scissors'.
// Limb points of the seated poses are measured from the seat (rig.js, sit). Pointing toward the opponent is +x in
// character space for both rigs (the opponent's rig is mirrored).
(function () {
  const K = window.DuelKit;
  const { g } = K;

  // Layout. seat: [x, y, scale] = where the body's bottom rests (viewBox; the chair seats are drawn just under it),
  // flip = mirrored rig, view = turn, arm = the throwing arm in RPS (Minus One uses both: slot 0 = a2, slot 1 = a1),
  // hand = the gesture hands' size (rig.bigHands scale).
  const STAGE = {
    seat: { you: [460, 593, 1.32], opp: [1140, 593, 1.32] }, flip: { you: false, opp: true },
    view: { you: { turn: 0.6 }, opp: { turn: 0.6 } }, arm: { you: 2, opp: 2 }, hand: 0.36,
    plus: { you: [460, 205], opp: [1140, 205] }, punch: [800, 300], glow: { you: [460, 470], opp: [1140, 470] },
  };
  const GEST = { ready: true, rock: true, paper: true, scissors: true };

  // ---------------- poses ----------------
  // A gesture hand: [x, y, bend] wrist point (seat-relative, character units), r = its angle (deg; 0 = toward the
  // opponent, negative = tipped up), hs = its scale.
  //
  // Wrist points of the throwing arm (a2, the far arm): [x, y, bend, r, hs] in the units of a 1.32 seat scale
  // (DESK_K turns them into the 1.2 reach, so the hands meet over the table).
  const DESK_K = 1.2 / 1.32;
  const DESK = Object.fromEntries(Object.entries({
    ready: [84, -112, -0.08, -12, 0.9], up: [112, -196, -0.08, -50, 0.95], down: [132, -100, -0.04, 6, 0.95],
    throw: [140, -150, -0.08, -14, 1], strike: [164, -156, -0.04, -10, 1.04], recoil: [104, -122, -0.08, 14, 0.92], meet: [156, -154, -0.04, -10, 1],
  }).map(([k, [x, y, bend, r, hs]]) => [k, [Math.round(x * DESK_K), Math.round(y * DESK_K), bend, r, hs]]));
  const handAt = (key) => {
    const [x, y, bend, r, hs] = DESK[key];
    return [[x, y, bend], r, hs];
  };

  // Seated bodies: legs, the free arm, and the end-of-match poses, per side. The thighs run forward over the seat,
  // the shins down past its front edge, the shoes flat on the rug.
  const LAP = [22, -40, 0.25];
  function bodyOf(side) {
    return {
      base: { sit: 1, ...STAGE.view[side], l1: [46, 58, -0.62], l2: [62, 58, -0.62], f1: 0, f2: 0 },
      // the near hand rests on the lap
      free: { a1: LAP, h1: 'ball' },
      // Minus One: the dropped hand on the lap (a1), or put down on the near edge of the table (a2: the far arm is
      // drawn behind the body and the legs, so it rests where it stays in view)
      drop: [LAP, [100, -70, -0.1]],
      cheer: { a1: [-76, -236, -0.3], a2: [112, -214, 0.08], h1: 'fist', h2: 'fist', by: -6, hy: -4 },
      sad: { by: 8, hy: 10, hrot: 10, a1: [20, -32, 0.25], a2: [50, -34, -0.08], ly: 0.7 },
      shrug: { a1: [-74, -100, -0.6], a2: [84, -100, 0.6], h1: 'open', h2: 'open', hy: 4, hrot: -6 },
    };
  }

  // RPS poses for one side. The gesture poses are functions of the gesture (the READY fist when none).
  function poses(side = 'you') {
    const t = STAGE.arm[side], B = bodyOf(side);
    const arm = (key, gest, extra = {}) => {
      const [a, r, hs] = handAt(key);
      return { ...B.base, ...B.free, [`a${t}`]: a, [`r${t}`]: r, [`hs${t}`]: hs, [`h${t}`]: gest || 'ready', [`over${t}`]: 1, ...extra };
    };
    return {
      ready: arm('ready'),
      pumpUp: arm('up', null, { by: -5, hy: -3 }),
      pumpDown: arm('down', null, { by: 4, bsy: 0.98, hy: 3 }),
      throw: (gest) => arm('throw', gest),
      strike: (gest) => arm('strike', gest, { brot: 6, bx: 8, hx: 4 }),
      recoil: (gest) => arm('recoil', gest, { brot: -10, bx: -12, hrot: -10 }),
      meet: (gest) => arm('meet', gest, { bx: 6 }),
      cheer: { ...B.base, ...B.cheer },
      hop: { ...B.base, ...B.cheer, y: -34 },
      sad: { ...B.base, ...B.sad },
      shrug: { ...B.base, ...B.shrug },
    };
  }

  // RPS Minus One: both arms. A pair's slot 0 is the upper hand, slot 1 the lower one; SLOTS = which rig arm shows each
  // slot: the far arm (a2, from behind the body) the upper hand and the near arm (a1, in front of the body) the lower
  // one. Per pose: the two hands ([[x, y, bend], r, hs] each, upper first), and for the keep phase the single forward
  // hand (DESK_K as DESK).
  const SLOTS = [2, 1];
  const k2 = ([x, y, b]) => [Math.round(x * DESK_K), Math.round(y * DESK_K), b];
  const DESK2 = Object.fromEntries(Object.entries({
    ready: [[118, -172, -0.08], [128, -104, 0.2]], up: [[108, -226, -0.08], [120, -158, 0.2]],
    down: [[126, -176, -0.04], [138, -98, 0.1]], open: [[140, -176, -0.04], [150, -100, 0.1]], mid: [154, -138, -0.04],
  }).map(([k, v]) => [k, Array.isArray(v[0]) ? v.map(k2) : k2(v)]));
  // [rows r, hs] of the two-hand poses
  const TWO = { ready: [[-20, -10], 0.86], readyPair: [[0, 0], 1], up: [[-50, -40], 0.94], down: [[0, 5], 0.94], open: [[0, 0], 1] };
  // forward hand of the keep phase: [dx, dy, r, hs] around the middle line (character units)
  const KEEP = { keep: [0, 0, 0, 1.06], keepUp: [-14, -60, -45, 1.06], keepDown: [0, 6, 4, 1.06], strike: [26, -4, 0, 1.06], recoil: [-44, 24, 26, 1.06], meet: [16, -2, 0, 1.06] };
  function two(key) {
    const [r, hs] = TWO[key];
    const pts = DESK2[key === 'readyPair' ? 'ready' : key];
    return [0, 1].map((i) => [pts[i], r[i], hs]);
  }
  function fwd(key) {
    const [dx, dy, r, hs] = KEEP[key], m = DESK2.mid;
    return [[m[0] + dx, m[1] + dy, m[2]], r, hs];
  }
  function poses2(side = 'you') {
    const B = bodyOf(side);
    const SA = SLOTS;
    const both = (key, pair, extra = {}) => {
      const hs = two(key), o = { ...B.base };
      for (const slot of [0, 1]) { const k = SA[slot]; o[`a${k}`] = hs[slot][0]; o[`r${k}`] = hs[slot][1]; o[`hs${k}`] = hs[slot][2]; o[`h${k}`] = pair ? pair[slot] : 'ready'; o[`over${k}`] = 1; }
      return { ...o, ...extra };
    };
    // the kept hand forward on the middle line, the other dropped to the lap or the table (it keeps its gesture, so it
    // doesn't flicker)
    const keep = (slot, g1, g0, extra = {}) => {
      const k = SA[slot], d = 3 - k, [a, r, hs] = fwd('keep');
      return { ...B.base, [`a${k}`]: a, [`h${k}`]: g1, [`hs${k}`]: hs, [`r${k}`]: r, [`over${k}`]: 1, [`a${d}`]: B.drop[d - 1], [`h${d}`]: g0 || 'ready', [`hs${d}`]: 0.8, [`r${d}`]: null, ...extra };
    };
    const at = (slot, key, extra = {}) => { const [a, r] = fwd(key); return { [`a${SA[slot]}`]: a, [`r${SA[slot]}`]: r, ...extra }; };
    return {
      ready: (pair) => both(pair ? 'readyPair' : 'ready', pair),
      up: both('up', null, { by: -5 }),
      down: both('down', null, { by: 4, bsy: 0.98 }),
      open: (pair) => both('open', pair),
      keep,
      keepUp: (slot) => at(slot, 'keepUp', { by: -5 }),
      keepDown: (slot) => at(slot, 'keepDown', { by: 4, bsy: 0.98 }),
      strike: (slot) => at(slot, 'strike', { brot: 6, bx: 8, hx: 4 }),
      recoil: (slot) => at(slot, 'recoil', { brot: -10, bx: -12, hrot: -10 }),
      meet: (slot) => at(slot, 'meet', { bx: 6 }),
    };
  }

  // ---------------- the stage ----------------
  // Builds the two seated players (big gesture hands on the playing arms) and the effect layer.
  // arms: which rig arms play (big gestures); pose(side): the first pose (default: the RPS ready pose; Minus One starts
  // in its own two-hand ready pose, so nothing jumps when its first round starts). Returns { rigs, S, tbl: { fx, stop } }.
  function stage(b, ctx, { arms = null, small = false, pose = null } = {}) {
    const S = STAGE;
    const M = window.DuelFigures;
    const rigs = {};
    b.frame.classList.add('rps-frame');
    for (const side of ['opp', 'you']) {
      const [x, y, s] = S.seat[side];
      const r = M.create({ side, flip: S.flip[side], x, y, scale: s, pose: pose ? pose(side) : poses(side).ready });
      const playing = arms || [S.arm[side]];
      r.bigHands((k, shape) => playing.includes(k) && GEST[shape], { scale: S.hand * (small ? 0.86 : 1) });
      b.layers.mid.append(r.root);
      rigs[side] = r;
    }
    K.glow(b, S.glow);
    // outside the camera (it never shakes, like the background): the effects
    const fx = g({ class: 'rps-fx' });
    b.svg.append(fx);
    return { rigs, S, tbl: { fx, stop() {} } };
  }

  // Helpers on the gesture hands: dim a missed player, the middle and size of a hand in scene units.
  function hands(rigs) {
    return {
      dim(side, on) { for (const k of [1, 2]) rigs[side].n[`arm${k}`].root.style.opacity = on ? '0.4' : ''; },
      mid: (side, k) => rigs[side].handMid(k),
      radius: (side, k) => rigs[side].handRadius(k),
      stop() {},
    };
  }

  // ---------------- ambient life: the pendant lamp swings a little, the plant sways, a cloud drifts past the window ----------------
  // The lamp and the plant are always drawn (minis and reduced motion too); only their motion is ambient. Few nodes.
  let clipN = 0;
  function ambient(b, ctx) {
    const life = K.life({ mini: ctx.mini });
    const room = window.DuelArt?.rpsRoom;
    if (!room) return life;
    const back = g({ class: 'rps-amb' });
    b.layers.amb.append(back);
    // an element placed at (x, y) inside its own holder; the returned node is free to animate (its origin = the anchor)
    const put = (layer, name, x, y, opts) => { const at = g({ transform: `translate(${x} ${y})` }); layer.append(at); return K.sprite(at, name, opts); };
    const lamp = put(back, 'el-rps-lamp', ...room.lamp);
    const plant = put(back, 'el-rps-plant', ...room.plant, { scale: 0.9 });
    if (ctx.mini || K.reduced()) return life;
    // a slow pendulum around the hook, a gentle sway around the pot
    for (const [node, deg, ms] of [[lamp, 1.6, 7000], [plant, 1.4, 5200]]) {
      node.style.transformBox = 'view-box'; node.style.transformOrigin = '0px 0px';
      life.add(K.loop(node, [{ transform: `rotate(${-deg}deg)` }, { transform: `rotate(${deg}deg)` }], { duration: ms, direction: 'alternate' }));
    }
    // a cloud drifting across the window view (clipped to the glass under the blind)
    const [x0, y0, x1, y1] = room.win, id = `rps-win-${++clipN}`;
    const view = g({ 'clip-path': `url(#${id})` });
    back.append(K.el('clipPath', { id }, K.el('rect', { x: x0, y: y0 + 26, width: x1 - x0, height: y1 - y0 - 26 })), view);
    const cloud = put(view, 'el-cloud-1', x0 - 50, y0 + 66, { scale: 0.26, opacity: 0.9 });
    const dur = 60000;
    life.add(K.loop(cloud, [{ transform: 'translate(0px,0px)' }, { transform: `translate(${x1 - x0 + 100}px,0px)` }],
      { duration: dur, easing: 'linear', delay: -dur * 0.4 }));
    return life;
  }

  // The pump countdown: list of [rig, pose up, pose down].
  async function pumps(ctx, list, n, ms) {
    for (let i = 0; i < n; i++) {
      await Promise.all(list.map(([r, up]) => r.to(up, ms / n / 2, 'out')));
      ctx.sound?.play('rps-whoosh', { volume: 0.6 });
      await Promise.all(list.map(([r, , down]) => r.to(down, ms / n / 2, 'in')));
    }
  }

  // Control icons: the code-drawn gesture hands.
  const icon = (gesture) => K.handIcon(gesture);

  const WIN = { rock: ['SMASH', 'rps-rock-smash'], scissors: ['SNIP', 'rps-scissors-cut'], paper: ['WRAPPED', 'rps-paper-wrap'] };

  // The top scoreboard's line for both RPS games (kit.js def.hud): the round, "first to N" (and the phase in Minus One).
  function hud(state) {
    return { round: `Round ${(state.round || 0) + 1}`, note: state.target ? `first to ${state.target}` : '', ...(state.phase ? { phase: state.phase === 'keep' ? 'Keep one' : 'Pick two' } : {}) };
  }

  window.DuelRpsDuel = { STAGE, poses, poses2, SLOTS, stage, hands, ambient, pumps, icon, hud, WIN };
})();
