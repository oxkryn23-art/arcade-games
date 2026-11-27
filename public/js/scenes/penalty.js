// Penalty Shootout scene: stadium view from behind the penalty spot. The goal mouth itself is the control
// (three tappable zones), with a button panel in the bottom-right corner (def.controls = 'corner') and the ← ↓ → keys.
// The panel changes with your role: kicking = "Pick a corner" (the goal with the ball flying into each zone), keeping =
// "Pick a dive" (a keeper diving left / jumping / diving right), each with its own accent (scenes.css [data-role]).
// Left/right are screen left/right (the camera's point of view). The kick tracker, the roles and the score are in the
// top scoreboard (def.hud: the boot = kicking, the gloves = keeping). The stadium, the pitch lines and the goal frame
// are the background art (art-penalty.js, which also holds the goal and seat geometry the layout below uses).
// Two characters (rig.js), one per side; the roles swap every kick. The kicker stands seen from BEHIND, runs up and
// strikes with the screen-right leg (l2); the keeper stands on the goal line in FRONT view wearing goalkeeper gloves
// and dives left / right (whole-character rotation, arms stretched overhead) or jumps for the center, catching
// overhead. A save hands the ball to the keeper (DuelProps.football held in hand 1); a goal bulges the net.
// Crowd: fans seated in the stands in two rows for depth (a front row el-fan-sit-n, a smaller back row el-fan-back-n
// two seat rows up, and the top row above the crossbar), with a light idle bob (K.life loops; none under reduced
// motion or in minis). A GOAL: every fan jumps up cheering (el-fan-cheer-n, the same fan, a scarf or fists overhead)
// and keeps hopping, el-goal-flag flags pop up and wave between them, confetti (el-confetti-v4-n) shoots up from three
// cannons in ballistic arcs, and a cream "GOAL!" splash pops in and out (the same splash says SAVED! / MISSED!). A save
// or a miss: a quick groan dip of the crowd. Everything fits the reveal budget (the outcome part is endMs; the
// confetti ends just after it, a new round clears it all).
// The gloves are hand shapes of the rig, drawn in the front arm layer above the head.
// Who does what this turn is instantly obvious, none of it touching the reveal's timing:
//   - a ROLE BANNER at the start of every kick turn (setRound): "YOU KICK" with a ball or "YOU SAVE" with the gloves,
//     sliding over the scene for ~1.1 s with a short whoosh (penalty-role-whoosh); under reduced motion it only fades;
//   - a YOU marker: the shared YOU arrow (kit.js youArrow) just above the head of the character you control this turn
//     (the kicker or the keeper), shown at the start of every turn for 3 s (it drops in and bobs; reduced motion: only
//     a fade), pointer-transparent, plus a soft glow ring under its feet in your color all turn; no opponent marker;
//   - an AIM PREVIEW on hover (mouse) or on the first tap (touch: the second tap on the same zone or button confirms):
//     kicking = a crosshair on the zone + a dashed ball path from the ball to it; keeping = a translucent ghost keeper
//     diving to that side (or jumping for the center). Purely local: nothing is sent before the pick locks;
//   - the panel by role: "KICK — pick a corner" (the ball icons, green) vs "SAVE — pick a dive" (the keeper icons,
//     amber), the same colors as the banner's role chip.
// Coach-mark targets: 'zone-left' | 'zone-center' | 'zone-right' (in-scene zones), 'left' | 'center' | 'right'
// (buttons), 'goal', 'keeper', 'kicker' (the rig roots of the current roles), 'you-marker' (the YOU arrow); 'scoreboard'
// is the top scoreboard.
(function () {
  const K = window.DuelKit;
  const { C, el, g } = K;
  const M = () => window.DuelFigures;
  const D2R = Math.PI / 180;
  const ZONES = ['left', 'center', 'right'];
  const LABEL = { left: 'Left', center: 'Center', right: 'Right' };
  // Control icons, drawn in code (art-penalty.js): kicking = the goal with the ball flying into the zone; keeping = a
  // keeper diving left / jumping / diving right.
  const ART = () => window.DuelArt || { icons: {} };
  const ICON = (role, v) => ART().icons[`pen-${role}-${v}`] || '';
  const ROLE_UI = {
    kick: { prompt: 'KICK — pick a corner', verb: 'Shoot', word: 'KICK' },
    keep: { prompt: 'SAVE — pick a dive', verb: 'Dive', word: 'SAVE' },
  };
  // Role icons for the banner and the panel's chip: the football (code-drawn, DuelProps) and the goalkeeper gloves.
  const ballIcon = () => { const fb = window.DuelProps?.football?.(); return fb ? `<svg class="pen-ball-ico" viewBox="-23 -23 46 46" aria-hidden="true">${fb.root.outerHTML}</svg>` : ''; };
  const ROLE_ICON = { kick: ballIcon, keep: () => ART().icons['pen-gloves-chip'] || '' };
  const KEYS = { ArrowLeft: 'left', ArrowDown: 'center', ArrowRight: 'right' };

  // Lined up with the background art (art-penalty.js A.pen): goal posts and crossbar (goal), penalty spot (spot; the
  // ball rests on it), goal line (keeper). kicker = where the kicker waits (start of the run-up); ks = the kicker's
  // scale at the ball (depth).
  const GOAL_ART = window.DuelArt?.pen?.goal || { x0: 486, x1: 1114, top: 294, bot: 550, pw: 18, bx0: 552, bx1: 1048, bt: 326, bb: 526 };
  const LAYOUT = {
    goal: GOAL_ART,
    keeper: { x: 800, y: 549, s: 0.5 }, kicker: { x: 560, y: 892, s: 0.92 }, ks: 0.64, spot: { x: 800, y: 752 }, r: 30,
    punchY: 235, bannerY: 470,
  };

  // ---------------- the crowd ----------------
  // Fans sit on the seat grid of the background's stands (A.pen.stands: row tops, columns at 800 +- colX(k)), in two
  // rows for depth: a FRONT row (el-fan-sit-n) on seat row 3 and, two seat rows up, a smaller BACK row (el-fan-back-n)
  // on row 1. Behind the goal only the top seat row (row 0) shows above the crossbar, so that row is part of the back
  // row there. A fan's feet (the element's anchor) sit `sit` below the top of the seat back, at scale s[row]. Fans are
  // drawn over the art, so none may overlap the goal frame (a fan "behind" the goal would show in front of the net):
  // over the goal mouth the feet stay above the crossbar, beside it a fan stays clear of the posts.
  const STANDS = {
    sit: 36, s: { front: 0.33, back: 0.32 },
    rows: [['back', 0, 'goal'], ['back', 1, 'side'], ['front', 3, 'side']],
    // flags held up from behind the front row on a goal: pole feet [x, y] (left half, mirrored) and their scale
    flags: [[100, 334], [300, 338]], flagS: 0.26,
  };
  // How many seats are taken (a deterministic pick, so the crowd is the same every match).
  const OCCUPANCY = 0.8;
  // el-fan-back-n is el-fan-sit-n drawn smaller (174 vs 203 units): a back-row fan cheers with el-fan-cheer-n at this ratio.
  const BACK_K = 174 / 203;
  function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // The fans: { x, y (feet), row: 'front'|'back', n (look number) }, the back row first (the front row overlaps it).
  function seatsFor(W, goal) {
    const S = STANDS, art = window.DuelArt?.pen, rnd = seeded(7), out = [];
    if (!art) return out;
    const { rows, sections } = art.stands, cols = [];
    for (const [k0, k1] of sections) for (let k = k0; k <= k1; k++) cols.push(art.colX(k));
    for (const want of ['back', 'front']) {
      const fans = [];
      for (const [row, ri, where] of S.rows) {
        if (row !== want) continue;
        const half = 66 * S.s[row], looks = window.DuelArt?.fans?.looks || 10;
        for (const dx of cols) for (const x of [W / 2 - dx, W / 2 + dx]) {
          if (x - half < 0 || x + half > W) continue;
          const behind = x + half > goal.x0 && x - half < goal.x1;
          if ((where === 'goal') !== behind) continue;
          let y = rows[ri] + S.sit;
          if (behind && y > goal.top - 2) {
            if (y > goal.top + 6) continue;   // below the crossbar: it would cover the net
            y = goal.top - 2;
          }
          if (rnd() < OCCUPANCY) fans.push({ x, y, row, n: 1 + Math.floor(rnd() * looks) });
        }
      }
      out.push(...fans.sort((a, b) => a.y - b.y || a.x - b.x));
    }
    return out;
  }

  const CSS = `
.pen-zones .pen-zone { fill: ${C.you}; fill-opacity: 0; stroke: ${C.paper}; stroke-opacity: 0; stroke-width: 3; stroke-dasharray: 14 10; pointer-events: none; transition: fill-opacity .15s, stroke-opacity .15s; }
.pen-zones .pen-zone-ico { fill: none; stroke: ${C.paper}; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; opacity: 0; pointer-events: none; transition: opacity .15s; }
.pen-zones.on .pen-zone:not(.off) { pointer-events: all; cursor: pointer; stroke-opacity: .5; }
.pen-zones.on .pen-zone:not(.off) + .pen-zone-ico { opacity: .55; }
.pen-zones.on .pen-zone:not(.off):hover, .pen-zones.on .pen-zone.press:not(.off) { fill-opacity: .2; stroke: ${C.you}; stroke-opacity: 1; stroke-dasharray: none; }
.pen-zones.on .pen-zone:not(.off):hover + .pen-zone-ico, .pen-zones.on .pen-zone.press + .pen-zone-ico { opacity: 1; }
.pen-zones .pen-zone.picked { fill-opacity: .26; stroke: ${C.you}; stroke-opacity: 1; stroke-dasharray: none; }
.pen-zones .pen-zone.picked + .pen-zone-ico { opacity: 1; stroke: ${C.you}; }
.pen-zones.on .pen-zone.aim:not(.off) { fill-opacity: .14; stroke: ${C.you}; stroke-opacity: .9; stroke-dasharray: none; }
.pen-marks, .pen-aim, .pen-ring, .pen-ghost { pointer-events: none; }
.pen-ring-fill { fill: ${C.you}; fill-opacity: .26; stroke: ${C.you}; stroke-width: 4; stroke-opacity: .85; }
.pen-ring-glow { fill: ${C.you}; fill-opacity: .14; }
.pen-aim-path { fill: none; stroke: ${C.you}; stroke-width: 5; stroke-dasharray: 12 10; stroke-linecap: round; }
.pen-aim-path-under { fill: none; stroke: ${C.ink}; stroke-width: 9; stroke-opacity: .35; stroke-linecap: round; }
.pen-aim-ring { fill: ${C.you}; fill-opacity: .18; stroke: ${C.you}; stroke-width: 5; }
.pen-aim-tick { stroke: ${C.you}; stroke-width: 5; stroke-linecap: round; }
.pen-aim-under { fill: none; stroke: ${C.paper}; stroke-width: 9; stroke-opacity: .8; stroke-linecap: round; }
.pen-ghost { opacity: .5; }`;

  // ---------------- poses (data) ----------------
  // The keeper catches with both gloves overhead: the ball sits at BALL_AT (character units), BALL_R big. The dives
  // are this same overhead reach, rotated, so the gloves meet the ball at the corner (aim points come from the poses).
  const BALL_AT = [0, -384], BALL_R = 34;
  // Offset of a point in the prop frame of a hand (rig: translate(end) rotate(r) translate(along, across)).
  const propAt = (end, r, pt) => {
    const a = -r * D2R, dx = pt[0] - end[0], dy = pt[1] - end[1];
    return [Math.round((dx * Math.cos(a) - dy * Math.sin(a)) * 10) / 10, Math.round((dx * Math.sin(a) + dy * Math.cos(a)) * 10) / 10, 0];
  };
  const GLOVES = { h1: 'glove', h2: 'glove' };   // every keeper pose wears the gloves
  const OVER = { ...GLOVES, a1: [-66, -346, -1.1], a2: [66, -346, 1.1], r1: -84, r2: -96, exact1: 1, exact2: 1 };
  OVER.p1 = propAt(OVER.a1, OVER.r1, BALL_AT);
  OVER.p2 = propAt(OVER.a2, OVER.r2, BALL_AT);

  // Screen mirror of a pose (dive left -> dive right): arms/legs swap sides, angles flip.
  const wrap180 = (r) => (r == null ? r : ((((r + 180) % 360) + 360) % 360) - 180);
  function mirror(p) {
    const o = { ...p };
    for (const k of ['x', 'rot', 'bx', 'brot', 'hx', 'hrot', 'lx']) if (p[k] != null) o[k] = -p[k];
    const pair = (a, b, fn) => { const A = p[a], B = p[b]; if (B !== undefined) o[a] = fn(B); else delete o[a]; if (A !== undefined) o[b] = fn(A); else delete o[b]; };
    const limb = (v) => [-v[0], v[1], -v[2]];
    pair('a1', 'a2', limb); pair('l1', 'l2', limb);
    pair('h1', 'h2', (v) => v); pair('hs1', 'hs2', (v) => v);
    pair('r1', 'r2', (v) => (v == null ? v : wrap180(180 - v)));
    pair('p1', 'p2', (v) => [v[0], -v[1], -v[2]]);
    pair('f1', 'f2', (v) => -v);
    return o;
  }

  // Keeper: front view, gloves on; the gloves overhead and in the dives are drawn over the head, so they always show.
  const KP = {
    ready: { ...GLOVES, a1: [-112, -178, 0.4], a2: [112, -178, -0.4], r1: -112, r2: -68, l1: [-34, -10, 0], l2: [34, -10, 0] },
    set: { ...GLOVES, by: 12, bsy: 0.92, hy: 6, a1: [-92, -128, 0.3], a2: [92, -128, -0.3], r1: -100, r2: -80, l1: [-46, -8, 0.2], l2: [46, -8, -0.2] },
    diveL: { ...OVER, x: -40, y: -150, rot: -78, hrot: -4, l1: [-34, -4, 0.3], l2: [24, -34, -0.5], f2: -20, shadow: 0.9 },
    landL: { ...OVER, x: -40, y: -66, rot: -88, l1: [-30, -6, 0.3], l2: [26, -28, -0.4], f2: -20, shadow: 1.2 },
    lieL: { ...GLOVES, x: -40, y: -66, rot: -88, hrot: 12, ly: 0.6, a1: [-36, -345, -0.6], a2: [96, -300, 0.5], r1: -100, r2: -150, l1: [-30, -6, 0.3], l2: [30, -12, -0.2], shadow: 1.2 },
    jump: { ...OVER, y: -14, l1: [-24, -2, 0.4], l2: [24, -2, -0.4], shadow: 0.75 },
    hold: { ...OVER, l1: [-30, -10, 0], l2: [30, -10, 0] },
    hop: { ...OVER, y: -38, l1: [-24, -2, 0.3], l2: [24, -2, -0.3], shadow: 0.7 },
    holdSad: { ...OVER, by: 6, hy: 8, hrot: 10, ly: 0.5 },
    cheer: { ...GLOVES, a1: [-96, -300, -0.3], a2: [96, -300, 0.3], r1: -105, r2: -75, by: -6, hy: -4 },
    sad: { ...GLOVES, by: 8, hy: 10, hrot: 8, ly: 0.6, a1: [-74, -84, 0.2], a2: [74, -84, -0.2], r1: 105, r2: 75 },
    shrug: { ...GLOVES, a1: [-88, -150, -0.6], a2: [88, -150, 0.6], r1: -150, r2: -30, hy: 4, hrot: -6 },
    look: (dir) => ({ ...GLOVES, a1: [-104, -160, 0.4], a2: [104, -160, -0.4], r1: -112, r2: -68, hrot: dir * 8, lx: dir, ly: -0.6, hx: dir * 4 }),
  };
  KP.cheerHop = { ...KP.cheer, y: -38, shadow: 0.7 };
  KP.diveR = mirror(KP.diveL); KP.landR = mirror(KP.landL); KP.lieR = mirror(KP.lieL);
  const DIVE = { left: 'diveL', right: 'diveR', center: 'jump' };
  const LAND = { left: 'landL', right: 'landR' };
  const LIE = { left: 'lieL', right: 'lieR' };

  // Kicker: seen from behind (back: 1) at the spot, kicks with the screen-right leg (l2); faces the camera to cheer.
  // The hands stay clear of the body sides (stance / run-up at 64+); raised arms (the kick, the despair with the hands
  // on the head) are drawn over the head.
  const B = { back: 1 };
  const KK = {
    stance: { ...B, a1: [-64, -100, 0.3], a2: [64, -100, -0.3] },
    runA: { ...B, by: -8, brot: 4, l1: [-22, -40, 0.4], l2: [28, -6, 0], a1: [-80, -126, 0.5], a2: [66, -96, -0.2] },
    runB: { ...B, by: -8, brot: -4, l1: [-26, -6, 0], l2: [24, -40, -0.4], a1: [-66, -96, 0.2], a2: [80, -126, -0.5] },
    windup: { ...B, by: 4, brot: -6, l1: [-22, -10, 0], l2: [34, -62, 0.7], f2: 30, a1: [-124, -178, -0.3], a2: [96, -150, 0.3] },
    strike: { ...B, by: 2, bx: -6, brot: -12, hrot: -6, l1: [-22, -10, 0], l2: [58, -92, -0.2], f2: -15, a1: [-142, -206, -0.3], a2: [124, -170, 0.3] },
    follow: { ...B, by: -2, bx: -8, brot: -14, hrot: -8, l1: [-22, -10, 0], l2: [74, -150, -0.3], f2: -35, a1: [-136, -216, -0.3], a2: [120, -192, 0.3] },
    scuff: { ...B, brot: -4, l1: [-22, -10, 0], l2: [46, -50, 0], f2: -5, a1: [-92, -150, -0.2], a2: [80, -130, 0.2] },
    despair: { ...B, by: 6, hy: 6, a1: [-56, -292, -0.9], a2: [56, -292, 0.9], l1: [-24, -10, 0], l2: [26, -10, 0] },
    cheer: { a1: [-96, -300, -0.3], a2: [96, -300, 0.3], by: -6, hy: -4, h1: 'fist', h2: 'fist' },
    stand: {},
    sad: { by: 8, hy: 10, hrot: 8, a1: [-64, -80, 0.2], a2: [64, -80, -0.2], ly: 0.6 },
    shrug: { a1: [-86, -150, -0.6], a2: [86, -150, 0.6], h1: 'open', h2: 'open', hy: 4, hrot: -6 },
  };
  KK.hop = { ...KK.cheer, y: -42, shadow: 0.7 };

  // A pose's point in scene coordinates (the rig's world(), for a pose that is not applied yet).
  function worldOf(pose, at, pt) {
    const p = M().resolve(pose), a = p.rot * D2R;
    const wx = pt[0] * Math.cos(a) - pt[1] * Math.sin(a) + p.x, wy = pt[0] * Math.sin(a) + pt[1] * Math.cos(a) + p.y;
    return { x: at.x + wx * at.s, y: at.y + wy * at.s };
  }

  function create() {
    let b, ctx, P, gl, ball, zoneG, controls, unbindKeys, last = null, plant, life, crowd = null;
    let fxG = null, splashEl = null;
    // who-is-who this turn: the role banner, the YOU marker and the glow ring, the aim preview (+ its ghost keeper)
    let bannerEl = null, ringG = null, marksG = null, aimG = null, ghost = null, ghostWrap = null, previewV = null, lastPointer = 'mouse';
    const fxAnims = new Set();
    let interactive = false, active = false, myPick = null, gen = 0;
    const zones = {}, rigs = {}, wraps = {};
    let kickerSide = 'you', keeperSide = 'opp';

    const sfx = (name, o) => { if (!ctx.mini) ctx.sound?.play(name, o); };
    const allowed = (v) => ZONES.includes(v) && (ctx.allow ? ctx.allow(v) : true);
    const side = (idx) => (idx === ctx.you ? 'you' : 'opp');
    const kick = () => rigs[kickerSide], keep = () => rigs[keeperSide];
    // Rig step lists that stop when a new round resets the scene.
    async function seq(r, steps) { const my = gen; for (const [p, ms, e] of steps) { if (my !== gen) return; await r.to(p, ms, e); } }

    // ---------------- drawing ----------------
    // The goal frame and net are in the art. This is a hit area for the coach mark plus a net overlay (the same
    // back plane as the art's net) that only shows when the ball hits it (the bulge on a goal).
    function drawGoal() {
      const { x0, x1, top, bot, bx0, bx1, bt: by0, bb: by1 } = P.goal;
      const m = [`M${bx0} ${by0}H${bx1}V${by1}H${bx0}Z`];
      for (let i = 1; i < 14; i++) m.push(`M${bx0 + ((bx1 - bx0) * i) / 14} ${by0}V${by1}`);
      for (let j = 1; j < 8; j++) m.push(`M${bx0} ${by0 + ((by1 - by0) * j) / 8}H${bx1}`);
      for (let j = 0; j < 5; j++) { const t = j / 5; m.push(`M${x0} ${top + (bot - top) * t}L${bx0} ${by0 + (by1 - by0) * t}M${x1} ${top + (bot - top) * t}L${bx1} ${by0 + (by1 - by0) * t}`); }
      for (let i = 1; i < 7; i++) m.push(`M${x0 + ((x1 - x0) * i) / 7} ${top}L${bx0 + ((bx1 - bx0) * i) / 7} ${by0}`);
      const net = g({ class: 'pen-net', opacity: 0 }, el('path', { d: m.join(''), fill: 'none', stroke: C.paper, 'stroke-opacity': 0.5, 'stroke-width': 2 }));
      const goal = g({ class: 'pen-goal' }, el('path', { d: `M${x0} ${top}H${x1}V${bot}H${x0}Z`, fill: C.ink, opacity: 0 }), net);
      b.layers.back.append(goal);
      return { goal, net };
    }

    function makeZones() {
      const { x0, x1, top, bot } = P.goal, w = (x1 - x0 - 24) / 3;
      const grp = g({ class: 'pen-zones' });
      ZONES.forEach((v, i) => {
        const x = x0 + 12 + i * w, cx = x + w / 2, cy = bot - 50;
        const r = el('rect', { x: x + 4, y: top + 14, width: w - 8, height: bot - top - 18, rx: 18, class: 'pen-zone', 'data-zone': v });
        const d = v === 'left' ? `M${cx + 10} ${cy - 20}L${cx - 10} ${cy}L${cx + 10} ${cy + 20}`
          : v === 'right' ? `M${cx - 10} ${cy - 20}L${cx + 10} ${cy}L${cx - 10} ${cy + 20}` : `M${cx - 20} ${cy - 10}L${cx} ${cy + 10}L${cx + 20} ${cy - 10}`;
        r.addEventListener('pointerdown', () => r.classList.add('press'));
        for (const e of ['pointerup', 'pointerleave', 'pointercancel']) r.addEventListener(e, () => r.classList.remove('press'));
        r.addEventListener('pointerenter', () => { if (active && allowed(v)) ctx.sound?.play('ui-hover', { volume: 0.4 }); });
        previewOn(r, v);
        r.addEventListener('click', (e) => { if (firstTap(v, e)) { preview(v); return; } pick(v, false); });
        grp.append(r, el('path', { d, class: 'pen-zone-ico' }));
        zones[v] = r;
      });
      b.layers.front.append(grp);
      return grp;
    }

    // The match ball (DuelProps.football, radius 20, scaled to the spot) + a ground shadow.
    function makeBall(p) {
      const fb = window.DuelProps.football();
      const fly = g({}, g({ transform: `scale(${p.r / fb.r})` }, fb.root));
      const shadow = g({}, el('ellipse', { cx: 0, cy: 0, rx: p.r * 0.95, ry: p.r * 0.28, fill: C.shadow, opacity: 0.35 }));
      return {
        root: g({ class: 'pen-ball', transform: `translate(${p.x} ${p.y})` }, fly),
        sRoot: g({ transform: `translate(${p.x} ${p.y + p.r * 0.85})` }, shadow), fly, spin: fb.spin, shadow,
      };
    }

    // ---------------- the crowd (layers.amb: glued to the art) ----------------
    // Ambient loops only through life / K.loop (none under reduced motion or in minis). Reactions: a cheer (the fans
    // stand up with el-fan-cheer-n, a scarf or fists overhead, and jump; flags pop up between them) and a groan (sink +
    // squash). Every fan: a seat node (translate to the feet) > bob (idle loop + reactions; its origin is the feet) >
    // the drawn fan (K.sprite).
    const amb = (node, frames, opts) => (ctx.mini ? null : life.add(K.loop(node, frames, opts)));
    function makeCrowd() {
      const S = STANDS, host = g({ class: 'pen-crowd' });
      const backG = g({}), flagG = g({ class: 'pen-flags' }), frontG = g({});
      host.append(backG, flagG, frontG);
      const fans = seatsFor(b.W, P.goal).map(({ x, y, row, n }) => {
        const bob = g({}), s = S.s[row], sit = row === 'back' ? `el-fan-back-${n}` : `el-fan-sit-${n}`;
        const spr = K.sprite(bob, sit, { scale: s });
        (row === 'back' ? backG : frontG).append(g({ transform: `translate(${x} ${y})` }, bob));
        // a small idle bob, each fan on its own beat
        amb(bob, [{ transform: 'translate(0px,0px)' }, { transform: `translate(0px,${-(1.2 + Math.random() * 1.6).toFixed(1)}px)` }, { transform: 'translate(0px,0px)' }],
          { duration: 900 + Math.random() * 900, iterationStart: Math.random() });
        // the same fan cheering (a back-row fan at the back row's smaller size)
        return { bob, spr, sit, s, cheer: `el-fan-cheer-${n}`, sad: `el-fan-sad-${n}`, cs: row === 'back' ? s * BACK_K : s, up: false };
      });
      // Flags (el-goal-flag), hidden until a goal: the flag's pole foot is (-144, +148) units from its center anchor, so
      // each flag's node origin is the pole foot (it pops up and waves around it).
      const flags = [];
      for (const [fx0, fy] of S.flags) for (const [x, k] of [[fx0, 1], [b.W - fx0, -1]]) {
        const wave = g({ opacity: 0 });
        K.sprite(wave, 'el-goal-flag', { x: 144 * S.flagS * k, y: -148 * S.flagS, scale: S.flagS, flip: k < 0 });
        flagG.append(g({ transform: `translate(${x} ${fy})` }, wave));
        flags.push({ wave, k });
      }
      b.layers.amb.append(host);
      return { host, fans, flags, react: new Set(), timers: new Set() };
    }
    function crowdSit() {
      if (!crowd) return;
      crowd.timers.forEach(clearTimeout); crowd.timers.clear();
      crowd.react.forEach((a) => a.cancel()); crowd.react.clear();
      for (const f of crowd.fans) if (f.up || f.down) { f.up = false; f.down = false; f.spr.setSprite(f.sit); f.spr.inner.setAttribute('transform', `scale(${f.s})`); }
    }
    const crowdLater = (fn, ms) => { const t = life.timeout(() => { crowd.timers.delete(t); fn(); }, ms); if (t) crowd.timers.add(t); };
    // GOAL: everyone jumps up cheering (staggered) and keeps jumping, the flags pop up and wave; all sit down after `ms`.
    function crowdCheer(ms = 1500) {
      if (!crowd) return;
      crowdSit();
      const still = K.reduced() || ctx.mini;
      for (const f of crowd.fans) {
        const d = still ? 0 : Math.random() * 160;
        const up = () => { f.up = true; f.spr.setSprite(f.cheer); f.spr.inner.setAttribute('transform', `scale(${f.cs})`); };
        if (d) crowdLater(up, d); else up();
        if (still) continue;
        // jumps: a squat, a leap with a stretch, a squashed landing; then a smaller second one and a third
        const h = 12 + Math.random() * 7, hop = 330 + Math.random() * 70;
        const n = Math.max(2, Math.floor((ms - d - 300) / hop));
        const jump = (k) => [{ transform: 'translate(0px,0px) scale(1,1)', easing: 'ease-out' }, { transform: 'translate(0px,1px) scale(1.06,.92)', offset: 0.14, easing: 'ease-out' },
          { transform: `translate(0px,${(-h * k).toFixed(1)}px) scale(.95,1.07)`, offset: 0.5, easing: 'ease-in' }, { transform: 'translate(0px,0px) scale(1.06,.93)', offset: 0.86, easing: 'ease-out' },
          { transform: 'translate(0px,0px) scale(1,1)' }];
        crowd.react.add(f.bob.animate(jump(1), { duration: hop, delay: d }));
        crowd.react.add(f.bob.animate(jump(0.7), { duration: hop, delay: d + hop, iterations: n - 1 }));
      }
      if (!still) {
        // the flags pop up from behind the front row, wave around the pole foot and drop back before the fans sit
        for (const [i, { wave, k }] of crowd.flags.entries()) {
          const d = 60 + i * 60, at = (y, sc, a, o, offset) => ({ transform: `translate(0px,${y}px) scale(${sc}) rotate(${(a * k).toFixed(1)}deg)`, opacity: o, offset, easing: 'ease-in-out' });
          crowd.react.add(wave.animate([
            at(30, 0.3, -30, 0, 0), at(-6, 1.1, 10, 1, 0.1), at(0, 1, -14, 1, 0.24), at(0, 1, 12, 1, 0.4), at(0, 1, -12, 1, 0.56),
            at(0, 1, 10, 1, 0.72), at(0, 1, -6, 1, 0.86), at(30, 0.4, -10, 0, 1),
          ], { duration: ms - 150 - d, delay: d }));
        }
      }
      crowdLater(crowdSit, ms);
    }
    // SAVE / miss: a groan, the fans put their hands on their heads (el-fan-sad-n) and sink into their seats (squashed),
    // then sit up again.
    function crowdGroan(ms = 1300) {
      if (!crowd || ctx.mini) return;
      crowdSit();
      for (const f of crowd.fans) { f.down = true; f.spr.setSprite(f.sad); f.spr.inner.setAttribute('transform', `scale(${f.cs})`); }
      crowdLater(crowdSit, ms);
      if (K.reduced()) return;
      const dip = 7;
      for (const f of crowd.fans) {
        crowd.react.add(f.bob.animate([
          { transform: 'translate(0px,0px) scale(1,1)' }, { transform: `translate(0px,${dip}px) scale(1.08,.84)`, offset: 0.25 },
          { transform: `translate(0px,${dip * 0.8}px) scale(1.06,.87)`, offset: 0.65 }, { transform: 'translate(0px,0px) scale(1,1)' },
        ].map((f) => ({ ...f, easing: 'ease-in-out' })), { duration: 900, delay: Math.random() * 160 }));
      }
    }

    // ---------------- the goal celebration: confetti and the GOAL! splash ----------------
    // Confetti (el-confetti-v4-1..20, center anchor) shot up from three cannons (the two side stands and behind the goal):
    // every piece flies a ballistic arc (launch velocity + gravity, sampled into keyframes) with a flutter, spins and
    // fades out within `ms`. None under reduced motion or in minis.
    function confetti(ms) {
      if (ctx.mini || K.reduced()) return;
      const n = 40, sc = 0.28, grav = 1500;
      const guns = [[140, 420, 1], [1460, 420, -1], [800, 290, 0]];
      for (let i = 0; i < n; i++) {
        const [x0, y0, dir] = guns[i % 3];
        const spr = K.sprite(fxG, `el-confetti-v4-${1 + Math.floor(Math.random() * 20)}`, { scale: sc * (0.75 + Math.random() * 0.5) });
        const vx = dir ? dir * (180 + Math.random() * 520) : (Math.random() - 0.5) * 1100;
        const vy = -(760 + Math.random() * 340) * (dir ? 1 : 0.85);
        const T = (ms * (0.78 + Math.random() * 0.22)) / 1000, r0 = Math.random() * 360, spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540);
        const sway = 8 + Math.random() * 14, fl = 5 + Math.random() * 5, frames = [];
        for (let j = 0; j <= 10; j++) {
          const u = j / 10, t = u * T;
          const x = x0 + vx * t * (1 - 0.35 * u) + Math.sin(t * fl) * sway * u, y = y0 + vy * t + 0.5 * grav * t * t;
          frames.push({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(r0 + spin * t).toFixed(0)}deg) scale(${(0.6 + 0.4 * Math.abs(Math.cos(t * fl * 0.7))).toFixed(2)},1)`, opacity: u < 0.7 ? 1 : (1 - u) / 0.3 });
        }
        const a = spr.animate(frames, { duration: T * 1000, delay: Math.random() * 90, easing: 'linear', fill: 'backwards' });
        a.onfinish = () => spr.remove();
        fxAnims.add(a);
      }
    }
    // The outcome splash (GOAL! / SAVED! / MISSED!): big display type, cream with an ink outline and a ledge (like the
    // UI), glowing in the winning side's color (scenes.css .pen-splash); pops in, holds, pops out within `ms`.
    function splash(text, who, ms) {
      const d = document.createElement('div');
      d.className = `pen-splash ${who}`;
      d.textContent = text;
      b.overlay.append(K.place(d, b, b.W / 2, P.punchY));
      splashEl?.remove(); splashEl = d;
      return K.anim(d, [
        { transform: 'translate(-50%,-50%) scale(.2) rotate(-10deg)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.18) rotate(3deg)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%,-50%) scale(.95) rotate(-2deg)', opacity: 1, offset: 0.27 },
        { transform: 'translate(-50%,-50%) scale(1.03) rotate(0deg)', opacity: 1, offset: 0.38 },
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%,-50%) scale(1.25) rotate(0deg)', opacity: 0 },
      ], { duration: ms, easing: 'ease-out' }).then(() => { d.remove(); if (splashEl === d) splashEl = null; });
    }
    // Ends the celebration pieces (a new round or a new reveal): the confetti and the splash.
    function clearFx() {
      fxAnims.forEach((a) => a.cancel()); fxAnims.clear();
      fxG?.replaceChildren();
      splashEl?.remove(); splashEl = null;
    }

    // ---------------- who is who this turn: the banner, the markers, the aim preview ----------------
    const myRole = () => (kickerSide === 'you' ? 'kick' : 'keep');
    // ROLE BANNER: "YOU KICK" / "YOU SAVE" slides over the scene (~1.1 s, pointer-transparent); a fade only under
    // reduced motion. Animated with element.animate directly, so reduced motion doesn't shorten it to a flash.
    function roleBanner(role = myRole()) {
      if (ctx.mini) return;
      bannerEl?.remove();
      const d = document.createElement('div');
      d.className = `pen-role-banner role-${role}`;
      d.setAttribute('role', 'status');
      d.innerHTML = `<span class="prb-chip">${ROLE_ICON[role]()}</span><span class="prb-you">YOU</span><span class="prb-word">${ROLE_UI[role].word}</span>`;
      b.overlay.append(K.place(d, b, b.W / 2, P.bannerY));
      bannerEl = d;
      sfx('penalty-role-whoosh', { volume: 0.8 });
      const frames = K.reduced()
        ? [{ transform: 'translate(-50%,-50%)', opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%)', opacity: 0 }]
        : [
          { transform: 'translate(-180%,-50%) skewX(-14deg)', opacity: 0 },
          { transform: 'translate(-44%,-50%) skewX(-5deg)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%,-50%) skewX(0deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-53%,-50%) skewX(0deg)', opacity: 1, offset: 0.8 },
          { transform: 'translate(90%,-50%) skewX(14deg)', opacity: 0 },
        ];
      d.animate(frames, { duration: 1100, easing: 'ease-out', fill: 'forwards' }).finished
        .then(() => { d.remove(); if (bannerEl === d) bannerEl = null; }, () => {});
    }
    // Where the YOU marker goes: the arrow's tip just above the top of the character you control this turn (its
    // head and hair), centered over its head. Measured on the rendered rig, so every look fits; a fixed estimate when
    // the scene is not laid out yet. Returns [x, y] of the arrow's tip.
    function markAt(sd) {
      const r = rigs[sd], [hx, hy] = r.headPoint(), s = r.placeAt[2];
      let top = hy - 150 * s;
      try {
        const box = wraps[sd].getBoundingClientRect(), m = marksG.getScreenCTM()?.inverse();
        if (m && box.height > 0) top = new DOMPoint(box.left, box.top).matrixTransform(m).y;
      } catch { /* not laid out: keep the estimate */ }
      return [hx, top - 6];
    }
    // The YOU marker (the shared YOU arrow, public/js/scenes/kit.js youArrow) close above the character you control this
    // turn, shown at the start of every turn and gone after 3 s: it drops in and bobs a few times (reduced motion: it
    // only fades in and out, no movement). Pointer-transparent, never part of the reveal. The glow ring under your feet stays all turn.
    // There is no marker on the opponent.
    const MARK_MS = 3000;
    function markers(on = true) {
      ringG?.replaceChildren(); marksG?.replaceChildren();
      if (!on || ctx.mini || !ringG) return;
      // the ring under your feet (behind your character)
      const [fx, fy, fs] = rigs.you.placeAt, rx = (rigs.you === keep() ? 92 : 104) * fs, ry = rx * 0.24;
      ringG.append(g({ transform: `translate(${fx} ${fy})` },
        el('ellipse', { rx: (rx * 1.45).toFixed(1), ry: (ry * 1.6).toFixed(1), class: 'pen-ring-glow' }),
        el('ellipse', { rx: rx.toFixed(1), ry: ry.toFixed(1), class: 'pen-ring-fill' })));
      // YOU: the shared YOU arrow (K.youArrow, the same look as at the start of every minigame), its tip just above
      // your head; it stays in place faded out (keep), so a coach mark can still point at it
      const you = K.youArrow(marksG, markAt('you'), { ms: MARK_MS, keep: true });
      you?.classList.add('pen-you');
    }
    // AIM PREVIEW (local only): kicking = a crosshair on the zone + the dashed ball path; keeping = the ghost keeper.
    function preview(v) {
      if (!active || !interactive || !allowed(v)) { clearPreview(); return; }
      if (previewV === v) return;
      clearPreview();
      previewV = v;
      zones[v]?.classList.add('aim');
      if (myRole() === 'kick') {
        const t = aimFor(v, v), { x, y } = P.ball, dx = t.x - x, dy = t.y - y;
        const bend = t.x < x - 1 ? 80 : t.x > x + 1 ? -80 : 0, cx = dx * 0.5 + bend, cy = dy * 0.5 - 140;
        const d = `M${x} ${y}Q${(x + cx).toFixed(1)} ${(y + cy).toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}`;
        const path = el('path', { d, class: 'pen-aim-path' });
        const R = 26, ticks = `M${-R - 12} 0H${-R + 8}M${R - 8} 0H${R + 12}M0 ${-R - 12}V${-R + 8}M0 ${R - 8}V${R + 12}`;
        aimG.append(el('path', { d, class: 'pen-aim-path-under' }), path,
          g({ transform: `translate(${t.x.toFixed(1)} ${t.y.toFixed(1)})` },
            el('circle', { r: R, class: 'pen-aim-under' }), el('path', { d: ticks, class: 'pen-aim-under' }),
            el('circle', { r: R, class: 'pen-aim-ring' }), el('path', { d: ticks, class: 'pen-aim-tick' })));
        life?.add(K.loop(path, [{ strokeDashoffset: 0 }, { strokeDashoffset: -44 }], { duration: 700, easing: 'linear' }));
      } else {
        if (!ghost) {
          ghost = M().create({ side: 'you', x: 0, y: 0, scale: 1, pose: KP.ready, idle: false });
          ghostWrap = g({ class: 'pen-ghost' }, ghost.root);
        }
        ghost.place(P.keeper.x, P.keeper.y, P.keeper.s).set(KP.ready);
        wraps[keeperSide].after(ghostWrap);
        ghostWrap.style.display = '';
        ghost.to(KP[DIVE[v]], 260, 'out');
      }
    }
    function clearPreview() {
      previewV = null;
      for (const z of ZONES) zones[z]?.classList.remove('aim');
      aimG?.replaceChildren();
      if (ghostWrap) ghostWrap.style.display = 'none';
    }
    // Hover / first tap wiring for a control (a goal zone or a panel button): mouse hover previews; on touch the first
    // tap previews and the second tap on the same one confirms (handled in pick's callers).
    const firstTap = (v, e) => lastPointer === 'touch' && e.detail !== 0 && previewV !== v;
    function previewOn(node, v) {
      node.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; });
      node.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && active) preview(v); });
      node.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && previewV === v) clearPreview(); });
    }

    // ---------------- state ----------------
    function setZones(on) {
      active = !!on && interactive;
      zoneG?.classList.toggle('on', active);
      for (const v of ZONES) zones[v]?.classList.toggle('off', !allowed(v));
    }

    function pick(v, fromButton) {
      if (!active || !allowed(v)) return;
      clearPreview();
      active = false; myPick = v;
      if (!fromButton) { ctx.sound?.play('ui-click'); controls?.mark(v); }
      controls?.disable(); setZones(false);
      zones[v]?.classList.add('picked');
      ctx.send(v);
    }

    // The panel's look for your role: header, accent (data-role), icons and button names.
    function roleLook(role) {
      if (!controls || controls.root.dataset.role === role) return;
      const ui = ROLE_UI[role];
      controls.root.dataset.role = role;
      const chipIco = controls.root.querySelector('.ctl-role');
      if (chipIco) chipIco.innerHTML = ROLE_ICON[role]();
      controls.setPrompt(ui.prompt);
      for (const bt of controls.buttons) {
        bt.querySelector('.ctl-icon').innerHTML = ICON(role, bt.dataset.v);
        bt.setAttribute('aria-label', `${ui.verb} ${bt.dataset.v}`);
      }
    }

    // Who stands where: the kicker index takes the spot, the other side the goal. Each rig keeps its own look; the
    // colored lights and the panel's look follow the roles.
    function roles(state) {
      const k = state?.kicker ?? 0;
      kickerSide = side(k); keeperSide = side(1 - k);
      kick().place(P.kicker.x, P.kicker.y, P.kicker.s);
      keep().place(P.keeper.x, P.keeper.y, P.keeper.s);
      // depth order: your glow ring, keeper, ball, kicker
      b.layers.mid.append(ringG, wraps[keeperSide], ball.sRoot, ball.root, wraps[kickerSide]);
      const atKicker = [P.kicker.x + 40, P.kicker.y - 120], atKeeper = [P.keeper.x, P.keeper.y - 60];
      K.glow(b, k === ctx.you ? { you: atKicker, opp: atKeeper } : { you: atKeeper, opp: atKicker });
      roleLook(k === ctx.you ? 'kick' : 'keep');
      return k;
    }

    function resetPoses() {
      gen++;
      [wraps.you, wraps.opp, ball.root, ball.sRoot, gl.net].forEach(K.clear);
      ball.root.style.display = ''; ball.sRoot.style.display = '';
      for (const s of ['you', 'opp']) { rigs[s].hold(1, null); rigs[s].idle(true); }
      kick().place(P.kicker.x, P.kicker.y, P.kicker.s).set(KK.stance);
      keep().set(KP.ready);
      crowdSit(); clearFx();
    }
    // Waiting faces: PEN-1 before the first kick, then PEN-2 (kicker) / PEN-3 (keeper).
    function waitFaces(state) {
      const first = !(state?.kicks?.length);
      kick().mood(first ? 'PEN-1' : 'PEN-2'); keep().mood(first ? 'PEN-1' : 'PEN-3');
    }

    // ---------------- reveal pieces ----------------
    // Slides a rig's wrapper from its placed spot to another (x, y, scale), then commits it with place().
    function glide(sd, to, ms, easing) {
      const r = rigs[sd], w = wraps[sd], [x0, y0, s0] = r.placeAt, k = to.s / s0, my = gen;
      const fr = (u) => {
        const kk = 1 + (k - 1) * u, x = x0 + (to.x - x0) * u, y = y0 + (to.y - y0) * u;
        return { transform: `translate(${(x - kk * x0).toFixed(1)}px,${(y - kk * y0).toFixed(1)}px) scale(${kk.toFixed(4)})` };
      };
      return K.anim(w, [fr(0), fr(1)], { duration: ms, easing }).then(() => { if (my === gen) { r.place(to.x, to.y, to.s); K.clear(w); } });
    }

    // Ball flight along a curling arc, shrinking with distance; the shadow slides to the goal line.
    function fly(t, ms) {
      const { x, y, r } = P.ball, dx = t.x - x, dy = t.y - y;
      const bend = t.x < x - 1 ? 80 : t.x > x + 1 ? -80 : 0, cx = dx * 0.5 + bend, cy = dy * 0.5 - 140;
      const frames = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, a = 2 * (1 - u) * u, c = u * u;
        frames.push({ transform: `translate(${(a * cx + c * dx).toFixed(1)}px,${(a * cy + c * dy).toFixed(1)}px) scale(${(1 - (1 - P.endS) * u).toFixed(3)})` });
      }
      return Promise.all([
        K.anim(ball.fly, frames, { duration: ms, easing: 'cubic-bezier(.3,.55,.55,1)' }),
        K.anim(ball.spin, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${bend > 0 ? -620 : 620}deg)` }], { duration: ms, easing: 'linear' }),
        K.anim(ball.shadow, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${P.goal.bot - y - r * 0.85}px) scale(.45)`, opacity: 0.4 }], { duration: ms }),
      ]);
    }

    // Where the ball goes: the keeper's catch point of that dive (so a save lands in the gloves). A keeper who missed
    // the timer stands in the middle, so a center shot goes high over his shoulder instead.
    function aimFor(shot, dive) {
      if (shot === 'center' && dive == null) {
        const { x0, x1, top, bot } = P.goal;
        return { x: (x0 + x1) / 2 + (x1 - x0) * 0.14, y: top + (bot - top) * 0.24 };
      }
      return worldOf(KP[DIVE[shot]], P.keeper, BALL_AT);
    }

    const api = {
      mount(container, c) {
        ctx = c;
        b = K.base(container, ctx, { bg: 'penalty' });
        b.frame.classList.add('pen-frame');
        P = { ...LAYOUT };
        // the ball rests on the penalty spot (its shadow on the spot's center)
        P.ball = { x: P.spot.x, y: P.spot.y - P.r * 0.8, r: P.r };
        // the ball at the goal is BALL_R big in the keeper's units; the kicker plants behind and left of the ball
        // (nearer the camera, so his head stays under the goal), the kicking foot (l2 at strike) meets its lower left
        P.endS = (BALL_R * P.keeper.s) / P.ball.r;
        plant = { x: P.ball.x - 104 * P.ks, y: P.ball.y + 120 * P.ks, s: P.ks };
        interactive = !!ctx.controlsEl && !ctx.mini;
        life = K.life({ mini: ctx.mini });
        b.svg.append(el('style', {}, CSS));
        crowd = makeCrowd();
        // now and then a bird crosses high over the stadium lights (not under reduced motion, not in minis)
        if (!ctx.mini) K.farBirds(b, life, b.layers.amb, { band: [30, 120], size: 1.2, every: 24000, jitter: 16000, max: 2 });
        gl = drawGoal();
        ball = makeBall(P.ball);
        for (const s of ['you', 'opp']) {
          rigs[s] = M().create({ side: s, x: 0, y: 0, scale: 1, pose: KP.ready });
          wraps[s] = g({ class: `pen-rig pen-rig--${s}` }, rigs[s].root);
        }
        ringG = g({ class: 'pen-ring' });
        aimG = g({ class: 'pen-aim' });
        marksG = g({ class: 'pen-marks' });
        if (interactive) zoneG = makeZones();
        fxG = g({ class: 'pen-fx', style: 'pointer-events:none' });
        b.layers.front.append(aimG, fxG, marksG);
        controls = interactive ? K.buttons(ctx, ZONES.map((v) => ({ v, label: LABEL[v], icon: ICON('kick', v), key: Object.keys(KEYS).find((k) => KEYS[k] === v) })),
          { cls: 'penalty', prompt: ROLE_UI.kick.prompt, hint: window.matchMedia?.('(pointer: coarse)').matches ? 'Tap once to aim, again to lock in.' : 'Hover to aim, click to lock in.' }) : null;
        controls?.root.querySelector('.ctl-chip').insertAdjacentHTML('afterbegin', '<span class="ctl-role" aria-hidden="true"></span>');
        roles({ kicker: 0 });
        resetPoses();
        waitFaces(null);
        markers(interactive);
        if (controls) {
          // the panel previews too: hover (mouse) or the first tap (touch; the second tap on the same button locks)
          for (const bt of controls.buttons) previewOn(bt, bt.dataset.v);
          controls.root.addEventListener('click', (e) => {
            const bt = e.target.closest('.ctl');
            if (bt && !bt.disabled && firstTap(bt.dataset.v, e)) { e.stopPropagation(); preview(bt.dataset.v); }
          }, true);
          controls.onPick = (v) => pick(v, true);
          controls.disable();
          unbindKeys = K.keys(KEYS, (v) => { if (active) controls.press(v); });
        }
      },

      setRound(state) {
        last = state;
        roles(state);
        resetPoses();
        waitFaces(state);
        ctx.hud?.set(state);
        myPick = null;
        for (const v of ZONES) zones[v]?.classList.remove('picked');
        sfx('penalty-whistle', { volume: 0.75 });
        controls?.enable(() => true);
        setZones(true);
        // who you are this turn: the markers and the banner (the choosing phase, never the reveal's budget)
        clearPreview();
        markers(interactive);
        if (interactive) roleBanner();
      },

      setLocked(who) {
        const r = rigs[who];
        if (!r) return;
        if (who === 'opp') { /* silent: the scoreboard check mark shows it */ }
        else { controls?.disable(); setZones(false); clearPreview(); sfx('ui-lock'); }
        // No pose change on a lock (the same in every game): the character stays as it is; the scoreboard check mark
        // (hud.js) and, for your own lock, ui-lock are the only signs. The face stays the round's normal mood.
        r.mood('PEN-4');
      },

      async reveal(r) {
        const prev = r.prev || last || { kicker: 0 };
        const kIdx = roles(prev), shot = r.moves[kIdx], dive = r.moves[1 - kIdx];
        const goal = shot != null && shot !== dive;
        resetPoses(); controls?.disable(); setZones(false);
        clearPreview(); markers(false); bannerEl?.remove(); bannerEl = null;
        const my = gen, live = () => my === gen;
        for (const v of ZONES) zones[v]?.classList.remove('picked');
        // Run-up, flight, outcome + punch text: the whole timeline fits the server's animation budget.
        const [runMs, flyMs, endMs] = K.fit([620, 480, 1100], (ctx.timing?.reveal || 2300) - 220);
        const kk = kick(), kp = keep();
        kk.mood('PEN-5'); kp.mood('PEN-3');

        // Run-up: two strides while sliding to the ball, wind-up, strike (contact at the end of runMs).
        glide(kickerSide, plant, runMs * 0.66, 'ease-out');
        const run = seq(kk, [[KK.runA, runMs * 0.2, 'inOut'], [KK.runB, runMs * 0.2, 'inOut'], [KK.windup, runMs * 0.32, 'out'], [shot ? KK.strike : KK.scuff, runMs * 0.28, 'in']]);
        // The keeper sinks into the set position just before the contact.
        (async () => { await K.sleep(runMs * 0.55); if (live()) kp.to(KP.set, runMs * 0.4, 'out'); })();
        await run;
        if (!live()) return;
        sfx('penalty-kick', { volume: shot ? 1 : 0.5 });
        if (shot) kk.to(KK.follow, flyMs * 0.9, 'out');
        if (dive) { kp.mood('PEN-6'); kp.to(KP[DIVE[dive]], flyMs, 'out'); }
        const aim = shot ? aimFor(shot, dive) : null;
        if (aim) await fly(aim, flyMs);
        else {
          // Missed the timer: a scuffed kick, the ball dribbles a little way and stops.
          const roll = { transform: 'translate(80px,-46px) scale(.9)' };
          await Promise.all([K.anim(ball.fly, [{ transform: 'translate(0,0) scale(1)' }, roll], { duration: flyMs, easing: 'cubic-bezier(.2,.7,.3,1)' }),
            K.anim(ball.spin, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-200deg)' }], { duration: flyMs }),
            K.anim(ball.shadow, [{ transform: 'translate(0,0) scale(1)' }, roll], { duration: flyMs })]);
        }
        if (!live()) return;

        const who = goal ? kickerSide : keeperSide;
        const text = goal ? 'GOAL!' : shot ? 'SAVED!' : 'MISSED!';
        const E = endMs;
        const fx = [splash(text, who, E)];
        if (goal) { ctx.hud?.set(r.state, { scoreOnly: true }); ctx.hud?.pulse(kickerSide); }
        if (goal) {
          // GOAL: the net bulges, the kicker turns round and cheers, the keeper ends up on the grass.
          const dx = aim.x - P.ball.x, dy = aim.y - P.ball.y, push = dx < -1 ? -16 : dx > 1 ? 16 : 0, s = P.endS;
          sfx('penalty-goal-net'); sfx('penalty-crowd-cheer');
          if (!ctx.mini) ctx.sound?.haptic?.(60);
          K.shake(b.camera, 10);
          K.pivot(gl.net, aim.x, aim.y);
          kk.mood('PEN-7'); kp.mood(dive ? 'PEN-8' : 'PEN-11');
          crowdCheer(); confetti(E + 150);
          fx.push(
            K.anim(ball.fly, [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: `translate(${dx + push}px,${dy - 4}px) scale(${s * 0.85})`, offset: 0.3 }, { transform: `translate(${dx + push}px,${dy + 26}px) scale(${s * 0.85})` }], { duration: E * 0.6 }),
            K.anim(gl.net, [1, 1.06, 0.97, 1.02, 1].map((sc, i) => ({ transform: `scale(${sc})`, opacity: [0, 1, 0.8, 0.4, 0][i] })), { duration: E * 0.55 }),
            seq(kk, [[KK.cheer, E * 0.26, 'back'], [KK.hop, E * 0.16, 'out'], [KK.cheer, E * 0.16, 'in'], [KK.hop, E * 0.16, 'out'], [KK.cheer, E * 0.16, 'in']]),
            dive === 'left' || dive === 'right' ? seq(kp, [[KP[LAND[dive]], E * 0.24, 'in'], [KP[LIE[dive]], E * 0.4, 'inOut']])
              : dive === 'center' ? seq(kp, [[KP.ready, E * 0.22, 'in'], [KP.sad, E * 0.4, 'inOut']])
                : seq(kp, [[KP.look(aim.x < P.keeper.x ? -1 : 1), E * 0.22, 'out'], [KP.sad, E * 0.45, 'inOut']]));
        } else if (shot) {
          // SAVE: the ball stays in the gloves (the held prop takes over from the flying ball), the keeper lands
          // holding it and shows it off; the kicker holds his head.
          ball.root.style.display = 'none'; ball.sRoot.style.display = 'none';
          kp.hold(1, 'football');
          kp.prop(1)?.root.setAttribute('transform', `scale(${BALL_R / 20})`);
          sfx('penalty-save'); sfx('penalty-crowd-groan', { volume: 0.6 });
          if (!ctx.mini) ctx.sound?.haptic?.(40);
          kp.mood('PEN-9'); kk.mood('PEN-10');
          crowdGroan();
          const show = [[KP.hop, E * 0.15, 'out'], [KP.hold, E * 0.15, 'in']];
          fx.push(
            dive === 'center' ? seq(kp, [[KP.hold, E * 0.22, 'in'], ...show, ...show])
              : (async () => { await seq(kp, [[KP[LAND[dive]], E * 0.24, 'in']]); if (live()) kp.mood('PEN-9'); await seq(kp, [[KP.hold, E * 0.3, 'inOut'], ...show]); })(),
            seq(kk, [[KK.despair, E * 0.4, 'inOut']]));
        } else {
          // MISSED (the kicker missed the timer): the ball dribbles off, the keeper is happy anyway.
          sfx('penalty-crowd-groan');
          kp.mood('PEN-9'); kk.mood('PEN-11');
          crowdGroan();
          const cheer = [[KP.cheer, E * 0.24, 'back'], [KP.cheerHop, E * 0.14, 'out'], [KP.cheer, E * 0.14, 'in']];
          fx.push(
            dive === 'left' || dive === 'right' ? seq(kp, [[KP[LAND[dive]], E * 0.22, 'in'], [KP.ready, E * 0.24, 'inOut'], ...cheer])
              : dive === 'center' ? seq(kp, [[KP.ready, E * 0.2, 'in'], ...cheer]) : seq(kp, cheer),
            seq(kk, [[KK.despair, E * 0.4, 'inOut']]));
        }
        await Promise.all(fx);
        if (!live()) return;
        last = r.state || last;
        ctx.hud?.set(r.state);
      },

      async end(r) {
        controls?.disable(); setZones(false); clearPreview(); markers(false);
        const kk = kick(), kp = keep(), ball1 = !!kp.held[1];
        // Both face the camera; a keeper still holding the ball keeps it overhead.
        const P2 = {
          kicker: { cheer: KK.cheer, hop: KK.hop, sad: KK.sad, shrug: KK.shrug, rest: KK.stand },
          keeper: ball1 ? { cheer: KP.hold, hop: KP.hop, sad: KP.holdSad, shrug: KP.holdSad, rest: KP.hold }
            : { cheer: KP.cheer, hop: KP.cheerHop, sad: KP.sad, shrug: KP.shrug, rest: KP.ready },
        };
        const poseOf = (sd) => (sd === kickerSide ? P2.kicker : P2.keeper);
        const win = r.winner == null ? null : side(r.winner);
        if (!win) {
          for (const sd of ['you', 'opp']) rigs[sd].mood('draw');
          await Promise.all(['you', 'opp'].map((sd) => seq(rigs[sd], [[poseOf(sd).shrug, 380, 'out'], [poseOf(sd).rest, 560, 'inOut']])));
          return;
        }
        const lose = win === 'you' ? 'opp' : 'you', W = poseOf(win);
        rigs[win].mood('PEN-12'); rigs[lose].mood('PEN-13');
        crowdCheer(1300);
        K.burst(b.layers.front, ...rigs[win].headPoint(), C.gold, 14, 200);
        ctx.hud?.pulse(win);
        await Promise.all([
          seq(rigs[win], [[W.cheer, 260, 'back'], [W.hop, 200, 'out'], [W.cheer, 200, 'in'], [W.hop, 200, 'out'], [W.cheer, 200, 'in']]),
          seq(rigs[lose], [[poseOf(lose).sad, 700, 'inOut']]),
        ]);
      },

      setControlsEnabled(on) {
        if (on) { controls?.enable(() => true); setZones(true); } else { controls?.disable(); setZones(false); }
      },
      target(name) {
        if (name?.startsWith('zone-')) return zones[name.slice(5)] || null;
        if (ZONES.includes(name)) return controls?.button(name) || null;
        if (name === 'goal') return gl?.goal || null;
        if (name === 'keeper') return rigs[keeperSide]?.root || null;
        if (name === 'kicker') return rigs[kickerSide]?.root || null;
        if (name === 'you-marker') return marksG?.querySelector('.pen-you') || null;
        return null;
      },
      // dev only (/dev/scenes): the role banner again, an aim preview, the markers
      devRole: { banner: () => roleBanner(), preview: (v) => preview(v), clear: () => clearPreview() },
      destroy() {
        gen++;
        unbindKeys?.(); K.clear(b?.frame); active = false;
        life?.stop();
        bannerEl?.remove(); ghost?.destroy();
        for (const r of Object.values(rigs)) r.destroy();
      },
    };
    return api;
  }

  window.DuelScenes.register('penalty', {
    create,
    // every pose, for the character lab
    poses: () => ({ ...Object.fromEntries(Object.entries(KP).map(([k, v]) => [`keeper ${k}`, typeof v === 'function' ? v(1) : v])), ...Object.fromEntries(Object.entries(KK).map(([k, v]) => [`kicker ${k}`, typeof v === 'function' ? v(1) : v])) }),
    preview: (s, step) => [['left', 'right'], ['center', 'center'], ['right', 'left'], ['left', 'left']][step % 4],
    // How much of the frame's bottom the match controls may cover (fraction of its height; kit.js contract): the kicker's
    // feet at the start of the run-up; the ball and the goal stay above it. The panel sits in the bottom-right corner
    // (controls: 'corner'), over the grass right of the ball: it may reach higher there (safeCorner).
    safeBottom: 0.11,
    safeCorner: 0.3,
    controls: 'corner',
    shortcuts: [['← ↓ →', 'Left, center, right'], ['Tap the goal', 'Pick a side right in the scene']],
    // the top scoreboard: the role chips (boot = kicking, gloves = keeping), the ●/✗ tracker, "Kick 2/5" / sudden death
    hud(state, you) {
      const reg = state.regulation || 5, kicks = state.kicks || [];
      const sudden = kicks.length > reg * 2 || (kicks.length === reg * 2 && state.score[0] === state.score[1]);
      const marks = (p) => {
        const regK = kicks.slice(0, reg * 2).filter((k) => k.kicker === p);
        const out = Array.from({ length: reg }, (_, i) => (regK[i] ? (regK[i].goal ? 'goal' : 'miss') : 'todo'));
        if (sudden) out.push('|', ...kicks.slice(reg * 2).filter((k) => k.kicker === p).slice(-3).map((k) => (k.goal ? 'goal' : 'miss')));
        return out;
      };
      const kicker = state.kicker ?? kicks.length % 2;
      return {
        round: sudden ? 'Sudden death' : `Kick ${Math.min(reg, Math.ceil((state.kickNo || kicks.length + 1) / 2))}/${reg}`, alert: sudden,
        you: { role: kicker === you ? 'kick' : 'keep', marks: marks(you) }, opp: { role: kicker === 1 - you ? 'kick' : 'keep', marks: marks(1 - you) },
      };
    },
    keyRule: 'Kicker and keeper pick left, center or right. Same side is saved, different side is a goal.',
  });
})();
