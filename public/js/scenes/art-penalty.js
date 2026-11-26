// Art for the penalty scene (see art.js for the registry contract): the stadium background is a picture
// (public/art/penalty-stadium.webp, from art-source/characters/07-stadium.png by tools/import-stadium.js: the sky,
// the floodlights, the roof, the stands, the pitch, the goal frame and net), the fans are pictures too (art-fans.js);
// the goal flags, scarves, confetti and the control / scoreboard icons are drawn here in code.
// Colors: server/theme-scenes/penalty.js (pen-*).
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
  const GOAL = { x0: 482, x1: 1118, top: 292, bot: 552, pw: 22, bx0: 552, bx1: 1048, bt: 325, bb: 531 };
  // The stands: seat rows (top of the seat backs), seat columns at x = 800 +- colX(k) for k = 0..17, aisles in place of
  // the columns in `aisles`, a section color per column range.
  const STANDS = {
    rows: [258, 290, 322, 354, 386, 418], seatW: 36, seatH: 22, cols: 18,
    aisles: [4, 10, 15],
    sections: [[0, 3, 'pen-seat-1'], [5, 9, 'pen-seat-2'], [11, 14, 'pen-seat-3'], [16, 17, 'pen-seat-4']],
  };
  const colX = (k) => 23 + 46 * k;   // distance of column k from the center line
  A.pen = { goal: GOAL, stands: STANDS, colX };

  const dot = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  // the pictures sit in public/art/, next to public/js/
  const ART = new URL('../../art/', document.currentScript ? document.currentScript.src : location.href).href;

  // ---------------- the background ----------------
  A.bg.penalty = (K) => {
    const { W, H } = K.SIZE;
    return K.g({ class: 'pen-bg' }, K.el('image', { href: `${ART}penalty-stadium.webp`, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none' }));
  };

  // ---------------- flags, scarves, confetti ----------------
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
