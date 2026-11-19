// Code-drawn art for the penalty scene (see art.js for the registry contract): the stadium background (sky,
// floodlights, the roof, the stands, the ad boards, the pitch with its mowing stripes and lines, the goal frame and net),
// the crowd (seated, cheering and back-row fans as simple people), the goal flags, scarves, confetti, the floodlight
// heads and the control / scoreboard icons. Colors: server/theme-scenes/penalty.js (pen-*).
//
// A.pen holds the geometry the scene lines up with (penalty.js reads it): the goal frame and the back plane of its
// net, and the seat grid of the stands (row tops, seat columns, aisles, sections).
(function () {
  const A = window.DuelArt;
  if (!A) return;
  const T = A.T, ink = A.ink;

  // ---------------- shared geometry (viewBox units) ----------------
  // The goal: the front frame (posts x0 / x1, crossbar top, goal line bot, post width pw) and the back plane of the net
  // (bx0..bx1, bt..bb), which sits higher and narrower because it is further away.
  const GOAL = { x0: 486, x1: 1114, top: 294, bot: 550, pw: 18, bx0: 552, bx1: 1048, bt: 326, bb: 526 };
  // The stands: seat rows (top of the seat backs), seat columns at x = 800 +- colX(k) for k = 0..17, aisles in place of
  // the columns in `aisles`, a section color per column range.
  const STANDS = {
    rows: [258, 290, 322, 354, 386, 418], seatW: 36, seatH: 22, cols: 18,
    aisles: [4, 10, 15],
    sections: [[0, 3, 'pen-seat-1'], [5, 9, 'pen-seat-2'], [11, 14, 'pen-seat-3'], [16, 17, 'pen-seat-4']],
  };
  const colX = (k) => 23 + 46 * k;   // distance of column k from the center line
  A.pen = { goal: GOAL, stands: STANDS, colX };

  const f1 = (n) => Math.round(n * 10) / 10;
  // a rounded-top box as a subpath (seat backs)
  const seat = (cx, y, w, h, r = 6) => `M${f1(cx - w / 2)} ${f1(y + h)}V${f1(y + r)}Q${f1(cx - w / 2)} ${y} ${f1(cx - w / 2 + r)} ${y}H${f1(cx + w / 2 - r)}Q${f1(cx + w / 2)} ${y} ${f1(cx + w / 2)} ${f1(y + r)}V${f1(y + h)}Z`;
  // a cloud: a flat base with round bumps
  const cloud = (x, y, w, h) => `M${x} ${y}C${x - h * 0.6} ${y} ${x - h * 0.5} ${y - h * 0.9} ${x + w * 0.12} ${y - h * 0.75}C${x + w * 0.2} ${y - h * 1.5} ${x + w * 0.5} ${y - h * 1.6} ${x + w * 0.58} ${y - h * 0.95}C${x + w * 0.7} ${y - h * 1.35} ${x + w * 0.98} ${y - h * 1.1} ${x + w * 0.92} ${y - h * 0.55}C${x + w * 1.1} ${y - h * 0.5} ${x + w * 1.08} ${y} ${x + w} ${y}Z`;

  // A floodlight head: a case with 2 x 4 lamps, centered on 0,0 (about 130 x 74). on = the lamps lit with a soft glow.
  function lampHead(K, on) {
    const { el, g } = K;
    const lamps = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) lamps.push(`M${-45 + c * 30 + 11} ${-14 + r * 28}a11 11 0 1 0 -22 0a11 11 0 1 0 22 0Z`);
    return g({},
      on ? el('ellipse', { rx: 110, ry: 72, fill: T('pen-lamp-glow'), opacity: 0.35 }) : null,
      el('rect', { x: -66, y: -38, width: 132, height: 76, rx: 12, fill: T('pen-lamp-case'), ...ink(5) }),
      el('path', { d: lamps.join(''), fill: T(on ? 'pen-lamp' : 'pen-lamp-off'), ...ink(3) }));
  }

  // A floodlight tower: a lattice mast from the roof up to the head. x = the mast's center, y0 = its foot.
  function tower(K, x, y0, tilt) {
    const { el, g } = K;
    const top = 86, w0 = 26, w1 = 10, n = 4;
    const legs = `M${x - w0} ${y0}L${x - w1} ${top}M${x + w0} ${y0}L${x + w1} ${top}`;
    const ties = [];
    for (let i = 0; i < n; i++) {
      const ya = y0 + ((top - y0) * i) / n, yb = y0 + ((top - y0) * (i + 1)) / n;
      const wa = w0 + ((w1 - w0) * i) / n, wb = w0 + ((w1 - w0) * (i + 1)) / n;
      ties.push(`M${f1(x - wa)} ${f1(ya)}L${f1(x + wb)} ${f1(yb)}M${f1(x + wa)} ${f1(ya)}L${f1(x - wb)} ${f1(yb)}`);
    }
    return g({},
      el('path', { d: ties.join(''), fill: 'none', stroke: T('pen-tower'), 'stroke-width': 4, 'stroke-linecap': 'round' }),
      el('path', { d: legs, fill: 'none', ...ink(11) }),
      el('path', { d: legs, fill: 'none', stroke: T('pen-tower'), 'stroke-width': 6, 'stroke-linecap': 'round' }),
      g({ transform: `translate(${x} ${top - 26}) rotate(${tilt})` }, lampHead(K, true)));
  }

  // ---------------- the background ----------------
  A.bg.penalty = (K) => {
    const { el, g } = K;
    const { W, H } = K.SIZE;
    const parts = [];
    // sky, a lighter band near the roof, clouds
    parts.push(el('rect', { x: 0, y: 0, width: W, height: H, fill: T('pen-sky') }),
      el('rect', { x: 0, y: 120, width: W, height: 140, fill: T('pen-sky-2') }),
      el('path', { d: [cloud(420, 112, 190, 34), cloud(760, 66, 120, 24), cloud(1060, 120, 220, 38)].join(''), fill: T('pen-cloud'), ...ink(4) }));
    // floodlights behind the roof
    parts.push(tower(K, 190, 170, -8), tower(K, W - 190, 170, 8));
    // the roof's dark underside
    const fasciaY = (x) => { const t = x / W; return 158 + 200 * t * (1 - t); };
    parts.push(el('path', { d: 'M0 150Q800 250 1600 150V264H0Z', fill: T('pen-roof-under') }));
    // the stands' back wall, the risers and the seat rows (one path per section color)
    parts.push(el('rect', { x: 0, y: 248, width: W, height: 200, fill: T('pen-stand') }));
    const S = STANDS, risers = [], seats = {};
    for (const y of S.rows) risers.push(`M0 ${y + S.seatH - 2}H${W}V${y + 32}H0Z`);
    parts.push(el('path', { d: risers.join(''), fill: T('pen-step') }));
    for (const [k0, k1, tok] of S.sections) {
      const d = [];
      for (const y of S.rows) for (let k = k0; k <= k1; k++) for (const x of [800 - colX(k), 800 + colX(k)]) d.push(seat(x, y, S.seatW, S.seatH));
      seats[tok] = d.join('');
    }
    for (const [tok, d] of Object.entries(seats)) parts.push(el('path', { d, fill: T(tok), stroke: T('outline'), 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    // aisles (stairs) between the sections
    const aisle = [], steps = [];
    for (const k of S.aisles) for (const x of [800 - colX(k), 800 + colX(k)]) {
      aisle.push(`M${x - 17} 250H${x + 17}V440H${x - 17}Z`);
      for (let y = 266; y < 440; y += 16) steps.push(`M${x - 17} ${y}H${x + 17}`);
    }
    parts.push(el('path', { d: aisle.join(''), fill: T('pen-aisle') }),
      el('path', { d: steps.join(''), fill: 'none', stroke: T('pen-step'), 'stroke-width': 3 }));
    // the pillars and the curved fascia over them
    const pillars = [120, 390, 650, 950, 1210, 1480].map((x) => `M${x - 7} ${f1(fasciaY(x) - 4)}H${x + 7}V262H${x - 7}Z`);
    parts.push(el('path', { d: pillars.join(''), fill: T('pen-pillar'), ...ink(3) }),
      el('path', { d: 'M0 124Q800 224 1600 124L1600 158Q800 258 0 158Z', fill: T('pen-roof'), ...ink(4) }),
      el('path', { d: 'M0 136Q800 236 1600 136', fill: 'none', stroke: T('pen-roof-edge'), 'stroke-width': 4 }));
    // the front wall and the ad boards (plain color blocks, no text)
    parts.push(el('rect', { x: -4, y: 432, width: W + 8, height: 10, fill: T('pen-wall'), ...ink(3) }),
      el('rect', { x: -4, y: 442, width: W + 8, height: 70, fill: T('pen-board'), ...ink(4) }),
      el('path', { d: 'M40 510C140 470 260 452 420 446H520C380 458 240 480 180 510ZM1560 510C1460 470 1340 452 1180 446H1080C1220 458 1360 480 1420 510Z', fill: T('pen-board-2') }),
      el('path', { d: [0, 1, 2, 3].map((i) => `M${620 + i * 96} 456h76v42h-76Z`).join(''), fill: T('pen-board-3'), opacity: 0.35 }));
    // the pitch: grass with mowing stripes converging on a vanishing point (800, 180)
    const y0 = 512, w0 = 120, w1 = 260;
    const wAt = (y) => w0 + ((w1 - w0) * (y - y0)) / (H - y0);
    const stripes = [];
    for (let i = -9; i <= 8; i += 2) {
      const a = i + 0.5, b2 = i + 1.5;
      stripes.push(`M${f1(800 + w0 * a)} ${y0}L${f1(800 + w0 * b2)} ${y0}L${f1(800 + w1 * b2)} ${H}L${f1(800 + w1 * a)} ${H}Z`);
    }
    parts.push(el('rect', { x: 0, y: y0, width: W, height: H - y0, fill: T('pen-grass') }),
      el('path', { d: stripes.join(''), fill: T('pen-grass-2') }));
    // lines: the goal line, the goal area box, the penalty spot
    const bx = 4.3, front = 667;
    const lx = (X, y) => f1(800 + X * wAt(y));
    const lines = `M-10 ${GOAL.bot}H${W + 10}M${lx(-bx, GOAL.bot)} ${GOAL.bot}L${lx(-bx, front)} ${front}H${lx(bx, front)}L${lx(bx, GOAL.bot)} ${GOAL.bot}`;
    parts.push(el('path', { d: lines, fill: 'none', stroke: T('pen-line'), 'stroke-width': 6, 'stroke-linejoin': 'round' }),
      el('ellipse', { cx: 800, cy: 773, rx: 26, ry: 9, fill: T('pen-line') }));
    // grass tufts
    const tufts = [[70, 872], [262, 818], [470, 862], [1150, 826], [1372, 876], [1528, 806], [610, 702], [1010, 712]]
      .map(([x, y]) => `M${x - 12} ${y}Q${x - 10} ${y - 10} ${x - 5} ${y - 12}M${x - 3} ${y}Q${x} ${y - 14} ${x + 3} ${y - 15}M${x + 5} ${y}Q${x + 9} ${y - 10} ${x + 13} ${y - 10}`);
    parts.push(el('path', { d: tufts.join(''), fill: 'none', stroke: T('pen-grass-dark'), 'stroke-width': 4, 'stroke-linecap': 'round' }));
    parts.push(goalArt(K));
    return g({ class: 'pen-bg' }, ...parts);
  };

  // The goal: the net (back plane, side and top nets), the back tubes, the white frame on top.
  function goalArt(K) {
    const { el, g } = K;
    const { x0, x1, top, bot, pw, bx0, bx1, bt, bb } = GOAL;
    const fx0 = x0 + pw / 2, fx1 = x1 - pw / 2, ft = top + pw / 2;
    const net = [];
    // back plane grid
    const nv = 14, nh = 8;
    for (let i = 1; i < nv; i++) { const x = f1(bx0 + ((bx1 - bx0) * i) / nv); net.push(`M${x} ${bt}V${bb}`); }
    for (let j = 1; j < nh; j++) { const y = f1(bt + ((bb - bt) * j) / nh); net.push(`M${bx0} ${y}H${bx1}`); }
    // side nets: lines from the posts back to the back plane, and two uprights between
    for (let j = 0; j <= nh; j++) {
      const u = j / nh, ya = f1(ft + (bot - ft) * u), yb = f1(bt + (bb - bt) * u);
      net.push(`M${fx0} ${ya}L${bx0} ${yb}M${fx1} ${ya}L${bx1} ${yb}`);
    }
    for (const u of [1 / 3, 2 / 3]) {
      const xa = f1(fx0 + (bx0 - fx0) * u), xb = f1(fx1 + (bx1 - fx1) * u), ya = f1(ft + (bt - ft) * u), yb = f1(bot + (bb - bot) * u);
      net.push(`M${xa} ${ya}L${xa} ${yb}M${xb} ${ya}L${xb} ${yb}`);
    }
    // top net: from the crossbar back to the top of the back plane
    for (let i = 0; i <= nv; i++) net.push(`M${f1(fx0 + ((fx1 - fx0) * i) / nv)} ${ft}L${f1(bx0 + ((bx1 - bx0) * i) / nv)} ${bt}`);
    net.push(`M${f1((fx0 + bx0) / 2)} ${f1((ft + bt) / 2)}H${f1((fx1 + bx1) / 2)}`);
    const tubes = `M${fx0} ${bot}L${bx0} ${bb}H${bx1}L${fx1} ${bot}M${bx0} ${bb}V${bt}H${bx1}V${bb}`;
    const frame = `M${fx0} ${bot + 2}V${ft}H${fx1}V${bot + 2}`;
    return g({ class: 'pen-goal-art' },
      el('path', { d: `M${fx0} ${ft}H${fx1}V${bot}H${fx0}Z`, fill: T('pen-net'), opacity: 0.08 }),
      el('path', { d: net.join(''), fill: 'none', stroke: T('pen-net'), 'stroke-width': 2, opacity: 0.75 }),
      el('path', { d: tubes, fill: 'none', stroke: T('pen-post-shade'), 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      el('path', { d: `M${fx0 - 14} ${bot + 3}H${fx0 + 14}M${fx1 - 14} ${bot + 3}H${fx1 + 14}`, fill: 'none', stroke: T('shadow'), 'stroke-width': 6, opacity: 0.35, 'stroke-linecap': 'round' }),
      el('path', { d: frame, fill: 'none', stroke: T('outline'), 'stroke-width': pw + 7, 'stroke-linejoin': 'round' }),
      el('path', { d: frame, fill: 'none', stroke: T('pen-post'), 'stroke-width': pw, 'stroke-linejoin': 'round' }),
      el('path', { d: `M${fx0 + pw * 0.28} ${bot}V${ft + pw * 0.28}H${fx1 - pw * 0.28}`, fill: 'none', stroke: T('pen-post-shade'), 'stroke-width': 3, opacity: 0.7 }));
  }

  // ---------------- the crowd ----------------
  // Simple people in a few skin, hair and shirt colors; fan n (1..12) picks its own mix.
  const SKINS = ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'];
  const HAIRS = ['hair-1', 'hair-2', 'hair-3', 'hair-4', 'hair-5', 'hair-6'];
  const SHIRTS = ['pen-fan-1', 'pen-fan-2', 'pen-fan-3', 'pen-fan-4', 'pen-fan-5', 'pen-fan-6'];
  const look = (n) => ({ skin: SKINS[(n * 3) % 5], hair: HAIRS[(n * 5 + 1) % 6], shirt: SHIRTS[(n - 1) % 6], long: n % 4 === 2, scarf: 1 + (n % 3), waves: n % 2 === 1 });
  // hair over a head at (cx, cy) radius r: short (a cap) or long (down to the jaw)
  const hairD = (cx, cy, r, long) => (long
    ? `M${cx - r - 4} ${cy + r * 0.9}C${cx - r - 8} ${cy - r * 0.4} ${cx - r * 0.7} ${cy - r - 6} ${cx} ${cy - r - 5}C${cx + r * 0.7} ${cy - r - 6} ${cx + r + 8} ${cy - r * 0.4} ${cx + r + 4} ${cy + r * 0.9}L${cx + r - 6} ${cy + r * 0.8}C${cx + r - 2} ${cy} ${cx + r * 0.5} ${cy - r * 0.45} ${cx} ${cy - r * 0.5}C${cx - r * 0.5} ${cy - r * 0.45} ${cx - r + 2} ${cy} ${cx - r + 6} ${cy + r * 0.8}Z`
    : `M${cx - r - 2} ${cy - 2}C${cx - r - 2} ${cy - r - 8} ${cx + r + 2} ${cy - r - 8} ${cx + r + 2} ${cy - 2}C${cx + r * 0.6} ${cy - r * 0.55} ${cx - r * 0.2} ${cy - r * 0.7} ${cx - r - 2} ${cy - 2}Z`);
  const eyesD = (cx, cy) => `M${cx - 14.6} ${cy}a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0ZM${cx + 7.4} ${cy}a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z`;
  const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

  // A seated fan, front view, in a 143 x 203 box (feet at the bottom center).
  function fanSit(K, n) {
    const { el, g } = K;
    const L = look(n), cx = 71.5;
    return g({},
      el('path', { d: 'M38 128H105V150H96V192H78V150H65V192H47V150H38Z', fill: T('pen-fan-pants'), ...ink(5) }),
      el('path', { d: 'M42 188H66V202H36V196Q36 188 42 188ZM77 188H101Q107 188 107 196V202H77Z', fill: T('shoe'), ...ink(4) }),
      el('path', { d: 'M48 80Q71.5 72 95 80Q114 84 116 104L118 136H100L98 110L96 136H47L45 110L43 136H25L27 104Q29 84 48 80Z', fill: T(L.shirt), ...ink(5) }),
      el('path', { d: dot(34, 138, 9) + dot(109, 138, 9), fill: T(L.skin), ...ink(4) }),
      el('circle', { cx, cy: 46, r: 29, fill: T(L.skin), ...ink(5) }),
      el('path', { d: hairD(cx, 46, 29, L.long), fill: T(L.hair), ...ink(4) }),
      el('path', { d: eyesD(cx, 50), fill: T('outline') }));
  }
  // The same fan standing up and cheering, in a 137 x 240 box: arms up, a scarf held overhead (or waving fists).
  function fanCheer(K, n) {
    const { el, g } = K;
    const L = look(n), cx = 68.5;
    const arms = L.waves ? 'M46 104Q30 78 22 36M91 104Q107 78 115 36' : 'M46 104Q24 86 16 54M91 104Q113 86 121 54';
    const hands = L.waves ? [[22, 30], [115, 30]] : [[16, 48], [121, 48]];
    const sy = 18;
    return g({},
      el('path', { d: 'M44 160H93V232H74V178H63V232H44Z', fill: T('pen-fan-pants'), ...ink(5) }),
      el('path', { d: 'M40 226H64V238H32V234Q32 226 40 226ZM73 226H97Q105 226 105 234V238H73Z', fill: T('shoe'), ...ink(4) }),
      el('path', { d: arms, fill: 'none', ...ink(22) }),
      el('path', { d: arms, fill: 'none', stroke: T(L.shirt), 'stroke-width': 13, 'stroke-linecap': 'round' }),
      el('path', { d: 'M46 96Q68.5 88 91 96Q99 100 98 116L96 166H41L39 116Q38 100 46 96Z', fill: T(L.shirt), ...ink(5) }),
      L.waves ? el('path', { d: `M18 ${sy}Q68.5 ${sy - 14} 119 ${sy}V${sy + 18}Q68.5 ${sy + 4} 18 ${sy + 18}Z`, fill: T(`pen-scarf-${L.scarf}`), ...ink(4) }) : null,
      L.waves ? el('path', { d: `M44 ${sy - 4}V${sy + 12}M68.5 ${sy - 6}V${sy + 10}M93 ${sy - 4}V${sy + 12}`, fill: 'none', stroke: T('pen-scarf-stripe'), 'stroke-width': 7 }) : null,
      el('path', { d: hands.map(([x, y]) => dot(x, y, 9)).join(''), fill: T(L.skin), ...ink(4) }),
      el('circle', { cx, cy: 62, r: 28, fill: T(L.skin), ...ink(5) }),
      el('path', { d: hairD(cx, 62, 28, L.long), fill: T(L.hair), ...ink(4) }),
      el('path', { d: eyesD(cx, 62), fill: T('outline') }),
      el('path', { d: `M${cx - 10} 73Q${cx} 86 ${cx + 10} 73Z`, fill: T('mouth'), ...ink(3) }));
  }
  const BACK_K = 174 / 203;
  for (let n = 1; n <= 12; n++) {
    A.add(`el-fan-sit-${n}`, 143, 203, 71.5, 203, (K) => fanSit(K, n));
    A.add(`el-fan-cheer-${n}`, 137, 240, 68.5, 240, (K) => fanCheer(K, n));
    // the back rows: the seated fan drawn smaller
    if (n <= 8) A.add(`el-fan-back-${n}`, 139, 174, 69.5, 174, (K) => K.g({ transform: `translate(${f1(69.5 - 71.5 * BACK_K)} 0) scale(${BACK_K.toFixed(4)})` }, fanSit(K, n)));
  }

  // ---------------- flags, scarves, confetti, floodlight heads ----------------
  // A flag on a pole (320 x 302, center anchor; the pole's foot is at (16, 300), 144 left of and 148 below the center).
  A.add('el-goal-flag', 320, 302, 160, 151, (K) => {
    const { el, g } = K;
    const cloth = (dy0, dy1) => `M22 ${14 + dy0}C110 ${-6 + dy0} 200 ${40 + dy0} 300 ${22 + dy0}L300 ${170 - dy1}C200 ${188 - dy1} 110 ${142 - dy1} 22 ${160 - dy1}Z`;
    return g({},
      el('path', { d: cloth(0, 0), fill: T('pen-flag-1') }),
      el('path', { d: 'M22 116L300 50V88L22 154Z', fill: T('pen-flag-2') }),
      el('path', { d: cloth(0, 0), fill: 'none', ...ink(5) }),
      el('rect', { x: 10, y: 6, width: 12, height: 294, rx: 6, fill: T('pen-pole'), ...ink(4) }),
      el('circle', { cx: 16, cy: 8, r: 9, fill: T('pen-board-2'), ...ink(4) }));
  });
  // Scarves (360 x 260, center): a striped supporters' scarf in a gentle wave with fringed ends.
  for (let i = 1; i <= 3; i++) {
    A.add(`el-scarf-${i}`, 360, 260, 180, 130, (K) => {
      const { el, g } = K;
      const band = 'M40 120C110 60 170 170 250 110C285 84 310 90 322 100L330 150C316 140 292 136 258 160C178 220 118 108 48 170Z';
      const fringe = 'M48 170L40 196M44 160L28 182M40 120L22 128M42 140L22 152M330 150L346 168M326 125L348 132M322 100L340 92';
      return g({},
        el('path', { d: fringe, fill: 'none', stroke: T(`pen-scarf-${i}`), 'stroke-width': 6, 'stroke-linecap': 'round' }),
        el('path', { d: band, fill: T(`pen-scarf-${i}`) }),
        el('path', { d: 'M108 92L118 150M180 128L186 188M250 110L258 162', fill: 'none', stroke: T('pen-scarf-stripe'), 'stroke-width': 14 }),
        el('path', { d: band, fill: 'none', ...ink(5) }));
    });
  }
  // Confetti (100 x 100, center): strips, squares, dots, triangles, bars and curls in five colors.
  const CONF = ['M28 42h44v16h-44Z', 'M38 38h24v24h-24Z', dot(50, 50, 14), 'M50 32L68 64H32Z', 'M44 30h12v40h-12Z'];
  for (let i = 1; i <= 20; i++) {
    const shape = (i - 1) % 6, color = `pen-conf-${1 + ((i - 1) % 5)}`;
    A.add(`el-confetti-v4-${i}`, 100, 100, 50, 50, (K) => (shape === 5
      ? K.el('path', { d: 'M26 60C34 36 46 36 50 50C54 64 66 64 74 40', fill: 'none', stroke: T(color), 'stroke-width': 9, 'stroke-linecap': 'round' })
      : K.el('path', { d: CONF[shape], fill: T(color), ...ink(3), transform: `rotate(${(i * 37) % 180} 50 50)` })));
  }
  // Floodlight heads on a short mast (255 x 360, bottom anchor), unlit and lit.
  for (const on of [false, true]) {
    A.add(on ? 'el-bulb-on' : 'el-bulb-off', 255, 360, 127.5, 360, (K) => K.g({},
      K.el('path', { d: 'M117 360L121 120H134L138 360Z', fill: T('pen-tower'), ...ink(4) }),
      K.g({ transform: 'translate(127.5 90) scale(1.6)' }, lampHead(K, on))));
  }

  // ---------------- icons ----------------
  // Markup with width/height 100%, so it fills whatever box it is put in (the panel buttons, the scoreboard chips).
  const icon = (viewBox, build, cls = '') => {
    const K = window.DuelKit;
    return K.el('svg', { viewBox, width: '100%', height: '100%', class: `ico art-ico${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true' }, build(K)).outerHTML;
  };
  const cur = 'currentColor';
  // the goal outline every control icon shares (72 x 50): the frame, a light net, the picked zone lightly shaded
  const goalIco = (K, zone) => {
    const { el, g } = K;
    const zx = { left: 11, center: 28, right: 45 }[zone];
    const net = [];
    for (let x = 18; x < 62; x += 9) net.push(`M${x} 10V45`);
    for (let y = 18; y < 45; y += 9) net.push(`M10 ${y}H62`);
    return g({},
      el('rect', { x: zx, y: 10, width: 16, height: 35, rx: 3, fill: `color-mix(in srgb, ${cur} 16%, transparent)` }),
      el('path', { d: net.join(''), fill: 'none', stroke: cur, 'stroke-width': 1.2, opacity: 0.3 }),
      el('path', { d: 'M3 46H69', fill: 'none', stroke: cur, 'stroke-width': 2, opacity: 0.45, 'stroke-linecap': 'round' }),
      el('path', { d: 'M9 46V9H63V46', fill: 'none', stroke: cur, 'stroke-width': 3.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  };
  const ballIco = (K, x, y, r = 6.2) => K.g({},
    K.el('circle', { cx: x, cy: y, r, fill: T('ball'), stroke: T('outline'), 'stroke-width': 1.8 }),
    K.el('path', { d: `M${x} ${y - 2.6}l2.5 1.8l-1 2.9h-3l-1 -2.9Z`, fill: T('ball-dark') }));
  // kick: the ball flying from the spot (bottom center) into the zone
  const KICK = { left: [19, 20, 22, 34], center: [36, 18, 40, 34], right: [53, 20, 50, 34] };
  for (const [zone, [bx, by, qx, qy]] of Object.entries(KICK)) {
    A.icons[`pen-kick-${zone}`] = icon('0 0 72 50', (K) => K.g({}, goalIco(K, zone),
      K.el('path', { d: `M36 49Q${qx} ${qy} ${bx} ${by + 6}`, fill: 'none', stroke: cur, 'stroke-width': 2.2, 'stroke-dasharray': '2.5 3.5', 'stroke-linecap': 'round' }),
      ballIco(K, bx, by)));
  }
  // a little keeper: legs, body, head, arms up with gloves (feet at 0,0, about 42 tall)
  const keeperIco = (K) => {
    const { el, g } = K;
    return g({},
      el('path', { d: 'M-4 0L-1.5 -11M4 0L1.5 -11', fill: 'none', stroke: cur, 'stroke-width': 3.4, 'stroke-linecap': 'round' }),
      el('path', { d: 'M0 -11V-23', fill: 'none', stroke: cur, 'stroke-width': 8, 'stroke-linecap': 'round' }),
      el('path', { d: 'M-2 -22L-8 -33M2 -22L8 -33', fill: 'none', stroke: cur, 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
      el('circle', { cx: 0, cy: -30, r: 4.6, fill: cur }),
      el('path', { d: dot(-8, -37, 3.8) + dot(8, -37, 3.8), fill: T('glove'), stroke: T('outline'), 'stroke-width': 1.5 }));
  };
  const KEEP = { left: 'translate(40 42) rotate(-58) scale(.9)', center: 'translate(36 44) scale(.92)', right: 'translate(32 42) rotate(58) scale(.9)' };
  for (const [zone, tf] of Object.entries(KEEP)) {
    A.icons[`pen-keep-${zone}`] = icon('0 0 72 50', (K) => K.g({}, goalIco(K, zone), K.g({ transform: tf }, keeperIco(K))));
  }
  // a football boot, side view, toe to the right, with studs
  A.icons['pen-boot'] = icon('0 0 48 48', (K) => K.g({},
    K.el('path', { d: 'M12 37h4v4h-4ZM23 37h4v4h-4ZM34 37h4v4h-4Z', fill: T('ball-dark'), stroke: T('outline'), 'stroke-width': 1.4 }),
    K.el('path', { d: 'M8 11H20Q21 21 29 23L37 25Q44 27 43.5 33V37H6.5Q4.5 23 8 11Z', fill: T('ball'), ...ink(2.6) }),
    K.el('path', { d: 'M7.5 15H19.6Q19 26 9 30', fill: T('glove-band'), stroke: T('outline'), 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    K.el('path', { d: 'M6.6 33H43.5', fill: 'none', ...ink(2.2) }),
    K.el('path', { d: 'M22 17.5l3 -2.2M24.5 20.5l3 -2.2M27.5 22.8l3 -2', fill: 'none', ...ink(1.6) })));
  // a pair of goalkeeper gloves, fingers up, with wrist bands
  const glove = (K, tf) => K.g({ transform: tf },
    K.el('path', { d: 'M-8 6V-9Q-8 -16 0 -16Q8 -16 8 -9V6Z', fill: T('glove'), ...ink(2.2) }),
    K.el('path', { d: 'M-8 0Q-14 -2 -13 -8Q-12 -12 -8 -9', fill: T('glove'), ...ink(2.2) }),
    K.el('path', { d: 'M-2.7 -15V-7M2.7 -15V-7', fill: 'none', ...ink(1.3) }),
    K.el('rect', { x: -8.5, y: 5, width: 17, height: 8, rx: 2, fill: T('glove-band'), ...ink(2.2) }));
  const gloves = (K) => K.g({}, glove(K, 'translate(16 25) rotate(-14)'), glove(K, 'translate(32 25) rotate(14) scale(-1 1)'));
  A.icons['pen-gloves'] = icon('0 0 48 48', gloves);
  // the gloves for the role chips (penalty.js: the role banner and the panel's chip)
  A.icons['pen-gloves-chip'] = icon('0 0 48 48', gloves, 'pen-glove-ico');
})();
