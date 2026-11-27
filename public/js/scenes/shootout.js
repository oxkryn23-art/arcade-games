// Shootout scene: two gunslingers duel across a dusty frontier street at noon (the code-drawn background
// 'shootout-street' in art-shootout.js: the saloon on the left, the green store and the tall tan building on the
// right, the little town at the far end). Each duelist stands on the street BEHIND a low wooden fence angled toward the
// street center (el-fence-l-* for the left one, its far end toward the center; el-fence-r-* mirrored on the right),
// seen from the viewer's side: the upper body shows above the fence, they aim and shoot over it. You behind the left
// fence facing right, the opponent mirrored behind the right one.
// Fences: intact at the start of every duel. A shot into a Block cracks the fence (-damaged: bullet holes) with
// splinters flying out; a Blast blows it apart: the planks and chips (el-fence-<l|r>-piece-1..14, started where they
// sat in the fence via their gx/gy) fly off with gravity and spin, bounce and lie on the street, the broken posts stay,
// dust puffs up. It stays broken until the next duel.
// Moves:
//   ready   3/4 idle, revolver in hand, the hands resting on the fence top (a lock changes nothing in the scene)
//   reload  revolver at the chest barrel down, cylinder swung out, the other hand inserts a bullet, the cylinder spins
//           and snaps back with a click
//   block   no prop: ducks down behind its own fence (only the top of the head peeks out); a bullet into the fence
//           cracks it; back up (unless a blast breaks the fence: Blast beats Block)
//   shoot   the noodle arm extends with the revolver over the fence, muzzle flash, tracer
//   blast   shotgun with the other hand on the pump, big flash, strong recoil
//   hit     dizzy face, knocked up and back, falls behind the fence with the legs sticking up
//   idle    (missed timer) frozen, scratching the head, "?"
// Ammo, the duel score and the duel / turn counter are in the top scoreboard (def.hud; the scene loads and spends the
// bullets there in step with the reload and the shots through ctx.hud.ammo). No name tags, no in-scene board.
// Ambient (not in minis): a warm pulsing sun glow; the vulture perched on the green store's cap, facing the players (at
// random calm moments it looks down, turns its head, ruffles or flaps its wings, hops a step along the cap; it blinks
// now and then), a few gnats buzzing by its perch, small birds far off; every 13-17 s a tumbleweed rolls across the
// far end of the street (small, behind the duelists: a background detail), pushed by 2-3 white wind gusts at a time
// sweeping in right behind and around it, dust puffing up where it lands; the saloon sign sways a little. Nothing moves
// with the pointer. Reduced motion keeps the tumbleweed crossing (slower, fewer gusts, no sway), the vulture's idle
// and blinks (calmer: longer pauses, smaller hops) and the gnats (fewer, smaller, slower loops); it drops the sun pulse.
// Coach-mark targets: 'reload' | 'block' | 'shoot' | 'blast' (buttons); 'ammo-you' | 'ammo-opp', 'score' and 'turn' are
// in the top scoreboard (scenes/hud.js).
(function () {
  const K = window.DuelKit;
  const { C, el, g, pivot, show } = K;
  const MOVES = ['reload', 'block', 'shoot', 'blast'];
  const SIDES = ['you', 'opp'];
  const LABEL = { reload: 'Reload', block: 'Block', shoot: 'Shoot', blast: 'Blast', idle: 'Missed' };
  const COL = { metalDark: C.figMid, flash: C.flash, muzzle: 'var(--muzzle)', wood: 'var(--wood)', woodDark: 'var(--wood-dark)', sun: 'var(--sho-sun-glow)' };
  const D2R = Math.PI / 180;
  const affordable = (m, ammo, max = 3) => (m === 'shoot' ? ammo >= 1 : m === 'blast' ? ammo === max : m === 'reload' || m === 'block');
  const other = (s) => (s === 'you' ? 'opp' : 'you');
  const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const lerp = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
  const add = (a, c) => [a[0] + c[0], a[1] + c[1]];
  const rotV = ([x, y], deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [x * c - y * s, x * s + y * c]; };
  const deg = (a, c) => (Math.atan2(c[1] - a[1], c[0] - a[0]) * 180) / Math.PI;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let uid = 0;

  // Layout in viewBox units, lined up with the background (art-shootout.js). you/opp = feet position on the street and
  // rig scale. roll: the tumbleweed's road at the far end of the street, behind the duelists and their fences: a small
  // background detail (ground y, radius, crossing time on its own, x0..x1 = the open stretch between the buildings
  // where it shows: it fades in out of one alley and out into the other); vulture: its perch on the green store's cap
  // (x, y, scale), perch: how far it may hop along the cap and the cap's slope. fence: its scale per rig scale (k), and
  // where its bottom center stands from the feet in character units (dx toward the enemy, dy toward the viewer).
  // Everything of a duelist below its feet line is clipped (a ducking or falling duelist sinks behind its fence). The
  // bottom of the frame (safeBottom, below) may be covered by the match controls: the street in front of the fences.
  // labelY = the move labels ("Reload", "Block") over the heads.
  const POS = {
    you: { x: 420, y: 654, s: 1.08 }, opp: { x: 1180, y: 654, s: 1.08 }, fence: { k: 0.54, dx: 24, dy: 62 },
    labelY: 140, punchY: 400, roll: { y: 532, r: 12, ms: 6400, x0: 650, x1: 1120 }, sun: [962, 107, 140], vulture: [1338, 203, 0.19],
    perch: { span: [-12, 28], slope: 0 }, gnats: [1290, 150],
    // the saloon sign (el-sho-sign): its top center; it sways on a gust
    sign: [270, 104],
  };
  // Fence geometry (the left fence in its own units from its bottom center; the right fence is the mirror image): where
  // a bullet hits the planks, where a blast aims, and the foot line from the near post's foot (x -248, y 0) to the far
  // post's foot (x 248, y -91), where the broken posts stand after a blast.
  // bottom(x) = the bottom plank's lower edge (the duelist is clipped below it).
  const FENCE = { hit: [36, -176], blast: [0, -150], farFoot: -91, half: 248, bottom: (x) => -24 - ((x + 158) * 80) / 350 };
  const SPLINTERS = [1, 2, 5, 12, 13, 14];          // the small chips among the blast pieces
  const POSTS = [6, 7];                              // the broken posts: they stay standing

  // ---------------- poses (character space, facing right; the opponent's rig is mirrored) ----------------
  // The torso faces the viewer with a slight turn toward the enemy, the head turned toward him (ht); the body stands
  // SINK lower behind the fence (the fence covers it from the belly down). The NEAR arm (a1) rests its fist on the fence
  // top; the FAR arm (a2, the gun arm) holds the revolver out toward the enemy at about his chest / head height, a
  // gentle line. Two-handed moves (reload, blast) turn to 3/4: the gun in the far hand out beside the chest, the near
  // arm reaches across in front of the body to the cylinder / pump.
  // FENCE_TOP = the fence top line in character units (it rises toward the street center): y at x.
  const LEGS = { l1: [-20, -10, 0], l2: [24, -10, 0] };
  const SINK = 12;                                     // the rig stands this much (character units) below its feet line
  const FENCE_TOP = (x) => -68 - (x + 44) * 0.13 - SINK;
  // The revolver's grip sits in the fist (the prop's origin is the grip top; the fist is ~14 along the hand).
  const GRIP = [14, -12, 0];
  // three-quarters toward the other duelist, eyes on them. (The gun arm a2 plays in every pose: its long sleeve rolled
  // up, rig.js roll2; the near arm keeps the full sleeve, also in the two-handed reload / shotgun grips, so no sleeve
  // rolls up and down during a reveal.)
  const FRONT = { turn: 0.5, ht: 0.25, lx: 1, ...LEGS, roll2: 1 };
  const FREE = { a1: [-46, FENCE_TOP(-46) - 11, 0.08], h1: 'fist', r1: 84 };   // the near hand on the fence top
  // The level gun hand: [x from the body center, y from the neck]; AIM_R = the revolver's level angle.
  const ARM = [134, -22], AIM_R = -3;
  const P = {
    // revolver in hand, both hands resting on the fence top
    ready: { ...FRONT, ...FREE, p2: GRIP, a2: [62, FENCE_TOP(62) - 12, -0.1], h2: 'fist', r2: 26 },
    // ducked behind the fence (Block): crouched and sunk below the fence top, only the top of the head peeking out
    duck: { p2: GRIP, turn: 0.55, y: 154 - SINK, by: 34, bsy: 0.9, brot: 6, hy: 6, hrot: 6, lx: 0.9, ly: -0.6, a1: [-40, -120, 0.3], h1: 'fist', a2: [62, -126, 0.1], h2: 'fist', r2: -70, l1: [-34, -8, -0.4], l2: [40, -8, 0.4] },
    // missed timer: frozen, scratching the head
    confused: { ...FRONT, ht: 0.1, p2: GRIP, a1: [-62, -262, -0.6], h1: 'open', a2: [64, FENCE_TOP(64) - 12, -0.1], h2: 'fist', r2: 8, hrot: -10, hx: -4, ly: -0.6, lx: -0.4 },
    victory: { ...FRONT, ht: 0.2, p2: GRIP, a1: [-74, -278, -0.3], h1: 'fist', a2: [124, -272, 0.1], h2: 'fist', r2: -70, by: -6, hy: -4 },
    victoryHop: { ...FRONT, ht: 0.2, p2: GRIP, y: -34, shadow: 0.7, l1: [-26, -18, 0.3], l2: [30, -14, -0.3], a1: [-80, -300, -0.3], h1: 'fist', a2: [128, -290, 0.1], h2: 'fist', r2: -78, by: -8, hy: -6 },
    sad: { ...FRONT, ht: 0.2, p2: GRIP, by: 8, hy: 10, hrot: 10, a1: [-44, FENCE_TOP(-44) - 8, 0.3], h1: 'fist', a2: [62, FENCE_TOP(62) - 8, -0.1], h2: 'fist', r2: 70, ly: 0.7 },
    shrug: { ...FRONT, ht: 0.2, p2: GRIP, a1: [-82, -158, -0.6], a2: [86, -160, 0.6], h1: 'open', h2: 'fist', r2: -40, hy: 4, hrot: -6 },
    // hit: knocked up and back, then flat on the back behind the fence with only the legs up
    fallUp: { turn: 0.55, rot: -22, x: 30, y: -70, shadow: 0.6, brot: -8, hrot: -16, a1: [-92, -246, -0.4], h1: 'open', a2: [118, -236, 0.1], h2: 'open', l1: [34, -72, 0.5], l2: [84, -44, 0.4] },
    fallDown: { turn: 0.55, rot: -91, x: 128, y: 16 - SINK, shadow: 1.25, hrot: -10, a1: [-70, -210, -0.5], h1: 'open', a2: [104, -214, 0.1], h2: 'open', l1: [92, -84, 0.4], l2: [128, -40, 0.3] },
    fallRest: { turn: 0.55, rot: -87, x: 126, y: 20 - SINK, shadow: 1.25, hrot: -6, a1: [-66, -206, -0.5], h1: 'open', a2: [100, -208, 0.1], h2: 'open', l1: [82, -76, 0.4], l2: [118, -34, 0.3] },
  };
  for (const p of Object.values(P)) p.roll2 = 1;

  // The computed poses (a = the aim angle in the rig's frame, deg, 0 = level at the enemy, negative = up). Gun geometry
  // from the props (props.js), read once.
  let GEO = null;
  const geo = () => {
    if (GEO) return GEO;
    const rev = window.DuelProps.revolver(), sg = window.DuelProps.shotgun();
    GEO = { REV: { S: 1.55, muzzle: rev.muzzle, cylIn: [10 * 1.55, -13 * 1.55], cylOut: [6 * 1.55, -32 * 1.55] }, GUN: { muzzle: sg.muzzle, pump: sg.pump } };
    return GEO;
  };
  // Aim: the far arm holds the revolver out at the level gun hand (ARM, AIM_DY), turned around the arm's root by a (deg,
  // 0 = level at the enemy, negative = up); the revolver points along a. The near hand stays on the fence.
  const levelHand = ([x, dy]) => [x, window.DuelFigures.skin().skel.neck + dy];
  function aimAt(a, base = {}, reach = ARM) {
    const pose = { ...FRONT, ...FREE, p2: GRIP, h2: 'fist', lx: 1, ...base };
    const root = window.DuelFigures.shoulderOf(null, pose, 2), h0 = levelHand(reach);
    const hand = add(root, rotV([h0[0] - root[0], h0[1] - root[1]], a));
    return { ...pose, a2: [Math.round(hand[0]), Math.round(hand[1]), -0.06], r2: a + AIM_R };
  }
  // Shotgun: 3/4, the gun out beside the chest in the far hand, the near hand reaching across to the pump.
  const SG_GRIP = [6, -4, 0], SG_AT = [40, -150];
  const pumpHand = (a2, r2) => add(a2, rotV([geo().GUN.pump[0] + SG_GRIP[0], geo().GUN.pump[1] + SG_GRIP[1] + 8], r2));
  function shotgunAt(a, base = {}) {
    const at = SG_AT, pump = pumpHand(at, a);
    return { turn: 0.55, ht: 0.2, roll2: 1, l1: [-30, -10, 0.1], l2: [34, -10, -0.2], a2: [at[0], at[1], -0.1], h2: 'fist', r2: a, p2: SG_GRIP, a1: [Math.round(pump[0]), Math.round(pump[1]), 0.15], h1: 'fist', r1: a - 70, exact1: 1, lx: 1, ...base };
  }
  // the blast's recoil: kicked up and back
  function blastKick(pose) {
    const ka2 = [pose.a2[0] - 18, pose.a2[1] - 22], kr2 = pose.r2 - 24, ka1 = pumpHand(ka2, kr2);
    return { ...pose, x: -30, brot: -12, bx: -10, hrot: -12, by: 2, r2: kr2, a2: [...ka2, -0.1], a1: [...ka1, 0.15], r1: pose.r1 - 24, l2: [44, -26, -0.3] };
  }
  // Reload (3/4): the revolver out beside the chest in the far hand, barrel down, cylinder out; the near hand reaches
  // across in front of the body and brings a bullet.
  // (the gun low beside the body, barrel down to the right, so the near arm crosses the chest, never the face)
  const RELOAD_R2 = 70;
  function reloadPoses() {
    const a2 = [52, -118], { REV } = geo();
    const cyl = add(a2, rotV(add(REV.cylOut, GRIP), RELOAD_R2));
    const bulletHand = (dy) => [Math.round(cyl[0] + 4), Math.round(cyl[1] - 34 + dy)];
    const near = (dx, dy) => [Math.round(cyl[0] + dx), Math.round(cyl[1] + dy)];
    const base = { turn: 0.55, ht: 0.1, ...LEGS, roll2: 1, p2: GRIP, a2: [...a2, 0.1], h2: 'fist', r2: RELOAD_R2, h1: 'fist', r1: 90, p1: [0, -26, 90], exact1: 1, hrot: 8, hy: 4, by: 4, lx: 0.5, ly: 0.9 };
    return {
      open: { ...base, a1: [...near(-46, -26), 0.2] },
      bring: { ...base, a1: [...bulletHand(-10), 0.2] },
      insert: { ...base, a1: [...bulletHand(6), 0.2] },
      spin: { ...base, a1: [...near(-40, -30), 0.2] },
      snap: { ...base, a2: [a2[0] + 2, a2[1] - 8, 0.1], r2: RELOAD_R2 - 26, a1: [...near(-50, -16), 0.2], hrot: 2, ly: 0.4 },
    };
  }
  // Every pose for the character lab (the computed ones sampled: aim angles, the shotgun, the reload).
  function allPoses() {
    const out = { ...P };
    for (const a of [-30, -14, 0, 12]) out[`aim ${a}`] = aimAt(a);
    out['shot kick'] = (() => { const p = aimAt(0); return { ...p, r2: p.r2 - 16, a2: [p.a2[0] - 10, p.a2[1] - 10, 0.2], bx: -4, hrot: -4 }; })();
    for (const a of [-8, 0, 10]) out[`blast ${a}`] = shotgunAt(a);
    out['blast kick'] = blastKick(shotgunAt(0));
    for (const [k, v] of Object.entries(reloadPoses())) out[`reload ${k}`] = v;
    return out;
  }
  const dive = (pose) => ({ ...pose, by: pose.by * 0.4, brot: 14, bx: (pose.bx || 0) + 18, x: 10, y: (pose.y || 0) * 0.6 - 14, shadow: 0.8 });
  const flinch = (pose) => ({ ...pose, by: pose.by + 10, bx: (pose.bx || 0) - 8, hx: (pose.hx || 0) - 8, hrot: (pose.hrot || 0) - 12, lx: -0.6, ly: 0.3, ...(pose.y ? { y: pose.y + 14 } : {}) });

  // Physics-like flight of a piece (viewBox units, seconds), simulated and sampled into WAAPI keyframes (linear between
  // samples): gravity, spin, a bounce or two on the street (ground = the landing line relative to the start), then it
  // slides to a stop; long pieces settle flat (rotation to the nearest half turn). half(rot) = the piece's half height
  // at that rotation, so it rests on its edge, not its center. fade: the piece fades out at the end (splinters).
  function flight({ vx, vy, spin, ground, w, h, dur, grav = 2600, flat = true, fade = false }) {
    const dt = 1 / 30, n = Math.max(2, Math.round(dur / dt)), frames = [];
    const half = (r) => Math.abs((h / 2) * Math.cos(r * D2R)) + Math.abs((w / 2) * Math.sin(r * D2R));
    let x = 0, y = 0, r = 0, hops = 0, rest = false;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const f = { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg)`, offset: t };
      if (fade) f.opacity = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
      frames.push(f);
      if (rest) {
        x += vx * dt; vx *= 0.72;
        if (flat) r += (Math.round(r / 180) * 180 - r) * 0.3;
        y = ground - half(r);
        continue;
      }
      vy += grav * dt; x += vx * dt; y += vy * dt; r += spin * dt;
      if (vy > 0 && y + half(r) >= ground) {
        y = ground - half(r); hops++;
        if (hops >= 3 || vy < 300) { rest = true; vy = 0; spin = 0; vx *= 0.5; } else { vy = -vy * 0.36; vx *= 0.6; spin *= 0.5; }
      }
    }
    return frames;
  }

  // Control icons: code-drawn in art-shootout.js (DuelArt.icons['sho-<move>']).
  const icon = (m) => window.DuelArt?.icons?.[`sho-${m}`] || '';

  function create() {
    let b, ctx, L, controls, unbindKeys, fx, life = null, dead = false, sent = false, myAmmo = 0, maxAmmo = 3, duelNo = 0;
    const rigs = {}, fences = {}, stage = {}, fallen = { you: false, opp: false }, ammoN = { you: 0, opp: 0 };
    // Ammo in the top scoreboard (no hud in minis): n bullets loaded for a side.
    const showAmmo = (side, n) => { ammoN[side] = Math.max(0, n); ctx.hud?.ammo(side, ammoN[side], maxAmmo); };
    let labels = [];
    const id = ++uid;
    const VP = () => window.DuelProps;
    const sfx = (name, o) => { if (!dead && !ctx.mini) ctx.sound?.play(name, o); };
    const dir = (side) => (side === 'you' ? 1 : -1);
    // Character space -> scene, for a pose without whole-character x / y / rot.
    const toWorld = (side, [x, y]) => { const p = L[side]; return [p.x + dir(side) * x * p.s, p.y + (y + SINK) * p.s]; };
    // A scene direction (deg) -> the angle in the rig's own (unmirrored) frame, and back.
    const localAng = (side, a) => (side === 'you' ? a : 180 - a);
    const worldAng = localAng;
    // Revolver / shotgun geometry in the hand frame (from the props).
    let REV, GUN;

    // ---------------- drawing ----------------
    function duelist(side) {
      const p = L[side];
      const r = window.DuelFigures.create({ side, flip: side === 'opp', x: p.x, y: p.y + SINK * p.s, scale: p.s, pose: P.ready });
      r.hold(2, 'revolver');
      return r;
    }

    // A duelist is cut off below its feet line, and behind its fence below the bottom plank (the fence's bottom rises
    // toward its far end), so a ducking or falling duelist sinks behind the fence and no shoe peeks out under it. Once
    // the fence is blasted the cut is the flat feet line (the duelist lies in the open). Call after buildFence(side).
    const clipId = (side) => `sho-clip-${id}-${side}`;
    function clipPoints(side, flat) {
      const f = fences[side], d = dir(side), floor = L[side].y + 4, pts = [[-2000, floor]];
      if (!flat) {
        for (let xs = -FENCE.half; xs <= FENCE.half; xs += FENCE.half / 8) pts.push([f.x + d * xs * f.k, Math.min(floor, f.y + FENCE.bottom(xs) * f.k)]);
        pts.push([f.x + d * FENCE.half * f.k, floor]);
        if (d < 0) pts.splice(1, pts.length - 1, ...pts.slice(1).reverse());
      }
      pts.push([b.W + 2000, floor], [b.W + 2000, -2000], [-2000, -2000]);
      return pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    }
    function clipped(side, ...nodes) {
      const poly = el('polygon', { points: clipPoints(side, false) });
      b.svg.prepend(el('defs', {}, el('clipPath', { id: clipId(side) }, poly)));
      fences[side].clip = poly;
      return g({ 'clip-path': `url(#${clipId(side)})` }, ...nodes);
    }

    // ---------------- fences ----------------
    // A fence point (left-fence units from its bottom center, mirrored for the right fence) -> scene.
    const fencePt = (side, [x, y]) => { const f = fences[side]; return [f.x + dir(side) * x * f.k, f.y + y * f.k]; };
    // The fence in front of a duelist: a wrapper (free for the wobble, pivot at its foot) around the fence art, and a
    // debris layer in front of it for the blast pieces lying on the street.
    function buildFence(side) {
      const p = L[side], k = L.fence.k * p.s, c = side === 'you' ? 'l' : 'r';
      const x = p.x + dir(side) * L.fence.dx * p.s, y = p.y + L.fence.dy * p.s;
      const wrap = pivot(g({ class: `sho-fence sho-fence--${side}` }), x, y);
      const node = K.sprite(wrap, `el-fence-${c}-intact`, { x, y, scale: k });
      const debris = g({ class: 'sho-debris' });
      fences[side] = { x, y, k, c, wrap, node, debris, state: 'intact' };
      return [wrap, debris];
    }
    // 'intact' | 'damaged' (bullet holes) | 'blasted' (the fence is gone: its pieces lie in the debris layer).
    function setFence(side, state) {
      const f = fences[side];
      f.state = state;
      show(f.wrap, state !== 'blasted');
      if (state !== 'blasted') f.node.setSprite(`el-fence-${f.c}-${state}`);
      f.clip?.setAttribute('points', clipPoints(side, state === 'blasted'));
    }
    function resetFence(side) {
      const f = fences[side];
      K.clear(f.debris); f.debris.replaceChildren(); K.clear(f.wrap);
      setFence(side, 'intact');
    }
    // A blast piece's art entry (w, h, and gx, gy = where it sat in the fence; art-shootout.js).
    const pieceInfo = (name) => window.DuelArt?.el?.[name] || null;
    // A piece in its own mover group at a scene point; returns { node, mover, w, h } (w/h in viewBox units).
    function piece(layer, name, at, k) {
      const info = pieceInfo(name);
      if (!info) return null;
      const node = g({ transform: `translate(${at[0].toFixed(1)} ${at[1].toFixed(1)})` }), mover = g({});
      node.append(mover);
      K.sprite(mover, name, { scale: k });
      layer.append(node);
      return { node, mover, w: info.w * k, h: info.h * k, info };
    }
    // A bullet into the fence: it cracks (bullet holes), shudders, and a few splinters spray out toward the shooter
    // and fall to the street.
    function crackFence(side, at) {
      const f = fences[side], d = dir(side), s = L[side].s;
      if (!f || f.state === 'blasted') return;
      setFence(side, 'damaged');
      K.anim(f.wrap, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: `translate(${-d * 7}px,0) rotate(${-d * 2}deg)`, offset: 0.25 }, { transform: `translate(${d * 2}px,0) rotate(${d * 0.8}deg)`, offset: 0.6 }, { transform: 'translate(0,0) rotate(0deg)' }], { duration: 300, fill: 'none' });
      const picks = SPLINTERS.slice().sort(() => Math.random() - 0.5).slice(0, 5);
      picks.forEach((i, n) => {
        const pc = piece(fx, `el-fence-${f.c}-piece-${i}`, at, f.k * rnd(0.8, 1.05));
        if (!pc) return;
        const dur = rnd(0.7, 0.95);
        K.anim(pc.mover, flight({ vx: d * rnd(80, 380) * s, vy: -rnd(280, 640) * s, spin: rnd(-900, 900), ground: f.y + rnd(-4, 26) * s - at[1], w: pc.w, h: pc.h, dur, fade: true }),
          { duration: dur * 1000, delay: n * 18, easing: 'linear', fill: 'both' }).then(() => pc.node.remove());
      });
    }
    // A blast blows the fence apart: the fence goes, its 14 pieces start where they sat (gx/gy) and fly away from the
    // shooter with gravity and spin, bounce and lie on the street; the broken posts stay standing (a jolt and a lean
    // onto the fence's foot line); dust and wood chips. ms = the time the pieces may take (they stay afterwards).
    function blowFence(side, ms) {
      const f = fences[side], d = dir(side), s = L[side].s;
      if (!f || f.state === 'blasted') return;
      setFence(side, 'blasted');
      const dur = Math.max(0.6, Math.min(1.35, ms / 1000)), sx = f.c === 'l' ? 1 : -1;
      for (let i = 1; i <= 14; i++) {
        const name = `el-fence-${f.c}-piece-${i}`, info = pieceInfo(name);
        if (!info) continue;
        const pc = piece(f.debris, name, [f.x + info.gx * f.k, f.y + info.gy * f.k], f.k);
        if (POSTS.includes(i)) {
          // the foot line runs from the near post (0) to the far post (farFoot); the stump's bottom drops onto it
          const xl = info.gx * sx, foot = (FENCE.farFoot * (xl + FENCE.half)) / (2 * FENCE.half);
          const drop = Math.max(0, foot - (info.gy + info.h / 2)) * f.k, lean = -d * rnd(4, 9);
          pivot(pc.mover, 0, pc.h / 2);
          K.anim(pc.mover, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: `translate(${-d * 10}px,${drop * 0.5}px) rotate(${lean * 1.8}deg)`, offset: 0.3 }, { transform: `translate(${-d * 4}px,${drop}px) rotate(${lean}deg)` }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
          continue;
        }
        const small = SPLINTERS.includes(i), high = -info.gy / 260;     // pieces higher up fly higher
        K.anim(pc.mover, flight({
          vx: (-d * rnd(60, 340) + rnd(-120, 120)) * s * (small ? 1.3 : 1),
          vy: -rnd(480, 900) * (0.75 + high * 0.5) * s,
          spin: rnd(-520, 520) * (small ? 2 : 1),
          ground: f.y + rnd(-26, 30) * s - (f.y + info.gy * f.k), w: pc.w, h: pc.h, dur: dur * rnd(0.85, 1), flat: !small,
        }), { duration: dur * 1000, easing: 'linear' });
      }
      const top = fencePt(side, FENCE.blast);
      sparks(top, 10, 90, COL.wood);
      chips(top, 8, 150 * s, side);
      for (let k = 0; k < 4; k++) dust(fx, [f.x + rnd(-120, 120) * s, f.y - rnd(10, 80) * s], rnd(0.3, 0.42) * s, 1 + (k % 3));
    }

    // ---------------- ambient life ----------------
    // A code-drawn element (DuelArt.el) in a fresh group.
    const spr = (layer, name, scale, x = 0, y = 0) => K.sprite(layer, name, { x, y, scale });
    // Warm sun glow over the drawn sun (static in minis / reduced motion, a slow pulse otherwise).
    function sunGlow() {
      const [x, y, r] = L.sun, gid = `sho-sun-${id}`;
      const grad = el('radialGradient', { id: gid },
        el('stop', { offset: '0%', 'stop-color': COL.sun, 'stop-opacity': 0.55 }),
        el('stop', { offset: '42%', 'stop-color': COL.sun, 'stop-opacity': 0.22 }),
        el('stop', { offset: '100%', 'stop-color': COL.sun, 'stop-opacity': 0 }));
      const inner = g({}, el('circle', { r, fill: `url(#${gid})` }));
      b.layers.amb.append(el('defs', {}, grad), g({ class: 'sho-sun', transform: `translate(${x} ${y})` }, inner));
      life?.add(K.loop(inner, [{ transform: 'scale(.94)', opacity: 0.7 }, { transform: 'scale(1.06)', opacity: 1 }], { duration: 3600, direction: 'alternate' }));
    }
    // The vulture perched on the green store's cap (el-vulture-1..3: three frames of one bird, each anchored at the
    // perch between its feet, so the talons sit exactly on the roof line). It faces the street and the players (the art
    // looks right, so it is mirrored). It watches the duel (frame 1); every 3-6 s (random) it blinks while resting:
    // half-closed, closed, half-closed, open (the el-vulture-blink-* lids laid over frame 1's eye). Idle (a random calm
    // act every 2.5-6 s, one at a time): it looks down harder (frame 2), turns its head away and back
    // (an instant flip, never squashed through a paper-thin bird), ruffles its wings (frame 3 with a shiver), flaps
    // them (frames 3/1 in turn, a little lift and stretch), or hops a step along the sloped cap (crouch, a small arc,
    // a squash on landing; L.perch = span [left, right] it may go from its spot and the cap's slope, scene units). Under
    // reduced motion the idle stays, calmer (longer pauses, slower, smaller hops and shivers, fewer flaps). Nodes:
    // node > hopper > bird > 3 frames + 2 lids.
    function vulture() {
      const [x, y, s] = L.vulture;
      const node = g({ class: 'sho-vulture', transform: `translate(${x} ${y}) scale(${-s} ${s})` });
      b.layers.amb.append(node);
      const hopper = g({}), bird = pivot(g({}), 0, 0);
      node.append(hopper); hopper.append(bird);
      const frames = [1, 2, 3].map((n) => spr(bird, `el-vulture-${n}`, 1));
      frames.forEach((f, k) => f.setAttribute('opacity', k ? 0 : 1));
      if (!life) return;                                   // minis: frame 1, still
      const calm = K.reduced(), slow = calm ? 1.8 : 1;
      const lids = { half: spr(bird, 'el-vulture-blink-half', 1), closed: spr(bird, 'el-vulture-blink-closed', 1) };
      Object.values(lids).forEach((n) => n.setAttribute('opacity', 0));
      const show = (n) => frames.forEach((f, k) => f.setAttribute('opacity', k === n - 1 ? 1 : 0));
      // the state: frame, head turned (bird mirrored), perch offset (scene units along x), busy (mid-act: no blink)
      let frame = 1, turned = false, off = 0, busy = false, cur = [];
      life.add(() => cur.forEach((a) => a.cancel()));
      const run = (n, kf, opts) => { const a = n.animate(kf, { fill: 'none', ...opts }); cur.push(a); a.finished.then(() => { cur = cur.filter((c) => c !== a); }, () => {}); return a; };
      const face = () => `scale(${turned ? -1 : 1},1)`;
      const setBird = (extra = '') => { bird.style.transform = `${face()} ${extra}`.trim(); };
      // the hopper moves in the bird's own space (mirrored, 1/s scale): scene dx -> -dx/s
      const perch = L.perch || { span: [0, 0], slope: 0 };
      const at = (dx) => `translate(${(-dx / s).toFixed(1)}px,${((dx * perch.slope) / s).toFixed(1)}px)`;
      const done = (ms) => life.timeout(() => { busy = false; }, ms);
      const acts = {
        look() {
          show(frame = 2); setBird('rotate(2deg)');
          life.timeout(() => { show(frame = 1); setBird(); done(0); }, rnd(1200, 2600) * slow);
        },
        turn() {
          turned = !turned; setBird();
          life.timeout(() => { turned = !turned; setBird(); done(0); }, rnd(900, 2400) * slow);
        },
        ruffle() {
          show(frame = 3);
          const k = calm ? 0.5 : 1, sq = (v) => (1 + (v - 1) * k).toFixed(3);
          run(bird, [
            { transform: `${face()} scale(1,1)` }, { transform: `${face()} scale(${sq(1.06)},${sq(0.94)})`, offset: 0.2 },
            { transform: `${face()} scale(${sq(0.96)},${sq(1.05)}) rotate(${1.5 * k}deg)`, offset: 0.45 },
            { transform: `${face()} scale(${sq(1.03)},${sq(0.98)}) rotate(${-k}deg)`, offset: 0.7 }, { transform: `${face()} scale(1,1)` },
          ], { duration: 1300 * slow, easing: 'ease-in-out' });
          life.timeout(() => { show(frame = 1); done(0); }, 1400 * slow);
        },
        flap() {
          const n = calm ? 2 : 3 + Math.floor(Math.random() * 2), beat = (calm ? 300 : 170), lift = (calm ? 3 : 7) / s;
          for (let i = 0; i < n * 2; i++) life.timeout(() => show(frame = i % 2 ? 1 : 3), i * beat);
          life.timeout(() => { show(frame = 1); done(0); }, n * 2 * beat);
          run(hopper, [{ transform: at(off) }, { transform: `${at(off)} translateY(${-lift}px)`, offset: 0.4 }, { transform: at(off) }], { duration: n * 2 * beat, easing: 'ease-in-out' });
          run(bird, [{ transform: `${face()} scale(1,1)` }, { transform: `${face()} scale(.97,1.05)`, offset: 0.4 }, { transform: `${face()} scale(1,1)` }], { duration: n * 2 * beat, easing: 'ease-in-out' });
        },
        hop() {
          const [lo, hi] = perch.span.map((v) => v * (calm ? 0.6 : 1)), step = rnd(10, 18) * (calm ? 0.5 : 1);
          let to = off + (Math.random() < 0.5 ? -step : step);
          if (to < lo || to > hi) to = off - (to - off);              // no room that way: the other way
          to = Math.max(lo, Math.min(hi, to));
          const from = off, up = (calm ? 5 : 12) / s, ms = (calm ? 900 : 620);
          // it turns toward where it hops (the art looks at the players; the mirrored bird looks away), then back
          const away = (to - from > 0) === (x > b.W / 2);  // looking at the street = toward the center of the screen
          if (Math.abs(to - from) < 3) { done(0); return; }
          turned = away; setBird();
          const T = (dx, lift = 0) => `${at(dx)} translateY(${(-lift).toFixed(1)}px)`;
          run(hopper, [
            { transform: T(from) }, { transform: T(from), offset: 0.22 },
            { transform: T((from + to) / 2, up), offset: 0.55, easing: 'ease-in' }, { transform: T(to), offset: 0.82 }, { transform: T(to) },
          ], { duration: ms, easing: 'linear' });
          run(bird, [
            { transform: `${face()} scale(1,1)` }, { transform: `${face()} scale(1.07,.9)`, offset: 0.2 },
            { transform: `${face()} scale(.95,1.06)`, offset: 0.4 }, { transform: `${face()} scale(1,1)`, offset: 0.7 },
            { transform: `${face()} scale(1.06,.92)`, offset: 0.85 }, { transform: `${face()} scale(1,1)` },
          ], { duration: ms, easing: 'ease-in-out' });
          life.timeout(() => show(frame = 3), ms * 0.25);
          life.timeout(() => show(frame = 1), ms * 0.8);
          off = to; hopper.style.transform = at(off);
          life.timeout(() => { turned = false; setBird(); done(0); }, ms + rnd(500, 1400) * slow);
        },
      };
      const W = [['look', 3], ['turn', 3], ['ruffle', 2], ['flap', 1.5], ['hop', perch.span[1] - perch.span[0] > 0 ? 2 : 0]];
      const idle = () => {
        if (!busy && !document.hidden) {
          let r = Math.random() * W.reduce((a, [, w]) => a + w, 0);
          const [name] = W.find(([, w]) => (r -= w) < 0) || W[0];
          busy = true; acts[name]();
        }
        life.timeout(idle, rnd(2500, 6000) * slow);
      };
      life.timeout(idle, rnd(1500, 3500));
      // blinks while resting (frame 1, not mid-act): half-closed, closed, half-closed, open; reduced motion included
      const lid = (which) => { lids.half.setAttribute('opacity', which === 'half' ? 1 : 0); lids.closed.setAttribute('opacity', which === 'closed' ? 1 : 0); };
      const blink = () => {
        if (!busy && frame === 1 && !document.hidden) {
          busy = true;
          const steps = [['half', 0], ['closed', 55], ['half', 145], [null, 200]];
          steps.forEach(([w, at2]) => life.timeout(() => lid(w), at2));
          done(220);
        }
        life.timeout(blink, rnd(3000, 6000));
      };
      life.timeout(blink, rnd(1500, 4000));
    }
    // The tumbleweed (el-weed-roll-1..8, el-weed-squash-1..2): a small background detail, rolling left to right across
    // the far end of the street, behind the duelists and their fences, cycling its eight rotation frames while it hops;
    // on each landing it squashes (the two squash frames, sitting on the ground) and a dust puff kicks up. dur: the crossing time. calm
    // (reduced motion): slower, lower hops. Animated with node.animate directly (not K.anim), so reduced motion does not
    // speed it up. Returns { x0, x1, dur }.
    const ROLL_FRAMES = 8, FRAME_MS = 70;
    function rollWeed(speed = 1, { puff = true, dur: forced = 0, calm = K.reduced() } = {}) {
      const { y, r } = L.roll, sc = (r * 2) / (K.spriteInfo?.('el-weed-roll-1')?.w || 110);   // the frame's own width
      const mover = g({ class: 'sho-weed' }), hop = g({}), roll = g({}), squash = g({});
      mover.append(hop); hop.append(roll, squash);
      // roll frames centered on the ball's middle (r above the ground), squash frames on the ground under it
      const frames = Array.from({ length: ROLL_FRAMES }, (_, i) => spr(roll, `el-weed-roll-${i + 1}`, sc, 0, -r));
      const flat = [spr(squash, 'el-weed-squash-1', sc), spr(squash, 'el-weed-squash-2', sc)];
      squash.setAttribute('opacity', 0);
      b.layers.amb.append(mover);
      const x0 = L.roll.x0, x1 = L.roll.x1, hops = (calm ? 4 : 5) + Math.floor(Math.random() * 3);
      const dur = (forced || (L.roll.ms / speed) * rnd(0.85, 1.15)) * (calm ? 1.4 : 1);
      const H = dur / hops, up = r * (calm ? 0.55 : 1.05);
      const LAND = [0.86, 0.9, 0.95, 0.99];                      // squash-1, squash-2, squash-1, back to rolling
      const frameMs = FRAME_MS * (calm ? 1.6 : 1);
      const step = { easing: 'steps(1, end)' };
      const anims = [
        mover.animate([{ transform: `translate(${x0}px,${y}px)`, opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { transform: `translate(${x1}px,${y}px)`, opacity: 0 }], { duration: dur, easing: 'linear', fill: 'both' }),
        hop.animate([
          { transform: 'translateY(0px)', easing: 'cubic-bezier(.3,.7,.5,1)' },
          { transform: `translateY(${-up}px)`, offset: 0.43, easing: 'cubic-bezier(.5,0,.7,.3)' },
          { transform: 'translateY(0px)', offset: LAND[0] },
          { transform: 'translateY(0px)' },
        ], { duration: H, iterations: hops }),
        // rolling frames off while it squashes, the squash frames on
        roll.animate([{ opacity: 1, offset: 0, ...step }, { opacity: 0, offset: LAND[0], ...step }, { opacity: 1, offset: LAND[3], ...step }, { opacity: 1, offset: 1 }], { duration: H, iterations: hops }),
        squash.animate([{ opacity: 0, offset: 0, ...step }, { opacity: 1, offset: LAND[0], ...step }, { opacity: 0, offset: LAND[3], ...step }, { opacity: 0, offset: 1 }], { duration: H, iterations: hops }),
        flat[0].animate([{ opacity: 1, offset: 0, ...step }, { opacity: 0, offset: LAND[1], ...step }, { opacity: 1, offset: LAND[2], ...step }, { opacity: 1, offset: 1 }], { duration: H, iterations: hops }),
        flat[1].animate([{ opacity: 0, offset: 0, ...step }, { opacity: 1, offset: LAND[1], ...step }, { opacity: 0, offset: LAND[2], ...step }, { opacity: 0, offset: 1 }], { duration: H, iterations: hops }),
        ...frames.map((f, i) => f.animate(Array.from({ length: ROLL_FRAMES + 1 }, (_, k) => ({ opacity: k % ROLL_FRAMES === i ? 1 : 0, offset: k / ROLL_FRAMES, ...step })), { duration: frameMs * ROLL_FRAMES, iterations: Infinity })),
      ];
      anims.forEach((a) => life?.add(a));
      // a dust puff where it lands
      if (puff) for (let h = 0; h < hops; h++) {
        const t = (h + LAND[0]) * H;
        life?.timeout(() => puffAt(b.layers.amb, [x0 + ((x1 - x0) * t) / dur, y], (r * (calm ? 1.6 : 2)) / (K.spriteInfo?.('el-puff-1')?.w || 126), calm), t);
      }
      anims[0].finished.then(() => mover.remove(), () => mover.remove());
      return { x0, x1, dur };
    }
    // A dust puff (el-puff-1..3, sitting on the ground) blooming and drifting off with the wind.
    function puffAt(layer, [x, y], s, calm = false) {
      const node = g({ transform: `translate(${x} ${y})` }), inner = g({});
      node.append(inner);
      spr(inner, `el-puff-${1 + Math.floor(Math.random() * 3)}`, s);
      layer.append(node);
      const dx = rnd(50, 110) * (calm ? 0.5 : 1), dur = rnd(1000, 1400);
      inner.animate([
        { transform: 'translate(0px,0px) scale(.4)', opacity: 0 },
        { transform: `translate(${dx * 0.25}px,-4px) scale(.9)`, opacity: 0.9, offset: 0.2 },
        { transform: `translate(${dx}px,-14px) scale(1.2)`, opacity: 0 },
      ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' }).finished.then(() => node.remove(), () => node.remove());
    }
    // A dust cloud drifting with the wind (shots, falls: el-dust-1..3).
    function dust(layer, [x, y], s, n = 1 + Math.floor(Math.random() * 3)) {
      const node = g({ transform: `translate(${x} ${y})` }), inner = g({});
      node.append(inner);
      spr(inner, `el-dust-${n}`, s);
      layer.append(node);
      const dx = rnd(60, 130), dur = rnd(1300, 1900);
      K.anim(inner, [
        { transform: 'translate(0px,0px) scale(.45)', opacity: 0 },
        { transform: `translate(${dx * 0.3}px,${-8}px) scale(.85)`, opacity: 0.85, offset: 0.25 },
        { transform: `translate(${dx}px,${-22}px) scale(1.15)`, opacity: 0 },
      ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' }).then(() => node.remove());
    }
    // One white wind gust (el-gust-1..6, blowing right, the curl at the front):
    // fades in behind the tumbleweed, sweeps right a little faster than it rolls (it pushes it and overtakes it), with a
    // slight stretch, and fades out. y = its middle; w = its width in scene units.
    function gustSprite(layer, x0, y, w, dist, dur, calm, set = null) {
      const n = set ? set[Math.floor(Math.random() * set.length)] : 1 + Math.floor(Math.random() * 6), info = K.spriteInfo?.(`el-gust-${n}`);
      const node = g({ class: 'sho-wind', opacity: 0 }), inner = g({});
      node.append(inner);
      spr(inner, `el-gust-${n}`, w / (info?.w || 360));
      layer.append(node);
      const lift = rnd(-8, 8);
      node.animate([
        { transform: `translate(${x0}px,${y}px) scale(.82,.9)`, opacity: 0 },
        { transform: `translate(${x0 + dist * 0.2}px,${y + lift * 0.4}px) scale(1,1)`, opacity: calm ? 0.8 : 0.95, offset: 0.2 },
        { transform: `translate(${x0 + dist * 0.75}px,${y + lift}px) scale(1.06,.97)`, opacity: calm ? 0.8 : 0.9, offset: 0.72 },
        { transform: `translate(${x0 + dist}px,${y + lift * 1.2}px) scale(1.12,.9)`, opacity: 0 },
      ], { duration: dur, easing: 'linear', fill: 'both' }).finished.then(() => node.remove(), () => node.remove());
    }
    // A gust (every 13-17 s, see gusts()): the tumbleweed crosses the street, and wave after wave of 2-3 white gusts
    // sweep in right behind and around it (one at its height just behind, one above, one a little lower and ahead),
    // each a little faster than the tumbleweed: they push it along, wrap around it, and fade once past it. The saloon
    // sign sways. The tumbleweed and the gusts are small and far, behind the duelists. calm (reduced motion): the
    // crossing is slower, the waves sparser, nothing sways.
    function gust() {
      const calm = K.reduced();
      const { y: ry, r } = L.roll, cy = ry - r;
      const DUR = 6400 * (calm ? 1.4 : 1), LEAD = 300;   // the crossing; the gusts come in a moment before it
      const x0 = L.roll.x0, x1 = L.roll.x1, v = (x1 - x0) / DUR;      // where the tumbleweed is: x0 + v * (t - LEAD)
      life?.timeout(() => rollWeed(1, { dur: DUR / (calm ? 1.4 : 1), calm }), LEAD);
      const WAVE = calm ? 1500 : 950, waves = Math.ceil((LEAD + DUR * 0.85) / WAVE);
      for (let i = 0; i < waves; i++) {
        const t = i * WAVE + rnd(0, 120);
        life?.timeout(() => {
          const wx = x0 + v * Math.max(0, t - LEAD), dur = rnd(1300, 1600) * (calm ? 1.3 : 1);
          const slots = [[-1.0, 0, 1], [-0.75, -1.5, 0.8], [-0.35, 0.55, 0.7]];       // [x behind (gust widths), y (radii), size]
          // devAmbient.weed gusts: fewer, smaller gusts of a chosen set
          const cg = L.coverGusts, n = cg ? cg.per : calm ? 2 : 2 + (Math.random() < 0.55 ? 1 : 0);
          for (const [bx, by, sz] of slots.slice(0, n)) {
            const w = r * rnd(5.2, 6.4) * sz * (cg ? cg.size : 1);            // small, like the far tumbleweed
            gustSprite(b.layers.amb, Math.max(x0 - w * 0.4, wx + bx * w), cy + by * r + rnd(-6, 6), w, v * dur * rnd(1.15, 1.35), dur, calm, cg ? cg.set : null);
          }
        }, t);
      }
      if (calm) return LEAD + DUR;
      // the sign sways
      if (signNode) K.anim(signNode, [0, -1.6, 1.2, -0.8, 0.4, 0].map((a, k2, l) => ({ transform: `rotate(${a}deg)`, offset: k2 / (l.length - 1) })), { duration: 2200, easing: 'ease-in-out', fill: 'none' });
      return LEAD + DUR;
    }
    // The saloon sign (el-sho-sign) hangs on the false front, pivoting on its top edge so it can sway on a gust.
    let signNode = null;
    function sign() {
      const [x, y] = L.sign;
      signNode = pivot(g({ class: 'sho-sign' }), x, y);
      K.sprite(signNode, 'el-sho-sign', { x, y });
      b.layers.amb.prepend(signNode);
    }
    // gusts every 13-17 s (the first one soon after the scene appears)
    function gusts(first = 3500) {
      life?.timeout(() => { if (!document.hidden) gust(); gusts(rnd(13000, 17000)); }, first);
    }
    function ambient() {
      sign();
      if (ctx.mini) { vulture(); return; }
      life = K.life({ mini: ctx.mini });
      sunGlow();
      vulture();
      // a few gnats buzz by the vulture's perch (far from the duelists; calmer under reduced motion, see K.gnats)
      K.gnats(life, b.layers.amb, { at: L.gnats, n: 3, size: 1.1, r: 12 });
      // a few small birds cross the sky now and then, far away (not under reduced motion)
      K.farBirds(b, life, b.layers.amb, { band: [70, 230], size: 1.1, every: 19000, jitter: 14000 });
      // the tumbleweed moment runs under reduced motion too (calm: slower, the sign stays still)
      gusts();
    }
    // Camera shake that moves the background with the scene.
    function shake(strength) {
      if (K.reduced()) return;
      K.shake(b.camera, strength);
      const s = strength, X = (v) => `${((v / b.W) * 100).toFixed(3)}%`, Y = (v) => `${((v / b.H) * 100).toFixed(3)}%`;
      if (b.bgEl) K.anim(b.bgEl, [{ transform: 'translate(0,0)' }, { transform: `translate(${X(s)},${Y(-s / 2)})` }, { transform: `translate(${X(-s)},${Y(s / 2)})` }, { transform: `translate(${X(s / 2)},${Y(s)})` }, { transform: 'translate(0,0)' }], { duration: 260, fill: 'none' });
    }

    // ---------------- effects (front layer, removed when done) ----------------
    // Code-drawn wood chips flying off a point (away from the enemy), fading.
    function chips(at, n, spread, side) {
      for (let i = 0; i < n; i++) {
        const w = rnd(10, 18), h = rnd(5, 8);
        const chip = el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 2, fill: i % 2 ? COL.wood : COL.woodDark, stroke: C.outline, 'stroke-width': 2.5 });
        const node = g({ transform: `translate(${at[0]} ${at[1]})` }, chip);
        fx.append(node);
        const dx = -dir(side) * rnd(0.2, 1) * spread * 0.6 + rnd(-0.4, 0.4) * spread, up = rnd(0.6, 1.2) * spread;
        K.anim(chip, [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx * 0.6}px,${-up}px) rotate(${rnd(-200, 200)}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px,${-up * 0.4}px) rotate(${rnd(-400, 400)}deg)`, opacity: 0 }], { duration: rnd(420, 620), easing: 'cubic-bezier(.2,.7,.5,1)' }).then(() => node.remove());
      }
    }
    function puff(at, r, dx, dy, delay = 0, dur = 650) {
      const c = el('circle', { r, fill: C.paper, stroke: C.outline, 'stroke-width': 6 });
      const node = g({ transform: `translate(${at[0]} ${at[1]})` }, c);
      fx.append(node);
      return K.anim(c, [{ transform: 'translate(0,0) scale(.3)', opacity: 0.95 }, { transform: `translate(${dx}px,${dy}px) scale(1.25)`, opacity: 0 }], { duration: dur, delay, fill: 'both' }).then(() => node.remove());
    }
    function sparks(at, n = 8, len = 60, color = COL.muzzle) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 360 + Math.random() * 30;
        const line = g({}, el('line', { x1: 6, y1: 0, x2: 28, y2: 0, stroke: C.outline, 'stroke-width': 13, 'stroke-linecap': 'round' }), el('line', { x1: 6, y1: 0, x2: 28, y2: 0, stroke: color, 'stroke-width': 7, 'stroke-linecap': 'round' }));
        const node = g({ transform: `translate(${at[0]} ${at[1]}) rotate(${a})` }, line);
        fx.append(node);
        K.anim(line, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${len * (0.7 + Math.random() * 0.6)}px,0)`, opacity: 0 }], { duration: 320 + Math.random() * 120 }).then(() => node.remove());
      }
    }
    // A bullet with a short trail from a to c; resolves when it arrives.
    function tracer(a, c, ms, w = 7) {
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const trail = el('rect', { x: 0, y: -w / 2, width: len, height: w, rx: w / 2, fill: C.paper, opacity: 0.85 });
      const slug = el('ellipse', { cx: 0, cy: 0, rx: 15, ry: 6 + w / 4, fill: COL.muzzle, stroke: C.outline, 'stroke-width': 4 });
      const node = g({ transform: `translate(${a[0]} ${a[1]}) rotate(${deg(a, c)})` }, trail, slug);
      fx.append(node);
      K.anim(trail, [{ transform: 'scaleX(0)', opacity: 0.9 }, { transform: 'scaleX(1)', opacity: 0.4 }], { duration: ms, easing: 'linear' });
      return K.anim(slug, [{ transform: 'translate(0,0)' }, { transform: `translate(${len}px,0)` }], { duration: ms, easing: 'linear' })
        .then(() => { K.anim(node, [{ opacity: 1 }, { opacity: 0 }], { duration: 120 }).then(() => node.remove()); });
    }
    // A big "?" over a confused duelist's head.
    function question(side, ms) {
      const [x, y] = rigs[side].headPoint(), s = L[side].s;
      const q = el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': Math.round(90 * s), fill: C.paper, stroke: C.outline, 'stroke-width': 10, 'paint-order': 'stroke' }, '?');
      fx.append(g({ transform: `translate(${x - dir(side) * 70 * s} ${y - 150 * s})` }, q));
      return K.anim(q, [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.2) rotate(8deg)', offset: 0.4 }, { transform: 'scale(1) rotate(0deg)' }], { duration: ms });
    }
    // The dropped revolver tumbles over the fence top and drops behind it.
    function dropGun(side, ms) {
      const r = rigs[side], at = r.handPoint(2), s = L[side].s, d = dir(side);
      const gun = VP()?.revolver?.();
      if (!gun) return;
      const spin = g({}, gun.root);
      const node = g({ transform: `translate(${at[0]} ${at[1]}) scale(${d * s} ${s})` }, spin);
      stage[side].append(node);
      const fallY = (L[side].y - at[1]) / s - 10;
      K.anim(spin, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(50px,-130px) rotate(260deg)', offset: 0.4 }, { transform: `translate(110px,${fallY}px) rotate(520deg)` }], { duration: ms, easing: 'ease-in' }).then(() => node.remove());
    }

    // ---------------- poses / choreography ----------------
    // Sets a side back to its standing ready look: revolver in hand.
    function resetSide(side, mood = 'SHO-2') {
      const r = rigs[side];
      r.hold(1, null); r.hold(2, 'revolver');
      r.idle(true); r.set(P.ready); r.mood(mood);
    }
    function resetFx() {
      fx.replaceChildren();
      labels.forEach((l) => l.remove()); labels = [];
    }

    // Aim pose: the gun arm reaches from its shoulder toward a scene point; r2 points the gun at it.
    function aimPose(side, pt, base = {}) {
      return aimAt(localAng(side, deg(toWorld(side, levelHand(ARM)), pt)), base);
    }
    function shotgunPose(side, pt, base = {}) { return shotgunAt(localAng(side, deg(toWorld(side, SG_AT), pt)), base); }
    const muzzleAt = (side, pose, m) => toWorld(side, add(window.DuelFigures.handOf(pose, 2), rotV(add(m, (pose.p2 || [0, 0]).slice(0, 2)), pose.r2)));

    async function reload(side, before, until) {
      const r = rigs[side], gun = r.prop(2), RP = reloadPoses();
      r.mood('SHO-4');
      const cylOut = (on, ms) => {
        if (!gun) return Promise.resolve();
        const at = `translate(${REV.cylIn[0] / REV.S}px,${REV.cylIn[1] / REV.S}px)`, out = `translate(${REV.cylOut[0] / REV.S}px,${REV.cylOut[1] / REV.S}px)`;
        if (on) { show(gun.cylSide, false); show(gun.cylFace, true); }
        return K.anim(gun.cylFace, [{ transform: on ? at : out }, { transform: on ? out : at }], { duration: ms, easing: on ? 'cubic-bezier(.2,.9,.3,1.3)' : 'cubic-bezier(.5,0,.8,.4)' })
          .then(() => { if (!on && !dead) { show(gun.cylFace, false); show(gun.cylSide, true); K.clear(gun.cylFace); } });
      };
      // Shot while reloading: only the gun comes up and the cylinder swings out before the hit.
      if (until < 900) {
        cylOut(true, until * 0.5);
        await r.to(RP.open, until * 0.9, 'out');
        return;
      }
      const [tOpen, tBring, tInsert, tSnap, tBack] = K.fit([260, 280, 150, 300, 330], until - 40);
      cylOut(true, tOpen * 0.8);
      await r.to(RP.open, tOpen, 'out');
      r.hold(1, 'bullet');
      r.prop(1)?.root.setAttribute('transform', 'scale(1.8)');
      await r.to(RP.bring, tBring, 'inOut');
      await r.to(RP.insert, tInsert, 'in');
      r.hold(1, null);
      if (before < maxAmmo) showAmmo(side, before + 1);
      // spin and snap back with a click
      sfx('shootout-cylinder-spin');
      if (gun) K.anim(gun.cylSpin, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(300deg)' }], { duration: tSnap * 0.7, easing: 'cubic-bezier(.2,.7,.4,1)' });
      await r.to(RP.spin, tSnap * 0.6, 'out');
      sfx('shootout-reload');
      cylOut(false, tSnap * 0.25);
      await r.to(RP.snap, tSnap * 0.4, 'snap');
      await r.to(P.ready, tBack, 'inOut');
    }

    // Block: duck down behind the fence, hold, back up (unless hit: `until` ends at the hit).
    async function block(side, t, until, staysDown) {
      const r = rigs[side], pose = P.duck;
      r.mood('SHO-5');
      await r.seq([[dive(pose), t.prepMs * 0.4, 'out'], [pose, t.prepMs * 0.6, 'back']]);
      if (staysDown) { await K.sleep(Math.max(0, until - t.prepMs)); return; }
      const exitMs = Math.min(320, until * 0.24);
      await K.sleep(Math.max(0, until - t.prepMs - exitMs));
      r.mood('SHO-2');
      await r.to(P.ready, exitMs, 'inOut');
    }
    // The enemy's bullet hits the fence: it cracks, splinters fly, a ricochet, a flinch.
    async function blockHit(side, at, shooterMuzzle, ms) {
      const r = rigs[side], pose = P.duck, s = L[side].s;
      sfx('shootout-block'); sfx('shootout-ricochet');
      VP()?.impact?.(fx, at[0], at[1], -dir(side), 420);
      sparks(at, 6, 40);
      crackFence(side, at);
      dust(fx, [at[0], at[1] - 6], 0.2 * s, 1);
      tracer(at, [at[0] + (at[0] - shooterMuzzle[0]) * -0.25, at[1] - 260 * s], 220, 5);
      r.mood('SHO-6');
      await r.seq([[flinch(pose), ms * 0.3, 'snap'], [pose, ms * 0.7, 'inOut']]);
    }

    async function shoot(side, plan, t, until) {
      const r = rigs[side];
      r.mood('SHO-7');
      await r.to(plan.pose, t.prepMs, 'back');
      fire(side, plan, t);
      const kick = { ...plan.pose, r2: plan.pose.r2 - 16, a2: [plan.pose.a2[0] - 10, plan.pose.a2[1] - 10, 0.2], bx: -4, hrot: -4 };
      await r.seq([[kick, 70, 'snap'], [plan.pose, 150, 'out']]);
      const used = t.prepMs + 220, back = Math.min(330, (until - used) * 0.5);
      if (until - used < 260) return;
      await K.sleep(until - used - back);
      r.mood('SHO-2');
      await r.to(P.ready, back, 'inOut');
    }
    async function blast(side, plan, t, until) {
      const r = rigs[side];
      r.hold(2, 'shotgun');
      r.mood('SHO-8');
      await r.to(plan.pose, t.prepMs, 'back');
      fire(side, plan, t);
      const kick = blastKick(plan.pose);
      await r.seq([[kick, 90, 'snap'], [{ ...plan.pose, x: -10 }, 260, 'out']]);
      const used = t.prepMs + 350, back = Math.min(330, (until - used) * 0.5);
      if (until - used < 260) return;
      await K.sleep(until - used - back);
      r.mood('SHO-2');
      await r.to({ ...P.ready, a2: [62, FENCE_TOP(62) - 14, -0.1], r2: 20 }, back * 0.5, 'in');
      r.hold(2, 'revolver');
      await r.to(P.ready, back * 0.5, 'out');
    }
    // Muzzle flash + tracer(s); resolves when the bullets arrive.
    function fire(side, plan, t) {
      const big = plan.big, s = L[side].s, ang = worldAng(side, plan.pose.r2);
      sfx(big ? 'shootout-blast' : 'shootout-shot');
      VP()?.muzzleFlash?.(fx, plan.muzzle[0], plan.muzzle[1], ang, (big ? 2.4 : 1.3) * s, big ? 300 : 180);
      showAmmo(side, ammoN[side] - (big ? maxAmmo : 1));
      if (!big) return tracer(plan.muzzle, plan.dest, t.flyMs);
      shake(14);
      const fwd = [Math.cos(ang * D2R), Math.sin(ang * D2R)], perp = [-fwd[1], fwd[0]];
      [0, 1, 2, 3].forEach((k) => puff([plan.muzzle[0] + fwd[0] * (30 + k * 40) * s, plan.muzzle[1] + fwd[1] * (30 + k * 40) * s], (22 + k * 6) * s, fwd[0] * 40, -40 - k * 10, k * 50));
      return Promise.all([-1, 0, 1].map((k) => tracer(plan.muzzle, [plan.dest[0] + perp[0] * k * 34 * s, plan.dest[1] + perp[1] * k * 34 * s], t.flyMs, 10)));
    }
    async function confused(side, until) {
      const r = rigs[side];
      r.mood('SHO-10');
      question(side, Math.min(500, until * 0.5));
      await r.to(P.confused, Math.min(360, until * 0.4), 'out');
      r.idle(false);
    }
    // Knocked up and back, then flat on the back behind the fence with the legs up.
    async function fall(side, ms) {
      const r = rigs[side];
      fallen[side] = true;
      r.idle(true);
      r.mood('SHO-9');
      dropGun(side, ms * 0.8);
      r.hold(2, null); r.hold(1, null);
      shake(10);
      await r.seq([[P.fallUp, ms * 0.32, 'out'], [P.fallDown, ms * 0.38, 'in'], [P.fallRest, ms * 0.3, 'out']]);
      dust(fx, toWorld(side, [60, -40]), 0.28 * L[side].s, 2);
      r.mood('SHO-12');
      r.idle(false);
    }
    async function victory(side, ms, moment = 'SHO-11') {
      const r = rigs[side];
      r.idle(true);
      r.mood(moment);
      K.burst(b.layers.front, ...r.headPoint(), C.gold, 12, 180 * L[side].s);
      ctx.hud?.pulse(side);
      const [a, c, d, e] = K.fit([260, 200, 200, 240], ms);
      // A shotgun is long: raised at a slant.
      const sg = r.held?.[2] === 'shotgun' ? { a2: [118, -240, 0.1], r2: -42 } : {};
      const up = { ...P.victory, ...sg }, hop = { ...P.victoryHop, ...sg, ...(sg.a2 ? { a2: [122, -256, 0.1] } : {}) };
      await r.seq([[up, a, 'back'], [hop, c, 'out'], [up, d, 'in'], [up, e, 'linear']]);
    }

    async function impact(mv, plan, win, t, over) {
      await K.sleep(t.prepMs + t.flyMs);
      const pz = { hold: Math.max(200, t.hitMs + t.afterMs - 400), y: L.punchY };
      const pair = (a, c) => (mv.you === a && mv.opp === c) || (mv.you === c && mv.opp === a);
      if (win) {
        const lose = other(win), fallMs = Math.min(900, t.hitMs + t.afterMs * 0.5);
        // a blast takes the fence with it (Blast beats Block: the blocker is hit too)
        if (mv[win] === 'blast') blowFence(lose, t.hitMs + t.afterMs - 120);
        if (mv[lose] === 'shoot') sparks(plan[lose].dest, 6, 40);
        VP()?.muzzleFlash?.(fx, plan[win].dest[0], plan[win].dest[1], deg(plan[win].muzzle, plan[win].dest), 0.9 * L[lose].s, 200);
        sfx('shootout-hit-fall');
        if (!ctx.mini) ctx.sound?.haptic?.(80);
        if (life) life.timeout(() => rollWeed(), t.hitMs + t.afterMs * 0.15);
        const jobs = [fall(lose, fallMs), K.punch(b, 'BANG!', { ...pz, who: win })];
        // The winner of the duel celebrates while the loser stays down.
        if (over) jobs.push(K.sleep(t.hitMs + t.afterMs * 0.3).then(() => victory(win, t.afterMs * 0.7 - 40)));
        return Promise.all(jobs);
      }
      let text = '', who = '';
      if (mv.you === 'shoot' && mv.opp === 'shoot') {
        sfx('shootout-bullet-clash');
        const at = plan.you.dest;
        sparks(at, 12, 80);
        VP()?.muzzleFlash?.(fx, at[0], at[1], -90, 1.2, 220);
        VP()?.muzzleFlash?.(fx, at[0], at[1], 90, 1.2, 220);
        text = 'CLANG!';
      } else if (pair('shoot', 'block')) {
        const shooter = mv.you === 'shoot' ? 'you' : 'opp';
        blockHit(other(shooter), plan[shooter].dest, plan[shooter].muzzle, Math.min(420, t.hitMs + t.afterMs * 0.4));
        text = 'BLOCKED'; who = other(shooter);
      } else if (mv.you === 'blast' && mv.opp === 'blast') {
        const pt = plan.you.dest;
        VP()?.muzzleFlash?.(fx, pt[0], pt[1], 0, 2.6, 360);
        VP()?.muzzleFlash?.(fx, pt[0], pt[1], 180, 2.6, 360);
        shake(18);
        [0, 1, 2, 3, 4, 5].forEach((k) => { const a = (k / 6) * Math.PI * 2; puff(pt, 34, Math.cos(a) * 90, Math.sin(a) * 60 - 30, k * 30, 700); });
        text = 'BOOM!';
      } else if (mv.you === 'reload' || mv.opp === 'reload') text = 'RELOAD';
      else if (mv.you === 'idle' && mv.opp === 'idle') text = 'BOTH MISSED';
      if (over) {
        text = 'No hit — next duel'; who = '';
        // both still standing when the duel runs out of turns
        K.sleep(t.hitMs + t.afterMs * 0.35).then(() => { if (!dead) SIDES.forEach((s) => { if (!fallen[s]) rigs[s].mood('SHO-13'); }); });
      }
      if (text) return K.punch(b, text, { ...pz, who, size: 'small' });
    }

    function setAmmo(state) { for (const s of SIDES) showAmmo(s, state.ammo[s === 'you' ? ctx.you : 1 - ctx.you]); }
    const legal = (v) => affordable(v, myAmmo, maxAmmo);

    const api = {
      mount(container, c) {
        ctx = c;
        b = K.base(container, ctx, { bg: 'shootout-street' });
        L = POS;
        b.frame.classList.add('sho-frame');
        ({ REV, GUN } = geo());
        // back to front: the opponent (clipped at its feet line) behind its fence, then you behind yours; the blast
        // pieces lie in front of each fence
        for (const s of ['opp', 'you']) {
          rigs[s] = duelist(s);
          const front = buildFence(s);
          stage[s] = clipped(s, rigs[s].root);
          b.layers.mid.append(stage[s], ...front);
        }
        K.glow(b, { you: [L.you.x, L.you.y - 200 * L.you.s], opp: [L.opp.x, L.opp.y - 200 * L.opp.s] });
        fx = g({ class: 'fx' });
        b.layers.front.append(fx);
        ambient();
        K.youStart(b, rigs.you, ctx);   // the YOU arrow over your character at the start (an overlay, never awaited)
        controls = K.buttons(ctx, MOVES.map((v, i) => ({ v, label: LABEL[v], icon: icon(v), key: String(i + 1) })), { cls: 'shootout' });
        if (controls) {
          controls.onPick = (v) => { if (sent) return; sent = true; ctx.send(v); };
          controls.disable();
          unbindKeys = K.keys({ 1: 'reload', 2: 'block', 3: 'shoot', 4: 'blast' }, (v) => controls.press(v));
        }
      },

      setRound(state) {
        const wasDown = SIDES.filter((s) => fallen[s]);
        resetFx();
        // A new duel (or a hit: a hit always ends the duel): the fences stand intact again.
        const newDuel = state.turn === 0 || state.duel !== duelNo || wasDown.length > 0 || SIDES.some((s) => fences[s].state === 'blasted');
        duelNo = state.duel;
        if (newDuel) SIDES.forEach(resetFence);
        // the stare-down at the start of a duel, then waiting for the move
        const mood = state.turn === 0 ? 'SHO-1' : 'SHO-2';
        for (const s of SIDES) { resetSide(s, mood); fallen[s] = false; }
        // A new duel: the fallen duelist gets back up behind its fence.
        for (const s of wasDown) {
          rigs[s].set({ ...P.ready, y: 118, by: 30, bsy: 0.85, hy: 16 });
          rigs[s].to(P.ready, 420, 'back');
        }
        sent = false;
        maxAmmo = state.maxAmmo || 3;
        myAmmo = state.ammo[ctx.you];
        ctx.hud?.set(state);
        setAmmo(state);
        if (!ctx.mini && state.turn === 0) { sfx('shootout-wind', { volume: 0.5 }); sfx('shootout-start-bell', { volume: 0.75 }); }   // a duel starts: church bells strike noon
        controls?.enable(legal);
      },

      setLocked(who) {
        if (who === 'opp') { /* silent: the scoreboard shows it (a mid-turn tock sounded like a clock) */ }
        else {
          controls?.disable();
          ctx.sound?.play('ui-lock');
        }
        // No pose change on a lock (the same in every game): the character stays as it is; the scoreboard check mark
        // (hud.js) and, for your own lock, ui-lock are the only signs. The face stays the round's normal mood.
        rigs[who].mood('SHO-3');
      },

      async reveal(r) {
        controls?.disable();
        resetFx();
        for (const s of SIDES) { if (fallen[s]) { resetSide(s); resetFence(s); } fallen[s] = false; rigs[s].idle(true); }
        const mv = { you: r.moves[ctx.you] || 'idle', opp: r.moves[1 - ctx.you] || 'idle' };
        const prev = r.prev || r.state;
        const before = { you: prev.ammo[ctx.you], opp: prev.ammo[1 - ctx.you] };
        setAmmo(prev);
        const over = !!r.state.history?.at(-1)?.duelOver;
        // Draw, fly, impact, aftermath (fall + punch): the whole timeline fits the server's animation budget.
        const budget = (over ? ctx.timing?.duelOver || 2300 : ctx.timing?.reveal || 1500) - 170;
        const [prepMs, flyMs, hitMs, afterMs] = K.fit(over ? [300, 300, 160, 1440] : [280, 280, 160, 680], budget);
        const t = { prepMs, flyMs, hitMs, afterMs }, total = prepMs + flyMs + hitMs + afterMs - 30;
        const win = r.roundWinner == null ? null : r.roundWinner === ctx.you ? 'you' : 'opp';
        const lose = win && other(win);
        if (!ctx.mini) for (const s of SIDES) { const l = K.label(b, L[s].x, L.labelY, s); l.textContent = LABEL[mv[s]] || ''; labels.push(l); }

        // Aim poses, muzzles and bullet destinations: a shot at a blocker hits its fence, a blast at a blocker aims
        // at the middle of the fence (and breaks it), anything else aims at the body over the fence.
        const target = (s, big) => {
          const o = other(s);
          if (mv[o] !== 'block') return toWorld(o, [4, -150]);
          return fencePt(o, big ? FENCE.blast : FENCE.hit);
        };
        const plan = {};
        for (const s of SIDES) {
          if (mv[s] !== 'shoot' && mv[s] !== 'blast') continue;
          const big = mv[s] === 'blast', aimPt = target(s, big);
          const pose = big ? shotgunPose(s, aimPt) : aimPose(s, aimPt);
          plan[s] = { pose, big, aimPt, muzzle: muzzleAt(s, pose, big ? GUN.muzzle : REV.muzzle) };
        }
        for (const s of Object.keys(plan)) {
          const p = plan[s], q = plan[other(s)];
          if (q && mv[s] === mv[other(s)]) p.dest = mid(p.muzzle, q.muzzle);         // bullets collide / blasts cancel
          else if (q && mv[s] === 'shoot') p.dest = lerp(p.muzzle, p.aimPt, 0.5);       // swallowed by the blast
          else p.dest = p.aimPt;
        }

        const hitAt = prepMs + flyMs;
        // the duel point shows in the scoreboard when the bullet lands
        if (win) life?.timeout(() => { ctx.hud?.set(r.state, { scoreOnly: true }); ctx.hud?.pulse(win); }, hitAt * (K.reduced() ? 0.35 : 1));
        const act = async (s) => {
          const m = mv[s];
          const until = s === lose ? hitAt : s === win ? hitAt + hitMs : total;
          if (m === 'reload') return reload(s, before[s], until);
          if (m === 'block') return block(s, t, until, s === lose);
          if (m === 'shoot') return shoot(s, plan[s], t, until);
          if (m === 'blast') return blast(s, plan[s], t, until);
          return confused(s, until);
        };
        await Promise.all([...SIDES.map(act), impact(mv, plan, win, t, over)]);
        ctx.hud?.set(r.state);
        setAmmo(r.state);
      },

      async end(r) {
        labels.forEach((l) => l.remove()); labels = [];
        const win = r.winner == null ? null : r.winner === ctx.you ? 'you' : 'opp';
        if (!win) {
          await Promise.all(SIDES.filter((s) => !fallen[s]).map((s) => { rigs[s].mood('SHO-13'); return rigs[s].seq([[P.shrug, 400, 'out'], [P.ready, 600, 'inOut']]); }));
          return;
        }
        const lose = other(win);
        const jobs = [];
        if (fallen[win]) { resetSide(win); fallen[win] = false; }
        jobs.push(victory(win, 1100, 'SHO-14'));
        if (!fallen[lose]) {
          rigs[lose].mood('SHO-15');
          jobs.push(rigs[lose].to(P.sad, 800, 'inOut'));
        } else rigs[lose].mood('SHO-15');
        await Promise.all(jobs);
      },

      // dev only (screenshots, tools/covers.js): start a tumbleweed roll / a wind gust (with its tumbleweed) now; weed =
      // the next tumbleweeds and gusts bigger (scale) and nearer (dy, scene units), and gusts = { per, size, set }: how
      // many gusts per wave, their size and which of el-gust-1..6; aim = both duelists hold their revolver at the other:
      // { chest: true } at the other's chest over the fence (the point a real shot aims at), else level at the other's
      // gun hand
      devAmbient: {
        roll: () => life && rollWeed(), gust: () => life && gust(), wind: () => life && gust(),
        weed: ({ scale = 1, dy = 0, gusts = null } = {}) => { const r0 = POS.roll; L = { ...L, roll: { ...r0, r: r0.r * scale, y: r0.y + dy }, coverGusts: gusts }; },
        aim: ({ chest = false } = {}) => SIDES.forEach((s) => { const o = other(s); rigs[s].idle(false); rigs[s].set(aimPose(s, toWorld(o, chest ? [4, -150] : levelHand(ARM)))); }),
      },
      setControlsEnabled(on) { if (on) controls?.enable(legal); else controls?.disable(); },
      target(name) {
        if (MOVES.includes(name)) return controls?.button(name) || null;
        return null;
      },
      destroy() {
        dead = true; unbindKeys?.(); life?.stop();
        Object.values(rigs).forEach((r) => r.destroy()); K.clear(b?.svg);
      },
    };
    return api;
  }

  // Scripted mini-preview duel: reload, a blocked shot, a blast, a hit on a reload, two shots colliding.
  const SCRIPT = [['reload', 'reload'], ['shoot', 'block'], ['reload', 'reload'], ['reload', 'reload'], ['block', 'blast'], ['reload', 'reload'], ['shoot', 'reload'], ['reload', 'reload'], ['shoot', 'shoot']];
  window.DuelScenes.register('shootout', {
    create,
    poses: allPoses,   // every pose (the computed aim / blast / reload ones sampled), for the character lab
    preview: (s, step) => SCRIPT[step % SCRIPT.length].map((m, i) => {
      const ammo = s?.ammo?.[i] ?? 0, max = s?.maxAmmo ?? 3;
      if (affordable(m, ammo, max)) return m;
      return m === 'blast' && ammo >= 1 ? 'shoot' : 'reload';
    }),
    // How much of the frame's bottom the match controls may cover (fraction of its height; kit.js contract): the street in
    // front of the fences; in the corner (preview option) also the street beside the opponent's fence.
    safeBottom: 0.15,
    shortcuts: [['1', 'Reload'], ['2', 'Block'], ['3', 'Shoot'], ['4', 'Blast']],
    // the top scoreboard: duel wins as the score, the duel and turn, ammo per player
    hud: (state, you) => ({
      round: `Duel ${state.duel}`, note: `Turn ${Math.min(state.turn + 1, state.maxTurns)}/${state.maxTurns}`,
      you: { ammo: [state.ammo[you], state.maxAmmo || 3] }, opp: { ammo: [state.ammo[1 - you], state.maxAmmo || 3] },
    }),
    keyRule: 'Reload to get ammo. Shoot hits a reloading player, Block stops bullets, Blast beats everything.',
  });
})();
