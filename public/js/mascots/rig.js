// Mascot rig: the code-drawn rubber-hose characters. This is the original game's rig (Verso), kept as it was: the same
// body, poses, arms, sleeves, hands, shoes, outfits and animation. This site has one species, the human
// (mascots/human.js); mascots/compat.js bridges it to the site (VersoKit = DuelKit, the look store), and
// figures/rig.js gives the scenes their DuelFigures API on top of it. The site's changes, all marked "(site)":
// per-player colors (skin.colorsFor(loadout): a human's skin tone, hair and shirt come with the loadout), no tail
// (skin.tail null), the far eye's side (skin.farEye), the sprite files' place (VersoKit.asset) and the outfit's color
// (outfits.js gets the loadout).
// Load after scenes/kit.js and mascots/compat.js + cosmetics.js; the species file (human.js) registers itself.
//
// A character is built from layered parts: tail, legs + feet (or shoes), body, head (ears, face, expression layer,
// hat), and two NOODLE arms (one cubic Bezier each, no elbows) ending in hands/paws that can hold a prop.
// Character space: the origin is on the ground between the feet, y grows down, about 330 units tall. Profile views
// face right; a mirrored rig (flip) faces left.
//
// Poses are data (see POSES below): limb endpoints + body/head transforms. rig.to(pose, ms) interpolates every number
// with easing, so the noodles bend smoothly between poses; discrete fields (hand shapes, back view) switch halfway.
// Idle life on top of any pose: breathing, blinking (unless the expression has closed eyes), tail sway and a slight
// noodle wobble. Reduced motion: no idle loops, tweens shortened (VersoKit timing).
//
// No team color on the mascot itself: the sides show in the match HUD and the scene lights. A character is
// { species, hat, outfit, feet }, and both players wear THEIR OWN: side 'you' = my species (VersoTeam.get()) + my
// loadout (VersoCosmetics.get()); side 'opp' = the opponent's character (VersoCosmetics.opponent(), species included,
// 'monkey' when unknown). Monkey vs monkey is fine. Changing my species or the opponent re-skins every live rig of that
// side in place (rig.setSpecies), keeping pose, props and loadout. create({ species, loadout }) pins a character.
//
// Cosmetics (public/js/mascots/cosmetics.js): every rig wears a loadout {hat, outfit, feet} (side 'you' / 'opp' from
// the store, or a fixed one: create({loadout}) / rig.setLoadout()). The hat is a sprite on the crown (view picked from
// the head turn), the shoes are drawn in code here (drawFoot), the outfit comes from public/js/mascots/outfits.js (see
// dressOutfit): body-shaped garments clipped to the body path with the body outline stroked again on top.
// The arms (see ARMS and SHOULDER). A TURNED view (turn >= ARMS.farTurn, not from the back; the owner's picks Shootout
// 6 / RPS 6, art-source/screens/arm-variants-2): a1 (toward screen -x, the side nearer the viewer) is the NEAR arm and
// a2 (+x, the side the character faces) the FAR arm. A near arm starts at its shoulder corner just below the head and is
// drawn in front of the body; the far arm starts INSIDE the torso just below the head and is drawn behind the body, so
// it comes out from behind the body edge, always with a gentle line (its bend is limited). A FRONT or BACK view (the
// picks front-idle 5 / kicker 3 / keeper 2, art-source/screens/arm-variants-3): both arms are TUCKED behind the torso,
// their roots just inside the body edge (ARMS.front, or the pose's arms set, e.g. Penalty's keeper), so the outline runs
// over them; they are drawn in their own layer OVER the legs and the head but clipped out of the body, so a raised arm
// never hides behind the head; a pose can put one in front (over1 / over2: a hand reaching toward us over the torso).
// Every garment has short sleeves in its sleeve color (outfits.js SLEEVE): a short sleeve over a front arm's joint, a
// band of the same color where a tucked arm leaves the body; no outfit = bare
// arms (test/arms.js checks every pose of every game). Hat API: hat(on),
// flingHat(ms) (the EQUIPPED hat flies off; nothing with 'none'), hatPop(ms) (hops off and lands back); while the
// character is upside-down the hat waits off-screen and pops back when it is upright again.
//
// Avatars and stills (HUD heads, profile window, leaderboard, customizer):
//   avatarSvg(who, side = 'you', { face, hat, body, pose, flip, loadout }) -> SVG markup. who = a character
//     { species, hat, outfit, feet } (drawn exactly so), a species id (+ opts.loadout), or null (the side's character
//     from the store). Default: the head (+ the top of the body and its outfit) for a round avatar disc;
//     hat: true adds the hat and headroom; body: true draws the whole figure (feet on the bottom edge).
//   paintAvatars(root) fills every [data-mascot] element: data-mascot="you" | "opp" follows the store, a species id is
//     fixed; data-character='{"species":..,"hat":..,"outfit":..,"feet":..}' (JSON) pins a whole character;
//     data-hat="1" / data-body="1" ask for the hat / the whole figure. Repainted when my species, my loadout or the
//     opponent changes.
//   stage(host, who, { pose, mood, idle, flip }) -> { svg, rig, set(who), destroy() }: a LIVE idle figure filling host
//     (the customizer preview, the profile window). who as in avatarSvg, or 'you' / 'opp' to follow the store.
//
// The tail is ONE path per species (skin.tail.d, taken from the back view of the reference sheet). Every view only
// transforms that same path (skin.tail.at[view]); it is never redrawn. /dev/scenes overlays it to prove it.
(function () {
  const K = window.VersoKit;
  const { el, g } = K;
  const NS = 'http://www.w3.org/2000/svg';
  const T = (n) => `var(--${n})`;
  const D2R = Math.PI / 180;
  const f1 = (n) => Math.round(n * 10) / 10;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const OUT = 4;                                   // outline width (character units)
  const ink = { stroke: T('outline'), 'stroke-width': OUT, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  let uid = 0;

  // ---------------- species registry ----------------
  const skins = {};
  const order = [];
  function register(skin) { if (!skins[skin.id]) order.push(skin.id); skins[skin.id] = skin; }

  // ---------------- poses ----------------
  // Every field is optional; a pose is merged over REST. Numbers interpolate; h1/h2 (hand shapes) and back switch at
  // the halfway point. a1/a2 = hand position [x, y, bend] in character space (a1 is the far arm in profile views and
  // the screen-left arm in the front view), l1/l2 = foot position [x, y, bend]. bend curves the noodle (-1..1).
  const REST = {
    x: 0, y: 0, rot: 0,                 // whole character, pivot on the ground (dives, falls, jumps)
    turn: 0, back: 0,                   // view: turn 0 front, ~0.55 three-quarter, 1 profile; back 1 = seen from behind
    bx: 0, by: 0, brot: 0, bsy: 1,      // body offset from rest, lean (deg), vertical squash
    hx: 0, hy: 0, hrot: 0,              // head offset and tilt
    lx: 0, ly: 0,                       // pupils (-1..1)
    a1: [-62, -108, 0.25], a2: [62, -108, -0.25],   // (front view: the hands a little away from the body, see ARMS.front)
    l1: [-26, -10, 0], l2: [26, -10, 0],
    h1: 'ball', h2: 'ball',             // hand shapes: ball, fist, rock, paper, scissors, point, open, glove
    r1: null, r2: null,                 // hand angle override (deg, 0 = pointing right); null follows the noodle
    hs1: 1, hs2: 1,                     // hand scale
    p1: [0, 0, 0], p2: [0, 0, 0],       // held prop offset [along, across, extra rotation] in the hand frame
    f1: 0, f2: 0,                       // foot tilt (deg)
    tail: 0,                            // tail swing (deg) around its base
    front1: 0,                          // 1 = a1 is drawn over a2 and its prop when both share a layer (front views)
    ht: 0,                              // extra head turn (-1..1): the face looks sideways without turning the body
    hat: [0, 0, 0],                     // hat offset + tilt on the head
    shadow: 1,                          // ground shadow size (shrinks on jumps)
    sit: 0,                             // 1 = seated: the character drops so the body's bottom rests on the origin (the
                                        // seat); feet then hang below it (l1/l2 as usual). No ground shadow.
    behind: 0,                          // 1 = both arms behind the body and the head (a back view reaching forward, away
                                        // from us)
    arms: null,                         // front / back views: the arm set (ARMS.sets name, e.g. 'keeper'); null = ARMS.front
    over1: 0, over2: 0,                 // front / back views: 1 = that arm is drawn in FRONT of the body (a hand reaching
                                        // toward us over the torso), its root at the same anchor under a short sleeve
    roll1: null, roll2: null,           // 1 = that arm PLAYS (the throwing / gun / pointing / keeper arm): a long sleeve is
                                        // rolled up on it (ARMS.roll); 0 = the full sleeve. Tweened; a pose that leaves it
                                        // out (null) KEEPS the rig's current value (keepRoll), so a game sets it in its
                                        // poses and it holds through every pose of the match (no rolling back and forth)
  };
  const ROLLS = ['roll1', 'roll2'];
  // fills a pose's unset roll fields from the previous pose (0 at the start)
  function keepRoll(p, prev) { for (const k of ROLLS) if (p[k] == null) p[k] = prev?.[k] ?? 0; return p; }
  const DISCRETE = new Set(['h1', 'h2', 'back', 'front1', 'behind', 'arms', 'over1', 'over2']);
  // Hand shapes whose wrist joins the arm: when the hand angle is set (r1/r2), the noodle bends INTO the hand (its end
  // tangent is the hand's angle), so the forearm runs straight into the wrist/cuff. Sprite hands always join.
  const JOINED = new Set(['glove']);
  // Shapes drawn as a RIGHT hand (thumb on +x): arm 2 wears the mirrored one, so a pair (goalkeeper gloves) has both
  // thumbs on the inner side when the palms face us.
  const PAIRED = new Set(['glove']);
  const FADE = 16;                      // sprite px over which a sprite hand cross-fades from the arm (see handSprites)

  // Shared pose library. Scenes add their own game poses (same format) next to their code.
  const POSES = {
    idle: {},
    idle3: { turn: 0.55, a1: [-50, -100, 0.3], a2: [62, -100, -0.1], l1: [-20, -10, 0], l2: [24, -10, 0] },
    side: { turn: 1, a1: [-18, -96, 0.3], a2: [22, -96, -0.3], l1: [-12, -10, 0], l2: [14, -10, 0] },
    back: { back: 1 },
    // The one neutral "ready" pose of a locked player: hands on the hips (the arms bowed out from the shoulders, never
    // across the torso), never depends on the move.
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
  // A tween's hand arc (rig.to(..., bow)): per hand the offset at the middle of the way, perpendicular to the straight
  // path on its upper side; bowedAt() adds it scaled by sin(pi x the eased progress e), so it is 0 at both ends.
  // (test/arms.js samples these arcs too.)
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
      if (!r.root.isConnected) { if (r.seen) { r.destroy(); } continue; }
      r.seen = true;
      r.frame(now);
    }
    if (live.size) raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf && live.size) raf = requestAnimationFrame(tick); };

  // ---------------- geometry helpers ----------------
  // A noodle between two points: one cubic Bezier, curved sideways by bend. Returns the path and the end tangent.
  function noodle(s, e, bend) {
    const dx = e[0] - s[0], dy = e[1] - s[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, k = bend * Math.min(len, 160) * 0.45;
    const c1 = [s[0] + dx * 0.3 + nx * k, s[1] + dy * 0.3 + ny * k], c2 = [s[0] + dx * 0.72 + nx * k, s[1] + dy * 0.72 + ny * k];
    return { d: `M${f1(s[0])} ${f1(s[1])}C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(e[0])} ${f1(e[1])}`, ang: Math.atan2(e[1] - c2[1], e[0] - c2[0]) / D2R, c: [s, c1, c2, e] };
  }
  // The same noodle, but arriving at e along angle ang (deg): the last control point sits behind e on that line, so
  // the arm runs straight into a hand turned that way (a joined wrist).
  function noodleTo(s, e, bend, ang) {
    const base = noodle(s, e, bend);
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]), L = clamp(len * 0.42, 14, 120), a = ang * D2R;
    const c1 = base.c[1], c2 = [e[0] - Math.cos(a) * L, e[1] - Math.sin(a) * L];
    return { d: `M${f1(s[0])} ${f1(s[1])}C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(e[0])} ${f1(e[1])}`, ang, c: [s, c1, c2, e] };
  }
  // A filled noodle along the Bezier c (from noodle / noodleTo) whose fill half-width goes from h0 (shoulder) to h1
  // (wrist) and outline from o0 to o1, widening over the forearm only (smoothstep, flat at both ends); it runs on ext
  // past the end at the wrist widths (under the sprite) and has a round cap at the shoulder. Returns { outer, inner }.
  function taper(c, h0, h1, o0, o1, ext) {
    const [P0, P1, P2, P3] = c, N = 22;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0];
      const y = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1];
      let tx = 3 * u * u * (P1[0] - P0[0]) + 6 * u * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]);
      let ty = 3 * u * u * (P1[1] - P0[1]) + 6 * u * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
      const l = Math.hypot(tx, ty);
      if (l < 1e-6) { const p = pts[pts.length - 1]; tx = p ? p[2] : 1; ty = p ? p[3] : 0; } else { tx /= l; ty /= l; }
      const w = clamp((t - 0.38) / 0.62), sm = w * w * (3 - 2 * w);
      pts.push([x, y, tx, ty, lerp(h0, h1, sm), lerp(o0, o1, sm)]);
    }
    const last = pts[N];
    pts.push([last[0] + last[2] * ext, last[1] + last[3] * ext, last[2], last[3], last[4], last[5]]);
    const side = (grow) => {
      const L = [], R = [];
      for (const [x, y, tx, ty, h, o] of pts) { const r = h + (grow ? o : 0); L.push([x - ty * r, y + tx * r]); R.push([x + ty * r, y - tx * r]); }
      const [x0, y0, tx0, ty0, h00, o00] = pts[0], r0 = h00 + (grow ? o00 : 0);
      const cap = [];
      for (let j = 1; j < 8; j++) { const th = Math.PI * j / 8; cap.push([x0 - ty0 * r0 * Math.cos(th) - tx0 * r0 * Math.sin(th), y0 + tx0 * r0 * Math.cos(th) - ty0 * r0 * Math.sin(th)]); }
      const all = [...L, ...R.reverse(), ...cap.reverse()];
      return `M${all.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`;
    };
    return { outer: side(true), inner: side(false) };
  }
  // A point and unit tangent on the Bezier c at t.
  function bez(c, t) {
    const [P0, P1, P2, P3] = c, u = 1 - t;
    const x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0];
    const y = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1];
    let tx = 3 * u * u * (P1[0] - P0[0]) + 6 * u * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]);
    let ty = 3 * u * u * (P1[1] - P0[1]) + 6 * u * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
    const l = Math.hypot(tx, ty);
    if (l < 1e-6) { tx = P3[0] - P0[0]; ty = P3[1] - P0[1]; const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m; } else { tx /= l; ty /= l; }
    return [x, y, tx, ty];
  }
  // Arc length along c: { len, at(d) -> t } (a lookup table, linear in between).
  function arc(c, N = 32) {
    const ts = [0], ds = [0];
    let prev = bez(c, 0), d = 0;
    for (let i = 1; i <= N; i++) { const t = i / N, p = bez(c, t); d += Math.hypot(p[0] - prev[0], p[1] - prev[1]); ts.push(t); ds.push(d); prev = p; }
    const at = (x) => {
      if (x <= 0) return 0;
      if (x >= d) return 1;
      let i = 1;
      while (ds[i] < x) i++;
      return ts[i - 1] + (ts[i] - ts[i - 1]) * (x - ds[i - 1]) / ((ds[i] - ds[i - 1]) || 1);
    };
    return { len: d, at };
  }
  // A band along c from t0 to t1 (a filled strip along a limb): half-width hw(t, u) (u = 0..1 along the band),
  // outline o. The outline sticks out o past both ends (a flat, outlined cut), or the start gets a round cap.
  // Returns { outer, inner } like taper().
  function band(c, t0, t1, hw, o, roundStart = false, M = 14) {
    const pts = [];
    for (let i = 0; i <= M; i++) { const u = i / M, t = lerp(t0, t1, u); pts.push([...bez(c, t), hw(t, u)]); }
    const side = (grow) => {
      const L = [], R = [];
      const a = pts[0];
      for (let i = 0; i <= M; i++) {
        let [x, y, tx, ty, h] = pts[i];
        if (grow && i === M) { x += tx * o; y += ty * o; }
        if (grow && i === 0 && !roundStart) { x -= tx * o; y -= ty * o; }
        const r = h + (grow ? o : 0);
        L.push([x - ty * r, y + tx * r]); R.push([x + ty * r, y - tx * r]);
      }
      const cap = [];
      if (roundStart) {
        const r0 = a[4] + (grow ? o : 0);
        for (let j = 1; j < 8; j++) { const th = Math.PI * j / 8; cap.push([a[0] - a[3] * r0 * Math.cos(th) - a[2] * r0 * Math.sin(th), a[1] + a[2] * r0 * Math.cos(th) - a[3] * r0 * Math.sin(th)]); }
      }
      const all = [...L, ...R.reverse(), ...cap.reverse()];
      return `M${all.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`;
    };
    return { outer: side(true), inner: side(false) };
  }


  // An egg: narrower top (rxT), widest (rx) at y=mid. map (optional): an affine map of every point (the egg in another
  // space, e.g. the body egg in character space for the tucked arms' clip).
  function egg(rxT, rx, top, mid, bot, cx = 0, map = null) {
    const k = 0.56, P = (x, y) => { const [u, v] = map ? map([x, y]) : [x, y]; return `${f1(u)} ${f1(v)}`; };
    return `M${P(cx, top)}C${P(cx + rxT, top)} ${P(cx + rx, mid - (mid - top) * k)} ${P(cx + rx, mid)}`
      + `C${P(cx + rx, mid + (bot - mid) * k)} ${P(cx + rx * k, bot)} ${P(cx, bot)}`
      + `C${P(cx - rx * k, bot)} ${P(cx - rx, mid + (bot - mid) * k)} ${P(cx - rx, mid)}`
      + `C${P(cx - rx, mid - (mid - top) * k)} ${P(cx - rxT, top)} ${P(cx, top)}Z`;
  }
  // Shapes outlined as one silhouette: every shape stroked first, then every fill on top (inner seams disappear).
  function blob(shapes, fill, w = OUT) {
    const mk = (s, outline) => el(s[0], { ...s[1], fill: outline ? T('outline') : fill, stroke: outline ? T('outline') : null, 'stroke-width': outline ? w * 2 : null, 'stroke-linejoin': 'round' });
    return g({}, shapes.map((s) => mk(s, true)), shapes.map((s) => mk(s, false)));
  }
  const circle = (cx, cy, r) => ['circle', { cx, cy, r }];
  const ellipse = (cx, cy, rx, ry) => ['ellipse', { cx, cy, rx, ry }];
  const rrect = (x, y, w, h, r, rot, ox, oy) => ['rect', { x, y, width: w, height: h, rx: r, transform: rot ? `rotate(${rot} ${ox} ${oy})` : null }];
  const pathS = (d) => ['path', { d }];

  // ---------------- generic hands (species override rock / paper / scissors / point / ball) ----------------
  // Drawn with the wrist at (0, 0) and the fingers toward -y, about 30 units wide.
  const HANDS = {
    ball: (c) => blob([circle(0, -10, 15)], c.fur),
    fist: (c) => blob([circle(0, -14, 17)], c.fur),
    open: (c) => blob([circle(0, -16, 16), rrect(-17, -44, 11, 26, 5.5, -18, -11, -26), rrect(-5.5, -48, 11, 30, 5.5), rrect(6, -44, 11, 26, 5.5, 18, 11, -26)], c.fur),
    glove: (c) => g({}, blob([circle(0, -20, 21), rrect(-24, -58, 13, 32, 6.5, -20, -17, -30), rrect(-10, -66, 13, 36, 6.5, -6, -4, -34),
      rrect(4, -64, 13, 34, 6.5, 8, 10, -34), rrect(16, -54, 13, 28, 6.5, 24, 22, -28), rrect(18, -30, 13, 26, 6.5, 62, 22, -20)], T('ball')),
      el('rect', { x: -19, y: -8, width: 38, height: 16, rx: 5, fill: T('gunmetal-light'), ...ink })),
  };

  // ---------------- props in a hand ----------------
  function propNode(name) { return window.VersoProps?.[name]?.() || null; }

  // ---------------- cosmetics ----------------
  const COS = () => window.VersoCosmetics;
  const NO_COSMETICS = { hat: 'cowboy', outfit: 'none', feet: 'natural' };   // cosmetics.js not loaded: the code-drawn cowboy hat
  const viewOf = (turn, back) => (COS()?.view ? COS().view(turn, back) : back ? 'back' : Math.abs(turn) < 0.28 ? 'front' : Math.abs(turn) < 0.8 ? 'three' : 'side');
  function loadoutFor(side) {
    const C = COS();
    if (!C) return { ...NO_COSMETICS };
    return C.valid(side === 'opp' ? C.opponent() : C.get());
  }

  // Shoes (the v9 set, public/js/mascots/cosmetics.js). Foot space: origin at the foot center, the sole on y = ry, a
  // profile's toes toward +x; ax = the ankle (where the leg ends) in foot space; foot = 'l' (foot1) or 'r' (foot2).
  //   - closed shoes (round 34, the owner's pick: variant 5 of art-source/screens/variants-5/shoes/, "Big shoe that
  //     follows, rim over the leg"): the sprite of the view and foot (shoe-<id>-<view>-<l|r>.webp), its ankle anchor on
  //     x = ax, its sole on the ground line just under the natural foot's sole, scaled so a median shoe of its sheet is
  //     SHOE.k (1.3) x the species' foot long (COS().SHOE). It replaces the natural foot and the leg goes INTO its opening
  //     (node.opening, shoeOpening): the opening gets ONE rim outline, a vector ellipse on the sprite's measured collar
  //     (COLLARS) in the outline token at the rig's outline weight (the leg's own outline); the leg is aimed at the
  //     middle of the opening along the shaft and ends flat just under the front lip; its end is drawn once more over the
  //     shoe (rig-leg-in) clipped to everything above the front lip, so it covers the dark lining and the rim's back half
  //     and disappears behind the rim's front half (drawn again over it).
  //   - 'natural' = the rig's own oval foot; the open-toe shoes (sandals, slides) are drawn in code OVER that foot
  //     (a sole under it, the straps on top), so each species keeps its own toes. Colors: shoe tokens (server/themes.js).
  // Every shoe (sprite or code-drawn) turns fully with its leg: leanOf() = the leg line's direction from the hip to its
  // end, measured from straight down, added to the pose's foot tilt (no dead zone; continuous, so tweens never jump).
  const leanOf = (s, e) => ((Math.atan2(e[1] - s[1], e[0] - s[0]) / D2R - 90 + 540) % 360) - 180;
  const RIM_INSET = 2;        // the rim sits this far inside the measured collar edge (units), on the art's rim line
  const RIM_DEPTH = 0.3;      // a shallow opening gets at least this x its half width in depth (a ring, never a bar)
  // The opening of a sprite shoe in foot space (the sprite drawn at translate(ax oy) scale(s), its anchor at the
  // origin): the rim ellipse { cx, cy, rx, ry }, the leg's clip (everything above the rim's front half, reaching far
  // out to the sides and up, so the only edge that cuts the leg is the lip) and the lip (the rim's front half). null
  // when no opening shows in that view (no sprite shoe has such a view since round 35; the leg would stay behind it).
  function shoeOpening(spr, s, ax, oy) {
    const col = spr.col;
    if (!col || col[3] < col[1]) return null;
    const X = (u) => ax + s * (u - spr.ax), Y = (v) => oy + s * (v - spr.ay);
    const top = Y(col[1]) + RIM_INSET, lip = Y(col[3]) - RIM_INSET * 0.5;
    const rx = f1(Math.max(3, col[2] * s - RIM_INSET)), ry = f1(Math.max(1.2, (lip - top) / 2, rx * RIM_DEPTH));
    const cx = f1(X(col[0])), cy = f1(top + ry), pad = 400;
    const l = f1(cx - rx), r = f1(cx + rx);
    return {
      cx, cy, rx, ry,
      clip: `M${f1(l - pad)} ${f1(cy - pad)}L${f1(r + pad)} ${f1(cy - pad)}L${f1(r + pad)} ${cy}L${r} ${cy}A${rx} ${ry} 0 0 1 ${l} ${cy}L${f1(l - pad)} ${cy}Z`,
      lip: `M${r} ${cy}A${rx} ${ry} 0 0 1 ${l} ${cy}`,
    };
  }
  function drawFoot(item, sk, v, ax, foot = 'l') {
    const [rx, ry] = sk.foot, c = sk.colors;
    const natural = () => blob([ellipse(0, 0, rx, ry)], c.foot || c.fur);
    if (!item || item === 'natural') return natural();
    const C = COS();
    const spr = C?.shoeSprite?.(item, v, foot);
    if (spr) {
      const s = (rx * 2 * C.SHOE.k * (spr.fit.k || 1)) / C.SHOE.ref, f3 = (n) => Math.round(n * 1000) / 1000;
      const oy = ry + 3 + (spr.fit.dy || 0);
      const img = el('image', { href: spr.href, x: f1(-spr.ax), y: f1(-spr.ay), width: spr.w, height: spr.h, class: 'rig-shoe-img' });
      const node = g({ class: `shoe shoe--${item} shoe--sprite` }, g({ transform: `translate(${f1(ax)} ${f1(oy)}) scale(${f3(s)})` }, img));
      node.opening = shoeOpening(spr, s, ax, oy);
      return node;
    }
    const k = v === 'side' ? 1 : v === 'three' ? 0.6 : 0;      // how far the toes point forward
    const back = v === 'back';
    const xh = -rx - 1 + k * 4, xt = rx + 1 + k * 9;            // heel and toe
    const sole = ry + 3;
    const path = (d, fill, w = OUT) => el('path', { d, fill, ...ink, 'stroke-width': w });
    const soleD = (x0, x1, y0, y1, r = 6) => `M${f1(x0 + r)} ${f1(y0)}L${f1(x1 - r)} ${f1(y0)}Q${f1(x1)} ${f1(y0)} ${f1(x1)} ${f1((y0 + y1) / 2)}`
      + `Q${f1(x1)} ${f1(y1)} ${f1(x1 - r)} ${f1(y1)}L${f1(x0 + r)} ${f1(y1)}Q${f1(x0)} ${f1(y1)} ${f1(x0)} ${f1((y0 + y1) / 2)}Q${f1(x0)} ${f1(y0)} ${f1(x0 + r)} ${f1(y0)}Z`;
    if (item === 'sandals') {
      // strap sandals (after the kit's strapsandals): a cream sole, red crossing straps over the toes, a red ankle strap
      // with a gold buckle
      const strap = T('shoe-sandals-strap');
      const out = g({ class: 'shoe shoe--sandals' });
      out.append(path(soleD(xh - 3, xt + 3, ry - 3, sole + 1, 5), T('shoe-sole')));
      out.append(natural());
      if (back) out.append(path(`M${f1(-rx * 0.86)} ${f1(ry * 0.2)}Q0 ${f1(ry * 0.5)} ${f1(rx * 0.86)} ${f1(ry * 0.2)}L${f1(rx * 0.8)} ${f1(ry * 0.62)}Q0 ${f1(ry * 0.9)} ${f1(-rx * 0.8)} ${f1(ry * 0.62)}Z`, strap, OUT * 0.7));
      else if (k) {
        out.append(path(`M${f1(rx * 0.05)} ${f1(-ry * 0.7)}L${f1(rx * 0.3)} ${f1(-ry * 0.78)}L${f1(rx * 0.72)} ${f1(ry * 0.55)}L${f1(rx * 0.42)} ${f1(ry * 0.62)}Z`, strap, OUT * 0.7));
        out.append(path(`M${f1(rx * 0.5)} ${f1(-ry * 0.45)}L${f1(rx * 0.78)} ${f1(-ry * 0.3)}L${f1(rx * 0.95)} ${f1(ry * 0.5)}L${f1(rx * 0.7)} ${f1(ry * 0.55)}Z`, strap, OUT * 0.7));
      } else out.append(path(`M${f1(-rx * 0.9)} ${f1(-ry * 0.55)}L0 ${f1(ry * 0.3)}L${f1(rx * 0.9)} ${f1(-ry * 0.55)}L${f1(rx * 0.62)} ${f1(-ry * 0.8)}L0 ${f1(-ry * 0.2)}L${f1(-rx * 0.62)} ${f1(-ry * 0.8)}Z`, strap, OUT * 0.7));
      // the ankle strap around the leg's end, the buckle on the outer side (front: the middle)
      const aw = sk.legW / 2 + 4, ay = -ry * 0.9;
      out.append(el('rect', { x: f1(ax - aw), y: f1(ay - 4), width: f1(aw * 2), height: 8, rx: 3, fill: strap, ...ink, 'stroke-width': OUT * 0.7 }));
      if (!back) out.append(el('rect', { x: f1(ax + (k ? aw * 0.2 : -4)), y: f1(ay - 4.5), width: 8, height: 9, rx: 1.5, fill: T('shoe-sandals-buckle'), ...ink, 'stroke-width': OUT * 0.55 }));
      return out;
    }
    if (item === 'slides') {
      // sport slides (after the kit's slides): a thick cream sole and one wide blue strap over the foot
      const strap = T('shoe-slides-strap');
      const out = g({ class: 'shoe shoe--slides' });
      out.append(path(soleD(xh - 4, xt + 4, ry - 4, sole + 4, 6), T('shoe-slides-sole')));
      out.append(natural());
      if (back) out.append(path(`M${f1(-rx * 0.95)} ${f1(ry * 0.05)}Q0 ${f1(ry * 0.3)} ${f1(rx * 0.95)} ${f1(ry * 0.05)}L${f1(rx * 0.9)} ${f1(ry * 0.75)}Q0 ${f1(ry * 0.95)} ${f1(-rx * 0.9)} ${f1(ry * 0.75)}Z`, strap, OUT * 0.75));
      else if (k) out.append(path(`M${f1(-rx * 0.1)} ${f1(-ry * 0.9)}Q${f1(rx * 0.25)} ${f1(-ry * 1.1)} ${f1(rx * 0.55)} ${f1(-ry * 0.75)}L${f1(rx * 0.75)} ${f1(ry * 0.7)}L${f1(-rx * 0.2)} ${f1(ry * 0.7)}Z`, strap, OUT * 0.75));
      else out.append(path(`M${f1(-rx * 0.95)} ${f1(-ry * 0.25)}Q0 ${f1(-ry * 1.05)} ${f1(rx * 0.95)} ${f1(-ry * 0.25)}L${f1(rx * 0.9)} ${f1(ry * 0.45)}Q0 ${f1(ry * 0.1)} ${f1(-rx * 0.9)} ${f1(ry * 0.45)}Z`, strap, OUT * 0.75));
      return out;
    }
    return natural();
  }

  // ---------------- the rig ----------------
  // The species a side plays: mine from VersoTeam, the opponent's from VersoCosmetics.opponent() (each player keeps
  // their own; 'monkey' when unknown).
  function speciesFor(side) {
    const sp = side === 'opp' ? COS()?.opponent?.().species : window.VersoTeam?.get?.();
    return skins[sp] ? sp : skins.monkey ? 'monkey' : order[0];
  }
  // The full character of a side: { species, hat, outfit, feet }.
  const characterFor = (side) => ({ species: speciesFor(side), ...loadoutFor(side) });

  function create(opts = {}) {
    const r = new Rig(opts);
    live.add(r); wake();
    return r;
  }

  class Rig {
    constructor({ species = null, side = 'you', pose = 'idle', idle = true, flip = false, hat = true, loadout = null, mood = 'idle', x = 0, y = 0, scale = 1 } = {}) {
      this.id = ++uid;
      this.side = side;
      this.fixed = species;               // a fixed species (profiles, leaderboards) ignores team changes
      this.species = species || speciesFor(side);
      this.idleOn = idle;
      this.flip = flip;
      this.cur = keepRoll(resolve(pose), null);
      this.tw = null;
      this.held = { 1: null, 2: null };
      this.hatOn = hat !== false;          // wear the loadout's hat (hat(false) takes it off)
      this.ownLoadout = !!loadout;         // a fixed loadout ignores the cosmetics store
      this.loadout = loadout ? (COS()?.valid ? COS().valid(loadout) : { ...NO_COSMETICS, ...loadout }) : loadoutFor(side);
      this.hatAway = false;
      this.faceName = null;
      this.moodName = mood;
      this.t0 = performance.now() + Math.random() * 4000;
      this.blinkAt = this.t0 + 1500 + Math.random() * 2500;
      this.root = g({ class: `rig rig--${side}` });
      this.placeAt = [x, y, scale];
      this.build();
      this.place(x, y, scale);
      this.mood(mood);
      this.apply(this.cur, performance.now());
    }

    // --- building (and rebuilding on a species change) ---
    build() {
      const sk = this.skin = skins[this.species];
      // (site) the player's own colors
      const c = this.c = sk.colorsFor ? sk.colorsFor(this.loadout) : sk.colors;
      this.root.innerHTML = '';
      this.root.dataset.species = sk.id;
      this.n = {};
      const n = this.n;
      const id = `rig${this.id}`;
      n.flip = g({ class: 'rig-flip' });
      n.shadow = el('ellipse', { cx: 0, cy: 0, rx: 70, ry: 12, fill: T('shadow'), opacity: 0.32 });
      n.all = g({ class: 'rig-all' });
      n.tailBack = g({}); n.tailFront = g({});
      n.armBack = g({}); n.armFront = g({});
      // the tucked arms of the front / back views: over the legs and the head (a raised arm never hides behind the
      // head), but clipped out of the body and its outline, so they still come out from behind the torso (see apply)
      n.armClip = el('path', { 'clip-rule': 'evenodd' });
      n.armMid = g({ class: 'rig-arms-tucked', 'clip-path': `url(#${id}-arms)` });
      n.legs = g({}); n.neck = g({ class: 'rig-neck-host' }); n.body = g({}); n.head = g({}); n.top = g({});
      n.all.append(el('defs', {}, el('clipPath', { id: `${id}-arms` }, n.armClip)), n.tailBack, n.armBack, n.legs, n.neck, n.body, n.tailFront, n.head, n.armMid, n.armFront, n.top);
      n.flip.append(n.shadow, n.all);
      this.root.append(n.flip);

      // tail: the single species path, stroked twice (outline under fill)
      // (site) a species without a tail (the human) keeps an empty tail group
      n.tail = sk.tail ? g({ class: 'rig-tail' },
        el('path', { d: sk.tail.d, fill: 'none', stroke: T('outline'), 'stroke-width': sk.tail.w + OUT * 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        el('path', { d: sk.tail.d, fill: 'none', stroke: sk.tail.color || c.fur, 'stroke-width': sk.tail.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) : g({ class: 'rig-tail' });
      n.tailBack.append(n.tail);

      // legs and feet
      const limb = (w, color) => {
        const o = el('path', { fill: 'none', stroke: T('outline'), 'stroke-width': w + OUT * 2, 'stroke-linecap': 'round' });
        const f = el('path', { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' });
        return { o, f, g: g({}, o, f) };
      };
      n.leg1 = limb(sk.legW, c.fur); n.leg2 = limb(sk.legW, c.fur);
      // a full-body garment's trouser leg (outfits.js SPEC legs, see dressLeg): the leg noodle in the leg color, ring
      // stripes, and an ankle cuff band near its end (under the foot or the shoe)
      for (const leg of [n.leg1, n.leg2]) {
        leg.st = el('path', { class: 'rig-leg-stripes' }); leg.cO = el('path', { fill: T('outline') }); leg.cF = el('path', {});
        leg.cuff = g({ class: 'rig-leg-cuff' }, leg.cO, leg.cF);
        leg.g.append(leg.st, leg.cuff);
        leg.st.style.display = 'none'; leg.cuff.style.display = 'none';
      }
      // feet: rebuilt by dressFeet() when the shoes or the view change. Each leg is drawn with its own foot (leg 1,
      // foot 1, then leg 2, foot 2: the second leg is the nearer one, in front of the first foot). A sprite shoe with an
      // opening (drawFoot node.opening) adds, in foot space (moved with the foot in apply): the rim (rig-shoe-rim: the
      // dark lining and the ONE rim ellipse in the outline token at OUT), the leg's end once more (a <use> of the leg
      // clipped above the rim's front half), and the rim's front half again over the leg (rig-shoe-lip), so the leg goes
      // INTO the shoe under one continuous rim line.
      n.foot1 = g({ class: 'rig-foot' }); n.foot2 = g({ class: 'rig-foot' });
      const defs = el('defs', {});
      const order = [defs];
      for (const k of [1, 2]) {
        const leg = n[`leg${k}`];
        leg.g.setAttribute('id', `${id}-leg${k}`);
        leg.clip = el('path', {});
        defs.append(el('clipPath', { id: `${id}-shoe${k}`, clipPathUnits: 'userSpaceOnUse' }, leg.clip));
        leg.into = el('use', { href: `#${id}-leg${k}`, 'clip-path': `url(#${id}-shoe${k})`, class: 'rig-leg-in' });
        leg.lining = el('ellipse', { fill: T('shoe-lining') });
        leg.rimLine = el('ellipse', { fill: 'none', stroke: T('outline'), 'stroke-width': OUT, class: 'rig-shoe-rim-line' });
        leg.rim = g({ class: 'rig-shoe-rim' }, leg.lining, leg.rimLine);
        leg.lip = el('path', { fill: 'none', stroke: T('outline'), 'stroke-width': OUT, 'stroke-linecap': 'round', class: 'rig-shoe-lip' });
        for (const q of [leg.into, leg.rim, leg.lip]) q.style.display = 'none';
        order.push(leg.g, n[`foot${k}`], leg.rim, leg.into, leg.lip);
      }
      n.legs.append(...order);
      this.feetKey = null;

      // body (+ clipped markings)
      n.clip = el('clipPath', { id: `${id}-body` }, el('path', {}));
      n.bodyPath = el('path', { fill: c.fur, ...ink });
      n.marks = g({ 'clip-path': `url(#${id}-body)` }, sk.marks ? sk.marks(c) : null);
      n.bodyLine = el('path', { fill: 'none', ...ink, 'stroke-width': OUT * 0.8 });
      // outfit (outfits.js), in body space so it follows every body transform; rebuilt by dressOutfit() when the item
      // or the view changes: the garment (clipped to the body), the body outline
      // stroked again over a clipped garment, then the unclipped bits (a bow tie)
      n.outfit = g({ class: 'rig-outfit' });
      n.bodyEdge = el('path', { fill: 'none', ...ink, class: 'rig-body-edge' });
      n.outfitTop = g({ class: 'rig-outfit-top' });
      // a species with a neck (skin.neck: drawn behind the body, it goes into the collar): the body's fill and outline
      // are left out across the neck's width at the top (neckGap, body space; set in apply), so the neck runs on into
      // the garment's neck opening with no line across it
      // (the mask: everything but the gap, one even-odd path)
      n.neckGap = sk.neck ? el('path', { d: '', fill: T('flash'), 'fill-rule': 'evenodd' }) : null;
      const neckMask = sk.neck ? el('mask', { id: `${id}-neckgap`, maskUnits: 'userSpaceOnUse', x: -4000, y: -4000, width: 8000, height: 8000 }, n.neckGap) : null;
      if (neckMask) for (const q of [n.bodyPath, n.bodyEdge]) q.setAttribute('mask', `url(#${id}-neckgap)`);
      n.body.append(el('defs', {}, n.clip, neckMask), n.bodyPath, n.marks, n.bodyLine, n.outfit, n.bodyEdge, n.outfitTop);
      this.outfitKey = null;

      // head: species parts (ears behind / head / face / ears on top), expression layer, hat
      n.headInner = g({});
      n.head.append(n.headInner);
      n.hp = sk.head(c, { id, el, g, blob, ink, T, circle, ellipse, pathS, rrect });   // { back, shape, face, front, R }
      n.neckInner = sk.neck ? sk.neck(c, { id, el, g, blob, ink, T, circle, ellipse, pathS, rrect }) : null;
      if (n.neckInner) {
        // The neck follows the head (n.neckTr) but is clipped in body space to the body plus everything above the
        // body's top (n.neckClip*, set in apply), so a turned or tilted head never shows the neck's lower end sticking
        // out beside the body.
        n.neckTr = g({});
        n.neckTr.append(n.neckInner);
        n.neckClipBody = el('path', {});
        n.neckClipTop = el('path', {});
        n.neck.append(el('defs', {}, el('clipPath', { id: `${id}-neckclip` }, n.neckClipBody, n.neckClipTop)), n.neckTr);
        n.neck.setAttribute('clip-path', `url(#${id}-neckclip)`);
      }
      n.faces = {};
      for (const [name, mk] of Object.entries(sk.faces)) {
        const f = mk(c, { el, g, blob, ink, T, circle, ellipse, pathS, R: n.hp.R });
        f.g.style.display = 'none';
        n.faces[name] = f;
        (n.hp.faceSlot || n.hp.face).append(f.g);
      }
      // hat: slot (pose offsets) > inner (flingHat) > pop (hatPop, upside-down guard) > node (the sprite, per view)
      n.hatSlot = g({ class: 'rig-hat' }); n.hatInner = g({}); n.hatPop = g({}); n.hatNode = g({});
      n.hatSlot.append(n.hatInner); n.hatInner.append(n.hatPop); n.hatPop.append(n.hatNode);
      n.headInner.append(n.hp.back, n.hp.shape, n.hp.face, n.hp.front, n.hatSlot);
      this.hatKey = null;

      // arms (outline + fill noodle, held prop, hand). A sprite hand (handSprites) swaps the stroked noodle for a
      // filled one that widens into the sprite's wrist (taper: outline under fill).
      const arm = (k) => {
        const l = limb(sk.armW, c.fur);
        const tO = el('path', { fill: T('outline'), class: 'rig-arm-taper' }), tF = el('path', { fill: c.fur, class: 'rig-arm-taper' });
        const taper = g({}, tO, tF);
        taper.style.display = 'none';
        l.g.append(taper);
        // the fur inside the shoulder oval, over the arm's root (body space, clipped to the body): the arm and its
        // shoulder read as one outlined shape coming out of the garment's armhole
        const coverE = el('ellipse', { fill: c.fur });
        const cover = g({ class: 'rig-shoulder-cover', 'clip-path': `url(#${id}-body)` }, coverE);
        cover.style.display = 'none';
        // the sleeve (every garment, see ARMS): a band in the garment's sleeve color along the arm's root; on a near arm
        // its root inside the body is covered by the same color (clipped to the body), so it reads as part of the garment
        const slO = el('path', { fill: T('outline') }), slF = el('path', {});
        const slE = el('ellipse', {});
        const slCover = g({ 'clip-path': `url(#${id}-body)` }, slE);
        // long sleeves (outfits.js SPEC): ring stripes and a cuff band at the wrist (a trim band at a short sleeve's end)
        const slS = el('path', { class: 'rig-sleeve-stripes' }), cuO = el('path', { fill: T('outline') }), cuF = el('path', {});
        // (a rolled-up sleeve, ARMS.roll: the cuff band becomes the roll and gets a fold line)
        const cuL = el('path', { fill: 'none', stroke: T('outline'), 'stroke-width': ARMS.roll.fold, 'stroke-linecap': 'round', class: 'rig-sleeve-fold' });
        const cuff = g({ class: 'rig-sleeve-cuff' }, cuO, cuF, cuL);
        slS.style.display = 'none'; cuff.style.display = 'none';
        const sleeve = g({ class: 'rig-sleeve' }, slO, slF, slS, cuff, slCover);
        sleeve.style.display = 'none';
        const prop = g({}); const propInner = g({}); prop.append(propInner);
        const hand = g({}); const handInner = g({}); hand.append(handInner);
        const root = g({ class: `rig-arm rig-arm${k}` }, l.g, cover, sleeve, prop, hand);
        return { ...l, tO, tF, taper, cover, coverE, sleeve, slO, slF, slS, cuff, cuO, cuF, cuL, slE, slCover, root, prop, propInner, hand, handInner, shape: null, spr: null };
      };
      n.arm1 = arm(1); n.arm2 = arm(2);
      n.armBack.append(n.arm1.root); n.armFront.append(n.arm2.root);
      // the wrist cross-fade of sprite hands: transparent at the sprite's cut (x 0), opaque from FADE px on
      n.fade = `${id}-fade`;
      // the sprite hands in the player's own skin (skin.handSkin = the sheet's skin color, RGB): every channel divided by
      // it (the skin becomes white, the lines stay dark), multiplied by the skin token, and laid over the sprite by its
      // lightness (the skin: all of it; the outline: none)
      const hk = sk.handSkin;
      n.handTint = hk ? `${id}-tint` : null;
      this.root.prepend(el('defs', {},
        hk && el('filter', { id: n.handTint, 'color-interpolation-filters': 'sRGB', x: '-5%', y: '-5%', width: '110%', height: '110%' },
          el('feColorMatrix', { type: 'matrix', values: `${f1(255 / hk[0] * 1000) / 1000} 0 0 0 0 0 ${f1(255 / hk[1] * 1000) / 1000} 0 0 0 0 0 ${f1(255 / hk[2] * 1000) / 1000} 0 0 0 0 0 1 0`, result: 'n' }),
          el('feFlood', { 'flood-color': c.skin || c.fur, result: 'k' }),
          el('feBlend', { in: 'n', in2: 'k', mode: 'multiply', result: 'm' }),
          // only the skin takes it (weighted by the lightness: the dark lines keep their own color)
          el('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.857 1.686 0.314 0 -0.714', result: 'w' }),
          el('feComposite', { in: 'm', in2: 'w', operator: 'in', result: 'mw' }),
          el('feComposite', { in: 'mw', in2: 'SourceGraphic', operator: 'over', result: 'o' }),
          el('feComposite', { in: 'o', in2: 'SourceAlpha', operator: 'in' })),
        el('linearGradient', { id: `${id}-fadeg`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: FADE, y2: 0 },
          el('stop', { offset: 0, 'stop-color': T('flash'), 'stop-opacity': 0 }), el('stop', { offset: 1, 'stop-color': T('flash'), 'stop-opacity': 1 })),
        el('mask', { id: n.fade, maskUnits: 'userSpaceOnUse', x: -20, y: -4000, width: 8000, height: 8000 },
          el('rect', { x: -20, y: -4000, width: 8000, height: 8000, fill: `url(#${id}-fadeg)` }))));
      for (const k of [1, 2]) if (this.held[k]) this.hold(k, this.held[k], true);
      if (this.faceName) this.face(this.faceName, true);
      n.flip.setAttribute('transform', this.flip ? 'scale(-1 1)' : '');
    }

    // --- placement in the scene ---
    place(x, y, s = this.placeAt[2]) {
      this.placeAt = [x, y, s];
      this.root.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) scale(${s})`);
      return this;
    }
    setFlip(on) { this.flip = !!on; this.n.flip.setAttribute('transform', on ? 'scale(-1 1)' : ''); return this; }
    // How far a seated pose lowers the character (sit 1: the body's bottom lands on the origin).
    drop(p) { return -this.skin.skel.bottom * (p.sit || 0); }
    // Character space -> scene coordinates (ignores the camera shake).
    world([x, y]) {
      const p = this.cur, a = p.rot * D2R;
      let wx = x * Math.cos(a) - y * Math.sin(a) + p.x, wy = x * Math.sin(a) + y * Math.cos(a) + p.y + this.drop(p);
      if (this.flip) wx = -wx;
      const [px, py, s] = this.placeAt;
      return [px + wx * s, py + wy * s];
    }

    // --- species / side ---
    setSpecies(id) {
      if (!skins[id] || id === this.species) return this;
      this.species = id;
      this.build();
      this.mood(this.moodName);
      this.apply(this.cur, performance.now());
      return this;
    }
    syncTeam() { if (!this.fixed) this.setSpecies(speciesFor(this.side)); }

    // --- expressions ---
    // A face code (M-A.., C-A..) or an old name (blankStare, happy, ...: skin.faceAlias).
    face(name, force = false) {
      const faces = this.n.faces;
      name = this.skin.faceAlias?.[name] || name;
      if (!faces[name]) name = this.skin.defaultFace;
      if (name === this.faceName && !force) return this;
      for (const [k, f] of Object.entries(faces)) f.g.style.display = k === name ? '' : 'none';
      this.faceName = name;
      return this;
    }
    // The expression for a moment (public/js/mascots/expressions.js): a moment id (RPS-3, SHO-9, ...) or an old name
    // (idle, locked, hit, ...). The rig is the key of the cat's per-round mood.
    mood(moment) {
      this.moodName = moment;
      const pick = window.VersoExpressions?.pick?.(this.species, moment, this);
      return this.face(pick || this.skin.defaultFace, true);
    }

    // --- props ---
    hold(k, name, rebuild = false) {
      const a = this.n[`arm${k}`];
      if (!rebuild && this.held[k] === name) return this;
      this.held[k] = name || null;
      a.propInner.innerHTML = '';
      a.prop.dataset.prop = name || '';
      a.propNode = name ? propNode(name) : null;
      if (a.propNode) a.propInner.append(a.propNode.root);
      this.apply(this.cur, performance.now());
      return this;
    }
    prop(k) { return this.n[`arm${k}`].propNode; }

    // --- cosmetics ---
    // Wear (or take off) the loadout's hat; also puts back a hat that flew off.
    hat(on = true) {
      this.hatOn = !!on;
      const n = this.n;
      n.hatInner.getAnimations?.().forEach((a) => a.cancel());
      n.hatPop.getAnimations?.().forEach((a) => a.cancel());
      this.hatAway = false;
      this.hatKey = null;
      this.apply(this.cur, performance.now());
      return this;
    }
    hasHat() { return this.hatOn && this.loadout.hat !== 'none'; }
    setLoadout(l) {
      this.ownLoadout = !!l;
      this.takeLoadout(l ? (COS()?.valid ? COS().valid(l) : { ...NO_COSMETICS, ...l }) : loadoutFor(this.side));
      return this;
    }
    // Follows the cosmetics store (my loadout / the opponent's / the cowboy look), unless the loadout is fixed.
    syncLoadout() { this.takeLoadout(this.ownLoadout ? this.loadout : loadoutFor(this.side)); }
    // (site) a new loadout; a new look (the skin's lookKey: skin tone, hair, shirt) rebuilds the character in place
    takeLoadout(l) {
      const lk = this.skin.lookKey, rebuild = lk && lk(l) !== lk(this.loadout);
      this.loadout = l;
      this.hatKey = null; this.feetKey = null; this.outfitKey = null;
      if (rebuild) { this.build(); this.mood(this.moodName); }
      this.apply(this.cur, performance.now());
    }
    // The hat node for a view: the sprite <image> (or the code-drawn cowboy hat, "Cowboy 2"), placed by HAT_FIT.
    dressHat(v, sg) {
      const item = this.hasHat() ? this.loadout.hat : 'none';
      const C = COS();
      const look = item === 'cowboy' ? (C?.cowboyLook?.() || '2') : '';
      const key = `${item}:${look}:${v}:${sg}`;
      if (key === this.hatKey) return;
      this.hatKey = key;
      const n = this.n;
      n.hatNode.innerHTML = '';
      n.hatNode.dataset.hat = item;
      if (item === 'none') return;
      const sp = this.skin.id;
      if (look === '2' || !C) {
        const h = propNode('hat');
        const fit = C?.CODE_HAT_FIT?.[sp]?.[v] || C?.CODE_HAT_FIT?.monkey?.[v] || [0, -58, 0.85, -4];
        if (h) { h.root.setAttribute('transform', `translate(${f1(fit[0] * sg)} ${fit[1]}) rotate(${fit[3] * sg}) scale(${fit[2] * sg} ${fit[2]})`); n.hatNode.append(h.root); }
        return;
      }
      const spr = C.hatSprite(item, v);
      const fit = C.HAT_FIT[item]?.[sp]?.[v] || C.HAT_FIT[item]?.monkey?.[v];
      if (!spr || !fit) return;
      const [x, y, s, r] = fit;
      const img = el('image', { href: spr.href, x: f1(-spr.ax), y: f1(-spr.ay), width: spr.w, height: spr.h, class: 'rig-hat-img' });
      n.hatNode.append(g({ transform: `translate(${f1(x * sg)} ${y}) rotate(${r * sg}) scale(${f1(s * sg * 1000) / 1000} ${f1(s * 1000) / 1000})` }, img));
    }
    // Shoes: rebuilt when the item or the view changes.
    dressFeet(v) {
      const item = this.loadout.feet;
      const key = `${item}:${v}`;
      if (key === this.feetKey) return;
      this.feetKey = key;
      const fw = v === 'side' ? [10, 10] : v === 'three' ? [2.8, 8.2] : [-6, 6];   // nominal foot offsets (see apply)
      for (const [k, i] of [[1, 0], [2, 1]]) {
        const node = this.n[`foot${k}`], leg = this.n[`leg${k}`];
        node.innerHTML = '';
        node.dataset.feet = item;
        const shoe = drawFoot(item, this.skin, v, -fw[i], k === 1 ? 'l' : 'r');
        node.append(shoe);
        // the opening: the rim, the leg's end over the shoe clipped above the lip, the lip (none: the leg stays under
        // the shoe)
        const o = leg.open = shoe.opening || null;
        leg.clip.setAttribute('d', o ? o.clip : '');
        if (o) {
          for (const e of [leg.lining, leg.rimLine]) { e.setAttribute('cx', o.cx); e.setAttribute('cy', o.cy); e.setAttribute('rx', o.rx); e.setAttribute('ry', o.ry); }
          leg.lip.setAttribute('d', o.lip);
        }
        for (const q of [leg.into, leg.rim, leg.lip]) q.style.display = o ? '' : 'none';
      }
    }
    // The outfit for a view (outfits.js), rebuilt when the item, the view or the (quantized) turn changes.
    // Returns true when the rig wears a garment.
    dressOutfit(turn, back) {
      const item = this.loadout.outfit || 'none', O = window.VersoOutfits;
      const q = Math.round(turn * 20) / 20;
      const key = `${item}:${back ? 1 : 0}:${q}:${this.loadout.shirt || ''}`;
      if (key === this.outfitKey) return this.outfitOn;
      this.outfitKey = key;
      const n = this.n, S = this.skin.skel;
      n.outfit.innerHTML = ''; n.outfitTop.innerHTML = '';
      n.outfit.dataset.outfit = item;
      const rx = lerp(S.bodyRx, S.bodyRxSide, q), rxT = lerp(S.bodyTop, S.bodyTopSide, q);
      const res = O?.dress?.(item, {
        rx, rxT, yT: S.neck - S.hip, yS: S.shoulder - S.hip, yM: S.belly - S.hip, yB: S.bottom - S.hip,
        turn: q, back, view: viewOf(q, back), cx: back ? 0 : q * rx * 0.55, k: back ? 1 : 1 - 0.55 * q, sp: this.skin.id, look: this.loadout,
      }) || null;
      if (res?.node) n.outfit.append(res.node);
      if (res?.top) n.outfitTop.append(res.top);
      this.outfitClip = !!(res?.node && res.clip);
      if (this.outfitClip) n.outfit.setAttribute("clip-path", `url(#rig${this.id}-body)`); else n.outfit.removeAttribute('clip-path');
      this.outfitOn = !!res?.node;
      return this.outfitOn;
    }

    // The hat hops off the head and lands back (a pose that would clip it, a bump). Resolves when it is back.
    hatPop(ms = 650) {
      if (!this.hasHat()) return Promise.resolve();
      return K.anim(this.n.hatPop, [
        { transform: 'translate(0px,0px) rotate(0deg)' },
        { transform: 'translate(-14px,-120px) rotate(-24deg)', offset: 0.45 },
        { transform: 'translate(-4px,-30px) rotate(-6deg)', offset: 0.8 },
        { transform: 'translate(0px,0px) rotate(0deg)' },
      ], { duration: ms, easing: 'ease-in-out', fill: 'none' });
    }
    // The equipped hat flies off (a hit), away from the face. Nothing flies with 'none'. hat(true) puts it back.
    flingHat(ms = 700) {
      if (!this.hasHat()) return Promise.resolve();
      return K.anim(this.n.hatInner, [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(-60px,-150px) rotate(-60deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(-130px,-40px) rotate(-150deg)', opacity: 0 },
      ], { duration: ms, easing: 'cubic-bezier(.2,.7,.4,1)' });
    }

    // --- pose animation ---
    // Tweens to a pose in ms (scaled for reduced motion). Resolves on a timer, so a hidden tab never stalls a reveal.
    // A new to() or seq() also stops a running seq() on this rig. bow (optional, e.g. 0.25): the hands (a1, a2) travel
    // on a smooth arc that bulges upward by bow x the distance, not on a straight line (rps_minus_one.js).
    to(pose, ms = 300, ease = 'inOut', bow = 0) { this.seqId = (this.seqId || 0) + 1; return this.tween(pose, ms, ease, bow); }
    tween(pose, ms = 300, ease = 'inOut', bow = 0) {
      const target = resolve(pose);
      const dur = Math.max(1, ms * (K.reduced() ? 0.35 : 1));
      // An interrupted tween stops where it is (no jump to its end) and its promise resolves.
      this.interrupt();
      const from = { ...this.cur };
      keepRoll(target, from);
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
    set(pose) { this.seqId = (this.seqId || 0) + 1; this.tw?.cut?.(); this.cur = keepRoll(resolve(pose), this.cur); this.apply(this.cur, performance.now()); return this; }
    // [[pose, ms, ease], ...] in sequence.
    async seq(steps) {
      const my = this.seqId = (this.seqId || 0) + 1;
      for (const [p, ms, e, bow] of steps) { if (this.seqId !== my || this.dead) return; await this.tween(p, ms, e, bow); }
    }
    idle(on) { this.idleOn = on; return this; }
    stop() { this.tw?.done?.(); K.settle(this.root); }
    destroy() { this.dead = true; this.tw?.cut?.(); live.delete(this); }

    frame(now) {
      if (this.tw) {
        const t = clamp((now - this.tw.t0) / this.tw.dur);
        this.cur = tweenAt(this.tw, t);
      }
      if (this.tw || (this.idleOn && !K.reduced())) this.apply(this.cur, now);
      else if (this.blinking) this.apply(this.cur, now);
    }

    // --- drawing a pose ---
    apply(p0, now) {
      const sk = this.skin, n = this.n, S = sk.skel;
      const p = { ...p0 };
      // idle life (additive)
      let blink = 1;
      if (this.idleOn && !K.reduced()) {
        const t = (now - this.t0) / 1000;
        p.bsy = p.bsy * (1 + 0.014 * Math.sin(t * 2.4));
        p.hy = p.hy - 1.6 * Math.sin(t * 2.4);
        p.tail = p.tail + 5 * Math.sin(t * 1.9);
        const w = (i) => 0.07 * Math.sin(t * 3.1 + i * 1.7);
        p.a1 = [p.a1[0], p.a1[1], p.a1[2] + w(1)]; p.a2 = [p.a2[0], p.a2[1], p.a2[2] + w(2)];
        p.l1 = [p.l1[0], p.l1[1], p.l1[2] + w(3) * 0.5]; p.l2 = [p.l2[0], p.l2[1], p.l2[2] + w(4) * 0.5];
        const f = this.n.faces[this.faceName];
        if (f && f.blink !== false) {
          if (now > this.blinkAt) { this.blinkStart = now; this.blinkAt = now + 2200 + Math.random() * 3200; }
          const bt = (now - (this.blinkStart || -1e9)) / 140;
          this.blinking = bt < 1;
          if (bt < 1) blink = Math.max(0.08, Math.abs(1 - 2 * bt));
        }
      }
      const turn = clamp(p.turn), back = p.back >= 0.5;
      // seated: the limb points are measured from the seat (the lowered origin), so they don't move with the drop
      if (p.sit) { const dy = S.bottom * p.sit; for (const k of ['a1', 'a2', 'l1', 'l2']) p[k] = [p[k][0], p[k][1] + dy, p[k][2]]; }

      // whole character + ground shadow
      n.all.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y + this.drop(p))}) rotate(${f1(p.rot)})`);
      const lift = Math.max(0, -p.y);
      n.shadow.setAttribute('transform', `translate(${f1(p.x)} 0) scale(${f1(clamp(p.shadow - lift / 260, 0.3, 1.4) * 100) / 100} 1)`);
      n.shadow.style.display = p.sit > 0.5 ? 'none' : '';

      // body space -> character space (around the hip center)
      const a = p.brot * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const B = ([x, y]) => { const yy = y * p.bsy; return [p.bx + x * ca - yy * sa, S.hip + p.by + x * sa + yy * ca]; };
      const rx = lerp(S.bodyRx, S.bodyRxSide, turn), rxT = lerp(S.bodyTop, S.bodyTopSide, turn);
      const body = egg(rxT, rx, S.neck - S.hip, S.belly - S.hip, S.bottom - S.hip);
      const bodyT = `translate(${f1(p.bx)} ${f1(S.hip + p.by)}) rotate(${f1(p.brot)}) scale(1 ${f1(p.bsy * 1000) / 1000})`;
      n.body.setAttribute('transform', bodyT);
      n.bodyPath.setAttribute('d', body);
      n.clip.firstChild.setAttribute('d', body);
      n.marks.setAttribute('transform', `translate(${f1(turn * S.marksShift)} 0)`);
      const outfit = this.dressOutfit(turn, back);
      n.bodyEdge.setAttribute('d', this.outfitClip ? body : '');
      n.bodyLine.setAttribute('d', turn > 0.75 && !back && !outfit ? `M${f1(rx * 0.1)} ${f1(S.shoulder - S.hip + 14)}Q${f1(rx * 0.35)} ${f1((S.belly - S.hip) * 0.8)} ${f1(rx * 0.05)} ${f1(S.bottom - S.hip - 26)}` : '');

      // tail: the same path, only transformed per view; behind the body, in front of it in the back view
      const tv = !sk.tail ? [0, 0, 0, 1, 1] : back ? sk.tail.at.back : turn < 0.55 ? mixAt(sk.tail.at.front, sk.tail.at.three, turn / 0.55) : mixAt(sk.tail.at.three, sk.tail.at.side, (turn - 0.55) / 0.45);
      const tb = B([tv[0], tv[1] - S.hip]);
      n.tail.setAttribute('transform', `translate(${f1(tb[0])} ${f1(tb[1])}) rotate(${f1(tv[2] + p.brot + p.tail)}) scale(${tv[3]} ${tv[4]})`);
      const tailHost = back ? n.tailFront : n.tailBack;
      if (n.tail.parentNode !== tailHost) tailHost.append(n.tail);

      // legs (+ the loadout's feet for this view)
      this.dressFeet(viewOf(turn, back));
      const hipX = lerp(S.hipX, S.hipXSide, turn);
      const legs = [[n.leg1, n.foot1, p.l1, -hipX, p.f1], [n.leg2, n.foot2, p.l2, hipX, p.f2]];
      const legSpec = this.outfitOn && this.sleeveOn !== false ? window.VersoOutfits?.SPEC?.[this.loadout.outfit]?.legs || null : null;
      const shod = !!this.loadout.feet && this.loadout.feet !== 'natural';
      for (const [leg, foot, end, hx, ft] of legs) {
        const s = B([hx, 0]);
        const fwd = lerp(hx < 0 ? -6 : 6, 10, turn);
        if (!shod) {
          const { d, c: lc } = noodle(s, end, end[2]);
          leg.o.setAttribute('d', d); leg.f.setAttribute('d', d);
          leg.o.setAttribute('stroke-linecap', 'round'); leg.f.setAttribute('stroke-linecap', 'round');
          this.dressLeg(leg, lc, legSpec);
          foot.setAttribute('transform', `translate(${f1(end[0] + fwd)} ${f1(end[1] + 2)}) rotate(${f1(ft)})`);
          continue;
        }
        // a shoe hangs on the leg's end and turns fully with the leg line (leanOf) plus the pose's foot tilt; the leg
        // arrives along the shoe's shaft (its end tangent = the shaft's axis). With an opening it is aimed at the middle
        // of the opening and ends flat just under the front lip (hidden by the shoe), so it enters centered; without
        // one (or a code-drawn shoe) it ends round on the foot, behind the shoe.
        const rot = ft + leanOf(s, end);
        const o = leg.open, rr = rot * D2R, cr = Math.cos(rr), sr = Math.sin(rr);
        const to = o ? (([u, w]) => [end[0] + (u + fwd) * cr - (w + 2) * sr, end[1] + (u + fwd) * sr + (w + 2) * cr])([o.cx, o.cy + o.ry + OUT]) : end;
        const { d, c: lc } = noodleTo(s, to, end[2], 90 + rot);
        const cap = o ? 'butt' : 'round';
        leg.o.setAttribute('d', d); leg.f.setAttribute('d', d);
        leg.o.setAttribute('stroke-linecap', cap); leg.f.setAttribute('stroke-linecap', cap);
        this.dressLeg(leg, lc, legSpec);
        const tr = `translate(${f1(end[0])} ${f1(end[1])}) rotate(${f1(rot)}) translate(${f1(fwd)} 2)`;
        foot.setAttribute('transform', tr);
        if (o) for (const q of [leg.clip, leg.rim, leg.lip]) q.setAttribute('transform', tr);
      }

      // head
      const neck = B([lerp(0, S.headSide, turn), S.neck - S.hip]);
      n.head.setAttribute('transform', `translate(${f1(neck[0] + p.hx)} ${f1(neck[1] + p.hy)}) rotate(${f1(p.brot + p.hrot)})`);
      n.headInner.setAttribute('transform', `translate(0 ${-S.headUp})`);
      if (n.neckInner) {
        n.neckTr.setAttribute('transform', n.head.getAttribute('transform'));
        n.neckInner.setAttribute('transform', `translate(0 ${-S.headUp})`);
        for (const q of [n.neckClipBody, n.neckClipTop]) q.setAttribute('transform', bodyT);
        n.neckClipBody.setAttribute('d', body);
        n.neckClipTop.setAttribute('d', `M-4000 -4000H4000V${S.neck - S.hip}H-4000Z`);
        // the gap = the neck column itself (head space -> body space), so it turns and tilts with the neck and the
        // body never shows a hole beside a tilted neck; it reaches 10 units under the body's top
        const hr = (p.brot + p.hrot) * D2R, hc = Math.cos(hr), hs = Math.sin(hr), hw = sk.neckW / 2;
        const toBody = ([u, v]) => {
          const dx = neck[0] + p.hx + u * hc - v * hs - p.bx, dy = neck[1] + p.hy + u * hs + v * hc - (S.hip + p.by);
          return [dx * ca + dy * sa, (-dx * sa + dy * ca) / p.bsy];
        };
        const q = [[-hw, -60], [hw, -60], [hw, 10], [-hw, 10]].map(toBody);
        n.neckGap.setAttribute('d', `M-4000 -4000H4000V4000H-4000ZM${q.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`);
      }
      this.skin.turnHead(n.hp, clamp(turn + p.ht, -1, 1), back, { el });
      const f = n.faces[this.faceName];
      if (f) {
        f.pupils?.forEach((pu) => pu.setAttribute('transform', `translate(${f1(p.lx * (f.lookR || 5))} ${f1(p.ly * (f.lookR || 5))})`));
        f.eyes?.forEach((e) => e.setAttribute('transform', blink < 1 ? `translate(0 ${f1(e.cy || 0)}) scale(1 ${f1(blink * 100) / 100}) translate(0 ${f1(-(e.cy || 0))})` : ''));
        // In a near-profile the far eye slides behind the head: fade it out (the side views show one eye).
        if (f.eyes?.length === 2 && this.skin.hideFarEye !== false) {
          const ht = clamp(turn + p.ht, -1, 1), fi = this.skin.farEye || 0, far = f.eyes[ht >= 0 ? fi : 1 - fi], near = f.eyes[ht >= 0 ? 1 - fi : fi];
          far.style.opacity = String(clamp((0.9 - Math.abs(ht)) / 0.15)); near.style.opacity = '';
        }
      }
      // hat: the sprite for the head's view (mirrored when the face turns screen-left), pose offsets on the slot
      const hTurn = clamp(turn + p.ht, -1, 1), hv = viewOf(hTurn, back);
      this.dressHat(hv, hv === 'front' || hv === 'back' || hTurn >= 0 ? 1 : -1);
      n.hatSlot.setAttribute('transform', `translate(${f1(p.hat[0])} ${f1(p.hat[1])}) rotate(${f1(p.hat[2])})`);
      // upside-down (head toward the ground): the hat waits off the head and pops back once upright
      const tilt = ((p.rot + p.brot + p.hrot) % 360 + 540) % 360 - 180;
      const away = Math.abs(tilt) > 115;
      if (away !== this.hatAway) {
        this.hatAway = away;
        if (this.hasHat()) {
          K.anim(n.hatPop, away
            ? [{ transform: 'translate(0px,0px) rotate(0deg)', opacity: 1 }, { transform: 'translate(-20px,-90px) rotate(-40deg)', opacity: 0 }]
            : [{ transform: 'translate(-10px,-110px) rotate(-20deg)', opacity: 0 }, { transform: 'translate(0px,8px) rotate(4deg)', opacity: 1, offset: 0.75 }, { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1 }],
          { duration: away ? 220 : 380, easing: 'ease-out' });
        }
      }

      // arms (ARMS, SHOULDER). A turned view: a NEAR arm (a1) starts exactly at its shoulder anchor (the top corner of
      // the torso just below the head) in front of the body, its root covered by the body's own fur (no outline ring
      // where the noodle starts) or, over a garment, by its short sleeve; the FAR arm (a2) starts at the far anchor
      // inside the torso and is drawn behind the body, its bend limited to ARMS.farBend. A front or back view: both arms
      // are TUCKED behind the torso (ARMS.front, or the pose's set p.arms), their roots just inside the body edge, so
      // they come out from behind its outline, each with a sleeve band; over1 / over2 draw one in front instead (under
      // a short sleeve, from the same anchor). behind: 1 (a back view reaching forward) puts both arms behind the body.
      const behind = p.behind >= 0.5;
      const edge = eggX(rxT, rx, S.neck - S.hip, S.belly - S.hip, S.shoulder - S.hip);
      const anchors = SHOULDER.anchors(S, turn, back, edge, p.arms);
      const farView = SHOULDER.isFar(turn, back) && !behind;
      const arms = [[n.arm1, p.a1, anchors[0], p.h1, p.r1, p.hs1, p.p1, 1], [n.arm2, p.a2, anchors[1], p.h2, p.r2, p.hs2, p.p2, 2]];
      // (site) a garment in the player's shirt color has its sleeve color per player (VersoOutfits.sleeveOf)
      const O = window.VersoOutfits;
      const sleeve = this.outfitOn && this.sleeveOn !== false ? ((O?.sleeveOf ? O.sleeveOf(this.loadout.outfit, this.loadout) : O?.SLEEVE?.[this.loadout.outfit]) || null) : null;
      const sleeveSpec = sleeve ? O?.SPEC?.[this.loadout.outfit] || null : null;
      // body space of a character-space point (the inverse of B), for where a tucked arm leaves the body
      const toBody = ([x, y]) => { const dx = x - p.bx, dy = y - (S.hip + p.by); return [dx * ca + dy * sa, (-dx * sa + dy * ca) / p.bsy]; };
      const outline = { rx, rxT, top: S.neck - S.hip, mid: S.belly - S.hip, bot: S.bottom - S.hip };
      // the sleeve bands of tucked arms: the set's in a front / back view (a2's blends toward the far arm's as the body
      // turns toward ARMS.farTurn, so nothing jumps at the switch), the far arm's in a turned view
      // the tucked arms' clip: everything but the body (grown by half its outline, so the outline runs over the arm)
      n.armClip.setAttribute('d', `M-4000 -4000H4000V4000H-4000Z${egg(rxT + OUT / 2, rx + OUT / 2, S.neck - S.hip - OUT / 2, S.belly - S.hip, S.bottom - S.hip + OUT / 2, 0, B)}`);
      const set = armSet(p.arms), fb = back ? 0 : clamp(turn / ARMS.farTurn);
      const bands = farView ? [null, [ARMS.farSleeve, ARMS.farSleeveW]] : [[set.band, set.bandW], [lerp(set.band, ARMS.farSleeve, fb), lerp(set.bandW, ARMS.farSleeveW, fb)]];
      for (const [arm, end0, an, shape, rOver, hs, po, k] of arms) {
        const s = B(an);
        const far = farView && k === 2;
        const tucked = behind || far || (!farView && !(p[`over${k}`] >= 0.5));
        const host = !tucked ? n.armFront : behind || far ? n.armBack : n.armMid;
        const front = host === n.armFront;
        arm.band = tucked ? bands[k - 1] || bands[1] : null;
        const w = far ? sk.armW + ARMS.farW : sk.armW;
        const end = far ? [end0[0], end0[1], clamp(end0[2], -ARMS.farBend, ARMS.farBend)] : end0;
        if (front) {
          const [ox, oy, orx, ory] = SHOULDER.oval(an, turn);
          // the root cover: the fur inside the shoulder (under a sleeve the sleeve's own cover takes over)
          arm.cover.setAttribute('transform', bodyT);
          arm.coverE.setAttribute('cx', f1(ox)); arm.coverE.setAttribute('cy', f1(oy));
          arm.coverE.setAttribute('rx', f1(orx - OUT / 2)); arm.coverE.setAttribute('ry', f1(ory - OUT / 2));
          arm.cover.style.display = sleeve ? 'none' : '';
        } else arm.cover.style.display = 'none';
        arm.o.setAttribute('stroke-width', w + OUT * 2); arm.f.setAttribute('stroke-width', w);
        arm.anchor = an; arm.s = s; arm.front = front; arm.far = far; arm.tucked = tucked; arm.w = w;
        // a sprite hand for this shape (handSprites), once sprites.json knows its wrist
        // (fn returns a name, or { name, mirror }: mirror = the sprite flipped across its own axis, the thumb to the other edge)
        const sprGot = this.sprH ? this.sprH.fn(k, shape, this) : null;
        const sprName = sprGot && typeof sprGot === 'object' ? sprGot.name : sprGot, sprMirror = !!(sprGot && sprGot.mirror);
        const info = sprName ? K.spriteInfo(sprName) : null;
        if (sprName && !info && !this.sprWait) { this.sprWait = true; K.sprReady.then(() => { this.sprLoaded = true; if (!this.dead) this.apply(this.cur, performance.now()); }); }
        const spr = info && info.wo ? info : null;
        // until sprites.json arrives the hand waits hidden; a sprite without wrist data falls back to the rig's own hand
        const waiting = !!sprName && !spr && !this.sprLoaded;
        // the arm joins the hand: its end tangent is the hand angle (sprite hands, gloves)
        const join = rOver != null && (spr || waiting || JOINED.has(shape));
        const nd = join ? noodleTo(s, end, end[2], rOver) : noodle(s, end, end[2]);
        const hr = rOver == null ? nd.ang : rOver;
        arm.c = nd.c;
        if (spr) {
          // filled noodle that widens into the sprite's wrist and runs on under its cross-faded stub
          const sc = this.sprH.scale * hs;
          const tp = taper(nd.c, w / 2, spr.wi * sc, OUT, (spr.wo - spr.wi) * sc, (FADE + 4) * sc);
          arm.tO.setAttribute('d', tp.outer); arm.tF.setAttribute('d', tp.inner);
          arm.o.setAttribute('d', ''); arm.f.setAttribute('d', '');
          arm.taper.style.display = '';
        } else {
          arm.o.setAttribute('d', nd.d); arm.f.setAttribute('d', nd.d);
          arm.taper.style.display = 'none';
        }
        this.handSprite(arm, spr ? sprName : null, spr, sprMirror);
        // Big hands (RPS close-ups) are rebuilt with a thinner outline, so it stays as thick as the rest.
        const bucket = hs > 1.25 ? Math.round(hs * 4) / 4 : 1;
        if (arm.shape !== shape || arm.bucket !== bucket) {
          arm.handInner.innerHTML = '';
          const mk = sk.hands[shape] || HANDS[shape] || HANDS.ball;
          const w = OUT / bucket;
          const blobW = (shapes, fill, ww) => blob(shapes, fill, ww ?? w);
          arm.handInner.append(mk(this.c, { el, g, blob: blobW, ink: { ...ink, 'stroke-width': w }, T, circle, ellipse, pathS, rrect, w }));
          arm.shape = shape; arm.bucket = bucket;
        }
        arm.handInner.style.display = spr || waiting ? 'none' : '';
        arm.hand.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1])}) rotate(${f1(hr + 90)}) scale(${f1((k === 2 && PAIRED.has(shape) && !spr ? -hs : hs) * 1000) / 1000} ${f1(hs * 1000) / 1000})`);
        arm.prop.setAttribute('transform', `translate(${f1(end[0])} ${f1(end[1])}) rotate(${f1(hr + po[2])}) translate(${po[0]} ${po[1]})`);
        // where a tucked arm leaves the body outline (body space; its sleeve band ends a little past it)
        arm.exit = null;
        if (tucked) {
          const A = arc(nd.c, 40);
          for (let d = 2; d <= A.len; d += 2) {
            const q = toBody(bez(nd.c, A.at(d)));
            if (!insideEgg(outline, q)) { arm.exit = q; arm.exitD = d; break; }
          }
        }
        arm.roll = clamp(p[`roll${k}`] || 0);
        this.dressSleeve(arm, nd.c, sleeve, front, sleeveSpec);
        arm.ang = hr; arm.end = end; arm.hs = hs; arm.root.dataset.arm = far ? 'far' : tucked ? 'tucked' : 'near';
        if (arm.root.parentNode !== host) host.append(arm.root);
      }
      // front1: a1 on top of a2 and its prop when both share a layer; else under it
      const r1 = n.arm1.root, r2 = n.arm2.root;
      if (r1.parentNode === r2.parentNode) {
        const top = p.front1 >= 0.5 && !behind, last = r1.parentNode.lastChild;
        if (top && last !== r1) r1.parentNode.append(r1);
        else if (!top && last !== r2) r2.parentNode.append(r2);
      }
    }

    // --- sleeves (every garment; ARMS) ---
    // A near arm (or an over arm): a short sleeve (ARMS.sleeve of the arm's length, at most ARMS.sleeveMax) from the
    // shoulder, its root covered inside the body in the same color. A tucked arm (the far arm, the front / back views):
    // a band from its hidden root to arm.band[0] units past the point where the arm leaves the body, arm.band[1] wider
    // than the arm (ARMS.farSleeve / farSleeveW, ARMS.front band / bandW), the same color. color = the garment's
    // SLEEVE token.
    dressSleeve(arm, c, color, front, spec = null) {
      arm.rolledLen = null;
      if (!color) { arm.sleeve.style.display = 'none'; return; }
      const a = arc(c), w = arm.w / 2;
      let sb, t1, len;
      if (spec?.long) {
        // a LONG sleeve: the whole arm from its root to just before the hand, a hair wider than the arm (flare: a bell
        // cuff widening over the last quarter), the same on near, far and tucked arms. On a PLAYING arm (arm.roll = the
        // pose's roll1 / roll2, tweened) it is ROLLED UP (ARMS.roll): it ends at frac of the visible arm (a tucked or
        // far arm's from where it leaves the body), a thick rolled band with a fold line, the forearm bare
        const r = arm.roll || 0, full = Math.max(4, a.len - 3), s0 = arm.tucked && arm.exit ? arm.exitD : 0;
        len = Math.max(4, lerp(full, Math.min(full, s0 + ARMS.roll.frac * (a.len - s0)), r)); t1 = a.at(len);
        const fl = (spec.flare || 0) * (1 - r), hw = (t) => w + 2 + 0.8 * (t / t1) + fl * clamp((t / t1 - 0.72) / 0.28) ** 1.5;
        sb = band(c, 0, t1, (t) => hw(t), OUT, true);
        this.sleeveExtras(arm, c, a, len, hw, spec, len, r, color);
        arm.rolledLen = len; arm.rolledFrom = s0;
      } else if (arm.tucked) {
        if (!arm.exit) { arm.sleeve.style.display = 'none'; return; }
        const [bl, extra] = arm.band;
        len = arm.exitD + bl; t1 = a.at(len);
        sb = band(c, 0, t1, (t, u) => w + extra + 1.2 * u, OUT, true);
        this.sleeveExtras(arm, c, a, len, (t) => w + extra + 1.2 * (t / t1), spec, bl);
      } else {
        len = Math.min(ARMS.sleeveMax, a.len * ARMS.sleeve); t1 = a.at(len);
        sb = band(c, 0, t1, (t, u) => w + 3 + 1.5 * u, OUT, true);
        this.sleeveExtras(arm, c, a, len, (t) => w + 3 + 1.5 * (t / t1), spec, len);
      }
      arm.slO.setAttribute('d', sb.outer); arm.slF.setAttribute('d', sb.inner); arm.slF.setAttribute('fill', color);
      const [ox, oy, orx, ory] = SHOULDER.oval(arm.anchor, clamp(this.cur.turn));
      arm.slCover.setAttribute('transform', this.n.body.getAttribute('transform'));
      arm.slE.setAttribute('cx', f1(ox)); arm.slE.setAttribute('cy', f1(oy)); arm.slE.setAttribute('rx', f1(orx)); arm.slE.setAttribute('ry', f1(ory)); arm.slE.setAttribute('fill', color);
      arm.slCover.style.display = front ? '' : 'none';
      arm.sleeve.style.display = '';
    }
    // The cuff (spec.cuff; spec.cuffW = its share of the sleeve's length: of the whole arm for a long sleeve, of the
    // visible part vis for a short sleeve's trim band) and the ring stripes (spec.stripe) of a sleeve that ends at arc
    // length len; hw(t) = the sleeve's half-width at the Bezier parameter t. roll (a long sleeve on a playing arm, 0..1):
    // the cuff turns into the rolled band (ARMS.roll: len units, extra wider, the sleeve color mixed toward the outline,
    // a fold line across its middle); in between (a tween) its length, width and color blend.
    sleeveExtras(arm, c, a, len, hw, spec, vis = len, roll = 0, color = null) {
      const t1 = a.at(len), R = ARMS.roll;
      let cl = spec?.cuff ? clamp(spec.cuffW * (spec.long ? a.len : vis), 3, spec.long ? 16 : 8) : 0, extra = 0.3, fill = spec?.cuff;
      if (roll > 0 && color) {
        const rc = `color-mix(in srgb, ${color} ${100 - R.mix}%, ${T('outline')})`;
        fill = roll >= 1 || !spec.cuff ? rc : `color-mix(in srgb, ${rc} ${Math.round(roll * 100)}%, ${spec.cuff})`;
        cl = lerp(cl, R.len, roll); extra = lerp(0.3, R.extra, roll);
      }
      arm.cuL.setAttribute('d', '');
      if (cl >= 1) {
        const cb = band(c, a.at(Math.max(0, len - cl)), t1, (t) => hw(t) + extra, OUT);
        arm.cuO.setAttribute('d', cb.outer); arm.cuF.setAttribute('d', cb.inner); K.paint(arm.cuF, 'fill', fill);
        if (roll > 0 && color) {
          // the fold line across the roll's middle, bowed a little toward the hand
          const [x, y, tx, ty] = bez(c, a.at(Math.max(0, len - cl / 2))), h = hw(a.at(Math.max(0, len - cl / 2))) * 1.2;
          arm.cuL.setAttribute('d', `M${f1(x + ty * h)} ${f1(y - tx * h)}Q${f1(x + tx * 1.5)} ${f1(y + ty * 1.5)} ${f1(x - ty * h)} ${f1(y + tx * h)}`);
          arm.cuL.setAttribute('stroke-opacity', f1(roll));
        }
        arm.cuff.style.display = '';
      } else arm.cuff.style.display = 'none';
      if (spec?.stripe) {
        const end = len - cl - 3;
        let d = '';
        for (let x = Math.max(6, len - vis + 4); x + 4.5 < end; x += 10) d += band(c, a.at(x), a.at(x + 4.5), (t) => hw(t) - 0.2, 0).inner;
        arm.slS.setAttribute('d', d); K.paint(arm.slS, 'fill', spec.stripe);
        arm.slS.style.display = d ? '' : 'none';
      } else arm.slS.style.display = 'none';
    }
    // A full-body garment's trouser leg (outfits.js SPEC legs { color, stripe, ankle, ankleW }), or the bare leg.
    dressLeg(leg, c, spec) {
      if (!spec) {
        if (leg.dressed) { K.paint(leg.f, 'stroke', this.c.fur); leg.st.style.display = 'none'; leg.cuff.style.display = 'none'; leg.dressed = false; }
        return;
      }
      leg.dressed = true;
      K.paint(leg.f, 'stroke', spec.color);
      const a = arc(c), w = this.skin.legW / 2, end = Math.max(6, a.len - 9), hw = () => w + 0.6;
      const cl = spec.ankle ? clamp(spec.ankleW * a.len, 5, 12) : 0;
      if (cl) {
        const cb = band(c, a.at(Math.max(0, end - cl)), a.at(end), () => w + 1.6, OUT);
        leg.cO.setAttribute('d', cb.outer); leg.cF.setAttribute('d', cb.inner); K.paint(leg.cF, 'fill', spec.ankle);
        leg.cuff.style.display = '';
      } else leg.cuff.style.display = 'none';
      if (spec.stripe) {
        let d = '';
        for (let x = 4; x + 4.5 < end - cl; x += 10) d += band(c, a.at(x), a.at(x + 4.5), hw, 0).inner;
        leg.st.setAttribute('d', d); K.paint(leg.st, 'fill', spec.stripe);
        leg.st.style.display = d ? '' : 'none';
      } else leg.st.style.display = 'none';
    }
    // The mascot lab can switch the sleeves off to compare (sleeves(false)); the games always draw them.
    sleeves(on = true) { this.sleeveOn = !!on; this.apply(this.cur, performance.now()); return this; }

    // --- sprite hands ---
    // fn(k, shape, rig) -> a sprite name (hand-<species>-<gesture>-<face>, sprites.json with the wrist fields wo/wi/wa
    // from tools/art-v3.js wristCut) or null for the rig's own hand. scale: sprite px -> character units. The sprite's
    // wrist anchor sits exactly on the arm's end, turned along the arm's end tangent (its stub direction wa
    // compensated); the arm is drawn as a filled noodle that widens to the stub's outline/fill widths and runs on under
    // the first FADE px of the sprite, which fade in over it (mask): no gap, no seam, whatever the pose.
    handSprites(fn, { scale = 0.34 } = {}) {
      this.sprH = fn ? { fn, scale } : null;
      this.apply(this.cur, performance.now());
      return this;
    }
    handSprite(arm, name, info, mirror = false) {
      if (!name) { if (arm.spr) arm.spr.g.style.display = 'none'; return; }
      if (!arm.spr) {
        const img = el('image', { preserveAspectRatio: 'none', mask: `url(#${this.n.fade})` });
        arm.spr = { g: g({ class: 'rig-hand-spr', filter: this.n.handTint ? `url(#${this.n.handTint})` : null }, img), img, name: null };
        arm.hand.append(arm.spr.g);
      }
      const s = arm.spr;
      s.g.style.display = '';
      // (the hand frame points the fingers to -y; the sprites point them to +x along their stub; a mirrored sprite is
      // flipped across its stub's axis, so the wrist stays on the arm)
      const tf = () => (mirror ? `rotate(-90) scale(${this.sprH.scale} ${-this.sprH.scale}) rotate(${f1(-(info.wa || 0))})` : `rotate(${f1(-90 - (info.wa || 0))}) scale(${this.sprH.scale})`);
      if (s.name !== name) {
        s.name = name;
        s.img.setAttribute('href', K.asset ? K.asset(`hands/${name}.webp`) : `/assets/${name}.webp`);   // (site)
        s.img.setAttribute('x', -info.ax); s.img.setAttribute('y', -info.ay); s.img.setAttribute('width', info.w); s.img.setAttribute('height', info.h);
        s.g.setAttribute('transform', tf());
        s.info = info;
      } else if (s.scale !== this.sprH.scale || s.mirror !== mirror) s.g.setAttribute('transform', tf());
      s.scale = this.sprH.scale; s.mirror = mirror;
    }
    // Scene coordinates of the middle of a hand (a sprite hand: the middle of its picture) and its radius (scene units).
    handMid(k) {
      const arm = this.n[`arm${k}`], s = arm.spr, e = arm.end || this.cur[`a${k}`];
      if (!s || s.g.style.display === 'none' || !s.info) return this.world(e);
      const i = s.info, sc = this.sprH.scale * (arm.hs || 1), w = (i.wa || 0) * D2R, a = arm.ang * D2R;
      // the picture's middle relative to the wrist, along the stub (u) and across it (v; flipped when mirrored)
      const px = (i.w / 2 - i.ax) * sc, py = (i.h / 2 - i.ay) * sc;
      const u = px * Math.cos(w) + py * Math.sin(w), v = (-px * Math.sin(w) + py * Math.cos(w)) * (s.mirror ? -1 : 1);
      const lx = u, ly = v;
      return this.world([e[0] + lx * Math.cos(a) - ly * Math.sin(a), e[1] + lx * Math.sin(a) + ly * Math.cos(a)]);
    }
    handRadius(k) {
      const arm = this.n[`arm${k}`], s = arm.spr, sc = this.placeAt[2];
      if (!s || s.g.style.display === 'none' || !s.info) return 22 * (arm.hs || 1) * sc;
      return Math.max(s.info.w, s.info.h) / 2 * this.sprH.scale * (arm.hs || 1) * sc;
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
      const S = this.skin.skel, p = this.cur;
      return this.world([p.bx + p.hx, S.neck + p.by + p.hy - S.headUp]);
    }
  }
  function mixAt(a, b, t) { t = clamp(t); return a.map((v, i) => lerp(v, b[i], t)); }

  // The half-width of the body egg (egg(): rxT at the top, rx at mid) at the height y, from its upper curve.
  function eggX(rxT, rx, top, mid, y) {
    if (y <= top) return 0;
    if (y >= mid) return rx;
    const y1 = mid - (mid - top) * 0.56;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2, u = 1 - t, yy = u * u * u * top + 3 * u * u * t * top + 3 * u * t * t * y1 + t * t * t * mid;
      if (yy < y) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2, u = 1 - t;
    return 3 * u * u * t * rxT + 3 * u * t * t * rx + t * t * t * rx;
  }
  // The arms' setup (the owner's picks, art-source/screens/arm-variants-2 Shootout 6 / RPS 6 with the near arm of
  // round 1 variant 5). farTurn: from this torso turn on (not from the back) a2 is the far arm. far: where the far arm
  // starts, in body space: at e of the way from the shoulder line down to the belly, inset units inside the body edge
  // (hidden by the torso, so it comes out from behind the body just below the head). farBend: the far arm's bend limit
  // (a gentle line). farW: its width against skin.armW (a hair thinner, it is further away). sleeve / sleeveMax: a near
  // arm's short sleeve (fraction of the arm's length, at most); farSleeve / farSleeveW: the far arm's smaller band
  // (units past the body edge, wider than the arm by).
  // front: the FRONT and BACK views (the owner's picks of art-source/screens/arm-variants-3: front-idle 5, kicker 3):
  // both arms TUCKED behind the torso, their roots at e of the way from the shoulder line down to the belly, inset units
  // inside the body edge (the outline runs over them), each with a sleeve band reaching band units past the point where
  // the arm leaves the body, bandW wider than the arm. sets: other sets a pose picks with its arms field (Penalty's
  // keeper: penalty-keeper 2, arms: 'keeper').
  const ARMS = {
    farTurn: 0.1, far: { e: 0.12, inset: 18 }, farBend: 0.12, farW: -1, sleeve: 0.22, sleeveMax: 22, farSleeve: 8, farSleeveW: 1,
    front: { e: 0.05, inset: 3, band: 14, bandW: 3 },
    sets: { keeper: { e: 0.15, inset: 10, band: 9, bandW: 2 } },
    // a long sleeve rolled up on a playing arm (the owner's pick, exploration round 4 long sleeves variant 5): it ends
    // at frac of the visible arm, the roll len units long, extra wider, the sleeve color mixed mix percent toward the
    // outline, a fold line (stroke width fold) across its middle
    roll: { frac: 0.55, len: 10, extra: 3, mix: 14, fold: 2.2 },
  };
  const armSet = (name) => (name && ARMS.sets[name]) || ARMS.front;
  // The body outline (egg(): rxT at the top, rx at mid, a round bottom) in body space: is q inside it?
  function eggHalf(o, y) {
    if (y < o.top || y > o.bot) return -1;
    if (y <= o.mid) return eggX(o.rxT, o.rx, o.top, o.mid, y);
    const k = 0.56, Y = (t) => { const u = 1 - t; return u * u * u * o.mid + 3 * u * u * t * (o.mid + (o.bot - o.mid) * k) + 3 * u * t * t * o.bot + t * t * t * o.bot; };
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) { const t = (lo + hi) / 2; if (Y(t) < y) lo = t; else hi = t; }
    const t = (lo + hi) / 2, u = 1 - t;
    return u * u * u * o.rx + 3 * u * u * t * o.rx + 3 * u * t * t * o.rx * k;
  }
  const insideEgg = (o, [x, y]) => Math.abs(x) < eggHalf(o, y);
  // The SHOULDER anchors: body-space points [a1, a2] where the arms start (body space: origin at the hip center, y
  // down; edge = the body's half-width at the shoulder height skel.shoulder, just below the head):
  //   a turned view (turn >= ARMS.farTurn, not from the back): a1 = the NEAR arm on the top corner of the torso, just
  //     inside the outline (IN), a little higher and tucked in at 3/4 (the rig faces right), sliding to the middle of the
  //     side in profile; a2 = the FAR arm at ARMS.far, inside the torso on the +x side.
  //   a front / back view: both arms TUCKED at the arm set's anchor (ARMS.front, or ARMS.sets[set]: tuck()),
  //     symmetric; while the body turns toward ARMS.farTurn they slide toward the turned view's anchors (a1 to its
  //     corner, a2 to ARMS.far), so a root never jumps when the view switches.
  // isFar(turn, back): whether a2 is the far arm. oval() = the shoulder around a front arm's anchor [cx, cy, rx, ry]: the
  // root cover (fur, or the sleeve's color under a sleeve), clipped to the body.
  const SHOULDER = {
    IN: 6,
    isFar: (turn, back) => !back && turn >= ARMS.farTurn,
    // a point at e of the way from the shoulder line down to the belly, inset units inside the body edge (+x side)
    at(S, turn, e, inset) {
      const t = clamp(turn), rx = lerp(S.bodyRx, S.bodyRxSide, t), rxT = lerp(S.bodyTop, S.bodyTopSide, t);
      const top = S.neck - S.hip, mid = S.belly - S.hip, y = S.shoulder - S.hip + e * (mid - (S.shoulder - S.hip));
      return [eggX(rxT, rx, top, mid, y) - inset, y];
    },
    far: (S, turn) => SHOULDER.at(S, turn, ARMS.far.e, ARMS.far.inset),
    tuck: (S, turn, set) => { const st = armSet(set); return SHOULDER.at(S, turn, st.e, st.inset); },
    anchors(S, turn, back, edge, set = null) {
      const yS = S.shoulder - S.hip, x0 = edge - SHOULDER.IN;
      const [tx, ty] = SHOULDER.tuck(S, turn, set);
      if (back) return [[-tx, ty], [tx, ty]];
      const t1 = clamp(turn / 0.55), t2 = clamp((turn - 0.55) / 0.45);
      const a1 = [-(x0 - 3 * t1), yS - 3 * t1];
      if (!SHOULDER.isFar(turn, back)) {
        const f = clamp(turn / ARMS.farTurn), fa = SHOULDER.far(S, turn);
        return [[lerp(-tx, a1[0], f), lerp(ty, a1[1], f)], [lerp(tx, fa[0], f), lerp(ty, fa[1], f)]];
      }
      const near1 = turn <= 0.55 ? a1 : [lerp(a1[0], S.shoulderXSide - 5, t2), lerp(a1[1], yS - 4, t2)];
      return [near1, SHOULDER.far(S, turn)];
    },
    oval: ([x, y], turn) => [x, y + 2, 12 - 1.5 * clamp(turn), 13.5],
  };

  // The character-space point of arm k's shoulder anchor for a pose (no idle life; seated poses in their seat-relative
  // limb coordinates, like a1/a2): scenes aim an arm from it (a gun arm, a pointing arm). sp = a species id or skin.
  function shoulderOf(sp, pose, k) {
    const sk = typeof sp === 'string' ? skins[sp] || skins[order[0]] : sp, S = sk.skel, p = resolve(pose);
    const turn = clamp(p.turn), back = p.back >= 0.5;
    const rx = lerp(S.bodyRx, S.bodyRxSide, turn), rxT = lerp(S.bodyTop, S.bodyTopSide, turn);
    const an = SHOULDER.anchors(S, turn, back, eggX(rxT, rx, S.neck - S.hip, S.belly - S.hip, S.shoulder - S.hip), p.arms)[k - 1];
    const a = p.brot * D2R, yy = an[1] * p.bsy;
    return [p.bx + an[0] * Math.cos(a) - yy * Math.sin(a), S.hip + p.by + an[0] * Math.sin(a) + yy * Math.cos(a) - S.bottom * (p.sit || 0)];
  }

  // ---------------- avatars and stills ----------------
  // who -> a full character { species, hat, outfit, feet }: a character object (validated; unknown species ->
  // 'monkey'), a species id (+ loadout, else the default loadout), or null / 'you' / 'opp' (that side from the store).
  function resolveWho(who, side = 'you', loadout = null) {
    const C = COS();
    const val = (l) => (C?.valid ? C.valid(l) : { ...NO_COSMETICS, ...(l || {}) });
    const fallback = skins.monkey ? 'monkey' : order[0];
    if (who && typeof who === 'object') return { species: skins[who.species] ? who.species : fallback, ...val(who) };
    if (typeof who === 'string' && skins[who]) return { species: who, ...val(loadout) };
    if (who === 'you' || who === 'opp') side = who;
    return loadout ? { species: speciesFor(side), ...val(loadout) } : characterFor(side);
  }
  // Static SVG markup of a character (signature in the header). The head avatar keeps the body (the outfit's collar
  // shows under the chin) but drops legs, arms and tail; the disc is cut to the head. pose: e.g. { turn: 0.55 } for a
  // 3/4 head (dev pages); hat adds headroom on top; body draws the whole figure, feet on the bottom edge.
  function avatarSvg(who, side = 'you', { face = null, hat = false, body = false, loadout = null, pose = null, flip = false } = {}) {
    const ch = resolveWho(who, side, loadout);
    const r = new Rig({ species: ch.species, side, idle: false, hat, loadout: ch, flip });
    if (pose) r.set(pose);
    r.face(face || r.skin.defaultFace, true);
    r.destroy();
    let svg;
    if (body) {
      const H = 372 + (hat ? 90 : 0);
      svg = el('svg', { viewBox: `-180 ${20 - H} 360 ${H}`, class: 'mascot-avatar-svg mascot-figure-svg', 'aria-hidden': 'true' });
    } else {
      const S = r.skin.skel, top = S.neck - S.headUp - r.skin.avatarBox - (hat ? 60 : 0);
      const size = r.skin.avatarBox * 2 + (hat ? 60 : 0);
      svg = el('svg', { viewBox: `${-size / 2} ${f1(top)} ${size} ${size}`, class: 'mascot-avatar-svg', 'aria-hidden': 'true' });
      r.n.shadow.remove(); r.n.legs.remove(); r.n.armBack.remove(); r.n.armMid.remove(); r.n.armFront.remove(); r.n.tailBack.remove(); r.n.tailFront.remove();
    }
    svg.dataset.species = ch.species;
    svg.append(r.root);
    return svg.outerHTML;
  }
  // A LIVE idle figure filling host (customizer preview, profile window): { svg, rig, set(who), destroy() }. who as in
  // avatarSvg; 'you' / 'opp' follow the store (species and loadout), anything else is pinned. The SVG keeps the feet
  // on its bottom edge (preserveAspectRatio xMidYMax meet), so the host decides the size.
  function stage(host, who = 'you', { pose = 'idle', mood = 'idle', idle = true, flip = false, hat = true } = {}) {
    const svg = el('svg', { viewBox: '-190 -450 380 474', class: 'mascot-stage', width: '100%', height: '100%', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' });
    let rig = null;
    const make = (w) => {
      if (rig) { rig.destroy(); rig.root.remove(); }
      const follow = w === 'you' || w === 'opp';
      const ch = follow ? null : resolveWho(w);
      rig = create(follow ? { side: w, pose, idle, flip, hat, mood } : { species: ch.species, loadout: ch, pose, idle, flip, hat, mood });
      svg.append(rig.root);
      api.rig = rig;
    };
    const api = {
      svg, rig: null,
      set(w) { make(w); return api; },
      destroy() { rig?.destroy(); svg.remove(); },
    };
    make(who);
    host.innerHTML = '';
    host.append(svg);
    return api;
  }
  // A hand/paw icon for controls (Rock / Paper / Scissors) in your team's species. Wrapped in a span that is
  // repainted when the team changes.
  function handSvg(gesture, species = speciesFor('you')) {
    const sk = skins[species];
    const mk = sk.hands[gesture] || HANDS[gesture] || HANDS.ball;
    const node = mk(sk.colorsFor ? sk.colorsFor(loadoutFor('you')) : sk.colors, { el, g, blob: (s, f, w) => blob(s, f, w ?? 3), ink: { ...ink, 'stroke-width': 3 }, T, circle, ellipse, pathS, rrect, w: 3 });
    // (skin.handIconBox: a box fitted to the species' hands, so the control icons show them big)
    return el('svg', { viewBox: sk.handIconBox || '-46 -90 92 92', class: 'ico mascot-hand' }, node).outerHTML;
  }
  const handIcon = (gesture) => `<span class="mascot-hand-wrap" data-mascot-hand="${gesture}">${handSvg(gesture)}</span>`;

  // Fills every [data-mascot] element (avatars) on the page (attributes in the header): data-mascot="you|opp" follows
  // the store, data-mascot="monkey|cat" is fixed (default loadout), data-character pins a whole character.
  function paintAvatars(rootEl = document) {
    rootEl.querySelectorAll('[data-mascot-hand]').forEach((node) => {
      const sp = speciesFor('you');
      if (node.dataset.painted === sp) return;
      node.dataset.painted = sp;
      node.innerHTML = handSvg(node.dataset.mascotHand, sp);
    });
    rootEl.querySelectorAll('[data-mascot]').forEach((node) => {
      const v = node.dataset.mascot;
      let who = null;
      if (node.dataset.character) { try { who = JSON.parse(node.dataset.character); } catch { who = null; } }
      if (!who) who = skins[v] ? v : null;
      const side = node.dataset.side || (v === 'opp' ? 'opp' : 'you');
      const opts = { hat: node.dataset.hat === '1', body: node.dataset.body === '1' };
      const ch = resolveWho(who, side);
      const key = JSON.stringify([ch.species, ch.hat, ch.outfit, ch.feet, opts.hat, opts.body]);
      if (node.dataset.painted === key) return;
      node.dataset.painted = key;
      node.innerHTML = avatarSvg(ch, side, opts);
    });
  }

  // My species changing re-skins my live rigs and every store-following avatar.
  function onTeamChange() {
    for (const r of live) if (!r.dead) r.syncTeam();
    paintAvatars();
  }
  window.VersoTeam?.onChange?.(onTeamChange);
  // Loadout changes (mine, the opponent's character) re-skin / re-dress every live rig and avatar that follows them.
  window.VersoCosmetics?.onChange?.(() => {
    for (const r of live) if (!r.dead) { r.syncTeam(); r.syncLoadout(); }
    paintAvatars();
  });

  window.VersoMascots = {
    register, skins: () => order.map((id) => skins[id]), skin: (id) => skins[id], ids: () => [...order],
    create, POSES, REST, resolve, EASE, speciesFor, characterFor, resolveWho, avatarSvg, stage, paintAvatars, handIcon, handSvg,
    noodle, egg, blob, HANDS, OUT, drawFoot, viewOf, loadoutFor, noodleTo, taper, band, arc, SHOULDER, ARMS, eggX, eggHalf, insideEgg, blend, arcOf, bowedAt, bez, shoulderOf,
    liveRigs: () => [...live].filter((r) => !r.dead),   // dev tools (scene lab screenshots)
  };
})();
