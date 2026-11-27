// Outfits: the OUTFIT slot of the cosmetics (ids in mascots/cosmetics.js ITEMS.outfit). This is the original game's
// outfits.js (Verso), kept as it was in how a garment is built and dressed; load after mascots/rig.js. (site) The
// human's default garment is 'tee': a T-shirt in the player's shirt color with trousers (the bottom of the body and the
// legs in the trousers color); the human clothes kit (art-source/human-kit/, imported like the original game's v9
// cosmetics) adds the vector-texture garments (SPRITE_IDS).
//
// Every garment is BODY-SHAPED: drawn in body space and CLIPPED to the character's own body path by the rig, so it can
// never sit off the body in any view or pose; the rig strokes the body outline again on top. The sleeves (and a
// garment's trouser legs) are the rig's: sleeveOf / SPEC below.
//
// dress(item, o) -> { node, clip, top } | null. node: SVG nodes in BODY space (origin at the hip center, y down; the
// egg from o.yT at the neck to o.yB at the bottom); clip: whether the rig clips node to the body; top: optional nodes
// over everything, not clipped. o = { rx, rxT, yT, yS (shoulders), yM (belly, widest), yB, turn (0 front .. 1 profile),
// back, view ('front'|'three'|'side'|'back'), cx (where the front center sits: it slides toward the facing side as the
// body turns), k (how wide front details are: 1 in front, narrower in profile), sp (species id), look (the loadout) }.
(function () {
  const K = window.VersoKit;
  const { el, g } = K;
  const T = (n) => `var(--${n})`;
  const f1 = (n) => Math.round(n * 10) / 10;
  const CODE_IDS = ['tee'];
  // the kit's vector-texture garments (filled on import)
  const SPRITE_IDS = [];
  const IDS = ['none', ...CODE_IDS, ...SPRITE_IDS];
  const ink = { stroke: T('outline'), 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };

  // ---- drawing helpers (body space) ----
  const shape = (d, fill, w = 3) => el('path', { d, fill, ...ink, 'stroke-width': w });
  const line = (d, color = T('outline'), w = 3) => el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const dot = (x, y, r, fill, w = 2) => el('circle', { cx: f1(x), cy: f1(y), r, fill, ...ink, 'stroke-width': w });
  const P = (pts) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z`;
  // The garment: everything above a hem that sags a little in the middle (the rig's clip trims it to the body).
  const W = 130;
  const torsoD = (o, hem, sag = 4) => `M${-W} ${f1(o.yT - 60)}L${W} ${f1(o.yT - 60)}L${W} ${f1(hem)}Q${f1(o.cx)} ${f1(hem + sag * 2)} ${-W} ${f1(hem)}Z`;
  const hemD = (o, hem, sag = 4) => `M${-W} ${f1(hem)}Q${f1(o.cx)} ${f1(hem + sag * 2)} ${W} ${f1(hem)}`;
  // Where every garment's hem sits: just below the body's bottom (o.yB), so the garment covers the whole torso down to
  // the hips, where the legs come out (the clip trims it to the body outline; test/arms.js checks that no skin shows
  // between the garment and the legs). Hem details (ribbing, a trim, a hem line) sit just above it, at the body's bottom.
  const HEM = (o) => o.yB + 4;
  // A band between two hem curves (ribbing, a waistband, a stripe).
  const bandD = (o, y0, y1, sag = 4) => `M${-W} ${f1(y0)}Q${f1(o.cx)} ${f1(y0 + sag * 2)} ${W} ${f1(y0)}L${W} ${f1(y1)}Q${f1(o.cx)} ${f1(y1 + sag * 2)} ${-W} ${f1(y1)}Z`;
  const front = (o) => !o.back;
  // A crew / scoop neckline under the chin (mostly hidden by the head; it shows when the head moves).
  const crew = (o, color, w = 15, depth = 16) => shape(`M${f1(o.cx - w * o.k)} ${f1(o.yT - 2)}Q${f1(o.cx)} ${f1(o.yT + depth + 6)} ${f1(o.cx + w * o.k)} ${f1(o.yT - 2)}`
    + `L${f1(o.cx + (w - 5) * o.k)} ${f1(o.yT - 2)}Q${f1(o.cx)} ${f1(o.yT + depth - 4)} ${f1(o.cx - (w - 5) * o.k)} ${f1(o.yT - 2)}Z`, color, 2.5);
  // THE NECK OPENING (round 33): every garment leaves its neck opening open, so the body's own fill (the species fur)
  // shows there as the neck, never a hole or a mannequin neck. A neck is a closed polygon in body space (open at the
  // top, it reaches up past the neck point): neckHole() cuts it out of a garment's fill (fill-rule evenodd), the
  // garment's group carries it as data-neck (test/arms.js allows bare body there and nowhere else).
  const NECK_UP = 30;
  // an opening under a quadratic curve from (a, y0) through the control point (c, d) to (b, y0)
  const quadNeck = (o, a, b, y0, c, d) => {
    const pts = [[a, o.yT - NECK_UP], [a, y0]];
    for (let i = 1; i < 12; i++) { const t = i / 12, u = 1 - t; pts.push([u * u * a + 2 * u * t * c + t * t * b, u * u * y0 + 2 * u * t * d + t * t * y0]); }
    pts.push([b, y0], [b, o.yT - NECK_UP]);
    return pts;
  };
  // the inside of the crew() ring
  const crewNeck = (o, w, depth) => quadNeck(o, o.cx - (w - 5) * o.k, o.cx + (w - 5) * o.k, o.yT - 2, o.cx, o.yT + depth - 4);
  const neckHole = (pts) => (pts ? `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z` : '');
  const neckData = (pts) => pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  // the garment's fill with its neck opening cut out
  const torsoNeck = (o, hem, fill, pts) => el('path', { d: torsoD(o, hem) + neckHole(pts), fill, ...ink, 'fill-rule': 'evenodd' });

  // ---- the body-shaped outfits drawn in code ----
  const BODY = {
    // (site) a T-shirt in the player's shirt color, a crew neck (the neck shows in it), the trousers over the bottom
    // of the body (the legs are the trousers too: SPEC.tee.legs)
    tee: (o) => {
      const shirt = T(o.look?.shirt || 'shirt-1'), hem = HEM(o), waist = o.yB - 20;
      const cw = o.back ? 13 : 15, cd = o.back ? 8 : 14, nk = crewNeck(o, cw, cd);
      const n = g({}, torsoNeck(o, hem, shirt, nk), crew(o, shirt, cw, cd));
      n.append(shape(`M${-W} ${f1(waist)}Q${f1(o.cx)} ${f1(waist + 6)} ${W} ${f1(waist)}L${W} ${f1(o.yB + 40)}L${-W} ${f1(o.yB + 40)}Z`, T('pants')));
      return { node: n, neck: nk };
    },
  };

  // ---- the v9 sprite garments ----
  // The texture of the view stretched over the body's box, over the base fill (the main color down past the hips).
  // The texture's neck opening is transparent (clipped out by tools/art-v9.js, its outline in the sprite table: s.neck, [x, y,
  // ...] in thousandths of the box from its top left): the base fill leaves it out and the collar's edge is outlined.
  function spriteBody(item, o) {
    const s = window.VersoCosmetics?.outfitSprite?.(item, o.view);
    const bw = o.rx * 2, bh = o.yB - o.yT;
    let nk = null, edge = null;
    if (s?.neck?.length >= 6) {
      const p = [];
      for (let i = 0; i + 1 < s.neck.length; i += 2) p.push([-o.rx + (s.neck[i] / 1000) * bw, o.yT + (s.neck[i + 1] / 1000) * bh]);
      // open at the top (the outline starts and ends on the box's top edge): the cut reaches up past the neck point and
      // the outline leaves the top edge out; an enclosed opening (a hood's fold) is outlined all round
      const open = s.neck[1] <= 25 && s.neck[s.neck.length - 1] <= 25;
      const D = (pts) => pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L');
      nk = open ? [[p[0][0], o.yT - NECK_UP], ...p, [p[p.length - 1][0], o.yT - NECK_UP]] : p;
      edge = el('path', { d: `M${D(p)}${open ? '' : 'Z'}`, fill: 'none', ...ink, 'stroke-width': 2.5, class: 'outfit-neck' });
    }
    const n = g({ class: `outfit-sprite outfit--${item}` }, el('path', { d: torsoD(o, HEM(o)) + neckHole(nk), fill: T(`outfit-${item}`), 'fill-rule': 'evenodd', class: 'outfit-base' }));
    if (s) n.append(el('image', { href: s.href, x: f1(-o.rx), y: f1(o.yT), width: f1(bw), height: f1(bh), preserveAspectRatio: 'none', class: 'outfit-img' }));
    if (edge) n.append(edge);
    return { node: n, neck: nk };
  }

  function dress(item, o) {
    if (!item || item === 'none' || !IDS.includes(item)) return null;
    const r = SPRITE_IDS.includes(item) ? spriteBody(item, o) : BODY[item]?.(o);
    if (r?.neck) r.node.setAttribute('data-neck', neckData(r.neck));
    return r ? { node: r.node, clip: true, top: r.top || null } : null;
  }
  // the sleeves (rig.js dressSleeve): the sleeve's fill per garment; sleeveOf(item, look) for a garment in the
  // player's own color (the tee)
  const SLEEVE = Object.fromEntries(SPRITE_IDS.map((id) => [id, T(`outfit-${id}-sleeve`)]));
  const sleeveOf = (item, look) => (item === 'tee' ? T(look?.shirt || 'shirt-1') : SLEEVE[item] || null);
  // short / long sleeves, cuffs and trouser legs (see the original header: { long, cuff, cuffW, stripe, flare, legs })
  const SPEC = {
    tee: { long: false, legs: { color: T('pants') } },
  };
  window.VersoOutfits = {
    ids: () => [...IDS],
    has: (id) => IDS.includes(id),
    isSprite: (id) => SPRITE_IDS.includes(id),
    dress, BODY, SLEEVE, sleeveOf, SPEC, SPRITE_IDS, CODE_IDS,
  };
})();
