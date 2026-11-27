// Character rig: rubber-hose cartoon people drawn in code (plain SVG), built the way the original game built its
// mascots: an egg-shaped body (the T-shirt, the trousers band at the bottom), a big round head sitting on it (the human
// skin, figures/human.js: ears, hair, faces with big eyes), noodle legs and arms.
// Load after scenes/kit.js, figures/avatar.js, figures/figure-art.js and figures/human.js.
//
// A character is built from layered parts: legs + shoes, the body, the head (hair behind, ears, the head, the face,
// hair in front) and two NOODLE arms (one cubic Bezier each, no elbows) ending in hands that can hold a prop. The
// hands and the shoes are the ChatGPT hand and shoe sheets traced into paths (tools/trace-figures.js -> figure-art.js). Character space: the origin is on the ground between the feet, y grows down, about 330 units tall.
// Profile views face right; a mirrored rig (flip) faces left.
//
// Poses are data (see REST / POSES): limb endpoints + body/head transforms. rig.to(pose, ms) interpolates every number
// with easing, so the noodles bend smoothly between poses; discrete fields (hand shapes, back view) switch halfway.
// Idle life on top of any pose: breathing and a slight noodle wobble. Reduced motion: no idle loops.
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
  // (the original game's mascot proportions; the body is an egg: bodyTop = its half-width near the top, bodyRx at the
  // belly, front / profile)
  const H = () => window.DuelHuman;
  const S = {
    hip: -74, neck: -178, shoulder: -163, belly: -98, bottom: -58,
    bodyRx: 46, bodyRxSide: 40, bodyTop: 24, bodyTopSide: 22,
    hipX: 20, hipXSide: 6, headSide: 6, headUp: 70, R: 70,
  };
  const SKIN = { id: 'human', skel: S, armW: 15, legW: 17 };
  const FA = () => window.DuelFigureArt || null;
  // the trousers band: the lowest BAND part of the body
  const BAND = 0.2;
  // the shoes: drawn SHOE_K x their traced size, the sole SOLE_DY below the leg's end (a pose's feet end 10 above the
  // ground)
  const SHOE_K = 1.3, SOLE_DY = 10;

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
    exact1: 0, exact2: 0,               // 1 = the hand stays exactly at a1 / a2 (no reach limit, see REACH): a hand on a prop
    over1: 0, over2: 0,                 // 1 = that arm is drawn IN FRONT of the body from its anchor under a short sleeve
                                        // (a far arm reaching across the table, a hand in front of the chest)
  };
  const DISCRETE = new Set(['h1', 'h2', 'back', 'front1', 'behind', 'exact1', 'exact2', 'over1', 'over2']);

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

  // The body in body space (origin at the hip center, y down): an egg (the original game's egg), narrower at the top,
  // widest at the belly, narrowing from front to profile. egg() gives the path, torsoPts(turn) its outline sampled into
  // points (cached per turn bucket; the arms measure the body's edge on it), torso(turn) the path for a turn.
  function egg(rxT, rx, top, mid, bot) {
    const k = 0.56, P = (x, y) => `${f1(x)} ${f1(y)}`;
    return `M${P(0, top)}C${P(rxT, top)} ${P(rx, mid - (mid - top) * k)} ${P(rx, mid)}`
      + `C${P(rx, mid + (bot - mid) * k)} ${P(rx * k, bot)} ${P(0, bot)}`
      + `C${P(-rx * k, bot)} ${P(-rx, mid + (bot - mid) * k)} ${P(-rx, mid)}`
      + `C${P(-rx, mid - (mid - top) * k)} ${P(-rxT, top)} ${P(0, top)}Z`;
  }
  const eggOf = (turn) => {
    const t = Math.round(clamp(turn) * 20) / 20;
    return [lerp(S.bodyTop, S.bodyTopSide, t), lerp(S.bodyRx, S.bodyRxSide, t), S.neck - S.hip, S.belly - S.hip, S.bottom - S.hip];
  };
  const TORSOS = new Map();
  function torsoPts(turn) {
    const key = Math.round(clamp(turn) * 20);
    if (TORSOS.has(key)) return TORSOS.get(key);
    const [rxT, rx, top, mid, bot] = eggOf(turn), k = 0.56, out = [];
    const segs = [[[0, top], [rxT, top], [rx, mid - (mid - top) * k], [rx, mid]], [[rx, mid], [rx, mid + (bot - mid) * k], [rx * k, bot], [0, bot]]];
    for (const c of segs) for (let i = 0; i < 24; i++) out.push(bez(c, i / 24));
    const right = out.slice();
    for (let i = right.length - 1; i > 0; i--) out.push([-right[i][0], right[i][1]]);
    out.band = bot - (bot - top) * BAND;
    TORSOS.set(key, out);
    return out;
  }
  const torso = (turn) => egg(...eggOf(turn));
  // The torso's half-width at the height y (body space), measured on its outline (the wider side); -1 above or below
  // it. inTorso(turn, [x, y]): whether a body-space point lies inside the outline.
  function edgeAt(turn, y) {
    const pts = torsoPts(turn);
    let best = -1;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) best = Math.max(best, Math.abs(y1 === y0 ? Math.max(Math.abs(x0), Math.abs(x1)) : lerp(x0, x1, (y - y0) / (y1 - y0))));
    }
    return best;
  }
  const inTorso = (turn, [x, y]) => Math.abs(x) < edgeAt(turn, y);

  // The arms (after the Verso rig's final arms). A TURNED view (turn >= ARMS.farTurn, not from the back): a1 is the
  // NEAR arm, starting on the top corner of the torso just below the head, drawn in front of the body with its root
  // under a short sleeve; a2 is the FAR arm, its root hidden inside the torso, drawn behind the body with a small
  // sleeve band where it leaves it. A FRONT or BACK view: both arms are TUCKED behind the torso, their roots just
  // inside the body edge a little below the shoulder line, so the body outline runs over them, each with a sleeve band
  // reaching band units past where the arm leaves the body; an arm whose hand is in front of the body is drawn in
  // front instead (from the same anchor, under a short sleeve). The anchors slide between the views, so no root jumps.
  const ARMS = {
    farTurn: 0.1, IN: 12,
    far: { e: 0.12, inset: 18, bend: 0.14, band: 8, bandW: 1 },
    front: { e: 0.06, inset: 4, band: 13, bandW: 3 },
    sleeve: 0.24, sleeveMax: 24,
  };
  // a body-space point at e of the way from the shoulder line down to the belly, inset units inside the body edge
  function armAt(turn, e, inset) {
    const y = S.shoulder - S.hip + e * (S.belly - S.shoulder);
    return [edgeAt(turn, y) - inset, y];
  }
  // The shoulder anchors in body space: [a1, a2] (see ARMS).
  function anchors(turn, back) {
    const tk = armAt(turn, ARMS.front.e, ARMS.front.inset);
    if (back) return [[-tk[0], tk[1]], [tk[0], tk[1]]];
    const yS = S.shoulder - S.hip + 7, edge = edgeAt(turn, yS);
    const t1 = clamp(turn / 0.55), t2 = clamp((turn - 0.55) / 0.45);
    const corner = [-(edge - ARMS.IN - 3 * t1), yS - 2 * t1];
    const near = turn <= 0.55 ? corner : [lerp(corner[0], -4, t2), lerp(corner[1], yS - 3, t2)];
    const fa = armAt(turn, ARMS.far.e, ARMS.far.inset);
    if (turn < ARMS.farTurn) {
      const f = turn / ARMS.farTurn;
      return [[lerp(-tk[0], near[0], f), lerp(tk[1], near[1], f)], [lerp(tk[0], fa[0], f), lerp(tk[1], fa[1], f)]];
    }
    return [near, fa];
  }
  const isFar = (turn, back) => !back && turn >= ARMS.farTurn;
  // The arms' reach: a hand farther than soft from its shoulder is pulled back along the arm (only k of the extra
  // length is kept), so a stretched arm stays about as long as the body allows. A pose's exact1 / exact2 keeps a hand
  // where it is (a hand on a prop). handOf(pose, k) gives scenes the drawn hand point.
  const REACH = { soft: 122, k: 0.35 };
  function capReach(s, e, exact) {
    if (exact) return e;
    const dx = e[0] - s[0], dy = e[1] - s[1], L = Math.hypot(dx, dy);
    if (L <= REACH.soft) return e;
    const f = (REACH.soft + (L - REACH.soft) * REACH.k) / L;
    return [s[0] + dx * f, s[1] + dy * f, ...e.slice(2)];
  }

  // A band along the cubic c from t = 0 to t1: half-width hw(u) (u = 0..1 along it), the outline OUT wider, the end
  // rounded off. Returns { inner, outer } closed paths. Its start is never seen (inside the body or under a cover).
  // flat: the far end is cut straight across (a band that runs on into the arm, the wrist widening), so no outline
  // crosses the arm there.
  function band(c, t1, hw, flat = false) {
    const N = 14, L = [], R = [], Lo = [], Ro = [];
    let last = null;
    for (let i = 0; i <= N; i++) {
      const u = i / N, t = t1 * u, p = bez(c, t), q = bez(c, Math.min(1, t + 0.01)), q0 = bez(c, Math.max(0, t - 0.01));
      let dx = q[0] - q0[0], dy = q[1] - q0[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = hw(u), nx = -dy, ny = dx;
      L.push([p[0] + nx * w, p[1] + ny * w]); R.push([p[0] - nx * w, p[1] - ny * w]);
      Lo.push([p[0] + nx * (w + OUT), p[1] + ny * (w + OUT)]); Ro.push([p[0] - nx * (w + OUT), p[1] - ny * (w + OUT)]);
      last = [p, dx, dy];
    }
    const [p, dx, dy] = last;
    const pts = (A) => A.map((q) => `${f1(q[0])} ${f1(q[1])}`).join('L');
    // a soft rounded end: the two sides meet over a short bulge past the end point
    const end = (A, B, k) => { const a = A[A.length - 1], b = B[B.length - 1]; return `Q${f1(a[0] + dx * k)} ${f1(a[1] + dy * k)} ${f1(p[0] + dx * k)} ${f1(p[1] + dy * k)}Q${f1(b[0] + dx * k)} ${f1(b[1] + dy * k)} ${f1(b[0])} ${f1(b[1])}`; };
    const poly = (A, B, k) => `M${pts(A)}${end(A, B, k)}L${pts(B.slice().reverse())}Z`;
    const w = hw(1);
    // (the skin runs 3 units past the outline's straight end, so no dark seam shows across the arm)
    if (flat) {
      const ext = (A) => { const q = A[A.length - 1]; return [...A, [q[0] + dx * 3, q[1] + dy * 3]]; };
      return { inner: `M${pts(ext(L))}L${pts(ext(R).reverse())}Z`, outer: `M${pts(Lo)}L${pts(Ro.slice().reverse())}Z` };
    }
    return { inner: poly(L, R, w * 0.35), outer: poly(Lo, Ro, w * 0.35 + OUT * 0.9) };
  }
  // the parameter t at the arc length d along the cubic c, and the whole length
  function arcOfCubic(c) {
    const N = 48, acc = [0];
    let prev = c[0];
    for (let i = 1; i <= N; i++) { const p = bez(c, i / N); acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
    const len = acc[N];
    const at = (d) => { if (d >= len) return 1; let i = 1; while (acc[i] < d) i++; return (i - 1 + (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1)) / N; };
    return { len, at };
  }

  // The character-space point of arm k's shoulder for a pose (no idle life; seated poses in their seat-relative limb
  // coordinates). Scenes aim an arm from it (a gun arm).
  function shoulderOf(_sp, pose, k) {
    const p = resolve(pose), turn = clamp(p.turn), back = p.back >= 0.5;
    const an = anchors(turn, back)[k - 1];
    const a = p.brot * D2R, yy = an[1] * p.bsy;
    return [p.bx + an[0] * Math.cos(a) - yy * Math.sin(a), S.hip + p.by + an[0] * Math.sin(a) + yy * Math.cos(a) - S.bottom * (p.sit || 0)];
  }
  // The point where arm k's hand is drawn for a pose (a1 / a2 after the reach limit, REACH; same coordinates).
  function handOf(pose, k) {
    const p = resolve(pose);
    return capReach(shoulderOf(null, p, k), p[`a${k}`], p[`exact${k}`] >= 0.5).slice(0, 2);
  }

  // ---------------- traced art pieces ----------------
  // A piece from figure-art.js: the silhouette in the outline color (the gaps between the fills are the drawn lines),
  // the color areas on top, each class filled by fillOf(class).
  function artPiece(pc, fillOf, attrs = {}) {
    const node = g(attrs, el('path', { d: pc.s, fill: T('outline'), 'fill-rule': 'evenodd' }));
    for (const [cls, d] of pc.f) node.append(el('path', { d, fill: fillOf(cls), 'fill-rule': 'evenodd' }));
    return node;
  }
  const classFill = (c) => (cls) => ({ skin: c.skin, hair: c.hair, shirt: c.shirt, shoe: c.shoe, sole: T('shoe-sole'), glove: T('glove'), band: T('glove-band'), white: T('eye'), mouth: T('mouth'), tongue: T('tongue'), cheek: T('cheek'), pants: c.pants }[cls] || T('outline'));

  // ---------------- hands (fingers toward -y, the wrist at the origin) ----------------
  // One outlined shape from several parts: the outlines under, the fills on top (the fallback while the art is missing).
  function blobs(shapes, fill, w) {
    const o = g({}), f = g({});
    for (const [tag, a] of shapes) {
      o.append(el(tag, { ...a, fill: T('outline'), stroke: T('outline'), 'stroke-width': w * 2, 'stroke-linejoin': 'round' }));
      f.append(el(tag, { ...a, fill }));
    }
    return g({}, o, f);
  }
  const cir = (cx, cy, r) => ['circle', { cx, cy, r }];
  // The hands are the hand sheet traced (figure-art.js hands: the back of the hand, a short wrist stub on the arm's
  // line): the silhouette, stroked at the rig's outline weight everywhere but across the wrist (where the arm joins),
  // and the skin (the keeper's glove and its wrist band) on top. Each shape the scenes ask for maps to a drawing.
  const HS = () => FA()?.hands || {};
  const SHAPE_OF = { ball: 'ready', fist: 'grip', ready: 'ready', rock: 'rock', paper: 'paper', open: 'open', scissors: 'scissors', point: 'scissors', glove: 'glove' };
  function traced(shape, c, w) {
    const s = HS()[SHAPE_OF[shape] || 'ready'];
    if (!s) return blobs([cir(0, -14, 15)], c.skin, w);
    const fill = classFill(c);
    return g({},
      el('path', { d: s.s, fill: T('outline'), 'fill-rule': 'evenodd' }),
      el('path', { d: s.open, fill: 'none', stroke: T('outline'), 'stroke-width': f1(w), 'stroke-linejoin': 'round', 'stroke-linecap': 'butt' }),
      ...s.f.map(([cls, d]) => el('path', { d, fill: fill(cls), 'fill-rule': 'evenodd' })),
      // the wrist: the skin runs on into the arm (no dark sliver along the cut)
      el('rect', { x: f1(-s.wi + 0.4), y: -4, width: f1(s.wi * 2 - 0.8), height: 6.5, fill: c.skin }));
  }
  // the wrist stub's half-widths [inner, outer] of a shape at scale 1 (the arm widens into them, see apply)
  const wristOf = (shape) => { const s = HS()[SHAPE_OF[shape] || 'ready']; return s ? [s.wi, s.wo] : [SKIN.armW / 2, SKIN.armW / 2 + OUT]; };
  const HANDS = Object.fromEntries(Object.keys(SHAPE_OF).map((shape) => [shape, (c, w) => traced(shape, c, w)]));
  // the middle of a hand along the arm (hand frame -y) and its radius (character units at scale 1)
  const handMidOf = (shape) => { const s = HS()[SHAPE_OF[shape] || 'ready']; return s ? [s.mid, s.r] : [14, 15]; };
  const HAND_MID = Object.fromEntries(Object.keys(SHAPE_OF).map((shape) => [shape, null]));
  for (const shape of Object.keys(HAND_MID)) Object.defineProperty(HAND_MID, shape, { get: () => handMidOf(shape), enumerable: true });

  // ---------------- heads and faces ----------------
  // The human skin (figures/human.js): the head, the ears, the hair styles and the faces.
  const HAIR = (window.DuelHuman && window.DuelHuman.HAIR) || { short: 'Short', crop: 'Crop', buzz: 'Buzz', spiky: 'Spiky', curly: 'Curly', long: 'Long', bun: 'Bun', ponytail: 'Ponytail' };
  // neutral, focus, smile, think, grin, joy, oops, sad, meh, shock (expressions.js says which shows when)
  const FACES = Object.fromEntries(['neutral', 'focus', 'smile', 'think', 'grin', 'joy', 'oops', 'sad', 'meh', 'shock'].map((n) => [n, n]));
  const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
  const ellipse = (cx, cy, rx, ry) => ['ellipse', { cx, cy, rx, ry }];
  const helpers = (id) => ({ id, el, g, ink, T, circle, ellipse, blob: (shapes, fill, w = OUT) => blobs(shapes, fill, w) });

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
      // the tucked arms (front / back views): over the legs and the head (a raised hand never hides behind the head),
      // masked out of the body (grown by half its outline), so they come out from behind the body's outline
      n.armMaskBody = el('path', { fill: 'black', stroke: 'black', 'stroke-width': OUT, 'stroke-linejoin': 'round' });
      n.armMask = el('mask', { id: `${id}-arms`, maskUnits: 'userSpaceOnUse', x: -4000, y: -4000, width: 8000, height: 8000 },
        el('rect', { x: -4000, y: -4000, width: 8000, height: 8000, fill: 'white' }), n.armMaskBody);
      n.armMid = g({ class: 'rig-arms-tucked', mask: `url(#${id}-arms)` });
      n.legs = g({}); n.body = g({}); n.head = g({});
      n.all.append(el('defs', {}, n.armMask), n.armBack, n.legs, n.body, n.head, n.armMid, n.armFront);
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

      // body: the egg in the shirt color, the trousers band at the bottom (clipped to it), the outline on top
      n.clip = el('clipPath', { id: `${id}-body` }, el('path', {}));
      n.bodyPath = el('path', { fill: c.shirt });
      n.pants = el('rect', { x: -80, y: 0, width: 160, height: 60, fill: c.pants, 'clip-path': `url(#${id}-body)` });
      n.belt = el('path', { fill: 'none', ...ink, 'stroke-width': 3.5, 'clip-path': `url(#${id}-body)` });
      n.bodyEdge = el('path', { fill: 'none', ...ink });
      n.body.append(el('defs', {}, n.clip), n.bodyPath, n.pants, n.belt, n.bodyEdge);

      // head (figures/human.js): hair behind + ears, the head, the face (every expression built once, one shown), the
      // hair in front
      n.headInner = g({ class: 'rig-head' });
      n.head.append(n.headInner);
      const hh = helpers(id);
      n.hp = H().head(c, hh);
      n.faces = {};
      for (const [name, mk] of Object.entries(H().faces)) {
        const f = mk(c, hh);
        f.g.style.display = 'none';
        n.faces[name] = f;
        n.hp.faceSlot.append(f.g);
      }
      n.headInner.append(n.hp.back, n.hp.shape, n.hp.face, n.hp.front);
      this.hairKey = null;

      // arms: outline + fill noodle, the short sleeve (shirt color) over the arm's root, the held prop, the hand
      const arm = (k) => {
        const l = limb(SKIN.armW, c.skin);
        // the sleeve: a band in the shirt color along the arm's root; on a front arm a cover in the same color over
        // its root inside the shoulder (clipped to the body), so no outline ring shows where the sleeve starts
        const sO = el('path', { fill: T('outline') });
        const sF = el('path', { fill: c.shirt });
        const coverE = el('ellipse', { fill: c.shirt });
        const cover = g({ class: 'rig-sleeve-cover', 'clip-path': `url(#${id}-body)` }, coverE);
        const sleeve = g({ class: 'rig-sleeve' }, sO, sF, cover);
        const prop = g({}); const propInner = g({}); prop.append(propInner);
        const hand = g({}); const handInner = g({}); hand.append(handInner);
        // the forearm widening into the hand's wrist over its last stretch (the outline, then the skin)
        const tO = el('path', { fill: T('outline') }), tF = el('path', { fill: c.skin });
        const taper = g({ class: 'rig-wrist' }, tO, tF);
        const root = g({ class: `rig-arm rig-arm${k}` }, l.g, taper, sleeve, prop, hand);
        return { ...l, sO, sF, sleeve, cover, coverE, tO, tF, root, prop, propInner, hand, handInner, shape: null };
      };
      n.arm1 = arm(1); n.arm2 = arm(2);
      n.armMid.append(n.arm1.root, n.arm2.root);
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
      if (!FACES[name]) name = 'neutral';
      if (name === this.faceName && !force) return this;
      for (const [k, f] of Object.entries(this.n.faces)) f.g.style.display = k === name ? '' : 'none';
      this.faceName = name;
      // place the new face for the current view and gaze right away (with reduced motion no idle frame would, and the
      // face stayed centered, looking at the camera, until the next tween)
      if (this.cur && !this.dead) this.apply(this.cur, performance.now());
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

    // The hair for a view (rebuilt when the look, the back view or the quantized head turn changes; a head turned left
    // draws the right-facing hair mirrored).
    dressHead(turn, back) {
      const q = Math.round(Math.abs(turn) * 10) / 10;
      const key = `${this.look.hair}:${back ? 1 : 0}:${q}`;
      if (key !== this.hairKey) {
        this.hairKey = key;
        const hp = this.n.hp, hr = H().hair(this.look.hair, q, back, this.c, helpers(`rig${this.id}`));
        hp.hairBack.innerHTML = ''; hp.hairFront.innerHTML = '';
        hp.hairBack.append(...hr.behind); hp.hairFront.append(...hr.front);
      }
      const m = turn < 0 && !back ? 'scale(-1 1)' : '';
      this.n.hp.hairBack.setAttribute('transform', m); this.n.hp.hairFront.setAttribute('transform', m);
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
        if (f && f.blink !== false) {
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
      const d = torso(turn), tp = torsoPts(turn);
      n.bodyPath.setAttribute('d', d); n.clip.firstChild.setAttribute('d', d); n.bodyEdge.setAttribute('d', d);
      // the trousers band from the band line down, its top a gentle curve
      const by = tp.band, bw = edgeAt(turn, by) + 6;
      n.pants.setAttribute('y', f1(by));
      n.belt.setAttribute('d', `M${f1(-bw)} ${f1(by - 1)}Q0 ${f1(by + 4)} ${f1(bw)} ${f1(by - 1)}`);

      // legs + shoes
      const hipX = lerp(S.hipX, S.hipXSide, turn);
      this.dressFeet(back ? 'back' : turn > 0.75 ? 'side' : turn > 0.25 ? 'three' : 'front');
      for (const [leg, foot, end, hx, ft] of [[n.leg1, n.foot1, p.l1, -hipX, p.f1], [n.leg2, n.foot2, p.l2, hipX, p.f2]]) {
        const nd = noodle(B([hx, -2]), end, end[2]);
        leg.o.setAttribute('d', nd.d); leg.f.setAttribute('d', nd.d);
        foot.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1] + SOLE_DY)}) rotate(${f1(ft)})`);
      }

      // head
      const neck = B([lerp(0, S.headSide, turn), S.neck - S.hip]);
      n.head.setAttribute('transform', `translate(${f1(neck[0] + p.hx)} ${f1(neck[1] + p.hy)}) rotate(${f1(p.brot + p.hrot)})`);
      n.headInner.setAttribute('transform', `translate(0 ${-S.headUp})`);
      const ht = clamp(turn + p.ht, -1, 1);
      H().turnHead(n.hp, ht, back);
      this.dressHead(ht, back);
      const f = n.faces[this.faceName];
      if (f && !back) {
        const look = f.look || [0, 0], lx = p.lx || look[0], ly = p.ly || look[1];
        f.pupils?.forEach((pu) => pu.setAttribute('transform', `translate(${f1(lx * (f.lookR || 4))} ${f1(ly * (f.lookR || 4))})`));
        f.eyes?.forEach((e) => e.setAttribute('transform', blink < 1 ? `translate(0 ${f1(e.cy || 0)}) scale(1 ${f1(blink * 100) / 100}) translate(0 ${f1(-(e.cy || 0))})` : ''));
        // a near profile: the far eye (on the side the face turns to) is behind the nose
        if (f.eyes?.length === 2) {
          const far = f.eyes[ht >= 0 ? 1 : 0], near = f.eyes[ht >= 0 ? 0 : 1];
          far.style.display = Math.abs(ht) > 0.86 ? 'none' : ''; near.style.display = '';
        }
      }

      // arms (ARMS): a turned view draws the near arm (a1) in front under a short sleeve and the far arm (a2) behind
      // the body; a front / back view tucks both behind the torso (an arm whose hand is in front of the body is drawn
      // in front instead); behind: 1 puts both behind the body
      const behind = p.behind >= 0.5;
      const an = anchors(turn, back), farView = isFar(turn, back);
      const bodyT = n.body.getAttribute('transform');
      n.armMaskBody.setAttribute('d', d); n.armMaskBody.setAttribute('transform', bodyT);
      // body space of a character-space point (the inverse of B)
      const toBody = ([x, y]) => { const dx = x - p.bx, dy = y - (S.hip + p.by); return [dx * ca + dy * sa, (-dx * sa + dy * ca) / p.bsy]; };
      for (let [arm, end0, anc, shape, rOver, hs, po, k] of [[n.arm1, p.a1, an[0], p.h1, p.r1, p.hs1, p.p1, 1], [n.arm2, p.a2, an[1], p.h2, p.r2, p.hs2, p.p2, 2]]) {
        const over = !behind && p[`over${k}`] >= 0.5;
        // a far arm drawn in front starts on the leading shoulder corner (the near arm's corner, mirrored)
        if (over && farView && k === 2) { const yS = S.shoulder - S.hip + 15; anc = [edgeAt(turn, yS) - ARMS.IN - 5, yS]; }
        const s = B(anc), far = farView && k === 2 && !over;
        end0 = capReach(s, end0, p[`exact${k}`] >= 0.5);
        const handIn = !behind && !far && !back && inTorso(turn, toBody(end0));
        const front = over || (!behind && !far && (farView ? k === 1 : handIn));
        const tucked = !front;
        const host = front ? n.armFront : behind || far ? n.armBack : n.armMid;
        const end = far ? [end0[0], end0[1], clamp(end0[2], -ARMS.far.bend, ARMS.far.bend)] : end0;
        const big = this.bigOf(k, shape);
        // a hand with its own angle: the forearm arrives along it, so the wrist never bends sideways
        const join = rOver != null;
        const nd = join ? noodleTo(s, end, end[2], rOver) : noodle(s, end, end[2]);
        const hr = rOver == null ? nd.ang : rOver;
        arm.o.setAttribute('d', nd.d); arm.f.setAttribute('d', nd.d);
        // the forearm widens into the hand's wrist over its last stretch (the drawn hands' wrists are a little wider
        // than the arm, much wider when a hand is drawn big)
        {
          const sc0 = hs * big, [wi] = wristOf(shape), hwW = wi * sc0, hwA = SKIN.armW / 2;
          if (hwW > hwA + 0.5) {
            const rc = [nd.c[3], nd.c[2], nd.c[1], nd.c[0]], RA = arcOfCubic(rc);
            const L = Math.min(RA.len * 0.4, 5 + 9 * (sc0 - 1) + 4 * (hwW - hwA));
            const tb = band(rc, RA.at(L), (u) => lerp(hwW, hwA, u * u * (3 - 2 * u)), true);
            arm.tO.setAttribute('d', tb.outer); arm.tF.setAttribute('d', tb.inner);
          } else { arm.tO.setAttribute('d', ''); arm.tF.setAttribute('d', ''); }
        }
        // the sleeve: a front arm's short sleeve from the shoulder (its root under the cover); a tucked arm's band
        // from its hidden root to a little past where it leaves the body
        const A = arcOfCubic(nd.c), w = SKIN.armW / 2;
        let sb = null;
        if (front) {
          const len = Math.min(ARMS.sleeveMax, A.len * ARMS.sleeve);
          sb = band(nd.c, A.at(len), (u) => w + 4 + 1.5 * u);
          arm.cover.setAttribute('transform', bodyT);
          arm.coverE.setAttribute('cx', f1(anc[0])); arm.coverE.setAttribute('cy', f1(anc[1] + 2));
          arm.coverE.setAttribute('rx', f1(17 - 2 * turn)); arm.coverE.setAttribute('ry', 18);
          arm.cover.style.display = '';
        } else {
          arm.cover.style.display = 'none';
          const st = far ? ARMS.far : ARMS.front;
          let exitD = null;
          for (let dd = 2; dd <= A.len; dd += 2) if (!inTorso(turn, toBody(bez(nd.c, A.at(dd))))) { exitD = dd; break; }
          if (exitD != null) sb = band(nd.c, A.at(Math.min(A.len - 4, exitD + st.band)), (u) => w + st.bandW + 1.2 * u);
        }
        arm.sleeve.style.display = sb ? '' : 'none';
        if (sb) { arm.sO.setAttribute('d', sb.outer); arm.sF.setAttribute('d', sb.inner); }
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
        arm.root.dataset.arm = far ? 'far' : tucked ? 'tucked' : 'near';
        if (arm.root.parentNode !== host) host.append(arm.root);
      }
      const r1 = n.arm1.root, r2 = n.arm2.root;
      if (r1.parentNode === r2.parentNode) {
        const topA = p.front1 >= 0.5 && !behind, last = r1.parentNode.lastChild;
        if (topA && last !== r1) r1.parentNode.append(r1);
        else if (!topA && last !== r2) r2.parentNode.append(r2);
      }
    }

    // Shoes per view: the traced sneakers (figure-art.js shoes[view] = [left, right]), the ankle opening's middle on the
    // leg's end, the sole on the ground.
    dressFeet(view) {
      if (view === this.feetKey) return;
      this.feetKey = view;
      const art = FA()?.shoes?.[view];
      for (const k of [1, 2]) {
        const node = this.n[`foot${k}`];
        node.innerHTML = '';
        if (art) node.append(artPiece(art[k - 1], classFill(this.c), { transform: `scale(${SHOE_K})` }));
        else node.append(el('ellipse', { cx: 4, cy: -8, rx: 20, ry: 9, fill: this.c.shoe, ...ink }));
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
      const cy = S.neck - S.headUp + 4, size = 206;   // room for the widest hair (curly) and the tallest (spiky, bun)
      svg = K.el('svg', { viewBox: `${-size / 2} ${f1(cy - size / 2)} ${size} ${size}`, class: 'figure-avatar-svg', 'aria-hidden': 'true' });
      r.n.shadow.remove(); r.n.legs.remove(); r.n.armBack.remove(); r.n.armMid.remove(); r.n.armFront.remove();
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
    // a square box around the drawing (fingers up), with room for the outline
    const s = HS()[SHAPE_OF[gesture] || 'ready'];
    const [bx, by, bw, bh] = s ? s.box : [-34, -54, 68, 68], side = Math.max(bw, bh) + 8;
    const box = `${f1(bx + bw / 2 - side / 2)} ${f1(by + bh / 2 - side / 2)} ${f1(side)} ${f1(side)}`;
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
    noodle, noodleTo, HANDS, OUT, FACES, HAIR, blend, arcOf, bowedAt, bez, shoulderOf, handOf, torso,
    liveRigs: () => [...live].filter((r) => !r.dead),
  };
})();
