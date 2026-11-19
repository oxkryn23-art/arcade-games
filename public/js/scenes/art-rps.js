// Code-drawn art for the RPS scenes (see art.js for the registry contract): a calm evening room in side view. A wall
// with a wainscot, a window on the left (a plant below it), a picture over a sideboard on the right, a wooden floor
// with a rug, and in the middle a small pedestal table between two wooden chairs facing each other. The chairs and the
// table line up with the seats in rps-duel.js (STAGE.seat: the seat top sits just under the seat point, the feet rest
// on the rug at ROOM.feet). The pendant lamp, the plant's leaves and the cloud in the window are separate elements, so
// the scene can sway / drift them (rps-duel.js ambient()).
(function () {
  const A = window.DuelArt;
  if (!A) return;
  const T = A.T;

  // The room's key lines (viewBox units), shared with rps-duel.js.
  const ROOM = {
    feet: 680,                          // where feet, chair legs and the table base touch the rug
    seatTop: 595,                       // the chair seats' top (the seat point of rps-duel.js is 2 units above, scaled)
    win: [128, 166, 302, 376],          // the window glass [x0, y0, x1, y1] (the drifting cloud is clipped to it)
    lamp: [800, 0],                     // the pendant lamp's hook
    plant: [214, 566],                  // the plant's leaves grow from the pot's top here
  };
  A.rpsRoom = ROOM;

  const el = (...a) => window.DuelKit.el(...a);
  const g = (attrs, ...c) => el('g', attrs, ...c);
  const shape = (tag, attrs, fill, w = 4) => el(tag, { ...attrs, fill: T(fill), ...(w ? A.ink(w) : {}) });
  const path = (d, fill, w = 4) => shape('path', { d }, fill, w);
  const rect = (x, y, wd, ht, r, fill, w = 4) => shape('rect', { x, y, width: wd, height: ht, rx: r }, fill, w);
  const line = (d, color, w = 3) => el('path', { d, fill: 'none', stroke: T(color), 'stroke-width': w, 'stroke-linecap': 'round' });
  const soft = (cx, cy, rx, ry, o = 0.25) => el('ellipse', { cx, cy, rx, ry, fill: T('shadow'), opacity: o });

  // A wooden chair facing +x, its seat front at x 530 (the left one; the right one is this mirrored).
  function chair() {
    const { feet, seatTop: s } = ROOM;
    return g({ class: 'rps-chair' },
      soft(458, feet + 2, 92, 7),
      // the back post (the backrest seen edge on), running down into the back leg
      path(`M362 432Q363 420 376 420L388 420Q395 421 395 432L397 520L402 ${feet}L389 ${feet}L383 520Z`, 'rps-wood'),
      line(`M384 436L386 508`, 'rps-wood-hi', 4),
      rect(398, 640, 116, 8, 3, 'rps-wood-dark', 3),                     // the stretcher
      rect(510, s + 12, 13, feet - s - 12, 3, 'rps-wood'),                // the front leg
      rect(380, s, 152, 16, 7, 'rps-wood'),                               // the seat
      line(`M392 ${s + 5}L520 ${s + 5}`, 'rps-wood-hi', 3));
  }

  function table() {
    const { feet } = ROOM;
    return g({ class: 'rps-table' },
      soft(800, feet + 2, 160, 8),
      path(`M732 ${feet}Q738 652 800 650Q862 652 868 ${feet}Z`, 'rps-table-dark'),
      rect(788, 516, 24, 140, 4, 'rps-table'),
      line('M796 528L796 640', 'rps-table-hi', 3),
      rect(606, 498, 388, 22, 9, 'rps-table'),
      line('M620 505L980 505', 'rps-table-hi', 3));
  }

  function windowLeft() {
    const [x0, y0, x1, y1] = ROOM.win, mx = (x0 + x1) / 2;
    return g({ class: 'rps-window' },
      rect(x0 - 16, y0 - 16, x1 - x0 + 32, y1 - y0 + 32, 6, 'rps-trim'),
      rect(x0, y0, x1 - x0, y1 - y0, 2, 'rps-sky', 3),
      path(`M${x0} ${y1 - 70}Q${x0 + 60} ${y1 - 110} ${x0 + 120} ${y1 - 84}Q${x1 - 30} ${y1 - 64} ${x1} ${y1 - 96}L${x1} ${y1}L${x0} ${y1}Z`, 'rps-hill-far', 0),
      path(`M${x0} ${y1 - 36}Q${x0 + 80} ${y1 - 72} ${x1} ${y1 - 30}L${x1} ${y1}L${x0} ${y1}Z`, 'rps-hill', 0),
      // the blind rolled up at the top, the mullions, the sill
      rect(x0, y0, x1 - x0, 26, 2, 'rps-blind', 3),
      line(`M${mx} ${y0 + 26}L${mx} ${y1}M${x0} ${y0 + 112}L${x1} ${y0 + 112}`, 'rps-trim', 8),
      rect(x0 - 30, y1 + 12, x1 - x0 + 60, 16, 4, 'rps-trim'),
      line(`M${x0 - 22} ${y1 + 24}L${x1 + 22} ${y1 + 24}`, 'rps-trim-shade', 3));
  }

  function plantPot() {
    const [x, y] = ROOM.plant;
    return g({ class: 'rps-pot' },
      soft(x, 640, 60, 6),
      path(`M${x - 46} ${y}L${x + 46} ${y}L${x + 36} 638L${x - 36} 638Z`, 'rps-pot'),
      rect(x - 52, y - 6, 104, 18, 5, 'rps-pot-dark'));
  }

  function pictureRight() {
    return g({ class: 'rps-picture' },
      rect(1306, 168, 172, 132, 4, 'rps-frame'),
      rect(1320, 182, 144, 104, 2, 'rps-mat', 0),
      rect(1334, 194, 116, 80, 1, 'rps-art-sky', 3),
      el('circle', { cx: 1416, cy: 222, r: 14, fill: T('rps-art-sun') }),
      path('M1334 274L1370 236L1394 256L1418 232L1450 268L1450 274Z', 'rps-art-hill', 3));
  }

  function sideboard() {
    return g({ class: 'rps-sideboard' },
      soft(1400, 640, 120, 6),
      rect(1300, 610, 12, 30, 3, 'rps-board'), rect(1488, 610, 12, 30, 3, 'rps-board'),
      rect(1290, 512, 220, 104, 6, 'rps-board'),
      line('M1400 526L1400 604', 'rps-board-hi', 3),
      el('circle', { cx: 1386, cy: 564, r: 5, fill: T('rps-knob'), ...A.ink(2.5) }),
      el('circle', { cx: 1414, cy: 564, r: 5, fill: T('rps-knob'), ...A.ink(2.5) }),
      rect(1280, 500, 240, 16, 6, 'rps-board-hi'),
      // a vase with two stems and a stack of books on top
      line('M1352 456Q1346 420 1332 404M1358 456Q1366 424 1380 410', 'rps-leaf-dark', 4),
      path('M1342 500Q1336 478 1346 462L1364 462Q1374 478 1368 500Z', 'rps-vase'),
      rect(1430, 482, 70, 18, 4, 'rps-book-1'),
      rect(1438, 466, 58, 16, 4, 'rps-book-2'));
  }

  // The rug: a flat strip on the floor under the table and the chairs.
  function rug() {
    const f = ROOM.feet;
    return g({ class: 'rps-rug' },
      path(`M352 ${f - 16}L1248 ${f - 16}L1282 ${f + 26}L318 ${f + 26}Z`, 'rps-rug'),
      path(`M372 ${f - 9}L1228 ${f - 9}L1254 ${f + 19}L346 ${f + 19}Z`, 'rps-rug-edge', 0),
      line(`M366 ${f + 5}L1234 ${f + 5}`, 'rps-rug-stripe', 4));
  }

  A.bg['rps-table'] = (K) => {
    const { W, H } = K.SIZE;
    // floor planks: lines further apart toward the viewer, a few staggered seams
    const planks = [652, 690, 740, 806, 884], seams = [];
    planks.forEach((y, i) => { if (i < planks.length - 1) for (let x = (i % 2 ? 140 : 300); x < W; x += 420) seams.push(`M${x} ${y}L${x - 10 - i * 4} ${planks[i + 1]}`); });
    return g({ class: 'rps-room' },
      el('rect', { x: 0, y: 0, width: W, height: 470, fill: T('rps-wall') }),
      el('rect', { x: 0, y: 470, width: W, height: 146, fill: T('rps-wall-low') }),
      el('rect', { x: 0, y: 464, width: W, height: 10, fill: T('rps-wall-rail') }),
      el('rect', { x: 0, y: 612, width: W, height: 20, fill: T('rps-base') }),
      el('rect', { x: 0, y: 632, width: W, height: H - 632, fill: T('rps-floor') }),
      line(`M0 632L${W} 632`, 'outline', 4),
      line(planks.map((y) => `M0 ${y}L${W} ${y}`).join('') + seams.join(''), 'rps-floor-line', 3),
      windowLeft(), plantPot(), pictureRight(), sideboard(), rug(),
      table(), chair(), g({ transform: `translate(${W} 0) scale(-1 1)` }, chair()));
  };

  // The pendant lamp, hanging from its hook (anchor = the top of the cord).
  A.add('el-rps-lamp', 160, 230, 80, 0, () => g({},
    el('circle', { cx: 80, cy: 160, r: 56, fill: T('rps-lamp-glow'), opacity: 0.1 }),
    el('circle', { cx: 80, cy: 156, r: 30, fill: T('rps-lamp-glow'), opacity: 0.25 }),
    line('M80 0L80 96', 'rps-cord', 4),
    rect(70, 90, 20, 16, 4, 'rps-lamp-dark', 3),
    el('circle', { cx: 80, cy: 152, r: 14, fill: T('rps-bulb'), ...A.ink(3) }),
    path('M20 154Q22 102 80 102Q138 102 140 154Z', 'rps-lamp'),
    line('M42 132Q60 116 80 114', 'rps-bulb', 4)));

  // The plant's leaves, growing from the pot (anchor = the bottom center).
  A.add('el-rps-plant', 240, 240, 120, 240, () => {
    const leaf = (rot, len, wd, fill) => g({ transform: `translate(120 240) rotate(${rot})` },
      path(`M0 0Q${wd} ${-len * 0.45} 0 ${-len}Q${-wd} ${-len * 0.45} 0 0Z`, fill, 3.5),
      line(`M0 -6L0 ${-len + 14}`, 'rps-leaf-dark', 2.5));
    return g({}, leaf(-62, 150, 30, 'rps-leaf-dark'), leaf(58, 150, 30, 'rps-leaf-dark'), leaf(-36, 196, 34, 'rps-leaf'),
      leaf(32, 190, 34, 'rps-leaf'), leaf(-8, 224, 36, 'rps-leaf'), leaf(12, 160, 30, 'rps-leaf-dark'));
  });

  // A small cloud (center anchor), drifting across the window view.
  A.add('el-cloud-1', 308, 215, 154, 108, () => g({},
    path('M40 160Q8 160 10 130Q12 100 48 102Q52 60 100 58Q130 28 172 50Q214 30 240 74Q290 76 294 116Q298 160 256 160Z', 'rps-cloud', 6)));

  // ---------------- outcome effects (centered on 0,0, about size across) ----------------
  // rock: stone shards flying out of a white impact star
  A.fx.rock = (size) => {
    const s = size / 2, rnd = A.rand(7), shards = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rnd() * 0.5, d = s * (0.6 + rnd() * 0.25), k = s * (0.15 + rnd() * 0.08);
      const x = Math.cos(a) * d, y = Math.sin(a) * d, r = rnd() * 360;
      const p = path(`M${(-k).toFixed(1)} ${(k * 0.6).toFixed(1)}L${(k * 0.2).toFixed(1)} ${(-k).toFixed(1)}L${k.toFixed(1)} ${(k * 0.4).toFixed(1)}Z`, i % 2 ? 'rps-fx-stone' : 'rps-fx-stone-hi', 3);
      p.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(0)})`);
      shards.push(p);
    }
    const star = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = s * (i % 2 ? 0.2 : 0.5); star.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`); }
    return g({}, path(`M${star.join('L')}Z`, 'flash', 3), ...shards);
  };
  // scissors: two crossing slashes and a few speed ticks
  A.fx.scissors = (size) => {
    const s = size / 2;
    const slash = (sy) => path(`M${-s * 0.85} ${-s * 0.5 * sy}Q0 ${-s * 0.05 * sy} ${s * 0.85} ${s * 0.5 * sy}Q${-s * 0.05} ${s * 0.16 * sy} ${-s * 0.85} ${-s * 0.5 * sy}Z`, 'flash', 3);
    return g({}, slash(1), slash(-1),
      line(`M${s * 0.5} ${-s * 0.75}L${s * 0.62} ${-s * 0.92}M${s * 0.78} ${-s * 0.6}L${s * 0.95} ${-s * 0.7}M${s * 0.5} ${s * 0.75}L${s * 0.62} ${s * 0.92}`, 'flash', 5));
  };
  // paper: a wrap sweeping around (a curved paper band with fold lines)
  A.fx.paper = (size) => {
    const s = size / 2, R1 = s * 1.05, R2 = s * 0.66;
    const pt = (r, deg) => `${(Math.cos(deg * Math.PI / 180) * r).toFixed(1)} ${(Math.sin(deg * Math.PI / 180) * r).toFixed(1)}`;
    const band = `M${pt(R1, -170)}A${R1} ${R1} 0 1 1 ${pt(R1, 60)}L${pt(R2, 48)}A${R2} ${R2} 0 1 0 ${pt(R2, -160)}Z`;
    return g({}, path(band, 'rps-fx-paper', 3.5),
      line(`M${pt(R1 - 5, -105)}L${pt(R2 + 5, -100)}M${pt(R1 - 5, -40)}L${pt(R2 + 5, -36)}M${pt(R1 - 5, 20)}L${pt(R2 + 5, 22)}`, 'rps-fx-paper-fold', 3));
  };
  // clash: a spark star and four small diamonds
  A.fx.clash = (size) => {
    const s = size / 2, star = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = s * (i % 2 ? 0.2 : 0.62); star.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`); }
    const dia = (a) => {
      const x = Math.cos(a) * s * 0.85, y = Math.sin(a) * s * 0.85, k = s * 0.09;
      return path(`M${(x - k).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y - k * 1.6).toFixed(1)}L${(x + k).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${(y + k * 1.6).toFixed(1)}Z`, 'rps-fx-spark', 2.5);
    };
    return g({}, path(`M${star.join('L')}Z`, 'rps-fx-spark', 3), el('circle', { r: s * 0.16, fill: T('flash') }), ...[0.4, 2, 3.6, 5.2].map(dia));
  };
})();
