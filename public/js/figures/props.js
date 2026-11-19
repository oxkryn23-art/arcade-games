// Props drawn in code: revolver, shotgun, football, bullet, and the Shootout effects (muzzle flash, impact,
// tracer). Flat token colors, one dark outline, round joins.
// Every prop returns { root, ... } in its own local coordinates (documented per prop).
(function () {
  const K = window.DuelKit;
  const { el, g } = K;
  const T = (n) => `var(--${n})`;
  const ink = (w = 4) => ({ stroke: T('outline'), 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const line = (d, w = 3.5) => el('path', { d, fill: 'none', ...ink(w) });

  // Revolver: grip at the origin (where the hand holds it), barrel along +x. muzzle = [x, y].
  // cylSide (the cylinder seen from the side) and cylFace (swung out, the six chambers) are separate for the reload.
  function revolver() {
    const grip = el('path', { d: 'M-4 -6L8 -6Q4 6 2 22Q-6 26 -14 22Q-10 8 -4 -6Z', fill: T('wood'), ...ink(3.5) });
    const frame = el('path', { d: 'M-10 -20L22 -20L22 -4L8 -4Q4 -2 -4 -2L-10 -8Z', fill: T('gunmetal'), ...ink(3.5) });
    const barrel = el('rect', { x: 20, y: -20, width: 38, height: 9, rx: 3, fill: T('gunmetal'), ...ink(3.5) });
    const sight = el('rect', { x: 52, y: -24, width: 4, height: 5, rx: 1, fill: T('gunmetal'), ...ink(2) });
    const hammer = el('path', { d: 'M-10 -18L-18 -26L-14 -16Z', fill: T('gunmetal'), ...ink(3) });
    const guard = el('path', { d: 'M0 -3Q2 8 12 6Q16 2 14 -3', fill: 'none', ...ink(3.5) });
    const cylSide = g({}, el('rect', { x: 0, y: -22, width: 20, height: 18, rx: 5, fill: T('gunmetal-light'), ...ink(3.5) }),
      line('M5 -17L15 -17M5 -13L15 -13M5 -9L15 -9', 2.5));
    const holes = [0, 60, 120, 180, 240, 300].map((a) => el('circle', { cx: Math.cos(a * Math.PI / 180) * 6.5, cy: Math.sin(a * Math.PI / 180) * 6.5, r: 2.6, fill: T('outline') }));
    const cylSpin = g({}, el('circle', { r: 12, fill: T('gunmetal-light'), ...ink(3.5) }), ...holes);
    const cylFace = g({ transform: 'translate(10 -13)' }, cylSpin);
    cylFace.style.display = 'none';
    const S = 1.55;   // drawn at hand scale, shown a bit bigger (about a head wide, like props-ref)
    const root = g({ class: 'prop-revolver', transform: `scale(${S})` }, grip, guard, barrel, sight, frame, hammer, cylSide, cylFace);
    return { root, cylSide, cylFace, cylSpin, muzzle: [60 * S, -15.5 * S], length: 60 * S };
  }

  // Shotgun: the rear hand holds the grip at the origin, the front hand the pump (pump). Barrel along +x.
  function shotgun() {
    const stock = el('path', { d: 'M8 -10L-6 -6L-46 4Q-52 18 -44 22L-20 12L4 4Z', fill: T('wood'), ...ink(3.5) });
    const body = el('path', { d: 'M2 -14L40 -14L40 2L8 2L0 -4Z', fill: T('gunmetal-light'), ...ink(3.5) });
    const barrel = g({}, el('rect', { x: 38, y: -16, width: 84, height: 9, rx: 4, fill: T('gunmetal'), ...ink(3.5) }),
      el('rect', { x: 38, y: -7, width: 74, height: 8, rx: 4, fill: T('gunmetal'), ...ink(3.5) }));
    const pump = g({}, el('rect', { x: 58, y: -4, width: 32, height: 12, rx: 5, fill: T('wood'), ...ink(3.5) }), line('M66 -2L66 6M73 -2L73 6M80 -2L80 6', 2.5));
    const guard = el('path', { d: 'M10 2Q10 12 20 10Q22 6 20 2', fill: 'none', ...ink(3.5) });
    const S = 1.4;
    const root = g({ class: 'prop-shotgun', transform: `scale(${S})` }, stock, guard, body, barrel, pump);
    return { root, muzzle: [124 * S, -8 * S], pump: [74 * S, 2 * S], length: 124 * S };
  }

  // Football: center at the origin, radius 20.
  function football() {
    const r = 20;
    const pent = (cx, cy, s, rot = 0) => el('path', {
      d: Array.from({ length: 5 }, (_, i) => { const a = (i * 72 - 90 + rot) * Math.PI / 180; return `${i ? 'L' : 'M'}${(cx + Math.cos(a) * s).toFixed(1)} ${(cy + Math.sin(a) * s).toFixed(1)}`; }).join('') + 'Z',
      fill: T('ball-dark'),
    });
    const id = `ball${Math.random().toString(36).slice(2, 7)}`;
    const clip = el('clipPath', { id }, el('circle', { r }));
    const spin = g({ 'clip-path': `url(#${id})` }, el('circle', { r, fill: T('ball') }), pent(0, 0, 7.5),
      ...[0, 72, 144, 216, 288].map((a) => pent(Math.cos((a - 90) * Math.PI / 180) * 19, Math.sin((a - 90) * Math.PI / 180) * 19, 7.5, 36)),
      line('M0 -7.5L0 -13M7 -2.3L12.5 -4M4.4 6L7.7 10.5M-4.4 6L-7.7 10.5M-7 -2.3L-12.5 -4', 2));
    const root = g({ class: 'prop-ball' }, el('defs', {}, clip), spin, el('circle', { r, fill: 'none', ...ink(3.5) }));
    return { root, spin, r };
  }

  // A brass bullet (reload), base at the origin, pointing -y.
  function bullet() {
    return { root: g({ class: 'prop-bullet' }, el('rect', { x: -3.5, y: -16, width: 7, height: 16, rx: 2, fill: T('muzzle'), ...ink(2.5) }), el('path', { d: 'M-3.5 -14Q0 -24 3.5 -14Z', fill: T('wood'), ...ink(2.5) })) };
  }

  // --- effects (scene coordinates) ---
  // Muzzle flash: a jagged star at x, y pointing along angle a (deg).
  function muzzleFlash(layer, x, y, a = 0, size = 1, ms = 160) {
    const pts = [[0, -14], [26, -22], [18, -6], [52, 0], [18, 6], [26, 22], [0, 14], [6, 0]];
    const star = el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('') + 'Z', fill: T('muzzle'), ...ink(3) });
    const inner = g({}, star);
    const node = g({ transform: `translate(${x} ${y}) rotate(${a}) scale(${size})` }, inner);
    layer.append(node);
    return K.anim(inner, [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.35 }, { transform: 'scale(.9)', opacity: 0 }], { duration: ms }).then(() => node.remove());
  }
  // Wood splinters + a ricochet spark where a bullet hits cover. dir: +1 splinters fly right, -1 left.
  function impact(layer, x, y, dir = 1, ms = 420) {
    const parts = [];
    if (!K.reduced()) {
      for (let i = 0; i < 6; i++) {
        const a = (-60 + i * 24 + Math.random() * 12) * Math.PI / 180;
        const s = el('rect', { x: -2, y: -7, width: 5, height: 14, rx: 2, fill: T('wood'), ...ink(2) });
        const n = g({ transform: `translate(${x} ${y})` }, s);
        layer.append(n);
        parts.push(K.anim(s, [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * 70 * dir}px,${Math.sin(a) * 70}px) rotate(${200 * dir}deg)`, opacity: 0 }], { duration: ms }).then(() => n.remove()));
      }
    }
    const spark = g({}, line('M0 0L22 -10M0 0L24 4M0 0L14 16', 3.5));
    paintSpark(spark);
    const sn = g({ transform: `translate(${x} ${y}) scale(${dir} 1)` }, spark);
    layer.append(sn);
    parts.push(K.anim(spark, [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.2)', opacity: 0 }], { duration: ms * 0.6 }).then(() => sn.remove()));
    return Promise.all(parts);
  }
  function paintSpark(node) { node.querySelectorAll('path').forEach((p) => { K.paint(p, 'stroke', T('muzzle')); }); }
  // Bullet trace from a to b (a short streak that travels).
  function tracer(layer, a, b, ms = 140) {
    const len = 46, ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    const streak = el('rect', { x: -len, y: -2.5, width: len, height: 5, rx: 2.5, fill: T('muzzle') });
    const node = g({ transform: `translate(${a[0]} ${a[1]}) rotate(${ang})` }, streak);
    layer.append(node);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return K.anim(streak, [{ transform: 'translateX(0px)', opacity: 1 }, { transform: `translateX(${d}px)`, opacity: 0.9 }], { duration: ms, easing: 'linear' }).then(() => node.remove());
  }

  window.DuelProps = { revolver, shotgun, football, bullet, muzzleFlash, impact, tracer };
})();
