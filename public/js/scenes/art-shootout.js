// Code-drawn art for the shootout scene (see art.js for the registry contract): a dusty frontier street at noon (the
// background), the hanging saloon sign, the two wooden fences the duelists take cover behind (intact, shot through,
// blown apart into pieces), the vulture on the green rooftop, the tumbleweed, dust, puffs, wind gusts and the four
// control icons. Every color is a sho-* token (server/theme-scenes/shootout.js) or a shared one.
(function () {
  const A = window.DuelArt;
  if (!A) return;
  const T = A.T, ink = A.ink;
  const E = (...a) => window.DuelKit.el(...a);
  const G = (...a) => window.DuelKit.g(...a);
  const f1 = (n) => Math.round(n * 10) / 10;
  const pts = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  const R = (x, y, w, h, fill, extra = {}) => E('rect', { x, y, width: w, height: h, fill, ...extra });
  const PG = (list, fill, extra = {}) => E('polygon', { points: pts(list), fill, ...extra });
  const C = (cx, cy, r, fill, extra = {}) => E('circle', { cx, cy, r, fill, ...extra });
  const P = (d, extra = {}) => E('path', { d, ...extra });
  const line = (d, color, w, extra = {}) => P(d, { fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });
  // a soft cloud of circles with one outline around the whole shape: outlined copies under plain ones
  const blob = (circles, fill, edge, ew) => G({},
    ...circles.map(([x, y, r]) => C(x, y, r, edge, { stroke: edge, 'stroke-width': ew * 2 })),
    ...circles.map(([x, y, r]) => C(x, y, r, fill)));

  // ======================= the background: 1600 x 900 =======================
  // The street runs from the viewer to the far end at the horizon (y 505). The duelists stand on it at y ~667, in
  // front of the porches; the tumbleweed crosses its far stretch (y ~532, x 650..1120); the vulture perches on the
  // green building's cap (its top edge at y 203, x 1290..1426).
  const HZ = 505;
  function sky() {
    return G({}, R(0, 0, 1600, 530, T('sho-sky')), R(0, 330, 1600, 200, T('sho-sky-2'), { opacity: 0.4 }), R(0, 430, 1600, 100, T('sho-sky-2'), { opacity: 0.6 }));
  }
  function sun() {
    return G({}, C(962, 107, 96, T('sho-sun-halo'), { opacity: 0.3 }), C(962, 107, 72, T('sho-sun-halo'), { opacity: 0.55 }), C(962, 107, 54, T('sho-sun')));
  }
  function cloud(x, y, s) {
    return G({ transform: `translate(${x} ${y}) scale(${s})` },
      C(-56, 0, 30, T('sho-cloud')), C(-18, -20, 40, T('sho-cloud')), C(30, -10, 34, T('sho-cloud')), C(66, 4, 24, T('sho-cloud')),
      R(-86, 0, 176, 28, T('sho-cloud'), { rx: 14 }));
  }
  function mesas() {
    return G({},
      PG([[590, HZ], [640, 452], [668, 426], [806, 420], [832, 446], [900, HZ]], T('sho-mesa-far')),
      PG([[860, HZ], [930, 462], [948, 434], [1050, 430], [1068, 456], [1150, HZ]], T('sho-mesa')),
      PG([[948, 434], [1050, 430], [1053, 440], [950, 445]], T('sho-mesa-2')),
      PG([[668, 426], [806, 420], [809, 430], [670, 436]], T('sho-mesa-2'), { opacity: 0.7 }));
  }
  function cactus(x, y, s) {
    const c = T('sho-cactus'), e = { stroke: T('sho-far-line'), 'stroke-width': 3 / s };
    return G({ transform: `translate(${x} ${y}) scale(${s})` },
      P('M-7 0 V-62 Q-7 -70 0 -70 Q7 -70 7 -62 V0 Z', { fill: c, ...e }),
      P('M-7 -30 H-18 Q-24 -30 -24 -36 V-48 Q-24 -53 -20 -53 Q-16 -53 -16 -48 V-38 H-7', { fill: c, ...e }),
      P('M7 -38 H16 V-54 Q16 -59 20 -59 Q24 -59 24 -54 V-38 Q24 -31 17 -31 H7', { fill: c, ...e }));
  }
  // small facades at the far end of the street, with the road's gap between them
  function farTown() {
    const rows = [[606, 64, 50, 1], [668, 56, 68, 2], [722, 64, 44, 1], [862, 62, 56, 2], [922, 78, 40, 1], [998, 56, 64, 2], [1052, 70, 46, 1]];
    const edge = { stroke: T('sho-far-line'), 'stroke-width': 2, 'stroke-linejoin': 'round' };
    return G({}, ...rows.map(([x, w, h, k]) => G({},
      R(x, HZ - h, w, h, T(`sho-far-${k}`), edge),
      R(x - 2, HZ - h - 5, w + 4, 6, T('sho-trim'), edge),
      R(x + w * 0.2, HZ - h * 0.62, w * 0.22, h * 0.26, T('sho-far-win')),
      R(x + w * 0.58, HZ - h * 0.62, w * 0.22, h * 0.26, T('sho-far-win')))),
    cactus(836, HZ - 1, 0.32), cactus(648, HZ + 2, 0.45));
  }
  function ground() {
    const patch = (x, y, rx, ry) => E('ellipse', { cx: x, cy: y, rx, ry, fill: T('sho-sand-2'), opacity: 0.5 });
    const pebble = (x, y, rx) => E('ellipse', { cx: x, cy: y, rx, ry: rx * 0.55, fill: T('sho-sand-2'), stroke: T('sho-rut'), 'stroke-width': 2 });
    return G({},
      R(0, HZ, 1600, 900 - HZ, T('sho-sand')),
      PG([[762, HZ], [878, HZ], [1470, 900], [130, 900]], T('sho-road')),
      PG([[797, HZ], [802, HZ], [494, 900], [470, 900]], T('sho-rut'), { opacity: 0.55 }),
      PG([[838, HZ], [843, HZ], [1132, 900], [1108, 900]], T('sho-rut'), { opacity: 0.55 }),
      patch(300, 770, 120, 15), patch(1010, 824, 160, 17), patch(650, 706, 90, 10), patch(1300, 726, 110, 12), patch(170, 866, 140, 15),
      patch(1430, 858, 150, 15), patch(905, 622, 60, 6), patch(565, 602, 50, 5), patch(1050, 580, 40, 4), patch(760, 560, 34, 3),
      pebble(262, 820, 9), pebble(700, 862, 8), pebble(1182, 786, 10), pebble(1500, 806, 8), pebble(560, 742, 6), pebble(980, 702, 6),
      // shade along the porches
      PG([[0, 648], [600, 648], [636, 668], [0, 672]], T('shadow'), { opacity: 0.14 }),
      PG([[1100, 604], [1440, 604], [1440, 620], [1086, 616]], T('shadow'), { opacity: 0.12 }),
      PG([[1380, 664], [1600, 664], [1600, 688], [1360, 680]], T('shadow'), { opacity: 0.14 }));
  }
  function windowAt(x, y, w, h, s = 4) {
    return G({},
      R(x - 6, y - 6, w + 12, h + 12, T('sho-trim'), { ...ink(s), rx: 3 }),
      R(x, y, w, h, T('sho-glass'), ink(s * 0.7)),
      PG([[x + w * 0.12, y + h * 0.55], [x + w * 0.5, y + h * 0.1], [x + w * 0.66, y + h * 0.1], [x + w * 0.28, y + h * 0.55]], T('sho-glass-2'), { opacity: 0.8 }),
      line(`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`, T('sho-trim'), s * 1.4));
  }
  function siding(x0, x1, y0, y1, color, step = 30) {
    let d = '';
    for (let y = y0 + step; y < y1; y += step) d += `M${x0} ${y} H${x1}`;
    return line(d, color, 3, { opacity: 0.7 });
  }
  // the saloon on the near left
  function saloon() {
    const wall = T('sho-wall-red');
    return G({},
      PG([[560, 130], [604, 160], [604, 622], [560, 640]], T('sho-wall-red-2'), ink(5)),
      PG([[-10, 640], [-10, 132], [40, 132], [40, 98], [500, 98], [500, 132], [560, 132], [560, 640]], wall, ink(5)),
      siding(-10, 560, 132, 640, T('sho-wall-red-2')),
      R(28, 86, 484, 16, T('sho-trim'), { ...ink(4), rx: 3 }),
      R(-16, 122, 62, 13, T('sho-trim'), ink(4)), R(494, 122, 74, 13, T('sho-trim'), ink(4)),
      windowAt(48, 160, 66, 84), windowAt(438, 160, 66, 84),
      // the porch: roof, shade, doorway with swinging doors, posts, floor, step
      PG([[-10, 290], [580, 290], [612, 342], [-10, 342]], T('sho-plank-2'), ink(5)),
      line('M60 292 L64 340 M150 292 L156 340 M240 292 L248 340 M330 292 L340 340 M420 292 L432 340 M510 292 L524 340', T('sho-plank-3'), 3),
      R(-10, 342, 572, 270, T('shadow'), { opacity: 0.12 }),
      windowAt(60, 420, 96, 104), windowAt(408, 420, 96, 104),
      R(214, 404, 124, 208, T('sho-door'), ink(4)),
      P('M222 470 H272 V560 H222 Z M280 470 H330 V560 H280 Z', { fill: T('sho-plank'), ...ink(3.5) }),
      line('M222 500 H272 M280 500 H330 M222 530 H272 M280 530 H330', T('sho-plank-3'), 3),
      ...[18, 176, 364, 540].map((x) => R(x, 342, 22, 272, T('sho-plank'), ink(4))),
      R(-10, 610, 610, 22, T('sho-plank'), ink(4)),
      R(-10, 630, 610, 18, T('sho-plank-3'), ink(4)),
      R(244, 646, 120, 12, T('sho-plank-2'), ink(3)));
  }
  // the green store in the middle right (the vulture's rooftop)
  function rightMid() {
    return G({},
      PG([[1150, 250], [1118, 276], [1118, 592], [1150, 600]], T('sho-wall-green-2'), ink(5)),
      PG([[1150, 600], [1150, 250], [1282, 250], [1282, 216], [1426, 216], [1426, 600]], T('sho-wall-green'), ink(5)),
      siding(1150, 1426, 216, 600, T('sho-wall-green-2'), 28),
      R(1144, 242, 144, 12, T('sho-trim'), ink(4)),
      R(1288, 203, 144, 14, T('sho-trim'), { ...ink(4), rx: 2 }),
      windowAt(1190, 284, 56, 70), windowAt(1324, 284, 56, 70),
      PG([[1110, 392], [1440, 392], [1440, 432], [1096, 432]], T('sho-plank-2'), ink(5)),
      R(1100, 432, 340, 150, T('shadow'), { opacity: 0.12 }),
      windowAt(1168, 466, 78, 76),
      R(1296, 456, 74, 126, T('sho-door'), ink(4)),
      ...[1106, 1270, 1414].map((x) => R(x, 432, 18, 150, T('sho-plank'), ink(4))),
      R(1096, 578, 344, 14, T('sho-plank'), ink(4)),
      R(1096, 590, 344, 12, T('sho-plank-3'), ink(4)));
  }
  // the tall tan building on the near right
  function rightNear() {
    return G({},
      PG([[1420, 72], [1394, 98], [1394, 650], [1420, 662]], T('sho-wall-tan-2'), ink(5)),
      PG([[1420, 662], [1420, 72], [1448, 72], [1448, 42], [1620, 42], [1620, 662]], T('sho-wall-tan'), ink(5)),
      siding(1420, 1620, 72, 662, T('sho-wall-tan-2'), 32),
      R(1442, 30, 184, 14, T('sho-trim'), { ...ink(4), rx: 3 }),
      windowAt(1462, 116, 58, 86), windowAt(1546, 116, 58, 86),
      PG([[1390, 410], [1620, 410], [1620, 452], [1372, 452]], T('sho-plank-2'), ink(5)),
      R(1394, 452, 226, 188, T('shadow'), { opacity: 0.12 }),
      windowAt(1470, 492, 88, 96),
      ...[1398, 1584].map((x) => R(x, 452, 20, 190, T('sho-plank'), ink(4))),
      R(1372, 638, 250, 14, T('sho-plank'), ink(4)),
      R(1372, 650, 250, 14, T('sho-plank-3'), ink(4)));
  }
  A.bg['shootout-street'] = () => G({ class: 'sho-street' },
    sky(), sun(), cloud(650, 190, 1.1), cloud(1250, 118, 0.9), cloud(262, 64, 0.8), cloud(1530, 300, 0.7),
    mesas(), ground(), farTown(), saloon(), rightMid(), rightNear());

  // The saloon sign: a board hanging on two short ropes, anchored at its top center (it sways on a gust).
  A.add('el-sho-sign', 300, 100, 150, 0, () => G({},
    line('M70 0 V20 M230 0 V20', T('sho-sign-ink'), 5),
    R(10, 18, 280, 78, T('sho-sign'), { ...ink(5), rx: 10 }),
    R(22, 28, 256, 58, 'none', { stroke: T('sho-sign-ink'), 'stroke-width': 3, rx: 6, opacity: 0.5 }),
    E('text', { x: 150, y: 59, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'Fredoka, sans-serif', 'font-weight': 600, 'font-size': 44, 'letter-spacing': 4, fill: T('sho-sign-ink') }, 'SALOON')));

  // ======================= the fences =======================
  // The left fence in its 496 x 296 box (anchor: the bottom center). It is seen at an angle, its far end toward the
  // street center: the top rail runs from y 91 (near end) up to 27 (far end), the bottom plank's lower edge from 293 to
  // 179, the posts stand on the foot line from (0, 296) to (496, 205). shootout.js clips the duelist along the same
  // bottom edge and rests the hands on the top rail. The right fence is the mirror image.
  const FW = 496, FH = 296;
  const top = (x) => 91 - x * 0.129, bot = (x) => 292.6 - x * 0.229, foot = (x) => FH - x * 0.1835;
  const rowY = (x, k) => top(x) + (bot(x) - top(x)) * k;
  // board i (0 = top) of four, from x0 to x1: its corners
  function board(i, x0, x1) {
    const a = i ? 2 : 0, b = i < 3 ? 2 : 0;
    return [[x0, rowY(x0, i / 4) + a], [x1, rowY(x1, i / 4) + a], [x1, rowY(x1, (i + 1) / 4) - b], [x0, rowY(x0, (i + 1) / 4) - b]];
  }
  // a post from x0 to x1, its top at yTop (sloped like the rail), standing on the foot line
  const post = (x0, x1, yTop) => [[x0, yTop], [x1, yTop - (x1 - x0) * 0.13], [x1, foot(x1)], [x0, foot(x0)]];
  const POSTS = [[0, 34, top(17) - 18], [236, 262, top(249) - 14], [468, 494, top(481) - 10]];
  const wood = (list, extra = {}) => PG(list, T('sho-fence'), { ...ink(5), ...extra });
  function boardDetail(i, x0, x1) {
    const y = (x, k) => rowY(x, (i + k) / 4);
    return G({},
      line(`M${x0 + 8} ${f1(y(x0 + 8, 0.2))} L${x1 - 8} ${f1(y(x1 - 8, 0.2))}`, T('sho-fence-3'), 4),
      line(`M${x0 + 60} ${f1(y(x0 + 60, 0.62))} L${x0 + 150} ${f1(y(x0 + 150, 0.62))}`, T('sho-fence-2'), 3),
      ...[17, 249, 481].map((x) => C(x, f1(y(x, 0.5)), 3.2, T('sho-fence-hole'))));
  }
  function fenceBody() {
    return G({},
      PG([[-6, 290], [FW + 6, 199], [FW + 10, 214], [6, 304]], T('shadow'), { opacity: 0.22 }),
      ...POSTS.map(([x0, x1, y]) => wood(post(x0, x1, y), { fill: T('sho-fence-2') })),
      ...[0, 1, 2, 3].map((i) => G({}, wood(board(i, 6, 490)), boardDetail(i, 6, 490))));
  }
  // bullet holes with a splintered rim and a crack
  function hole(x, y, r, crack) {
    const n = 9, star = Array.from({ length: n * 2 }, (_, k) => {
      const a = (k / (n * 2)) * Math.PI * 2, rr = k % 2 ? r * 1.25 : r * 2.1;
      return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
    });
    return G({}, PG(star, T('sho-fence-in'), ink(2.5)), C(x, y, r, T('sho-fence-hole')), line(crack, T('sho-fence-hole'), 3));
  }
  function fenceDamaged() {
    return G({}, fenceBody(),
      hole(284, 120, 8, 'M296 118 L318 112 L332 116'),
      hole(208, 156, 7, 'M200 160 L182 170 L170 168'),
      hole(352, 98, 6, 'M360 100 L380 92'),
      hole(150, 206, 7, 'M140 208 L120 214'));
  }
  const mirror = (node, w) => G({ transform: `translate(${w} 0) scale(-1 1)` }, node);
  const sides = { l: (n) => n, r: (n) => mirror(n, FW) };
  for (const [c, wrap] of Object.entries(sides)) {
    A.add(`el-fence-${c}-intact`, FW, FH, FW / 2, FH, () => wrap(fenceBody()));
    A.add(`el-fence-${c}-damaged`, FW, FH, FW / 2, FH, () => wrap(fenceDamaged()));
  }

  // The blast pieces: each one a part of the left fence in the box above (polygons in its coordinates); its element is
  // its own bounding box with the anchor at the center, and gx, gy = that center from the fence's bottom center (where
  // the piece sat in the fence; mirrored for the right fence). 6 and 7 are the broken post stumps that stay standing;
  // 1, 2, 5, 12, 13, 14 are small splinters.
  const jagRight = (q, n = 3) => {
    const [p0, p1, p2, p3] = q, out = [p0, p1];
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push([p1[0] + (k % 2 ? 9 : -7), p1[1] + (p2[1] - p1[1]) * t]); }
    return [...out, p2, p3];
  };
  const jagLeft = (q, n = 3) => {
    const [p0, p1, p2, p3] = q, out = [p0, p1, p2, p3];
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push([p3[0] + (k % 2 ? -9 : 7), p3[1] + (p0[1] - p3[1]) * t]); }
    return out;
  };
  const sliver = (x, y, len, w, a) => {
    const c = Math.cos(a), s = Math.sin(a), p = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    return [p(-len / 2, -w / 2), p(len / 2, -w * 0.1), p(len / 2 - 4, w / 2), p(-len / 2 + 3, w / 2)];
  };
  const stumpTop = (x0, x1, y) => [[x0, y + 8], [x0 + (x1 - x0) * 0.3, y - 4], [x0 + (x1 - x0) * 0.5, y + 6], [x0 + (x1 - x0) * 0.75, y - 2], [x1, y + 6]];
  const PIECES = {
    1: { polys: [sliver(196, 132, 34, 9, -0.4)], light: true },
    2: { polys: [sliver(300, 104, 28, 8, 0.5)], light: true },
    3: { polys: [jagRight(board(0, 34, 249)), jagRight(board(1, 34, 238))] },
    4: { polys: [jagLeft(board(0, 249, 468)), jagLeft(board(1, 238, 468))] },
    5: { polys: [sliver(250, 196, 30, 8, 1.1)], light: true },
    6: { polys: [[...stumpTop(0, 34, 228), [34, foot(34)], [0, FH]]], post: true },
    7: { polys: [[...stumpTop(468, 494, 150), [494, foot(494)], [468, foot(468)]]], post: true },
    8: { polys: [jagRight(board(2, 34, 256)), jagRight(board(3, 34, 244))] },
    9: { polys: [jagLeft(board(2, 256, 468)), jagLeft(board(3, 244, 468))] },
    10: { polys: [post(236, 262, top(249) - 14)], post: true },
    11: { polys: [[...post(0, 34, top(17) - 18).slice(0, 2), [34, 232], [24, 222], [12, 234], [0, 226]]], post: true },
    12: { polys: [sliver(150, 176, 26, 8, -1.0)], light: true },
    13: { polys: [sliver(352, 150, 32, 9, 0.2)], light: true },
    14: { polys: [sliver(276, 76, 24, 7, -0.8)], light: true },
  };
  const PAD = 5;
  for (const [i, pc] of Object.entries(PIECES)) {
    const all = pc.polys.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const x0 = Math.min(...xs) - PAD, y0 = Math.min(...ys) - PAD, w = Math.max(...xs) + PAD - x0, h = Math.max(...ys) + PAD - y0;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const fill = pc.light ? T('sho-fence-in') : pc.post ? T('sho-fence-2') : T('sho-fence');
    for (const c of ['l', 'r']) {
      const flip = c === 'r';
      const draw = () => G({ transform: flip ? `translate(${f1(w)} 0) scale(-1 1)` : '' },
        G({ transform: `translate(${f1(-x0)} ${f1(-y0)})` }, ...pc.polys.map((q) => PG(q, fill, ink(pc.light ? 3 : 5)))));
      A.add(`el-fence-${c}-piece-${i}`, f1(w), f1(h), f1(w / 2), f1(h / 2), draw);
      Object.assign(A.el[`el-fence-${c}-piece-${i}`], { gx: f1((flip ? -1 : 1) * (cx - FW / 2)), gy: f1(cy - FH) });
    }
  }
  // the blown-apart fence as one picture (591 x 273, bottom center): the two stumps and boards lying in the street
  for (const [c, wrap] of Object.entries({ l: (n) => n, r: (n) => mirror(n, 591) })) {
    A.add(`el-fence-${c}-blasted`, 591, 273, 295.5, 273, () => wrap(G({ transform: 'translate(47 -23)' },
      ...[6, 7].map((i) => G({}, ...PIECES[i].polys.map((q) => PG(q, T('sho-fence-2'), ink(5))))),
      wood([[60, 286], [250, 262], [252, 278], [62, 300]]), wood([[280, 250], [440, 224], [442, 238], [284, 264]]))));
  }

  // ======================= the vulture =======================
  // 300 x 360, anchored at the perch between its feet (151, 324), facing right (the scene mirrors it to face the
  // street). Frames: 1 = watching, 2 = looking down, 3 = wings half open; the blink lids sit on frame 1's eye.
  const VW = 300, VH = 360, VA = [151, 324];
  const vInk = (w = 12) => ink(w);
  const EYE = [238, 70];
  function vulture(frame) {
    const body = T('sho-vul-body'), wing = T('sho-vul-wing'), head = T('sho-vul-head'), beak = T('sho-vul-beak');
    const legs = G({},
      line('M128 290 L126 318 M160 292 L160 318', T('outline'), 22), line('M128 290 L126 318 M160 292 L160 318', beak, 10),
      line('M112 324 Q124 312 138 324 M146 324 Q160 312 174 324', T('outline'), 20), line('M112 324 Q124 312 138 324 M146 324 Q160 312 174 324', beak, 9));
    const tail = PG([[86, 290], [36, 346], [74, 344], [112, 304]], wing, vInk(10));
    const torso = E('ellipse', { cx: 140, cy: 232, rx: 70, ry: 92, transform: 'rotate(-16 140 232)', fill: body, ...vInk() });
    const folded = P('M100 168 Q62 248 86 322 L106 300 L120 324 L134 298 L146 318 Q172 252 158 178 Z', { fill: wing, ...vInk(10) });
    const open = G({},
      P('M118 178 L28 98 L44 150 L8 138 L46 196 L20 204 L96 252 Z', { fill: wing, ...vInk(10) }),
      P('M164 180 L262 120 L246 170 L288 166 L244 214 L268 226 L176 258 Z', { fill: wing, ...vInk(10) }));
    const ruff = blob([[146, 150, 30], [182, 140, 27], [204, 160, 22], [126, 166, 22]], T('sho-vul-ruff'), T('outline'), 6);
    const down = frame === 2;
    const neckD = down ? 'M186 148 Q214 146 236 168' : 'M186 150 Q200 110 224 90';
    const hc = down ? [246, 172] : [232, 78];
    const neck = G({}, line(neckD, T('outline'), 46), line(neckD, head, 24));
    const beakD = down ? 'M262 160 Q290 184 274 214 Q266 198 250 196 Z' : 'M252 64 Q290 68 294 96 Q282 88 260 92 Z';
    const eye = down ? [252, 164] : EYE;
    const face = G({},
      C(hc[0], hc[1], 30, head, vInk()),
      P(beakD, { fill: beak, ...vInk(10) }),
      C(eye[0], eye[1], 9, T('flash'), vInk(5)), C(eye[0] + 3, eye[1] + 1, 4.5, T('outline')),
      line(`M${eye[0] - 13} ${eye[1] - 11} L${eye[0] + 10} ${eye[1] - 8}`, T('outline'), 6));
    return G({}, frame === 3 ? open : null, tail, legs, torso, frame === 3 ? null : folded, ruff, neck, face);
  }
  for (const n of [1, 2, 3]) A.add(`el-vulture-${n}`, VW, VH, VA[0], VA[1], () => vulture(n));
  A.add('el-vulture', VW, VH, VA[0], VA[1], () => vulture(1));
  A.add('el-vulture-blink-half', VW, VH, VA[0], VA[1], () =>
    P(`M${EYE[0] - 10} ${EYE[1] + 1} A10 10 0 0 1 ${EYE[0] + 10} ${EYE[1] + 1} Z`, { fill: T('sho-vul-head'), ...vInk(5) }));
  A.add('el-vulture-blink-closed', VW, VH, VA[0], VA[1], () => G({},
    C(EYE[0], EYE[1], 10.5, T('sho-vul-head')), line(`M${EYE[0] - 9} ${EYE[1] + 2} Q${EYE[0]} ${EYE[1] + 7} ${EYE[0] + 9} ${EYE[1] + 2}`, T('outline'), 5)));

  // ======================= tumbleweed, dust, puffs, wind =======================
  // The tumbleweed: eight roll frames (the same ball turned by 45 degrees each, 92 x 92, centered) and two squash
  // frames for the landings (104 x 77, standing on the ground).
  const twigs = 'M-30 -10 Q-4 -36 26 -18 M-28 16 Q0 -6 31 12 M-12 33 Q-22 0 -4 -35 M10 34 Q24 4 8 -33 M-34 2 Q0 26 30 -8 M38 -14 L46 -18 M-40 -16 L-47 -20 M4 40 L6 47 M-24 -34 L-28 -41';
  const weed = () => G({},
    C(0, 0, 38, T('sho-weed'), { ...ink(5), opacity: 0.9 }),
    line(twigs, T('sho-weed-2'), 4.5),
    C(-8, -6, 14, 'none', { stroke: T('sho-weed-2'), 'stroke-width': 3 }));
  for (let i = 1; i <= 8; i++) A.add(`el-weed-roll-${i}`, 92, 92, 46, 46, () => G({ transform: `translate(46 46) rotate(${(i - 1) * 45})` }, weed()));
  A.add('el-weed-squash-1', 104, 77, 52, 77, () => G({ transform: 'translate(52 42) scale(1.16 0.84)' }, weed()));
  A.add('el-weed-squash-2', 104, 77, 52, 77, () => G({ transform: 'translate(52 48) scale(1.26 0.7)' }, weed()));
  // dust clouds (centered), in three sizes
  const DUST = [[174, 153], [260, 230], [360, 325]];
  DUST.forEach(([w, h], k) => A.add(`el-dust-${k + 1}`, w, h, w / 2, h / 2, () => blob(
    [[w * 0.34, h * 0.58, w * 0.2], [w * 0.55, h * 0.4, w * 0.24], [w * 0.72, h * 0.6, w * 0.18], [w * 0.5, h * 0.66, w * 0.2], [w * 0.22, h * 0.68, w * 0.12]],
    T('sho-dust'), T('sho-dust-2'), w * 0.025)));
  // small puffs that sit on the ground (bottom center)
  [[[30, 58, 22], [62, 44, 30], [94, 58, 22]], [[36, 54, 26], [74, 50, 28], [100, 62, 16]], [[28, 62, 18], [56, 50, 26], [88, 54, 24]]].forEach((cs, k) =>
    A.add(`el-puff-${k + 1}`, 126, 80, 63, 80, () => blob(cs, T('sho-dust'), T('sho-dust-2'), 3)));
  // wind gusts: a swoosh blowing right with a curl at its front (220 x ~90, centered)
  const GUSTS = [
    ['M10 52 C60 44 120 58 170 50 C198 46 204 24 186 22 C172 21 168 36 180 38', 'M40 70 C80 66 112 72 140 68'],
    ['M8 40 C70 34 128 50 176 44 C204 40 206 66 188 68 C174 69 172 56 182 54', 'M30 22 C70 18 100 24 124 20'],
    ['M12 48 C70 56 132 40 182 46 C206 49 210 26 194 22 C180 19 174 32 184 36', null],
    ['M6 56 C56 50 104 60 150 54 C176 50 182 30 166 26 C152 23 148 38 160 40', 'M64 30 C100 26 140 32 196 28'],
    ['M14 44 C60 36 120 52 168 44 C196 40 200 18 182 16 C168 15 164 30 176 32', 'M24 64 C60 60 92 68 120 64'],
    ['M10 50 C70 46 140 54 196 46', 'M50 30 C96 26 136 32 168 28 C188 26 192 12 180 10'],
  ];
  GUSTS.forEach(([a, c], k) => A.add(`el-gust-${k + 1}`, 220, 90, 110, 45, () => G({},
    line(a, T('sho-wind-edge'), 13), c ? line(c, T('sho-wind-edge'), 11) : null,
    line(a, T('sho-wind'), 7), c ? line(c, T('sho-wind'), 5.5) : null)));

  // ======================= control icons (64 x 64) =======================
  const icon = (build) => A.icon('0 0 64 64', build);
  const bullet = (x) => G({},
    R(x - 6, 26, 12, 26, T('sho-brass'), { ...ink(3), rx: 2 }),
    P(`M${x - 6} 27 Q${x - 6} 10 ${x} 8 Q${x + 6} 10 ${x + 6} 27 Z`, { fill: T('sho-copper'), ...ink(3) }),
    R(x - 7.5, 49, 15, 7, T('sho-brass-2'), { ...ink(3), rx: 2 }));
  A.icons['sho-reload'] = icon(() => G({}, bullet(15), bullet(32), bullet(49)));
  A.icons['sho-block'] = icon(() => G({},
    R(9, 10, 9, 48, T('sho-fence-2'), { ...ink(3), rx: 2 }), R(46, 10, 9, 48, T('sho-fence-2'), { ...ink(3), rx: 2 }),
    ...[16, 29, 42].map((y) => R(4, y, 56, 11, T('sho-fence'), { ...ink(3), rx: 2 })),
    line('M10 20 H24 M30 33 H50 M14 46 H30', T('sho-fence-3'), 2.5)));
  A.icons['sho-shoot'] = icon(() => G({},
    R(28, 21, 30, 8, T('gunmetal'), { ...ink(3), rx: 2 }),
    R(54, 17, 3, 5, T('gunmetal'), ink(2)),
    P('M16 20 H34 V36 H24 Q22 44 18 50 L8 48 Q12 38 12 30 Z', { fill: T('gunmetal'), ...ink(3) }),
    R(20, 18, 14, 16, T('gunmetal-light'), { ...ink(3), rx: 3 }),
    line('M22 23 V30 M27 23 V30 M32 23 V30', T('gunmetal'), 2),
    P('M12 32 H23 L19 54 Q12 56 6 52 Z', { fill: T('wood'), ...ink(3) }),
    P('M23 36 Q24 44 30 43', { fill: 'none', ...ink(3) }),
    P('M14 20 L10 13 L16 13 Z', { fill: T('gunmetal'), ...ink(2.5) })));
  A.icons['sho-blast'] = icon(() => G({},
    P('M2 32 L18 26 L22 36 L6 44 Z', { fill: T('wood'), ...ink(3) }),
    R(16, 24, 30, 9, T('gunmetal'), { ...ink(3), rx: 2 }),
    R(22, 32, 24, 5, T('gunmetal-light'), { ...ink(2.5), rx: 2 }),
    R(28, 34, 12, 7, T('wood'), { ...ink(2.5), rx: 2 }),
    PG([[50, 28], [55, 18], [57, 26], [63, 22], [59, 30], [64, 36], [57, 34], [54, 43], [52, 34]], T('muzzle'), ink(2.5))));
})();
