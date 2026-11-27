// The human skin of the rig, drawn in code the way the original game drew its mascots (a big round head, ears that
// follow the head turn, big eyes with whites, a face that slides and narrows toward a profile): the head, the ears,
// the eight hairstyles and the ten expressions. Load before figures/rig.js, which draws every character with it.
//
// Head frame: the head center at 0,0, y down, R = the head radius. turn: -1..1 (0 front, 0.55 three-quarter, 1 profile
// facing right; negative = facing left), back = seen from behind.
//   head(c, h)                 -> { back, shape, face, front, R, ... } nodes (ears behind, the head, the face layer,
//                                 the hair in front), c = the colors { skin, hair, shirt }, h = the drawing helpers
//   turnHead(hp, turn, back)   moves the face and the ears for the view
//   hair(style, turn, back, c, h) -> { behind: [nodes], front: [nodes] } (rebuilt by the rig when the turn changes)
//   faces[name](c, h)          -> { g, eyes, pupils, lookR, blink } (eyes blink, pupils follow the pose's gaze)
(function () {
  const T = (n) => `var(--${n})`;
  const f1 = (n) => Math.round(n * 10) / 10;
  const R = 70;
  // the face: eye height and spacing, the eye whites' radius, the mouth height
  const EY = -0.04 * R, EX = 0.33 * R, ER = 13.5, MY = 0.43 * R;

  // ---------------- faces ----------------
  const line = (h, d, w = 3.6) => h.el('path', { d, fill: 'none', ...h.ink, 'stroke-width': w });
  const white = (h, x, r = ER) => h.el('circle', { cx: x, cy: EY, r, fill: T('eye'), ...h.ink, 'stroke-width': 3.4 });
  const dot = (h, x, y, r = 5.6) => h.el('circle', { cx: x, cy: y, r, fill: T('outline') });
  const eyeG = (h, ...parts) => { const e = h.g({}, ...parts); e.cy = EY; return e; };
  // a round eye: the white and a pupil (px, py offset, pr radius)
  function round(h, x, px = 0, py = 0, pr = 5.2, r = ER) {
    const pupil = h.g({}, dot(h, x + px, EY + py, pr));
    return { eye: eyeG(h, white(h, x, r), pupil), pupil };
  }
  // a lidded eye: the white, a pupil, then the lid (a skin cap) down to y = EY + cut * ER with its edge line
  function lidded(h, c, x, cut, px = 0, py = 3, pr = 5.2) {
    const y0 = EY + cut * ER, dx = Math.sqrt(Math.max(0, ER * ER - (cut * ER) ** 2));
    const pupil = h.g({}, dot(h, x + px, EY + py, pr));
    const cap = h.el('path', { d: `M${f1(x - dx)} ${f1(y0)}A${ER} ${ER} 0 ${cut > 0 ? 1 : 0} 1 ${f1(x + dx)} ${f1(y0)}Z`, fill: c.skin });
    return { eye: eyeG(h, white(h, x), pupil, cap, line(h, `M${f1(x - dx)} ${f1(y0)}L${f1(x + dx)} ${f1(y0)}`, 3.4), h.el('circle', { cx: x, cy: EY, r: ER, fill: 'none', ...h.ink, 'stroke-width': 3.4 })), pupil };
  }
  // closed happy eyes: arcs
  const happy = (h, x) => ({ eye: eyeG(h, line(h, `M${f1(x - 11)} ${f1(EY + 4)}Q${f1(x)} ${f1(EY - 11)} ${f1(x + 11)} ${f1(EY + 4)}`, 4)) });
  // brows: a short line over each eye; kind: flat, down (angry), worried, high, one (one raised)
  function brows(h, kind) {
    const y = EY - ER - 7, out = [];
    for (const s of [-1, 1]) {
      const x0 = s * EX - 9, x1 = s * EX + 9, inner = s < 0 ? x1 : x0, outer = s < 0 ? x0 : x1;
      let d;
      if (kind === 'down') d = `M${f1(outer)} ${f1(y - 4)}L${f1(inner)} ${f1(y + 3)}`;
      else if (kind === 'worried') d = `M${f1(outer)} ${f1(y + 2)}L${f1(inner)} ${f1(y - 5)}`;
      else if (kind === 'high') d = `M${f1(x0)} ${f1(y - 5)}Q${f1(s * EX)} ${f1(y - 12)} ${f1(x1)} ${f1(y - 5)}`;
      else if (kind === 'one') d = s > 0 ? `M${f1(x0)} ${f1(y - 5)}Q${f1(s * EX)} ${f1(y - 12)} ${f1(x1)} ${f1(y - 5)}` : `M${f1(x0)} ${f1(y)}L${f1(x1)} ${f1(y)}`;
      else d = `M${f1(x0)} ${f1(y - 1)}Q${f1(s * EX)} ${f1(y - 5)} ${f1(x1)} ${f1(y - 1)}`;
      out.push(line(h, d, 3.8));
    }
    return out;
  }
  const cheeks = (h) => [-1, 1].map((s) => h.el('ellipse', { cx: f1(s * R * 0.56), cy: f1(EY + 20), rx: 9, ry: 5.5, fill: T('cheek'), opacity: 0.7 }));
  const nose = (h) => line(h, `M2 ${f1(EY + 10)}Q8 ${f1(EY + 18)} 1 ${f1(EY + 21)}`, 3.2);
  const M = {
    smallSmile: (h) => line(h, `M-9 ${f1(MY - 2)}Q0 ${f1(MY + 6)} 9 ${f1(MY - 2)}`),
    smile: (h) => line(h, `M-14 ${f1(MY - 4)}Q0 ${f1(MY + 10)} 14 ${f1(MY - 4)}`),
    flat: (h) => line(h, `M-8 ${f1(MY + 1)}L8 ${f1(MY + 1)}`),
    side: (h) => line(h, `M-5 ${f1(MY + 2)}Q5 ${f1(MY + 5)} 12 ${f1(MY - 3)}`),
    grin: (h) => h.g({}, h.el('path', { d: `M-16 ${f1(MY - 5)}L16 ${f1(MY - 5)}Q13 ${f1(MY + 13)} 0 ${f1(MY + 13)}Q-13 ${f1(MY + 13)} -16 ${f1(MY - 5)}Z`, fill: T('mouth'), ...h.ink, 'stroke-width': 3.4 }),
      h.el('path', { d: `M-13.5 ${f1(MY - 3)}L13.5 ${f1(MY - 3)}L12.5 ${f1(MY + 3)}L-12.5 ${f1(MY + 3)}Z`, fill: T('eye') })),
    open: (h) => h.g({}, h.el('path', { d: `M-15 ${f1(MY - 5)}L15 ${f1(MY - 5)}Q14 ${f1(MY + 17)} 0 ${f1(MY + 17)}Q-14 ${f1(MY + 17)} -15 ${f1(MY - 5)}Z`, fill: T('mouth'), ...h.ink, 'stroke-width': 3.4 }),
      h.el('path', { d: `M-8 ${f1(MY + 12)}Q0 ${f1(MY + 4)} 8 ${f1(MY + 12)}Q0 ${f1(MY + 16)} -8 ${f1(MY + 12)}Z`, fill: T('tongue') })),
    wobble: (h) => line(h, `M-11 ${f1(MY + 3)}Q-5.5 ${f1(MY - 3)} 0 ${f1(MY + 2)}Q5.5 ${f1(MY + 6)} 11 ${f1(MY)}`),
    frown: (h) => line(h, `M-12 ${f1(MY + 6)}Q0 ${f1(MY - 5)} 12 ${f1(MY + 6)}`),
    slant: (h) => line(h, `M-10 ${f1(MY + 3)}L10 ${f1(MY - 2)}`),
    o: (h) => h.el('ellipse', { cx: 0, cy: f1(MY + 3), rx: 6, ry: 8, fill: T('mouth'), ...h.ink, 'stroke-width': 3.2 }),
  };
  const face = (h, eyes, parts, extra = {}) => {
    const e = eyes.map((x) => x.eye), p = eyes.map((x) => x.pupil).filter(Boolean);
    return { g: h.g({}, ...parts.flat(), ...e), eyes: e, pupils: p.length ? p : null, lookR: 4, ...extra };
  };
  // neutral, focus, smile, think, grin, joy, oops, sad, meh, shock (expressions.js says which shows when)
  const faces = {
    neutral: (c, h) => face(h, [round(h, -EX), round(h, EX)], [brows(h, 'flat'), nose(h), M.smallSmile(h)], { lookR: 4 }),
    focus: (c, h) => face(h, [lidded(h, c, -EX, -0.25, 0, 2), lidded(h, c, EX, -0.25, 0, 2)], [brows(h, 'down'), nose(h), M.flat(h)], { lookR: 3 }),
    smile: (c, h) => face(h, [round(h, -EX), round(h, EX)], [brows(h, 'high'), nose(h), M.smile(h)], { lookR: 4 }),
    think: (c, h) => face(h, [round(h, -EX, 4, -4), round(h, EX, 4, -4)], [brows(h, 'one'), nose(h), M.side(h)], { lookR: 2 }),
    grin: (c, h) => face(h, [happy(h, -EX), happy(h, EX)], [cheeks(h), brows(h, 'high'), nose(h), M.grin(h)], { blink: false }),
    joy: (c, h) => face(h, [happy(h, -EX), happy(h, EX)], [cheeks(h), brows(h, 'high'), nose(h), M.open(h)], { blink: false }),
    oops: (c, h) => face(h, [round(h, -EX, 0, 0, 4.5, ER + 1), round(h, EX, 0, 0, 4.5, ER + 1)], [brows(h, 'worried'), nose(h), M.wobble(h)], { lookR: 3 }),
    sad: (c, h) => face(h, [lidded(h, c, -EX, -0.1, 0, 5), lidded(h, c, EX, -0.1, 0, 5)], [brows(h, 'worried'), nose(h), M.frown(h)], { lookR: 2 }),
    meh: (c, h) => face(h, [lidded(h, c, -EX, 0.12, 0, 6), lidded(h, c, EX, 0.12, 0, 6)], [brows(h, 'flat'), nose(h), M.slant(h)], { lookR: 2 }),
    shock: (c, h) => face(h, [round(h, -EX, 0, 0, 3.8, ER + 2), round(h, EX, 0, 0, 3.8, ER + 2)], [brows(h, 'high'), nose(h), M.o(h)], { lookR: 5 }),
  };

  // ---------------- the head ----------------
  // An ear: a small rounded shape with an inner curve, its base on the head's side (s = -1 left, 1 right).
  const ear = (h, c, s) => h.g({},
    h.el('ellipse', { cx: 0, cy: 0, rx: 0.17 * R, ry: 0.23 * R, fill: c.skin, ...h.ink }),
    h.el('path', { d: `M${f1(s * -2)} ${f1(-0.11 * R)}Q${f1(s * 6)} ${f1(-0.02 * R)} ${f1(s * -1)} ${f1(0.1 * R)}`, fill: 'none', ...h.ink, 'stroke-width': 3 }));
  function head(c, h) {
    const earL = h.g({}, ear(h, c, -1)), earR = h.g({}, ear(h, c, 1));
    // the ears sit behind the head seen from the front; in a turned view the ear on the back of the head is drawn ON
    // the head's side (earsFront, see turnHead)
    const back = h.g({}, earL, earR), earsFront = h.g({ class: 'rig-ears-front' });
    const shape = h.el('ellipse', { cx: 0, cy: 0, rx: R, ry: R * 1.02, fill: c.skin, ...h.ink });
    const faceSlot = h.g({});
    const face = h.g({}, faceSlot);
    const hairBack = h.g({ class: 'rig-hair-back' }), hairFront = h.g({ class: 'rig-hair' });
    return { back: h.g({}, hairBack, back), shape, face: h.g({}, earsFront, face), front: hairFront, R, earL, earR, earsBack: back, earsFront, faceSlot, hairBack, hairFront, faceG: face };
  }
  // After the original game's monkey: the face slides toward the turn and narrows; the ear on the back of the head moves
  // in a little and shrinks, the ear on the face side slides behind the head and is gone in a full profile.
  function turnHead(hp, turn, back) {
    const sg = turn < 0 ? -1 : 1, a = Math.abs(turn);
    hp.faceSlot.setAttribute('transform', `translate(${f1(turn * 0.5 * R)} 0) scale(${(1 - 0.34 * a).toFixed(3)} 1)`);
    hp.faceG.style.display = back ? 'none' : '';
    const t = back ? 0 : a;
    const [backEar, faceEar] = sg > 0 ? [hp.earL, hp.earR] : [hp.earR, hp.earL];
    // the back ear moves onto the side of the head as it turns (a profile's ear just behind the middle)
    backEar.setAttribute('transform', `translate(${f1(-sg * (0.98 * R - t * 0.6 * R))} ${f1(0.06 * R)}) scale(${(1 - 0.08 * t).toFixed(3)} 1)`);
    const host = t > 0.18 ? hp.earsFront : hp.earsBack;
    if (backEar.parentNode !== host) host.append(backEar);
    if (faceEar.parentNode !== hp.earsBack) hp.earsBack.append(faceEar);
    faceEar.setAttribute('transform', `translate(${f1(sg * (0.98 * R - t * 0.5 * R))} ${f1(0.06 * R - t * 0.04 * R)}) scale(${(1 - 0.5 * t).toFixed(3)})`);
    faceEar.style.display = t > 0.5 ? 'none' : '';
  }

  // ---------------- hair ----------------
  // Two layers: behind the head (long hair, a bun, a ponytail) and in front (the cap over the top of the head with its
  // fringe). From behind the hair covers the whole back of the head down to the nape.
  const HAIR = { short: 'Short', crop: 'Crop', buzz: 'Buzz', spiky: 'Spiky', curly: 'Curly', long: 'Long', bun: 'Bun', ponytail: 'Ponytail' };
  function hair(style, turn, back, c, h) {
    const sg = turn < 0 ? -1 : 1, a = Math.abs(turn), cx = back ? 0 : turn * R * 0.42;
    const fill = { fill: c.hair, ...h.ink };
    const behind = [], front = [];
    const backHair = (nape = 0.62, puff = 3) => {
      const sy = f1(R * 0.36), sx = f1(R * 0.93 + puff);
      return h.el('path', { d: `M${-sx} ${sy}C${f1(-R - puff - 4)} ${f1(-R * 0.35)} ${f1(-R * 0.8)} ${f1(-R - puff - 6)} 0 ${f1(-R - puff - 6)}`
        + `C${f1(R * 0.8)} ${f1(-R - puff - 6)} ${f1(R + puff + 4)} ${f1(-R * 0.35)} ${sx} ${sy}`
        + `Q${f1(R * 0.62)} ${f1(R * nape + 4)} ${f1(R * 0.3)} ${f1(R * nape + 2)}Q0 ${f1(R * nape - 6)} ${f1(-R * 0.3)} ${f1(R * nape + 2)}Q${f1(-R * 0.62)} ${f1(R * nape + 4)} ${-sx} ${sy}Z`, ...fill });
    };
    // the cap: the top of the head down to y = -low R at the back side, the fringe lower toward the face; in a turned
    // view the back of the head (away from the face) keeps more hair, down past the ear
    const cap = (low = 0.18, fringe = 0.34) => {
      if (back) return backHair();
      const l = -R - 3, r = R + 3, y0 = f1(-R * low + 8);
      const yB = f1(-R * low + 8 + a * R * 0.22);   // the back side, lower in a turned view
      const [yl, yr] = sg > 0 ? [yB, y0] : [y0, yB];
      return h.el('path', { d: `M${l} ${yl}C${l - 3} ${f1(-R * 1.36)} ${r + 3} ${f1(-R * 1.36)} ${r} ${yr}`
        + `Q${f1(cx + R * 0.55)} ${f1(-R * fringe - 14)} ${f1(cx + 4)} ${f1(-R * fringe)}Q${f1(cx - R * 0.5)} ${f1(-R * fringe - 6)} ${l} ${yl}Z`, ...fill });
    };
    switch (style) {
      case 'crop': front.push(cap(0.3, 0.5)); break;
      case 'buzz':
        front.push(back ? backHair(0.56, 0) : h.el('path', { d: `M${-R - 1} ${f1(-R * 0.2)}C${-R - 2} ${f1(-R * 1.32)} ${R + 2} ${f1(-R * 1.32)} ${R + 1} ${f1(-R * 0.2)}Q${f1(cx)} ${f1(-R * 0.74)} ${-R - 1} ${f1(-R * 0.2)}Z`, ...fill }));
        break;
      case 'spiky': {
        // spikes around the top; in a turned view they end higher on the face side
        const n = 7, pts = [], span = 1 - (back ? 0 : a * 0.3);
        for (let i = 0; i <= n; i++) {
          const an = Math.PI * (1 + (i / n) * span);
          pts.push([Math.cos(an) * (R + 5), Math.sin(an) * (R + 5) - 4]);
          if (i < n) { const am = Math.PI * (1 + ((i + 0.5) / n) * span); pts.push([Math.cos(am) * (R + 24) + cx * 0.25, Math.sin(am) * (R + 24) - 4]); }
        }
        front.push(h.el('path', { d: `M${pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join('L')}Q${f1(cx)} ${f1(back ? -R * 0.1 : -R * 0.42)} ${f1(pts[0][0])} ${f1(pts[0][1])}Z`, ...fill }));
        if (back) front.push(backHair(0.58, 2));
        break;
      }
      case 'curly': {
        const balls = [];
        const span = 1.2 - (back ? 0 : a * 0.38);   // a turned head drops the curls on the face side
        for (let i = 0; i < 10; i++) { const an = Math.PI * (0.9 + (i * span) / 9); balls.push(h.circle(f1(Math.cos(an) * (R + 2) + cx * 0.12), f1(Math.sin(an) * (R + 2) - 4), 19)); }
        if (back) balls.push(h.circle(0, 0, R * 0.95), h.circle(-R * 0.62, R * 0.2, 20), h.circle(R * 0.62, R * 0.2, 20));
        else balls.push(h.ellipse(f1(cx), f1(-R * 0.62), R * 0.8, R * 0.4));
        front.push(h.blob(balls, c.hair, 3));
        break;
      }
      case 'long':
        behind.push(h.el('path', { d: `M${-R - 6} ${f1(-R * 0.2)}C${-R - 12} ${f1(R * 0.85)} ${-R - 6} ${f1(R * 1.15)} ${f1(-R * 0.5)} ${f1(R * 1.15)}L${f1(R * 0.5)} ${f1(R * 1.15)}C${R + 6} ${f1(R * 1.15)} ${R + 12} ${f1(R * 0.85)} ${R + 6} ${f1(-R * 0.2)}Z`, ...fill }));
        front.push(cap(0.05, 0.3));
        if (back) front.push(h.el('path', { d: `M${f1(-R * 0.9)} ${f1(R * 0.2)}Q0 ${f1(R * 0.5)} ${f1(R * 0.9)} ${f1(R * 0.2)}L${f1(R * 0.92)} ${f1(R * 1.1)}L${f1(-R * 0.92)} ${f1(R * 1.1)}Z`, fill: c.hair }));
        break;
      // a bun or a ponytail sits behind the head from the front and on top of the hair from behind
      case 'bun': {
        const bun = h.el('circle', { cx: f1(-cx * 0.4), cy: back ? f1(-R * 0.55) : -R - 14, r: 22, ...fill });
        if (back) front.push(cap(0.2, 0.42), bun);
        else { behind.push(bun); front.push(cap(0.2, 0.42)); }
        break;
      }
      case 'ponytail': {
        const bx = back ? 0 : -turn * R * 0.95, by = back ? -R * 0.25 : -R * 0.35;
        const tail = back
          ? h.el('path', { d: `M${f1(bx - 13)} ${f1(by)}Q${f1(bx - 18)} ${f1(by + 50)} ${f1(bx - 4)} ${f1(by + 92)}Q${f1(bx + 18)} ${f1(by + 50)} ${f1(bx + 13)} ${f1(by)}Q${f1(bx)} ${f1(by - 8)} ${f1(bx - 13)} ${f1(by)}Z`, ...fill })
          : h.el('path', { d: `M${f1(bx - 12)} ${f1(by)}Q${f1(bx - 34 - turn * 20)} ${f1(by + 40)} ${f1(bx - 18 - turn * 30)} ${f1(by + 88)}Q${f1(bx + 4)} ${f1(by + 58)} ${f1(bx + 12)} ${f1(by)}Z`, ...fill });
        const tie = h.el('ellipse', { cx: f1(bx), cy: f1(by + 2), rx: 9, ry: 6, fill: c.shirt, ...h.ink, 'stroke-width': 3 });
        if (back) front.push(cap(0.22, 0.4), tail, tie);
        else { behind.push(tail); front.push(cap(0.22, 0.4)); if (a > 0.3) front.push(tie); }
        break;
      }
      default: front.push(cap(0.15, 0.36));   // short
    }
    return { behind, front };
  }

  window.DuelHuman = { R, head, turnHead, hair, faces, HAIR };
})();
