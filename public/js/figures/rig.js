// Character rig: simple flat-vector people drawn in code (plain SVG, no images).
// Load after scenes/kit.js and characters/avatar.js.
//
// A character is built from layered parts: legs + shoes, the torso (shirt + trousers band), the head (hair behind,
// ears, face, hair in front) and two NOODLE arms (one cubic Bezier each, no elbows) ending in code-drawn hands that
// can hold a prop. Character space: the origin is on the ground between the feet, y grows down, about 330 units tall.
// Profile views face right; a mirrored rig (flip) faces left.
//
// Poses are data (see REST / POSES): limb endpoints + body/head transforms. rig.to(pose, ms) interpolates every number
// with easing, so the noodles bend smoothly between poses; discrete fields (hand shapes, back view) switch halfway.
// Idle life on top of any pose: breathing, blinking and a slight noodle wobble. Reduced motion: no idle loops.
//
// Looks come from the avatar store (public/js/figures/avatar.js): { skin, hair, hairColor, shirt }. Side 'you' wears
// mine, side 'opp' the opponent's (with a different shirt when both picked the same one, so the two players never
// look alike). create({ look }) pins a look.
//
// Avatars and stills (HUD heads, the avatar picker, the result card):
//   avatarSvg(look, side, { body, face, pose, mood }) -> SVG markup (a head disc, or the whole figure with body: true)
//   paintAvatars(root) fills every [data-figure="you|opp"] element (data-look='{"skin":..}' pins a look,
//     data-body="1" draws the whole figure)
//   stage(host, who, { pose, mood }) -> { svg, rig, set(who), destroy() }: a live idle figure filling host
(function () {
  const K = window.DuelKit;
  const T = (n) => `var(--${n})`;
  const D2R = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const f1 = (n) => Math.round(n * 10) / 10;
  const OUT = 4;                                   // outline width (character units)
  const ink = { stroke: T('outline'), 'stroke-width': OUT, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  const el = (tag, attrs = {}, ...children) => K.el(tag, attrs, ...children);
  const g = (attrs = {}, ...children) => el('g', attrs, ...children);
  let uid = 0;

  // ---------------- the skeleton (character units, y down, origin on the ground) ----------------
  // The hip line, the neck, the shoulder line, the belly, the bottom of the torso; torso half-widths (front /
  // profile); the head center sits headUp above the neck; R = the head radius.
  const S = {
    hip: -74, neck: -178, shoulder: -163, belly: -98, bottom: -58,
    shoulderW: 44, shoulderWSide: 30, hipW: 38, hipWSide: 30,
    hipX: 18, hipXSide: 6, headSide: 6, headUp: 66, R: 58,
  };
  const SKIN = { id: 'human', skel: S, armW: 15, legW: 16 };

  // ---------------- poses ----------------
  const REST = {
    x: 0, y: 0, rot: 0,                 // whole character, pivot on the ground (dives, falls, jumps)
    turn: 0, back: 0,                   // view: turn 0 front, ~0.55 three-quarter, 1 profile; back 1 = seen from behind
    bx: 0, by: 0, brot: 0, bsy: 1,      // body offset from rest, lean (deg), vertical squash
    hx: 0, hy: 0, hrot: 0,              // head offset and tilt
    lx: 0, ly: 0,                       // pupils (-1..1)
    a1: [-62, -108, 0.25], a2: [62, -108, -0.25],
    l1: [-24, -10, 0], l2: [24, -10, 0],
    h1: 'ball', h2: 'ball',             // hand shapes: ball, fist, ready, rock, paper, scissors, point, open, glove
    r1: null, r2: null,                 // hand angle override (deg, 0 = pointing right); null follows the noodle
    hs1: 1, hs2: 1,                     // hand scale
    p1: [0, 0, 0], p2: [0, 0, 0],       // held prop offset [along, across, extra rotation] in the hand frame
    f1: 0, f2: 0,                       // foot tilt (deg)
    front1: 0,                          // 1 = a1 is drawn over a2 when both share a layer
    ht: 0,                              // extra head turn (-1..1): the face looks sideways without turning the body
    shadow: 1,                          // ground shadow size (shrinks on jumps)
    sit: 0,                             // 1 = seated: the character drops so the torso's bottom rests on the origin
    behind: 0,                          // 1 = both arms behind the body (a back view reaching forward)
  };
  const DISCRETE = new Set(['h1', 'h2', 'back', 'front1', 'behind']);

  const POSES = {
    idle: {},
    idle3: { turn: 0.55, a1: [-50, -100, 0.3], a2: [62, -100, -0.1], l1: [-20, -10, 0], l2: [24, -10, 0] },
    side: { turn: 1, a1: [-18, -96, 0.3], a2: [22, -96, -0.3], l1: [-12, -10, 0], l2: [14, -10, 0] },
    back: { back: 1 },
    locked: { a1: [-62, -96, 0.9], a2: [62, -96, -0.9], hrot: -3 },
    locked3: { turn: 0.55, a1: [-40, -98, 0.8], a2: [60, -98, -0.1], l1: [-20, -10, 0], l2: [24, -10, 0] },
    cheer: { a1: [-108, -296, -0.45], a2: [108, -296, 0.45], by: -6, hy: -4, h1: 'fist', h2: 'fist' },
    sad: { by: 8, brot: 0, hy: 10, hrot: 8, a1: [-64, -80, 0.2], a2: [64, -80, -0.2], ly: 0.6 },
    shrug: { a1: [-86, -150, -0.6], a2: [86, -150, 0.6], h1: 'open', h2: 'open', hy: 4, hrot: -6 },
  };

  function resolve(p) {
    if (typeof p === 'string') p = POSES[p] || {};
    const out = {};
    for (const k of Object.keys(REST)) {
      const v = p[k] !== undefined ? p[k] : REST[k];
      out[k] = Array.isArray(v) ? [...v] : v;
    }
    return out;
  }
  function blend(a, b, t) {
    const o = {};
    for (const k of Object.keys(REST)) {
      const x = a[k], y = b[k];
      if (DISCRETE.has(k)) o[k] = t < 0.5 ? x : y;
      else if (x == null || y == null) o[k] = t < 0.5 ? x : y;
      else if (Array.isArray(x)) o[k] = x.map((v, i) => lerp(v, y[i] ?? v, t));
      else o[k] = lerp(x, y, t);
    }
    return o;
  }
  // A tween's hand arc (rig.to(..., bow)): the hands travel on an arc bulging upward by bow x the distance.
  function arcOf(a, b, bow) {
    const o = {};
    for (const k of ['a1', 'a2']) {
      const p = a[k], q = b[k];
      if (!p || !q) continue;
      const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      if (len < 8) continue;
      let nx = -dy / len, ny = dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; }
      o[k] = [nx * len * bow, ny * len * bow];
    }
    return o;
  }
  function bowedAt(o, arc, e) {
    if (!arc) return o;
    const s = Math.sin(Math.PI * clamp(e));
    for (const k in arc) if (o[k]) o[k] = [o[k][0] + arc[k][0] * s, o[k][1] + arc[k][1] * s, ...o[k].slice(2)];
    return o;
  }
  const tweenAt = (tw, t) => { const e = tw.ease(clamp(t)); return bowedAt(blend(tw.from, tw.target, e), tw.arc, e); };
  const EASE = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - (1 - t) ** 3,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    back: (t) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * (t - 1) ** 3 + c * (t - 1) ** 2; },
    snap: (t) => 1 - (1 - t) ** 5,
  };

  // ---------------- the shared ticker ----------------
  const live = new Set();
  let raf = 0;
  function tick(now) {
    raf = 0;
    for (const r of live) {
      if (r.dead) { live.delete(r); continue; }
      if (!r.root.isConnected) { if (r.seen) r.destroy(); continue; }
      r.seen = true;
      r.frame(now);
    }
    if (live.size) raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf && live.size && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick); };

  // ---------------- geometry ----------------
  const pathOf = ([s, c1, c2, e]) => `M${f1(s[0])} ${f1(s[1])}C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(e[0])} ${f1(e[1])}`;
  // A noodle between two points: one cubic Bezier, curved sideways by bend. Returns the path, the end tangent (deg)
  // and the control points.
  function noodle(s, e, bend) {
    const dx = e[0] - s[0], dy = e[1] - s[1];
    const c1 = [s[0] + dx * 0.3 - dy * bend, s[1] + dy * 0.3 + dx * bend];
    const c2 = [s[0] + dx * 0.7 - dy * bend, s[1] + dy * 0.7 + dx * bend];
    return { d: pathOf([s, c1, c2, e]), ang: Math.atan2(e[1] - c2[1], e[0] - c2[0]) / D2R, c: [s, c1, c2, e] };
  }
  // A noodle that arrives at e along the angle ang (deg): the forearm runs straight into the wrist.
  function noodleTo(s, e, bend, ang) {
    const dx = e[0] - s[0], dy = e[1] - s[1], len = Math.hypot(dx, dy);
    const c1 = [s[0] + dx * 0.3 - dy * bend, s[1] + dy * 0.3 + dx * bend];
    const c2 = [e[0] - Math.cos(ang * D2R) * len * 0.35, e[1] - Math.sin(ang * D2R) * len * 0.35];
    return { d: pathOf([s, c1, c2, e]), ang, c: [s, c1, c2, e] };
  }
  // The first part (0..t) of a cubic Bezier (de Casteljau).
  function splitAt(c, t) {
    const L = (a, b) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const [p0, p1, p2, p3] = c;
    const a = L(p0, p1), b = L(p1, p2), cc = L(p2, p3), d = L(a, b), e = L(b, cc), f = L(d, e);
    return [p0, a, d, f];
  }
  function bez(c, t) {
    const u = 1 - t, [p0, p1, p2, p3] = c;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  }

  // The torso outline in body space (origin at the hip center, y down): rounded shoulders, gently narrowing sides,
  // a rounded bottom. turn narrows it toward a profile.
  function torso(turn) {
    const wS = lerp(S.shoulderW, S.shoulderWSide, turn), wH = lerp(S.hipW, S.hipWSide, turn);
    const top = S.neck - S.hip, sh = S.shoulder - S.hip + 8, bot = S.bottom - S.hip;
    const n = wS * 0.42, cx = turn * 4;
    return `M${f1(cx - n)} ${top}C${f1(cx - wS + 4)} ${top - 1} ${f1(-wS)} ${sh - 10} ${f1(-wS)} ${sh}`
      + `C${f1(-wS + 2)} ${f1(sh + 30)} ${f1(-wH)} ${f1(bot - 30)} ${f1(-wH)} ${bot - 12}`
      + `Q${f1(-wH)} ${bot} ${f1(-wH + 14)} ${bot}L${f1(wH - 14)} ${bot}Q${f1(wH)} ${bot} ${f1(wH)} ${bot - 12}`
      + `C${f1(wH)} ${f1(bot - 30)} ${f1(wS - 2)} ${f1(sh + 30)} ${f1(wS)} ${sh}`
      + `C${f1(wS)} ${sh - 10} ${f1(cx + wS - 4)} ${top - 1} ${f1(cx + n)} ${top}Z`;
  }
  // The shoulder anchors in body space: [a1, a2]. Front / back: both at the shoulder corners. Turned (facing right):
  // a1 is the NEAR arm (toward the viewer), a2 the FAR arm, both sliding toward the middle of the side in profile.
  function anchors(turn, back) {
    const wS = lerp(S.shoulderW, S.shoulderWSide, turn), y = S.shoulder - S.hip + 6;
    if (back) return [[-(wS - 8), y], [wS - 8, y]];
    return [[lerp(-(wS - 8), -2, turn), y + 2 * turn], [lerp(wS - 8, 10, turn), y - 2 * turn]];
  }
  const isFar = (turn, back) => !back && turn >= 0.1;

  // The character-space point of arm k's shoulder for a pose (no idle life; seated poses in their seat-relative limb
  // coordinates). Scenes aim an arm from it (a gun arm).
  function shoulderOf(_sp, pose, k) {
    const p = resolve(pose), turn = clamp(p.turn), back = p.back >= 0.5;
    const an = anchors(turn, back)[k - 1];
    const a = p.brot * D2R, yy = an[1] * p.bsy;
    return [p.bx + an[0] * Math.cos(a) - yy * Math.sin(a), S.hip + p.by + an[0] * Math.sin(a) + yy * Math.cos(a) - S.bottom * (p.sit || 0)];
  }

  // ---------------- hands (fingers toward -y, the wrist at the origin) ----------------
  // One outlined shape from several parts: the outlines under, the fills on top.
  function blobs(shapes, fill, w) {
    const o = g({}), f = g({});
    for (const [tag, a] of shapes) {
      o.append(el(tag, { ...a, fill: T('outline'), stroke: T('outline'), 'stroke-width': w * 2, 'stroke-linejoin': 'round' }));
      f.append(el(tag, { ...a, fill }));
    }
    return g({}, o, f);
  }
  // a rounded rect part, rotated by rot around (cx, cy) (default: its bottom center)
  const rr = (x, y, w, h, r, rot = 0, cx = x + w / 2, cy = y + h) => ['rect', { x, y, width: w, height: h, rx: r, transform: rot ? `rotate(${rot} ${cx} ${cy})` : null }];
  const cir = (cx, cy, r) => ['circle', { cx, cy, r }];
  const crease = (d, w) => el('path', { d, fill: 'none', stroke: T('outline'), 'stroke-width': w, 'stroke-linecap': 'round' });
  const HANDS = {
    // a relaxed closed hand
    ball: (c, w) => blobs([cir(0, -14, 15)], c.skin, w),
    // a fist: the knuckles toward -y, the thumb folded over
    fist: (c, w) => g({}, blobs([rr(-16, -36, 32, 32, 13)], c.skin, w), crease('M-6 -33L-6 -25M4 -33L4 -25', w * 0.6), blobs([rr(-18, -22, 16, 12, 6)], c.skin, w)),
    // an open hand, the fingers spread
    open: (c, w) => blobs([rr(-8, -60, 9, 30, 4.5, -14), rr(-1, -64, 9, 32, 4.5, -3), rr(7, -60, 9, 30, 4.5, 8), rr(13, -50, 8, 24, 4, 22),
      rr(-15, -40, 32, 30, 12), rr(-24, -32, 9, 20, 4.5, -30)], c.skin, w),
    // goalkeeper gloves: a padded open hand with a wrist band
    glove: (c, w) => g({}, blobs([rr(-12, -74, 13, 38, 6.5, -14), rr(-1, -80, 13, 42, 6.5, -3), rr(10, -74, 13, 38, 6.5, 10), rr(18, -62, 12, 30, 6, 24),
      rr(-20, -48, 44, 40, 15), rr(-38, -42, 13, 28, 6.5, -42)], T('glove'), w), blobs([rr(-18, -14, 40, 16, 5)], T('glove-band'), w)),
    // one finger pointing
    point: (c, w) => g({}, blobs([rr(-4, -66, 11, 40, 5.5), rr(-16, -36, 32, 30, 13)], c.skin, w), blobs([rr(-18, -22, 14, 12, 6)], c.skin, w)),
    // rock / paper / scissors, seen from the side, the fingers toward -y (the opponent): big, readable shapes
    rock: (c, w) => g({}, blobs([rr(-18, -40, 36, 36, 15)], c.skin, w), crease('M-9 -37L-9 -28M0 -38L0 -29M9 -37L9 -28', w * 0.6), blobs([rr(-22, -24, 18, 13, 6.5)], c.skin, w)),
    paper: (c, w) => g({}, blobs([rr(-14, -72, 10, 40, 5), rr(-4, -76, 10, 44, 5), rr(6, -74, 10, 42, 5), rr(15, -66, 9, 34, 4.5, 6), rr(-17, -40, 36, 34, 13), rr(-25, -34, 10, 22, 5, -24)], c.skin, w),
      crease('M-4 -40L-4 -46M6 -40L6 -46', w * 0.5)),
    scissors: (c, w) => g({}, blobs([rr(-14, -80, 11, 50, 5.5, -12), rr(3, -80, 11, 50, 5.5, 12), rr(-18, -40, 36, 36, 15)], c.skin, w),
      crease('M-4 -14L6 -14', w * 0.6), blobs([rr(-22, -24, 18, 13, 6.5)], c.skin, w)),
  };
  HANDS.ready = HANDS.fist;   // the pumping fist before a throw
  // the middle of a hand along the arm (hand frame -y) and its radius (character units at scale 1)
  const HAND_MID = { ball: [14, 15], fist: [20, 20], ready: [20, 20], rock: [22, 22], paper: [40, 34], scissors: [42, 36], open: [36, 32], glove: [42, 40], point: [30, 24] };

  // ---------------- head: hair styles ----------------
  // Hair is drawn in two layers: back (behind the head: long hair, a ponytail, a bun) and front (the cap over the top
  // of the head with its fringe). turn = the head turn (0..1, facing right), R = the head radius.
  const HAIR = {
    short: 'Short', crop: 'Crop', curly: 'Curly', long: 'Long', bun: 'Bun', ponytail: 'Ponytail', spiky: 'Spiky', buzz: 'Buzz',
  };
  function hairShapes(style, turn, back, color) {
    const R = S.R, cx = back ? 0 : turn * R * 0.42;
    const fill = { fill: color, ...ink };
    const behind = [], front = [];
    const cap = (low = 0.18, fringe = 0.32) => {
      // the top of the head down to y = -low R at the sides, the fringe a little lower toward the face
      if (back) return el('path', { d: `M${-R - 3} ${f1(R * 0.25)}C${-R - 6} ${f1(-R * 1.3)} ${R + 6} ${f1(-R * 1.3)} ${R + 3} ${f1(R * 0.25)}Q0 ${f1(R * 0.55)} ${-R - 3} ${f1(R * 0.25)}Z`, ...fill });
      const l = -R - 3, r = R + 3, y0 = f1(-R * low + 8);
      return el('path', { d: `M${l} ${y0}C${l - 3} ${f1(-R * 1.35)} ${r + 3} ${f1(-R * 1.35)} ${r} ${y0}`
        + `Q${f1(cx + R * 0.55)} ${f1(-R * fringe - 14)} ${f1(cx + 4)} ${f1(-R * fringe)}Q${f1(cx - R * 0.5)} ${f1(-R * fringe - 6)} ${l} ${y0}Z`, ...fill });
    };
    switch (style) {
      case 'crop': front.push(cap(0.32, 0.52)); break;
      case 'buzz':
        front.push(el('path', { d: back ? `M${-R - 1} 4C${-R - 2} ${f1(-R * 1.3)} ${R + 2} ${f1(-R * 1.3)} ${R + 1} 4Q0 ${f1(R * 0.3)} ${-R - 1} 4Z`
          : `M${-R - 1} ${f1(-R * 0.22)}C${-R - 2} ${f1(-R * 1.32)} ${R + 2} ${f1(-R * 1.32)} ${R + 1} ${f1(-R * 0.22)}Q${f1(cx)} ${f1(-R * 0.74)} ${-R - 1} ${f1(-R * 0.22)}Z`, ...fill }));
        break;
      case 'spiky': {
        const n = 7, pts = [];
        for (let i = 0; i <= n; i++) {
          const a = Math.PI * (1 + i / n);
          pts.push([Math.cos(a) * (R + 5), Math.sin(a) * (R + 5) - 4]);
          if (i < n) { const am = Math.PI * (1 + (i + 0.5) / n); pts.push([Math.cos(am) * (R + 24) + cx * 0.25, Math.sin(am) * (R + 24) - 4]); }
        }
        front.push(el('path', { d: `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L')}Q${f1(cx)} ${f1(back ? R * 0.4 : -R * 0.42)} ${f1(pts[0][0])} ${f1(pts[0][1])}Z`, ...fill }));
        break;
      }
      case 'curly': {
        const balls = [];
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.92 + i * 0.145); balls.push(cir(f1(Math.cos(a) * (R + 2) + cx * 0.15), f1(Math.sin(a) * (R + 2) - 4), 19)); }
        if (back) balls.push(cir(0, 0, R * 0.95), cir(-R * 0.6, R * 0.2, 20), cir(R * 0.6, R * 0.2, 20));
        else balls.push(['ellipse', { cx: f1(cx), cy: f1(-R * 0.62), rx: R * 0.8, ry: R * 0.4 }]);
        front.push(blobs(balls, color, OUT / 2));
        break;
      }
      case 'long':
        behind.push(el('path', { d: `M${-R - 6} ${f1(-R * 0.2)}C${-R - 12} ${f1(R * 0.9)} ${-R - 6} ${f1(R * 1.25)} ${f1(-R * 0.5)} ${f1(R * 1.25)}L${f1(R * 0.5)} ${f1(R * 1.25)}C${R + 6} ${f1(R * 1.25)} ${R + 12} ${f1(R * 0.9)} ${R + 6} ${f1(-R * 0.2)}Z`, ...fill }));
        front.push(cap(0.05, 0.3));
        break;
      case 'bun':
        behind.push(el('circle', { cx: f1(-cx * 0.4), cy: -R - 14, r: 22, ...fill }));
        front.push(cap(0.2, 0.42));
        break;
      case 'ponytail': {
        const bx = back ? 0 : -turn * R * 0.95, by = back ? -R * 0.1 : -R * 0.35;
        behind.push(el('path', { d: `M${f1(bx - 12)} ${f1(by)}Q${f1(bx - 34 - turn * 20)} ${f1(by + 40)} ${f1(bx - 18 - turn * 30)} ${f1(by + 92)}Q${f1(bx + 4)} ${f1(by + 60)} ${f1(bx + 12)} ${f1(by)}Z`, ...fill }));
        front.push(cap(0.22, 0.4));
        break;
      }
      default: front.push(cap(0.15, 0.36));   // short
    }
    return { behind, front };
  }

  // ---------------- faces ----------------
  // Eyes, brows and mouth per expression, around the face center; R = the head radius.
  // neutral, focus, smile, think, grin, joy, oops, sad, meh, shock (expressions.js says which shows when).
  const FACES = {
    neutral: { eyes: 'dot', brows: 'flat', mouth: 'smallSmile' },
    focus: { eyes: 'dot', brows: 'down', mouth: 'flat' },
    smile: { eyes: 'dot', brows: 'up', mouth: 'smile' },
    think: { eyes: 'dot', brows: 'one', mouth: 'side', look: [0.6, -0.4] },
    grin: { eyes: 'happy', brows: 'up', mouth: 'grin', cheeks: true },
    joy: { eyes: 'happy', brows: 'up', mouth: 'open', cheeks: true },
    oops: { eyes: 'dot', brows: 'worried', mouth: 'wobble' },
    sad: { eyes: 'dot', brows: 'worried', mouth: 'frown', look: [0, 0.6] },
    meh: { eyes: 'half', brows: 'flat', mouth: 'slant' },
    shock: { eyes: 'wide', brows: 'high', mouth: 'o' },
  };
  function faceNode(name) {
    const F = FACES[name] || FACES.neutral, R = S.R;
    const root = g({ class: `rig-face rig-face--${name}` });
    const ex = R * 0.36, ey = -R * 0.05;
    const eyes = [], pupils = [];
    for (const s of [-1, 1]) {
      const eg = g({});
      let pupil = null;
      if (F.eyes === 'happy') eg.append(el('path', { d: `M${f1(s * ex - 9)} ${f1(ey + 3)}Q${f1(s * ex)} ${f1(ey - 9)} ${f1(s * ex + 9)} ${f1(ey + 3)}`, fill: 'none', ...ink, 'stroke-width': 4.5 }));
      else if (F.eyes === 'half') { eg.append(el('path', { d: `M${f1(s * ex - 8)} ${f1(ey)}L${f1(s * ex + 8)} ${f1(ey)}`, fill: 'none', ...ink, 'stroke-width': 4 })); pupil = el('circle', { cx: f1(s * ex), cy: f1(ey + 4), r: 4, fill: T('outline') }); }
      else if (F.eyes === 'wide') { eg.append(el('circle', { cx: f1(s * ex), cy: f1(ey), r: 10, fill: T('eye'), ...ink, 'stroke-width': 3 })); pupil = el('circle', { cx: f1(s * ex), cy: f1(ey), r: 4.5, fill: T('outline') }); }
      else pupil = el('ellipse', { cx: f1(s * ex), cy: f1(ey), rx: 5.5, ry: 7, fill: T('outline') });
      if (pupil) { const pg = g({}, pupil); eg.append(pg); pupils.push(pg); }
      eg.cy = ey;
      eyes.push(eg);
    }
    const by = -R * 0.3;
    const brow = (s) => {
      const x0 = f1(s * ex - 10), x1 = f1(s * ex + 10), mid = f1(s * ex);
      const inner = s < 0 ? x1 : x0, outer = s < 0 ? x0 : x1;
      switch (F.brows) {
        case 'down': return `M${outer} ${f1(by - 4)}L${inner} ${f1(by + 3)}`;
        case 'up': return `M${x0} ${f1(by - 2)}Q${mid} ${f1(by - 9)} ${x1} ${f1(by - 2)}`;
        case 'high': return `M${x0} ${f1(by - 8)}Q${mid} ${f1(by - 16)} ${x1} ${f1(by - 8)}`;
        case 'worried': return `M${outer} ${f1(by + 2)}L${inner} ${f1(by - 6)}`;
        case 'one': return s > 0 ? `M${x0} ${f1(by - 6)}Q${mid} ${f1(by - 13)} ${x1} ${f1(by - 6)}` : `M${x0} ${f1(by)}L${x1} ${f1(by)}`;
        default: return `M${x0} ${f1(by - 1)}L${x1} ${f1(by - 1)}`;
      }
    };
    const brows = g({}, ...[-1, 1].map((s) => el('path', { d: brow(s), fill: 'none', ...ink, 'stroke-width': 4.5 })));
    const my = f1(R * 0.38);
    const M = {
      smallSmile: () => el('path', { d: `M-9 ${my - 2}Q0 ${my + 6} 9 ${my - 2}`, fill: 'none', ...ink }),
      smile: () => el('path', { d: `M-14 ${my - 4}Q0 ${my + 10} 14 ${my - 4}`, fill: 'none', ...ink }),
      flat: () => el('path', { d: `M-9 ${my}L9 ${my}`, fill: 'none', ...ink }),
      side: () => el('path', { d: `M-4 ${my + 1}Q6 ${my + 3} 12 ${my - 3}`, fill: 'none', ...ink }),
      grin: () => el('path', { d: `M-17 ${my - 6}Q0 ${my - 4} 17 ${my - 6}Q12 ${my + 14} 0 ${my + 14}Q-12 ${my + 14} -17 ${my - 6}Z`, fill: T('mouth'), ...ink, 'stroke-width': 3.5 }),
      open: () => g({}, el('path', { d: `M-16 ${my - 6}Q0 ${my - 8} 16 ${my - 6}Q14 ${my + 20} 0 ${my + 20}Q-14 ${my + 20} -16 ${my - 6}Z`, fill: T('mouth'), ...ink, 'stroke-width': 3.5 }),
        el('path', { d: `M-8 ${my + 15}Q0 ${my + 9} 8 ${my + 15}Z`, fill: T('tongue') })),
      wobble: () => el('path', { d: `M-12 ${my + 3}Q-6 ${my - 3} 0 ${my + 2}Q6 ${my + 6} 12 ${my}`, fill: 'none', ...ink }),
      frown: () => el('path', { d: `M-13 ${my + 6}Q0 ${my - 6} 13 ${my + 6}`, fill: 'none', ...ink }),
      slant: () => el('path', { d: `M-10 ${my + 2}L10 ${my - 2}`, fill: 'none', ...ink }),
      o: () => el('ellipse', { cx: 0, cy: my + 2, rx: 7, ry: 9, fill: T('mouth'), ...ink, 'stroke-width': 3.5 }),
    };
    const cheeks = F.cheeks ? g({}, ...[-1, 1].map((s) => el('ellipse', { cx: f1(s * R * 0.55), cy: f1(R * 0.2), rx: 9, ry: 5.5, fill: T('cheek'), opacity: 0.6 }))) : null;
    const nose = el('path', { d: `M2 ${f1(R * 0.06)}Q7 ${f1(R * 0.18)} 0 ${f1(R * 0.22)}`, fill: 'none', ...ink, 'stroke-width': 3.5 });
    root.append(...(cheeks ? [cheeks] : []), ...eyes, brows, nose, M[F.mouth]());
    return { g: root, eyes, pupils, look: F.look || null, closed: F.eyes === 'happy' };
  }

  // ---------------- looks ----------------
  const A = () => window.DuelAvatar;
  const DEFAULT_LOOK = { skin: 'skin-3', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1' };
  const validLook = (l) => (A()?.valid ? A().valid(l) : { ...DEFAULT_LOOK, ...(l || {}) });
  const lookFor = (side) => (A()?.forSide ? A().forSide(side) : { ...DEFAULT_LOOK });

  // ---------------- the rig ----------------
  function create(opts = {}) {
    const r = new Rig(opts);
    live.add(r); wake();
    return r;
  }

  class Rig {
    constructor({ side = 'you', pose = 'idle', idle = true, flip = false, look = null, mood = 'idle', x = 0, y = 0, scale = 1 } = {}) {
      this.id = ++uid;
      this.side = side;
      this.skin = SKIN;
      this.idleOn = idle;
      this.flip = flip;
      this.cur = resolve(pose);
      this.tw = null;
      this.held = { 1: null, 2: null };
      this.ownLook = !!look;
      this.look = look ? validLook(look) : lookFor(side);
      this.faceName = null;
      this.moodName = mood;
      this.big = null;                     // bigHands(): which arms draw big gesture hands
      this.t0 = performance.now() + Math.random() * 4000;
      this.blinkAt = this.t0 + 1500 + Math.random() * 2500;
      this.root = g({ class: `rig rig--${side}` });
      this.placeAt = [x, y, scale];
      this.build();
      this.place(x, y, scale);
      this.mood(mood);
      this.apply(this.cur, performance.now());
    }
    colors() {
      const L = this.look;
      return { skin: T(L.skin), hair: T(L.hairColor), shirt: T(L.shirt), pants: T('pants'), shoe: T('shoe') };
    }

    build() {
      const c = this.c = this.colors();
      this.root.innerHTML = '';
      this.n = {};
      const n = this.n, id = `rig${this.id}`;
      n.flip = g({ class: 'rig-flip' });
      n.shadow = el('ellipse', { cx: 0, cy: 0, rx: 66, ry: 11, fill: T('shadow'), opacity: 0.22 });
      n.all = g({ class: 'rig-all' });
      n.armBack = g({}); n.armFront = g({});
      n.legs = g({}); n.body = g({}); n.head = g({});
      n.all.append(n.armBack, n.legs, n.body, n.head, n.armFront);
      n.flip.append(n.shadow, n.all);
      this.root.append(n.flip);

      // legs: trouser noodles, a shoe at the end
      const limb = (w, color) => {
        const o = el('path', { fill: 'none', stroke: T('outline'), 'stroke-width': w + OUT * 2, 'stroke-linecap': 'round' });
        const f = el('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' });
        return { o, f, g: g({}, o, f) };
      };
      n.leg1 = limb(SKIN.legW, c.pants); n.leg2 = limb(SKIN.legW, c.pants);
      n.foot1 = g({ class: 'rig-foot' }); n.foot2 = g({ class: 'rig-foot' });
      n.legs.append(n.leg1.g, n.foot1, n.leg2.g, n.foot2);
      this.feetKey = null;

      // torso: the shirt, the trousers band at the bottom (clipped to the torso), the neck opening, the outline on top
      n.clip = el('clipPath', { id: `${id}-body` }, el('path', {}));
      n.bodyPath = el('path', { fill: c.shirt });
      n.pants = el('rect', { x: -60, y: -6, width: 120, height: 40, fill: c.pants, 'clip-path': `url(#${id}-body)` });
      n.belt = el('path', { fill: 'none', ...ink, 'stroke-width': 3, 'clip-path': `url(#${id}-body)` });
      n.neck = el('path', { fill: c.skin, ...ink, 'stroke-width': 3 });
      n.bodyEdge = el('path', { fill: 'none', ...ink });
      n.body.append(el('defs', {}, n.clip), n.bodyPath, n.pants, n.belt, n.neck, n.bodyEdge);

      // head: hair behind, ears, the head, the face, hair in front
      n.headInner = g({});
      n.head.append(n.headInner);
      n.hairBack = g({ class: 'rig-hair-back' });
      n.ears = g({});
      n.headShape = el('ellipse', { cx: 0, cy: 0, rx: S.R, ry: S.R + 2, fill: c.skin, ...ink });
      n.faceSlot = g({ class: 'rig-face-slot' });
      n.hairFront = g({ class: 'rig-hair' });
      n.headInner.append(n.hairBack, n.ears, n.headShape, n.faceSlot, n.hairFront);
      n.faces = {};
      for (const name of Object.keys(FACES)) {
        const f = faceNode(name);
        f.g.style.display = 'none';
        n.faces[name] = f;
        n.faceSlot.append(f.g);
      }
      this.hairKey = null;

      // arms: outline + fill noodle, the short sleeve (shirt color) over the arm's root, the held prop, the hand
      const arm = (k) => {
        const l = limb(SKIN.armW, c.skin);
        const sO = el('path', { fill: 'none', stroke: T('outline'), 'stroke-width': SKIN.armW + 10 + OUT * 2, 'stroke-linecap': 'round' });
        const sF = el('path', { fill: 'none', stroke: c.shirt, 'stroke-width': SKIN.armW + 10, 'stroke-linecap': 'round' });
        const sleeve = g({ class: 'rig-sleeve' }, sO, sF);
        const prop = g({}); const propInner = g({}); prop.append(propInner);
        const hand = g({}); const handInner = g({}); hand.append(handInner);
        const root = g({ class: `rig-arm rig-arm${k}` }, l.g, sleeve, prop, hand);
        return { ...l, sO, sF, sleeve, root, prop, propInner, hand, handInner, shape: null };
      };
      n.arm1 = arm(1); n.arm2 = arm(2);
      n.armBack.append(n.arm1.root); n.armFront.append(n.arm2.root);
      n.flip.setAttribute('transform', this.flip ? 'scale(-1 1)' : '');
    }

    // --- placement in the scene ---
    place(x, y, s = this.placeAt[2]) {
      this.placeAt = [x, y, s];
      this.root.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) scale(${s})`);
      return this;
    }
    setFlip(on) { this.flip = !!on; this.n.flip.setAttribute('transform', on ? 'scale(-1 1)' : ''); return this; }
    drop(p) { return -S.bottom * (p.sit || 0); }
    // Character space -> scene coordinates (ignores the camera shake).
    world([x, y]) {
      const p = this.cur, a = p.rot * D2R;
      let wx = x * Math.cos(a) - y * Math.sin(a) + p.x;
      const wy = x * Math.sin(a) + y * Math.cos(a) + p.y + this.drop(p);
      if (this.flip) wx = -wx;
      const [px, py, s] = this.placeAt;
      return [px + wx * s, py + wy * s];
    }

    // --- looks ---
    setLook(l) {
      this.ownLook = !!l;
      this.look = l ? validLook(l) : lookFor(this.side);
      const held = { ...this.held }, face = this.faceName;
      this.build();
      for (const k of [1, 2]) if (held[k]) this.hold(k, held[k], true);
      this.face(face, true);
      this.apply(this.cur, performance.now());
      return this;
    }
    syncLook() { if (!this.ownLook) this.setLook(null); }

    // --- expressions ---
    face(name, force = false) {
      const faces = this.n.faces;
      if (!faces[name]) name = 'neutral';
      if (name === this.faceName && !force) return this;
      for (const [k, f] of Object.entries(faces)) f.g.style.display = k === name ? '' : 'none';
      this.faceName = name;
      return this;
    }
    // The expression for a moment (public/js/figures/expressions.js): a moment id (RPS-3, SHO-9, ...) or an old name.
    mood(moment) {
      this.moodName = moment;
      const pick = window.DuelExpressions?.pick?.(moment, this);
      return this.face(pick || 'neutral', true);
    }

    // --- props ---
    hold(k, name, rebuild = false) {
      const a = this.n[`arm${k}`];
      if (!rebuild && this.held[k] === name) return this;
      this.held[k] = name || null;
      a.propInner.innerHTML = '';
      a.prop.dataset.prop = name || '';
      a.propNode = name ? window.DuelProps?.[name]?.() || null : null;
      if (a.propNode) a.propInner.append(a.propNode.root);
      this.apply(this.cur, performance.now());
      return this;
    }
    prop(k) { return this.n[`arm${k}`].propNode; }

    // Big gesture hands (the RPS table): fn(k, shape, rig) -> truthy for an arm that draws its gesture big.
    bigHands(fn, { scale = 0.36 } = {}) {
      this.big = fn ? { fn, k: 1.55 * (scale / 0.36) } : null;
      for (const k of [1, 2]) this.n[`arm${k}`].shape = null;
      this.apply(this.cur, performance.now());
      return this;
    }
    bigOf(k, shape) { return this.big && this.big.fn(k, shape, this) ? this.big.k : 1; }

    // --- pose animation ---
    // Tweens to a pose in ms (shortened under reduced motion). Resolves on a timer, so a hidden tab never stalls a
    // reveal. bow: the hands travel on an arc (see arcOf).
    to(pose, ms = 300, ease = 'inOut', bow = 0) { this.seqId = (this.seqId || 0) + 1; return this.tween(pose, ms, ease, bow); }
    tween(pose, ms = 300, ease = 'inOut', bow = 0) {
      const target = resolve(pose);
      const dur = Math.max(1, ms * (K.reduced() ? 0.35 : 1));
      this.interrupt();
      const from = { ...this.cur };
      return new Promise((done) => {
        const tw = { from, target, t0: performance.now(), dur, ease: EASE[ease] || EASE.inOut, done: null, cut: null, arc: bow ? arcOf(from, target, bow) : null };
        const timer = setTimeout(() => finish(), dur);
        const finish = () => { clearTimeout(timer); if (this.tw === tw) { this.tw = null; this.cur = target; this.apply(target, performance.now()); } done(); };
        tw.done = finish;
        tw.cut = () => { clearTimeout(timer); if (this.tw === tw) this.tw = null; done(); };
        this.tw = tw;
        wake();
      });
    }
    interrupt() {
      const tw = this.tw;
      if (!tw) return;
      this.cur = tweenAt(tw, (performance.now() - tw.t0) / tw.dur);
      tw.cut();
    }
    set(pose) { this.seqId = (this.seqId || 0) + 1; this.tw?.cut?.(); this.cur = resolve(pose); this.apply(this.cur, performance.now()); return this; }
    async seq(steps) {
      const my = this.seqId = (this.seqId || 0) + 1;
      for (const [p, ms, e, bow] of steps) { if (this.seqId !== my || this.dead) return; await this.tween(p, ms, e, bow); }
    }
    idle(on) { this.idleOn = on; if (on) wake(); return this; }
    stop() { this.tw?.done?.(); K.settle(this.root); }
    destroy() { this.dead = true; this.tw?.cut?.(); live.delete(this); }

    frame(now) {
      if (this.tw) this.cur = tweenAt(this.tw, (now - this.tw.t0) / this.tw.dur);
      if (this.tw || (this.idleOn && !K.reduced()) || this.blinking) this.apply(this.cur, now);
    }

    // The hair and ears for a view (rebuilt when the look, the view or the quantized turn changes).
    dressHead(turn, back) {
      const q = Math.round(turn * 10) / 10;
      const key = `${this.look.hair}:${this.look.hairColor}:${this.look.skin}:${back ? 1 : 0}:${q}`;
      if (key === this.hairKey) return;
      this.hairKey = key;
      const n = this.n, h = hairShapes(this.look.hair, q, back, this.c.hair);
      n.hairBack.innerHTML = ''; n.hairFront.innerHTML = '';
      n.hairBack.append(...h.behind); n.hairFront.append(...h.front);
      // ears: the near one always, the far one until a near profile; none from behind
      n.ears.innerHTML = '';
      if (!back) {
        const ear = (x) => el('ellipse', { cx: f1(x), cy: 6, rx: 10, ry: 14, fill: this.c.skin, ...ink });
        if (q < 0.7) n.ears.append(ear(S.R * (1 - q * 0.9) - 2));
        n.ears.append(ear(-S.R + 2 + q * S.R * 0.7));
      }
    }

    // --- drawing a pose ---
    apply(p0, now) {
      const n = this.n;
      const p = { ...p0 };
      let blink = 1;
      if (this.idleOn && !K.reduced()) {
        const t = (now - this.t0) / 1000;
        p.bsy = p.bsy * (1 + 0.012 * Math.sin(t * 2.4));
        p.hy = p.hy - 1.4 * Math.sin(t * 2.4);
        const w = (i) => 0.06 * Math.sin(t * 3.1 + i * 1.7);
        p.a1 = [p.a1[0], p.a1[1], p.a1[2] + w(1)]; p.a2 = [p.a2[0], p.a2[1], p.a2[2] + w(2)];
        const f = n.faces[this.faceName];
        if (f && !f.closed) {
          if (now > this.blinkAt) { this.blinkStart = now; this.blinkAt = now + 2200 + Math.random() * 3200; }
          const bt = (now - (this.blinkStart || -1e9)) / 140;
          this.blinking = bt < 1;
          if (bt < 1) blink = Math.max(0.08, Math.abs(1 - 2 * bt));
        }
      }
      const turn = clamp(p.turn), back = p.back >= 0.5;
      if (p.sit) { const dy = S.bottom * p.sit; for (const k of ['a1', 'a2', 'l1', 'l2']) p[k] = [p[k][0], p[k][1] + dy, p[k][2]]; }

      // whole character + ground shadow
      n.all.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y + this.drop(p))}) rotate(${f1(p.rot)})`);
      const lift = Math.max(0, -p.y);
      n.shadow.setAttribute('transform', `translate(${f1(p.x)} 0) scale(${f1(clamp(p.shadow - lift / 260, 0.3, 1.4) * 100) / 100} 1)`);
      n.shadow.style.display = p.sit > 0.5 ? 'none' : '';

      // body space -> character space (around the hip center)
      const a = p.brot * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const B = ([x, y]) => { const yy = y * p.bsy; return [p.bx + x * ca - yy * sa, S.hip + p.by + x * sa + yy * ca]; };
      n.body.setAttribute('transform', `translate(${f1(p.bx)} ${f1(S.hip + p.by)}) rotate(${f1(p.brot)}) scale(1 ${f1(p.bsy * 1000) / 1000})`);
      const d = torso(turn);
      n.bodyPath.setAttribute('d', d); n.clip.firstChild.setAttribute('d', d); n.bodyEdge.setAttribute('d', d);
      const wH = lerp(S.hipW, S.hipWSide, turn);
      n.belt.setAttribute('d', `M${f1(-wH - 2)} -6L${f1(wH + 2)} -6`);
      // the neck opening: a small round collar in the skin color (not from behind)
      const top = S.neck - S.hip, nx = turn * 8;
      n.neck.setAttribute('d', back ? '' : `M${f1(nx - 13)} ${top + 1}Q${f1(nx)} ${f1(top + 16 - turn * 4)} ${f1(nx + 13)} ${top + 1}Z`);

      // legs + shoes
      const hipX = lerp(S.hipX, S.hipXSide, turn);
      this.dressFeet(back ? 'back' : turn > 0.75 ? 'side' : turn > 0.25 ? 'three' : 'front');
      for (const [leg, foot, end, hx, ft] of [[n.leg1, n.foot1, p.l1, -hipX, p.f1], [n.leg2, n.foot2, p.l2, hipX, p.f2]]) {
        const nd = noodle(B([hx, -2]), end, end[2]);
        leg.o.setAttribute('d', nd.d); leg.f.setAttribute('d', nd.d);
        foot.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1] + 2)}) rotate(${f1(ft)})`);
      }

      // head
      const neck = B([lerp(0, S.headSide, turn), S.neck - S.hip]);
      n.head.setAttribute('transform', `translate(${f1(neck[0] + p.hx)} ${f1(neck[1] + p.hy)}) rotate(${f1(p.brot + p.hrot)})`);
      n.headInner.setAttribute('transform', `translate(0 ${-S.headUp})`);
      const ht = clamp(turn + p.ht, -1, 1), mirror = ht < 0 ? 'scale(-1 1)' : '';
      this.dressHead(Math.abs(ht), back);
      n.hairBack.setAttribute('transform', mirror); n.hairFront.setAttribute('transform', mirror); n.ears.setAttribute('transform', mirror);
      n.faceSlot.style.display = back ? 'none' : '';
      const f = n.faces[this.faceName];
      if (f && !back) {
        const k = 1 - Math.abs(ht) * 0.35;
        f.g.setAttribute('transform', `translate(${f1(ht * S.R * 0.42)} 0) scale(${f1(k * 100) / 100} 1)`);
        const look = f.look || [0, 0], lx = p.lx || look[0], ly = p.ly || look[1];
        f.pupils.forEach((pu) => pu.setAttribute('transform', `translate(${f1(lx * 4)} ${f1(ly * 4)})`));
        f.eyes.forEach((e) => e.setAttribute('transform', blink < 1 ? `translate(0 ${f1(e.cy)}) scale(1 ${f1(blink * 100) / 100}) translate(0 ${f1(-e.cy)})` : ''));
        // a near profile: the far eye slides behind the head
        const far = f.eyes[ht >= 0 ? 1 : 0], near = f.eyes[ht >= 0 ? 0 : 1];
        far.style.opacity = String(clamp((0.85 - Math.abs(ht)) / 0.15)); near.style.opacity = '';
      }

      // arms: a turned view draws the far arm (a2) behind the body, the near one in front
      const behind = p.behind >= 0.5;
      const an = anchors(turn, back), farView = isFar(turn, back);
      for (const [arm, end, anc, shape, rOver, hs, po, k] of [[n.arm1, p.a1, an[0], p.h1, p.r1, p.hs1, p.p1, 1], [n.arm2, p.a2, an[1], p.h2, p.r2, p.hs2, p.p2, 2]]) {
        const s = B(anc), far = farView && k === 2;
        const host = behind || far ? n.armBack : n.armFront;
        const big = this.bigOf(k, shape);
        const join = rOver != null && (big > 1 || shape === 'glove');
        const nd = join ? noodleTo(s, end, end[2], rOver) : noodle(s, end, end[2]);
        const hr = rOver == null ? nd.ang : rOver;
        arm.o.setAttribute('d', nd.d); arm.f.setAttribute('d', nd.d);
        const sl = pathOf(splitAt(nd.c, 0.26));
        arm.sO.setAttribute('d', sl); arm.sF.setAttribute('d', sl);
        const key = `${shape}:${big}`;
        if (arm.shape !== key) {
          arm.handInner.innerHTML = '';
          arm.handInner.append((HANDS[shape] || HANDS.ball)(this.c, OUT / Math.max(1, big)));
          arm.shape = key;
        }
        const sc = f1(hs * big * 1000) / 1000;
        arm.hand.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1])}) rotate(${f1(hr + 90)}) scale(${sc})`);
        arm.prop.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1])}) rotate(${f1(hr + po[2])}) translate(${po[0]} ${po[1]})`);
        arm.ang = hr; arm.end = end; arm.hs = hs; arm.big = big; arm.gesture = shape;
        arm.root.dataset.arm = far ? 'far' : 'near';
        if (arm.root.parentNode !== host) host.append(arm.root);
      }
      const r1 = n.arm1.root, r2 = n.arm2.root;
      if (r1.parentNode === r2.parentNode) {
        const topA = p.front1 >= 0.5 && !behind, last = r1.parentNode.lastChild;
        if (topA && last !== r1) r1.parentNode.append(r1);
        else if (!topA && last !== r2) r2.parentNode.append(r2);
      }
    }

    // Shoes per view: a rounded shoe, its toe pointing forward (+x) in the turned views.
    dressFeet(view) {
      if (view === this.feetKey) return;
      this.feetKey = view;
      for (const k of [1, 2]) {
        const node = this.n[`foot${k}`];
        node.innerHTML = '';
        const dx = view === 'side' ? 10 : view === 'three' ? 6 : 0;
        const w = view === 'side' || view === 'three' ? 21 : 15;
        node.append(
          el('path', { d: `M${-w + dx - 6} 2Q${-w + dx - 6} -14 ${dx - 4} -14Q${w + dx + 4} -14 ${w + dx + 6} 0Q${w + dx + 6} 6 ${w + dx} 6L${-w + dx} 6Q${-w + dx - 6} 6 ${-w + dx - 6} 2Z`, fill: this.c.shoe, ...ink }),
          el('path', { d: `M${-w + dx - 3} 3.5L${w + dx + 3} 3.5`, fill: 'none', stroke: T('shoe-sole'), 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
      }
    }

    // Scene coordinates of the middle of a hand and its radius (scene units).
    handMid(k) {
      const arm = this.n[`arm${k}`], e = arm.end || this.cur[`a${k}`];
      const [m] = HAND_MID[arm.gesture] || HAND_MID.ball, s = (arm.hs || 1) * (arm.big || 1), a = (arm.ang || 0) * D2R;
      return this.world([e[0] + Math.cos(a) * m * s, e[1] + Math.sin(a) * m * s]);
    }
    handRadius(k) {
      const arm = this.n[`arm${k}`];
      const [, r] = HAND_MID[arm.gesture] || HAND_MID.ball;
      return r * (arm.hs || 1) * (arm.big || 1) * this.placeAt[2];
    }
    // Scene coordinates of a hand, or of a point on its held prop ([along, across] in the prop frame, e.g. a muzzle).
    handPoint(k, local = null) {
      const arm = this.n[`arm${k}`], p = this.cur;
      const end = arm.end || p[`a${k}`];
      if (!local) return this.world(end);
      const po = p[`p${k}`], a = (arm.ang + po[2]) * D2R;
      const lx = local[0] + po[0], ly = local[1] + po[1];
      return this.world([end[0] + lx * Math.cos(a) - ly * Math.sin(a), end[1] + lx * Math.sin(a) + ly * Math.cos(a)]);
    }
    headPoint() {
      const p = this.cur;
      return this.world([p.bx + p.hx, S.neck + p.by + p.hy - S.headUp]);
    }
  }

  // ---------------- avatars and stills ----------------
  const lookOf = (who, side) => (who && typeof who === 'object' ? validLook(who) : lookFor(who === 'opp' ? 'opp' : side));
  // Static SVG markup: a head disc (head + shoulders), or with body: true the whole figure (feet on the bottom edge).
  function avatarSvg(who, side = 'you', { face = null, body = false, pose = null, flip = false, mood = null } = {}) {
    const look = lookOf(who, side);
    const r = new Rig({ side, idle: false, look, flip });
    if (pose) r.set(pose);
    if (mood) r.mood(mood); else r.face(face || 'smile', true);
    r.destroy();
    let svg;
    if (body) svg = K.el('svg', { viewBox: '-170 -352 340 372', class: 'figure-avatar-svg figure-figure-svg', 'aria-hidden': 'true' });
    else {
      const cy = S.neck - S.headUp + 10, size = 176;
      svg = K.el('svg', { viewBox: `${-size / 2} ${f1(cy - size / 2)} ${size} ${size}`, class: 'figure-avatar-svg', 'aria-hidden': 'true' });
      r.n.shadow.remove(); r.n.legs.remove(); r.n.armBack.remove(); r.n.armFront.remove();
    }
    svg.append(r.root);
    return svg.outerHTML;
  }
  // A LIVE idle figure filling host: { svg, rig, set(who), destroy() }. who: 'you' / 'opp' (follow the store) or a look.
  function stage(host, who = 'you', { pose = 'idle', mood = 'idle', idle = true, flip = false } = {}) {
    const svg = K.el('svg', { viewBox: '-190 -380 380 404', class: 'figure-stage', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' });
    let rig = null;
    const make = (w) => {
      if (rig) { rig.destroy(); rig.root.remove(); }
      const follow = w === 'you' || w === 'opp';
      rig = create(follow ? { side: w, pose, idle, flip, mood } : { look: validLook(w), pose, idle, flip, mood });
      svg.append(rig.root);
      api.rig = rig;
    };
    const api = { svg, rig: null, set(w) { make(w); return api; }, destroy() { rig?.destroy(); svg.remove(); } };
    make(who);
    host.innerHTML = '';
    host.append(svg);
    return api;
  }
  // A hand icon for the controls (Rock / Paper / Scissors) in my skin tone.
  function handSvg(gesture) {
    const look = lookFor('you');
    const node = (HANDS[gesture] || HANDS.ball)({ skin: T(look.skin) }, 3);
    const box = gesture === 'rock' ? '-34 -54 68 68' : '-42 -90 84 96';
    return K.el('svg', { viewBox: box, class: 'ico figure-hand' }, node).outerHTML;
  }
  const handIcon = (gesture) => `<span class="figure-hand-wrap" data-figure-hand="${gesture}">${handSvg(gesture)}</span>`;

  // Fills every [data-figure] element: data-figure="you|opp" follows the store, data-look pins a look.
  function paintAvatars(rootEl = document) {
    rootEl.querySelectorAll('[data-figure-hand]').forEach((node) => {
      const key = lookFor('you').skin;
      if (node.dataset.painted === key) return;
      node.dataset.painted = key;
      node.innerHTML = handSvg(node.dataset.figureHand);
    });
    rootEl.querySelectorAll('[data-figure]').forEach((node) => {
      let who = null;
      if (node.dataset.look) { try { who = JSON.parse(node.dataset.look); } catch { who = null; } }
      const side = node.dataset.figure === 'opp' ? 'opp' : 'you';
      const look = lookOf(who, side), body = node.dataset.body === '1';
      const key = JSON.stringify([look, body]);
      if (node.dataset.painted === key) return;
      node.dataset.painted = key;
      node.innerHTML = avatarSvg(look, side, { body });
    });
  }

  // Look changes (mine, the opponent's) re-dress every live rig and avatar that follows them.
  window.DuelAvatar?.onChange?.(() => {
    for (const r of live) if (!r.dead) r.syncLook();
    paintAvatars();
  });

  window.DuelFigures = {
    skin: () => SKIN, ids: () => ['human'], create, POSES, REST, resolve, EASE, avatarSvg, stage, paintAvatars, handIcon, handSvg,
    noodle, noodleTo, HANDS, OUT, FACES, HAIR, blend, arcOf, bowedAt, bez, shoulderOf, torso,
    liveRigs: () => [...live].filter((r) => !r.dead),
  };
})();
