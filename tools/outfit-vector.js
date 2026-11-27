// The outfit textures as VECTORS: the original game's tools/outfit-vector.js, unchanged; called by tools/import-kit.js
// for every outfit view. No extra packages: the tracing is written here (pure Node).
//
// Why: the ChatGPT sheets are 1024x1536, so a garment view is only about 180 px. The raster pipeline removed the
// garment's own outline by rebuilding a ring of pixels from their neighbours (a mean bleed: smeared, frayed stripe ends
// at the hem, grey smudges where a detail sat near the outline) and warped every row by its jittery silhouette span
// (a straight placket came out jagged), then upscaled ~2x (soft). The art itself is flat cartoon colors, so it is traced:
//   1. palette(): one palette per garment from its four views' PURE pixels (a pixel whose 3 x 3 neighbourhood has the
//      same color), clustered in CIELAB (MERGE); two clusters up to MERGE_HI apart stay two only when the smaller forms
//      coherent areas bounded by drawn edges (a lapel, a collar), else (blotchy grain, one half of a soft gradient) they
//      merge; clusters with fewer than MIN_PURE pure pixels are dropped (unless DISTINCT from every other color, with
//      MIN_PURE_LO: a thin gold buckle). The ink = the darkest color (L < 22).
//   2. labels(): every opaque pixel -> a palette index; a mixed (anti-aliased) pixel takes the nearest of the pure
//      labels within 2 px and the colors close to it (a dark one may be ink); a THIN line (a ridge across x or y on the
//      mix from the ground toward a palette color, RIDGE_MIX / RIDGE_INK) keeps its color (pinstripes); then specks
//      (< SPECK px), lone teeth (a majority pass) and short stray pieces without pure pixels (< STRAY px: the dashes a
//      fold line in a color the palette lacks would leave) are merged into their surroundings; last, the blotches of
//      the art's SOFT SHADING (shades(), round 38: pieces of a gradient toward the silhouette that landed on a shade
//      color, the lab coat's smudges) take the color they shade.
//   3. outline(): the garment's own OUTER outline = ink pixels within the outline's thickness (inkWidth, counted on the
//      labels) of the silhouette edge, grown along connected ink up to OUT_GROW x that thickness (an inner line that
//      touches the outline is cut there, a line nearby is kept: the old 'dark residue' rule ate the referee's pocket);
//      short ink pieces (< FRAG) and small pieces of color (< EDGE_BIT, or a sliver within the outline's reach
//      < EDGE_STRIP: a button on the outline) left at the cut go too; a line that met the outline is drawn on straight
//      to the silhouette edge (lines(), round 38); all the rest and everything outside the silhouette is filled from
//      the NEAREST known non-ink pixel, so stripes and prints run on FLAT and square to the box edge (round 35 filled
//      ring by ring by a majority vote, which ran lines, pocket corners and shading out as diagonal streaks).
//   4. trace(): stacked layers, one per color (largest first, the ink last): layer i = the union of the labels from i
//      up, so the layers nest and no hairline gap can open between two colors. Each layer's mask carries the art's own
//      anti-aliasing as a sub-pixel edge position (coverage()), gets a light gaussian (BLUR), is upsampled UP x with a
//      Catmull-Rom kernel and contoured at 1/2 (marching squares): smooth curves, no pixel stairs; the loops are
//      smoothed along their length (SMOOTH_K, round 38: no ragged ink edges) and simplified (Douglas-Peucker, SIMPLIFY).
//   5. warpLoop(): the vector is warped into the canonical body egg point by point (the mapping the raster warp used,
//      but on SMOOTHED silhouette spans: SPAN_SMOOTH rows), long edges subdivided first so they bend with the warp;
//      loops wholly outside the egg are dropped and the parts outside it simplified loosely (nothing shows there).
//   6. svg(): a viewBox of the texture's published size (sprites.json w, h), preserveAspectRatio none (the rig stretches
//      it over the body's box), a full-box rect in the first color, the layers as evenodd paths; the neck opening is
//      clipped out (clip-rule evenodd) so the body's fur shows there.
const { Resvg } = require('@resvg/resvg-js');

const RIDGE_MIX = 0.15;  // a thin line's pixel: at least this share of the mix toward its color
const RIDGE_INK = 0.45;  // (toward the ink: a darker shade of the fill is a mix toward black too, a fold line)
const MERGE = 4;         // CIELAB distance under which two clusters are one color
const MERGE_HI = 12;     // up to this distance, two clusters are one unless the smaller forms coherent areas
const COHERENT = 60;     // px: a coherent area (a component of pure pixels)
const GRADIENT = 0.2;    // share of a shade's border touching the other shade: a soft gradient, one color
const MIN_PURE = 40;     // px: clusters with fewer pure pixels (over the four views) are dropped
const MIN_PURE_LO = 15;  // px: ... or this many when the color is distinct (DISTINCT from every other: round 38)
const DISTINCT = 25;     // CIELAB
const STRAY = 30;        // px: a thin piece without pure pixels shorter than this is dropped (stray())
const SPECK = 7;         // px (source): smaller components are merged into the surroundings
const OUT_GROW = 1.7;    // the outline: connected ink up to this x its thickness from the silhouette edge
const FRAG = 80;         // px per 36000 px of the crop: smaller ink pieces left at the cut are dropped
const EDGE_STRIP = 400;  // px per 36000 px: up to this size when the piece lies wholly within the outline's reach (round 38)
const THIN_RUN = 3;      // steps: a shade line no thicker than this runs on only inside the silhouette (round 39)
const RUN_MIN = 150;     // px per 36000 px: smaller pieces of color do not run on across the cut (round 38)
const EDGE_BIT = 45;     // px per 36000 px of the crop: smaller pieces of a color left at the cut are dropped (round 38)
const UP = 4;            // the contour grid: UP samples per source px
const BLUR = 0.35;       // source px: the gaussian (sigma) over each layer's mask before contouring (smooth edges)
const BLUR_INK = 0.3;    // (lighter on the ink, so thin lines keep their width)
const SMOOTH_K = 7;      // contour samples (UP per source px): the loops are smoothed over +- this many (round 38)
const SIMPLIFY = 0.14;   // source px (Douglas-Peucker on the traced loops)
const SPAN_SMOOTH = 4;   // rows: the silhouette spans are averaged over +-SPAN_SMOOTH rows before the warp
const SEG = 1.25;        // source px: the longest edge warped as a straight line
const SIMPLIFY_OUT = 0.18; // texture px: after the warp
const OUTSIDE = 0.08;    // share of the half width: beyond the canonical egg by this much, nothing shows (both bodies)
const LOOSE = 3;         // texture px: the tolerance there

// ---------- color ----------
const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
function toLab(r, g, b) {
  const R = srgb(r), G = srgb(g), B = srgb(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
const dl = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const opaque = (c, i) => c.data[i * 4 + 3] > 128;
function labOf(c) {
  const L = new Float32Array(c.w * c.h * 3);
  for (let i = 0; i < c.w * c.h; i++) { const l = toLab(c.data[i * 4], c.data[i * 4 + 1], c.data[i * 4 + 2]); L[i * 3] = l[0]; L[i * 3 + 1] = l[1]; L[i * 3 + 2] = l[2]; }
  return L;
}
const at = (L, i) => [L[i * 3], L[i * 3 + 1], L[i * 3 + 2]];
// pure = opaque, and every 8-neighbour opaque and within 6 (CIELAB) of it
function purity(c, L) {
  const { w, h } = c, p = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!opaque(c, i)) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) { const j = i + dy * w + dx; if (!opaque(c, j) || dl(at(L, i), at(L, j)) > 6) ok = false; }
    p[i] = ok ? 1 : 0;
  }
  return p;
}

// ---------- 1. the palette of a garment (its four view crops) ----------
function palette(cells) {
  const bins = new Map(), views = [];
  for (const c of cells) {
    const L = labOf(c), p = purity(c, L), px = [];
    for (let i = 0; i < c.w * c.h; i++) {
      if (!p[i]) continue;
      const l = at(L, i), k = `${Math.round(l[0] / 3)},${Math.round(l[1] / 3)},${Math.round(l[2] / 3)}`;
      const b = bins.get(k) || { n: 0, l: [0, 0, 0], rgb: [0, 0, 0] };
      b.n++; for (let q = 0; q < 3; q++) { b.l[q] += l[q]; b.rgb[q] += c.data[i * 4 + q]; }
      bins.set(k, b); px.push([i, b]);
    }
    views.push({ w: c.w, h: c.h, px });
  }
  // greedy: the most common bins seed clusters, every other bin joins the nearest within MERGE
  const list = [...bins.values()].map((b) => ({ n: b.n, l: b.l.map((v) => v / b.n), rgb: b.rgb, src: b })).sort((a, b) => b.n - a.n);
  let cl = [];
  for (const b of list) {
    let best = null, bd = MERGE;
    for (const c of cl) { const d = dl(c.l, b.l); if (d < bd) { bd = d; best = c; } }
    if (best) { best.items.push(b); } else cl.push({ l: b.l, items: [b] });
  }
  // a few k-means rounds over the bins
  for (let it = 0; it < 6; it++) {
    for (const c of cl) { let n = 0; const s = [0, 0, 0]; for (const b of c.items) { n += b.n; for (let q = 0; q < 3; q++) s[q] += b.l[q] * b.n; } if (n) c.l = s.map((v) => v / n); c.items = []; }
    for (const b of list) { let best = cl[0], bd = 1e9; for (const c of cl) { const d = dl(c.l, b.l); if (d < bd) { bd = d; best = c; } } best.items.push(b); }
    cl = cl.filter((c) => c.items.length);
    // clusters closer than MERGE after the update are merged
    for (let a = 0; a < cl.length; a++) for (let b = cl.length - 1; b > a; b--) if (dl(cl[a].l, cl[b].l) < MERGE) { cl[a].items.push(...cl[b].items); cl.splice(b, 1); }
  }
  // Two close colors (MERGE to MERGE_HI apart) stay two only when the smaller one forms coherent areas (a lapel, a
  // shade band): most of its pure pixels in components of COHERENT px or more, and bounded by drawn edges (less than
  // GRADIENT of its border touching the other color's pure pixels); a blotchy shade of the same fill (the art's soft
  // noise) or one half of a soft gradient is merged into the bigger one.
  const centroid = (c) => { let n = 0; const s = [0, 0, 0]; for (const b of c.items) { n += b.n; for (let q = 0; q < 3; q++) s[q] += b.l[q] * b.n; } c.n = n; c.l = s.map((v) => v / n); };
  cl.forEach(centroid);
  for (let merged = true; merged;) {
    merged = false;
    const owner = new Map();
    for (const [ci, c] of cl.entries()) for (const b of c.items) owner.set(b.src, ci);
    const pairs = [];
    for (let a = 0; a < cl.length; a++) for (let b = a + 1; b < cl.length; b++) { const d = dl(cl[a].l, cl[b].l); if (d < MERGE_HI) pairs.push([d, a, b]); }
    pairs.sort((x, y) => x[0] - y[0]);
    for (const [, a, b] of pairs) {
      const sm = cl[a].n < cl[b].n ? a : b, big = sm === a ? b : a;
      let coh = 0, tot = 0, edge = 0, touch = 0;
      for (const v of views) {
        const m = new Uint8Array(v.w * v.h);
        for (const [i, bin] of v.px) { const o = owner.get(bin); if (o === sm) m[i] = 1; else if (o === big) m[i] = 2; }
        // the border of the smaller color: how much of it touches the bigger color's pure pixels directly (a soft
        // gradient between two shades); a drawn edge always has mixed pixels (or a line) between two flat colors
        for (let i = 0; i < m.length; i++) {
          if (m[i] !== 1) continue;
          const x = i % v.w, nb = [x > 0 ? i - 1 : -1, x < v.w - 1 ? i + 1 : -1, i - v.w, i + v.w].filter((j) => j >= 0 && j < m.length);
          if (nb.some((j) => m[j] !== 1)) { edge++; if (nb.some((j) => m[j] === 2)) touch++; }
        }
        for (let i = 0; i < m.length; i++) if (m[i] === 2) m[i] = 0;
        const seen = new Uint8Array(v.w * v.h);
        for (let s0 = 0; s0 < m.length; s0++) {
          if (!m[s0] || seen[s0]) continue;
          let n = 0; const q = [s0]; seen[s0] = 1;
          while (q.length) { const i = q.pop(), x = i % v.w; n++; for (const j of [i - 1, i + 1, i - v.w, i + v.w]) { if (j < 0 || j >= m.length || (j === i - 1 && x === 0) || (j === i + 1 && x === v.w - 1) || !m[j] || seen[j]) continue; seen[j] = 1; q.push(j); } }
          tot += n; if (n >= COHERENT) coh += n;
        }
      }
      if (tot && coh / tot >= 0.5 && touch / (edge || 1) < GRADIENT) continue;
      cl[big].items.push(...cl[sm].items); cl.splice(sm, 1); centroid(cl[big < sm ? big : big - 1]);
      merged = true;
      break;
    }
  }
  const out = cl.map((c) => {
    let n = 0; const rgb = [0, 0, 0];
    for (const b of c.items) { n += b.n; for (let q = 0; q < 3; q++) rgb[q] += b.rgb[q]; }
    return { n, rgb: rgb.map((v) => v / n), l: c.l };
  }).sort((a, b) => b.n - a.n);
  // (round 38) a small color stays when it is DISTINCT, DISTINCT or more from every color kept: a gold buckle drawn
  // with thin strokes has few pure pixels (the duster's: 30 over the four views), and without its color its pixels
  // went to the cream and the brown, a blotchy buckle; a soft mix of two colors kept (a shade between them) is not
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].n >= MIN_PURE) continue;
    const far = out.every((o, j) => j === i || (o.n < MIN_PURE && j > i) || dl(o.l, out[i].l) >= DISTINCT);
    if (out[i].n < MIN_PURE_LO || !far) out.splice(i, 1);
  }
  // the ink: the darkest color, when it is dark enough (L < 22)
  let ink = -1;
  out.forEach((c, i) => { if (c.l[0] < 22 && (ink < 0 || c.l[0] < out[ink].l[0])) ink = i; });
  return { colors: out, ink };
}

// ---------- 2. labels ----------
function labels(c, pal) {
  const { w, h } = c, L = labOf(c), p = purity(c, L), lab = new Int16Array(w * h).fill(-1);
  const near = (l, allowed) => { let best = -1, bd = 1e9; for (let k = 0; k < pal.colors.length; k++) { if (allowed && !allowed.has(k)) continue; const d = dl(pal.colors[k].l, l); if (d < bd) { bd = d; best = k; } } return best; };
  for (let i = 0; i < w * h; i++) if (p[i]) lab[i] = near(at(L, i));
  // mixed pixels: the nearest color among the pure labels within 2 px and the colors within 12 of it (else any)
  const out = Int16Array.from(lab);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!opaque(c, i) || lab[i] >= 0) continue;
    const set = new Set(), l = at(L, i);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && lab[Y * w + X] >= 0) set.add(lab[Y * w + X]); }
    // (and any color the pixel is close to: a thin line has no pure pixels of its own)
    pal.colors.forEach((c, k) => { if (dl(c.l, l) < 12) set.add(k); });
    // (a dark pixel may always be ink: the thin dark outline of a print is darker than its fill)
    if (pal.ink >= 0 && l[0] < 35) set.add(pal.ink);
    out[i] = near(at(L, i), set.size ? set : null);
    // a THIN line (a pinstripe, a seam: 1 to 2 px, so only a faint mix of its color over the ground) keeps its color:
    // when the pixel is a ridge across x or y (on both sides, within 2 px, a pixel closer to the ground color A, the
    // most common pure label around) and it lies on the mix from A toward a color B (at least RIDGE_MIX of the way,
    // off that line by less than 9), it is B
    const cnt = new Map();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && lab[Y * w + X] >= 0) cnt.set(lab[Y * w + X], (cnt.get(lab[Y * w + X]) || 0) + 1); }
    let A = -1, an = 0; for (const [u, n] of cnt) if (n > an) { an = n; A = u; }
    if (A < 0 || out[i] !== A) continue;
    const a = pal.colors[A].l, dA = dl(l, a);
    const closer = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && opaque(c, Y * w + X) && dl(at(L, Y * w + X), a) < dA - 3;
    const ridge = ((closer(x - 1, y) || closer(x - 2, y)) && (closer(x + 1, y) || closer(x + 2, y))) || ((closer(x, y - 1) || closer(x, y - 2)) && (closer(x, y + 1) || closer(x, y + 2)));
    if (!ridge) continue;
    let best = -1, br = 9;
    pal.colors.forEach((cb, B) => {
      if (B === A) return;
      const b = cb.l, v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1;
      const al = ((l[0] - a[0]) * v[0] + (l[1] - a[1]) * v[1] + (l[2] - a[2]) * v[2]) / n2;
      if (al < (B === pal.ink ? RIDGE_INK : RIDGE_MIX) || al > 1.3) return;
      const r = Math.hypot(l[0] - a[0] - al * v[0], l[1] - a[1] - al * v[1], l[2] - a[2] - al * v[2]);
      if (r < br) { br = r; best = B; }
    });
    if (best >= 0) out[i] = best;
  }
  despeck(out, w, h);
  majority(out, w, h, pal.ink);
  despeck(out, w, h);
  stray(out, w, h, p);
  shades(out, c, L, pal);
  despeck(out, w, h);
  return out;
}
// The art's SOFT SHADING (round 38): the sheets shade a garment toward its silhouette (a darker band along the left,
// right and bottom edges, the lab coat's back most of all) with a smooth gradient, not a drawn edge. Where the palette
// keeps a shade color for a real drawn area (the lab coat's taupe neck and lapel shadows), the pixels of that gradient
// just past the midpoint landed on the shade too, in blotches: smudges along the sides and the back (and the ring fill
// ran them on). A component (4-connected, not ink, under SHADE_MAX px) is such a blotch when, toward its main non-ink
// neighbour b (a close color: under SHADE_D apart), its pixels sit on average SHADE_AL or more of the way from its own
// color to b (a drawn area is mostly its own flat color; a gradient's piece sits around the midpoint) and SHADE_SOFT or
// more of that border is soft (no step of SHADE_STEP x the colors' distance over the 4 px across it, on the art
// smoothed 3 x 3 against its grain; a drawn edge or a thin line always has one). Such a blotch takes b's label.
const SHADE_MAX = 700, SHADE_D = 40, SHADE_AL = 0.25, SHADE_SOFT = 0.3, SHADE_STEP = 0.22;
function shades(lab, c, L, pal) {
  const { w, h } = c, S = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0; const s = [0, 0, 0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h || !opaque(c, Y * w + X)) continue; n++; for (let q = 0; q < 3; q++) s[q] += L[(Y * w + X) * 3 + q]; }
    if (n) for (let q = 0; q < 3; q++) S[(y * w + x) * 3 + q] = s[q] / n;
  }
  const sm = (i) => [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]];
  // the label a part (pixels of label v; cset = its whole component) should take, or -1 when it is no blotch
  const blotch = (part, cset, v) => {
    const set = new Set(part), nb = new Map(), pairs = [];
    for (const p of part) {
      const x = p % w;
      for (const [d, ok] of [[-1, x > 0], [1, x < w - 1], [-w, true], [w, true]]) {
        const r = p + d;
        if (!ok || r < 0 || r >= w * h || set.has(r) || cset.has(r)) continue;
        const u = lab[r];
        if (u < 0 || u === pal.ink) continue;
        nb.set(u, (nb.get(u) || 0) + 1); pairs.push([p, r, d, u]);
      }
    }
    let b = -1, bn = 0; for (const [u, n] of nb) if (n > bn) { bn = n; b = u; }
    if (b < 0) return -1;
    const A = pal.colors[v].l, B = pal.colors[b].l, D = dl(A, B);
    if (D >= SHADE_D) return -1;
    const vv = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], n2 = D * D || 1;
    let al = 0;
    for (const p of part) al += ((L[p * 3] - A[0]) * vv[0] + (L[p * 3 + 1] - A[1]) * vv[1] + (L[p * 3 + 2] - A[2]) * vv[2]) / n2;
    if (al / part.length < SHADE_AL) return -1;
    let soft = 0, tot = 0;
    for (const [p, r, d, u] of pairs) {
      if (u !== b) continue;
      const pin = set.has(p - d) ? p - d : p, ro = lab[r + d] === b ? r + d : r;
      const st = Math.max(dl(sm(pin), sm(p)), dl(sm(p), sm(r)), dl(sm(r), sm(ro))) / D;
      tot++; if (st < SHADE_STEP) soft++;
    }
    return tot && soft / tot >= SHADE_SOFT ? b : -1;
  };
  // the 4-step distance of every pixel of a component from its border (1 = on the border)
  const inner = (comp, cset) => {
    const dd = new Map();
    let fr = comp.filter((p) => { const x = p % w; return (x === 0 || !cset.has(p - 1)) || (x === w - 1 || !cset.has(p + 1)) || !cset.has(p - w) || !cset.has(p + w); });
    for (const p of fr) dd.set(p, 1);
    while (fr.length) { const nx = []; for (const p of fr) for (const j of [p - 1, p + 1, p - w, p + w]) if (cset.has(j) && !dd.has(j)) { dd.set(j, dd.get(p) + 1); nx.push(j); } fr = nx; }
    return dd;
  };
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    const seen = new Uint8Array(w * h);
    for (let s0 = 0; s0 < w * h; s0++) {
      if (seen[s0] || lab[s0] < 0 || lab[s0] === pal.ink) continue;
      const v = lab[s0], comp = [s0], q = [s0]; seen[s0] = 1;
      while (q.length) { const i = q.pop(), x = i % w; for (const j of [i - 1, i + 1, i - w, i + w]) { if (j < 0 || j >= w * h || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1) || seen[j] || lab[j] !== v) continue; seen[j] = 1; comp.push(j); q.push(j); } }
      if (comp.length >= SHADE_MAX) continue;
      const cset = new Set(comp);
      let part = comp, b = blotch(part, cset, v);
      // (a soft shadow band can hang on a drawn fold line, one component: the lab coat's 3/4 and side views. Then its
      // THICK part, the pixels 3 px or more inside it grown back by 2 within it, is tested alone; the line stays.)
      if (b < 0 && comp.length >= 30) {
        const din = inner(comp, cset), core = comp.filter((p) => din.get(p) >= 3), grow = new Set(core);
        for (let k = 0; k < 2; k++) for (const p of [...grow]) for (const j of [p - 1, p + 1, p - w, p + w]) if (cset.has(j)) grow.add(j);
        if (grow.size >= 15 && grow.size < comp.length) { part = [...grow]; b = blotch(part, cset, v); }
      }
      if (b < 0) continue;
      for (const p of part) lab[p] = b;
      changed++;
    }
    if (!changed) break;
  }
}
// Short pieces of a thin line in a color the art does not have (a darker fold line on a sash: its pixels land on
// whatever palette color is nearest, in dashes): 8-connected components with no pure pixel and fewer than STRAY px
// take the most common label around them. Real thin lines (pinstripes, print outlines) are long or touch their color.
function stray(lab, w, h, pure) {
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || lab[s] < 0) continue;
    const v = lab[s], comp = [s], q = [s]; let hasPure = false; seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      if (pure[i]) hasPure = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if ((!dx && !dy) || X < 0 || Y < 0 || X >= w || Y >= h || seen[j] || lab[j] !== v) continue;
        seen[j] = 1; comp.push(j); q.push(j);
      }
    }
    if (hasPure || comp.length >= STRAY) continue;
    const cnt = new Map();
    for (const i of comp) { const x = i % w; for (const j of [i - 1, i + 1, i - w, i + w]) { if (j < 0 || j >= w * h || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue; const u = lab[j]; if (u >= 0 && u !== v) cnt.set(u, (cnt.get(u) || 0) + 1); } }
    let best = -1, bn = 0; for (const [u, n] of cnt) if (n > bn) { bn = n; best = u; }
    if (best >= 0) for (const i of comp) lab[i] = best;
  }
}
// components (4-connected, one label) smaller than SPECK px take the most common label around them
function despeck(lab, w, h) {
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || lab[s] < 0) continue;
    const v = lab[s], comp = [s], q = [s]; seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1) || seen[j] || lab[j] !== v) continue;
        seen[j] = 1; comp.push(j); q.push(j);
      }
    }
    if (comp.length >= SPECK) continue;
    const cnt = new Map();
    for (const i of comp) { const x = i % w; for (const j of [i - 1, i + 1, i - w, i + w]) { if (j < 0 || j >= w * h || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue; const u = lab[j]; if (u >= 0 && u !== v) cnt.set(u, (cnt.get(u) || 0) + 1); } }
    let best = -1, bn = 0; for (const [u, n] of cnt) if (n > bn) { bn = n; best = u; }
    if (best >= 0) for (const i of comp) lab[i] = best;
  }
}
// one 3 x 3 majority pass: a pixel with at most 1 neighbour of its own label (a stray tooth) takes the label
// that holds 5 or more of its neighbours; ink pixels are kept (thin lines would break)
function majority(lab, w, h, ink) {
  const src = Int16Array.from(lab);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, v = src[i];
    if (v < 0 || v === ink) continue;
    const cnt = new Map(); let own = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const u = src[i + dy * w + dx]; if (u === v) own++; else if (u >= 0) cnt.set(u, (cnt.get(u) || 0) + 1); }
    if (own > 1) continue;
    for (const [u, n] of cnt) if (n >= 5) { lab[i] = u; break; }
  }
}

// ---------- 3. the outer outline out, the ring and the outside filled ----------
function outline(c, lab, pal, T, edgeDist) {
  const { w, h } = c, d = edgeDist(c), unk = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (!opaque(c, i) || lab[i] < 0 || d[i] <= 1 || (lab[i] === pal.ink && d[i] <= T + 1)) unk[i] = 1;
  // grown along connected ink, up to OUT_GROW x the thickness
  const lim = Math.max(T + 2, OUT_GROW * T + 1);
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < w * h; i++) {
      if (unk[i] || lab[i] !== pal.ink || d[i] > lim) continue;
      const x = i % w;
      if ((x > 0 && unk[i - 1]) || (x < w - 1 && unk[i + 1]) || (i >= w && unk[i - w]) || (i + w < w * h && unk[i + w])) { unk[i] = 1; grew = true; }
    }
  }
  // (the anti-aliased rim of the outline on the inside: one more pixel)
  const rim = Uint8Array.from(unk);
  for (let i = 0; i < w * h; i++) {
    if (unk[i]) continue;
    const x = i % w;
    if ((x > 0 && unk[i - 1]) || (x < w - 1 && unk[i + 1]) || (i >= w && unk[i - w]) || (i + w < w * h && unk[i + w])) if (d[i] <= lim + 1) rim[i] = 1;
  }
  const out = Int16Array.from(lab);
  for (let i = 0; i < w * h; i++) if (rim[i]) out[i] = -1;
  // the pieces of ink the cut left at the edge (a button or a collar line drawn into the outline, now a stray hook):
  // ink components touching the cut and smaller than FRAG px (per 36000 px of the crop) are rebuilt with the rest
  const frag = FRAG * (w * h) / 36000, seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || out[s] !== pal.ink) continue;
    const comp = [s], q = [s]; let touch = false; seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if ((!dx && !dy) || X < 0 || Y < 0 || X >= w || Y >= h) continue;
        if (out[j] < 0) touch = true;
        if (!seen[j] && out[j] === pal.ink) { seen[j] = 1; comp.push(j); q.push(j); }
      }
    }
    if (touch && comp.length < frag) for (const i of comp) out[i] = -1;
  }
  // (round 38) the same for the small pieces of COLOR the cut left at the edge: the inside of a button or a toggle
  // drawn on the outline (the baseball side view's buttons, the referee side view's placket), a lone white or light
  // patch on the body's edge in the game. Components (4-connected, not ink) touching the cut and smaller than EDGE_BIT
  // px (per 36000 px of the crop) are rebuilt with the rest.
  const bit = EDGE_BIT * (w * h) / 36000, seen2 = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen2[s] || out[s] < 0 || out[s] === pal.ink) continue;
    const v = out[s], comp = [s], q = [s]; let touch = false; seen2[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h) continue;
        if (out[j] < 0) touch = true;
        if (!seen2[j] && out[j] === v) { seen2[j] = 1; comp.push(j); q.push(j); }
      }
    }
    // (or a piece of any size up to EDGE_STRIP that lies wholly within the outline's reach of the edge: a sliver
    // between the outline and an inner line, the placket of a side view with its buttons and stripe ends)
    const deep = comp.reduce((m, i) => Math.max(m, d[i]), 0);
    if (touch && (comp.length < bit || (comp.length < EDGE_STRIP * (w * h) / 36000 && deep <= lim + 4))) for (const i of comp) out[i] = -1;
  }
  // A line that meets the outline (the lab coat's back panel seams and front edges at the hem, a lapel at the
  // shoulder) lost its run through the outline, and the growth above ate it along its whole run near the edge, so it
  // ended in the air short of the body's outline. Each such line END (the ink that stayed, where it borders cut pixels
  // that were ink in the art, at the far end of the line along its own direction) is drawn on straight, at the line's
  // width, to the silhouette's edge, over pixels that were ink in the art only (lines()). Ink that only touched the
  // outline from the side (the Hawaiian side view's buttons drawn on the outline, a thick part of the outline) is not
  // an end and stays out.
  lines(out, lab, c, pal, d);
  // Then every other cut pixel is filled from the NEAREST known non-ink pixel (round 38; Euclidean, from the known
  // pixels that border the unknown ones), so every color runs on straight out across the removed outline, square to
  // the edge. (Round 35 filled ring by ring by a majority of the known 8-neighbours, ink included: that grows every
  // shape at 45 degrees, so a line or a pocket corner near the edge ran on as a long diagonal bar to the box corner,
  // buttons on the outline as dark streaks, a hem stripe bent away, and the shading blotches at the side streaked
  // outward: visible inside the bodies wider than the canonical egg and in the ring the outline left.)
  // (a small piece of a print that the cut reached, a flower's yellow middle at the edge, does not run on: it would show
  // as a lone patch on the bodies wider than the canonical egg; only pieces of RUN_MIN px or more (per 36000 px) do,
  // the stripes and the large prints)
  const area = new Map(); for (const v of out) if (v >= 0 && v !== pal.ink) area.set(v, (area.get(v) || 0) + 1);
  const main = [...area.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
  const size = new Int32Array(w * h), seen3 = new Uint8Array(w * h), thin = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen3[s] || out[s] < 0) continue;
    const v = out[s], comp = [s], q = [s]; seen3[s] = 1;
    while (q.length) { const i = q.pop(), x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) { if (j < 0 || j >= w * h || seen3[j] || out[j] !== v) continue; seen3[j] = 1; comp.push(j); q.push(j); } }
    for (const i of comp) size[i] = comp.length;
    // (round 39) a THIN line in a SHADE of the garment's main color (a soft fold line: the lab coat's 3/4 fold, which
    // meets the outline at the bottom left) runs on only inside the silhouette (through the cut outline to the
    // body's edge, as a seam does), not beyond it: from its end the nearest-pixel fill fanned out into a widening
    // wedge of the shade outside the silhouette, which showed at the body's lower left on the bodies wider than the
    // canonical egg. Thin = no pixel more than THIN_RUN steps from its border; the stripes and prints are other
    // colors and the chef's shading crescent is thick, so they run on everywhere.
    if (v !== pal.ink && v !== main && dl(pal.colors[v].l, pal.colors[main].l) < SHADE_D) {
      const cset = new Set(comp);
      let fr = comp.filter((p) => { const x = p % w; return x === 0 || x === w - 1 || !cset.has(p - 1) || !cset.has(p + 1) || !cset.has(p - w) || !cset.has(p + w); });
      const dd = new Map(fr.map((p) => [p, 1]));
      let deep = 1;
      while (fr.length) { const nx = []; for (const p of fr) for (const j of [p - 1, p + 1, p - w, p + w]) if (cset.has(j) && !dd.has(j)) { dd.set(j, dd.get(p) + 1); deep = Math.max(deep, dd.get(p) + 1); nx.push(j); } fr = nx; }
      if (deep <= THIN_RUN) for (const i of comp) thin[i] = 1;
    }
  }
  const runMin = RUN_MIN * (w * h) / 36000;
  const src = [], srcOut = [];
  for (let i = 0; i < w * h; i++) {
    if (out[i] < 0 || out[i] === pal.ink || size[i] < runMin) continue;
    const x = i % w;
    if ((x > 0 && out[i - 1] < 0) || (x < w - 1 && out[i + 1] < 0) || (i >= w && out[i - w] < 0) || (i + w < w * h && out[i + w] < 0)) { src.push(i); if (!thin[i]) srcOut.push(i); }
  }
  const fill = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (out[i] >= 0) continue;
    const x = i % w, y = (i / w) | 0;
    let best = -1, bd = 1e18;
    for (const j of (opaque(c, i) ? src : srcOut)) { const dx = (j % w) - x, dy = ((j / w) | 0) - y, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = j; } }
    fill[i] = best >= 0 ? out[best] : pal.ink;
  }
  for (let i = 0; i < w * h; i++) if (out[i] < 0) out[i] = fill[i];
  out.rebuilt = rim;
  return out;
}

// The line ends at the cut (outline(), round 38): out = the labels with the cut pixels at -1, lab = the labels before
// the cut, d = the 4-step distance from the silhouette's edge. Every 8-connected cluster of ink that stayed and borders
// cut pixels that were ink is an END when the ink around it (within END_R px, its own component) is a line (its
// principal axis at least END_LONG x longer than wide) and the cluster sits at the line's far end along that axis.
// The end is then drawn on along the axis at the line's width (measured across its last 3 px) until the silhouette's
// edge, over the cut pixels that were ink in the art.
const END_R = 10, END_LONG = 1.6;
function lines(out, lab, c, pal, d) {
  const { w, h } = c, N = w * h;
  const cut = (i) => out[i] < 0 && lab[i] === pal.ink && opaque(c, i);
  const near8 = (i, f) => { const x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && f(Y * w + X)) return true; } return false; };
  // the ink components (8-connected) of what stayed
  const comp = new Int32Array(N).fill(-1);
  let nc = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0 || out[s] !== pal.ink) continue;
    const q = [s]; comp[s] = nc;
    while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, j = Y * w + X; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && comp[j] < 0 && out[j] === pal.ink) { comp[j] = nc; q.push(j); } } }
    nc++;
  }
  const isEnd = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (out[i] === pal.ink && near8(i, cut)) isEnd[i] = 1;
  const seen = new Uint8Array(N), marks = [];
  for (let s = 0; s < N; s++) {
    if (!isEnd[s] || seen[s]) continue;
    const cl = [s], q = [s]; seen[s] = 1;
    while (q.length) { const i = q.pop(), x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, j = Y * w + X; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && isEnd[j] && !seen[j]) { seen[j] = 1; cl.push(j); q.push(j); } } }
    const cx = cl.reduce((t, i) => t + (i % w), 0) / cl.length + 0.5, cy = cl.reduce((t, i) => t + ((i / w) | 0), 0) / cl.length + 0.5;
    // the line around it
    const pts = [];
    for (let y = Math.max(0, Math.floor(cy - END_R)); y < Math.min(h, cy + END_R); y++) for (let x = Math.max(0, Math.floor(cx - END_R)); x < Math.min(w, cx + END_R); x++) {
      const i = y * w + x;
      if (comp[i] === comp[s] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= END_R) pts.push([x + 0.5, y + 0.5]);
    }
    if (pts.length < 8) continue;
    const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr - l1;
    if (l1 < END_LONG * END_LONG * Math.max(l2, 1e-6)) continue;
    let ux = sxy, uy = l1 - sxx;
    if (Math.abs(ux) + Math.abs(uy) < 1e-9) { ux = sxx >= syy ? 1 : 0; uy = sxx >= syy ? 0 : 1; }
    const un = Math.hypot(ux, uy); ux /= un; uy /= un;
    let tc = (cx - mx) * ux + (cy - my) * uy;
    if (tc < 0) { ux = -ux; uy = -uy; tc = -tc; }
    const ts = pts.map(([x, y]) => (x - mx) * ux + (y - my) * uy), tmax = Math.max(...ts);
    if (tc < 1.5 || tc < 0.5 * tmax) continue;
    // its width across the last 3 px before the end
    let lo = 1e9, hi = -1e9;
    pts.forEach(([x, y], k) => { if (ts[k] < tc - 3) return; const v = -(x - mx) * uy + (y - my) * ux; lo = Math.min(lo, v); hi = Math.max(hi, v); });
    const half = Math.max(0.75, Math.min(6, (hi - lo + 1) / 2));
    // the axis through the middle of the line's end, drawn on
    const mid = (lo + hi) / 2, ax = mx + ux * tc - uy * mid, ay = my + uy * tc + ux * mid;
    marks.push({ ax, ay, ux, uy, half });
  }
  for (const { ax, ay, ux, uy, half } of marks) {
    for (let t = 0; t < 40; t += 0.5) {
      const px = ax + ux * t, py = ay + uy * t, X = Math.floor(px), Y = Math.floor(py);
      if (X < 0 || Y < 0 || X >= w || Y >= h) break;
      const i = Y * w + X;
      if (!opaque(c, i) || d[i] < 1) break;
      if (out[i] >= 0 && out[i] !== pal.ink && t > 2) break;   // (ran into the garment: no outline here)
      const r = Math.ceil(half + 1);
      for (let yy = Y - r; yy <= Y + r; yy++) for (let xx = X - r; xx <= X + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx, ox = xx + 0.5 - px, oy = yy + 0.5 - py;
        if (Math.abs(-ox * uy + oy * ux) <= half && Math.abs(ox * ux + oy * uy) <= 0.5 && cut(j)) out[j] = pal.ink;
      }
    }
  }
}

// ---------- 4. tracing ----------
// Catmull-Rom upsampling of a 0/1 mask (w x h, with a replicated margin of M px around it) to a grid of UP samples per
// px; sample (X, Y) sits at source ((X + 0.5) / UP - M, (Y + 0.5) / UP - M) in pixel-edge coordinates.
function gauss(mask, w, h, sigma) {
  if (!sigma) return mask;
  const r = Math.ceil(sigma * 2.5), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0), kn = k.map((v) => v / sum);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let j = -r; j <= r; j++) a += kn[j + r] * mask[y * w + Math.max(0, Math.min(w - 1, x + j))]; tmp[y * w + x] = a; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let j = -r; j <= r; j++) a += kn[j + r] * tmp[Math.max(0, Math.min(h - 1, y + j)) * w + x]; out[y * w + x] = a; }
  return out;
}
function upsample(mask, w, h) {
  const W = w * UP, H = h * UP;
  const cr = (f) => { const f2 = f * f, f3 = f2 * f; return [(-f3 + 2 * f2 - f) / 2, (3 * f3 - 5 * f2 + 2) / 2, (-3 * f3 + 4 * f2 + f) / 2, (f3 - f2) / 2]; };
  const taps = [];
  for (let X = 0; X < UP; X++) { const s = (X + 0.5) / UP - 0.5, x0 = Math.floor(s); taps.push({ off: x0 - 1, w: cr(s - x0) }); }
  const tmp = new Float32Array(W * h), F = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let X = 0; X < W; X++) {
    const t = taps[X % UP], bx = Math.floor(X / UP) + t.off;
    let a = 0; for (let j = 0; j < 4; j++) a += t.w[j] * mask[y * w + Math.max(0, Math.min(w - 1, bx + j))];
    tmp[y * W + X] = a;
  }
  for (let Y = 0; Y < H; Y++) {
    const t = taps[Y % UP], by = Math.floor(Y / UP) + t.off;
    for (let X = 0; X < W; X++) { let a = 0; for (let j = 0; j < 4; j++) a += t.w[j] * tmp[Math.max(0, Math.min(h - 1, by + j)) * W + X]; F[Y * W + X] = a; }
  }
  return { F, W, H };
}
// marching squares: the closed iso-loops of F (outside the grid = 0, so every loop closes)
function contours(F, W, H, iso = 0.5) {
  const GW = W + 2, GH = H + 2;
  const v = (i, j) => (i <= 0 || j <= 0 || i > W || j > H ? 0 : F[(j - 1) * W + (i - 1)]);
  const nE = GW * GH, nb = new Int32Array(nE * 4).fill(-1), pt = new Float32Array(nE * 4);
  const hE = (i, j) => j * GW + i, vE = (i, j) => nE + j * GW + i;
  const point = (e, i0, j0, i1, j1) => {
    if (pt[e * 2] || pt[e * 2 + 1]) return;
    const a = v(i0, j0), b = v(i1, j1), t = (iso - a) / (b - a || 1e-9);
    pt[e * 2] = i0 + (i1 - i0) * t; pt[e * 2 + 1] = j0 + (j1 - j0) * t;
  };
  const link = (a, b) => { const sa = nb[a * 2] < 0 ? a * 2 : a * 2 + 1, sb = nb[b * 2] < 0 ? b * 2 : b * 2 + 1; nb[sa] = b; nb[sb] = a; };
  const P = new Float32Array(nE * 2 * 2);
  pt.fill(0);
  for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
    const a = v(i, j) > iso, b = v(i + 1, j) > iso, c = v(i + 1, j + 1) > iso, d = v(i, j + 1) > iso;
    const k = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (!k || k === 15) continue;
    const T = hE(i, j), R = vE(i + 1, j), B = hE(i, j + 1), L = vE(i, j);
    const segs = [];
    switch (k) {
      case 1: case 14: segs.push([L, B]); break;
      case 2: case 13: segs.push([B, R]); break;
      case 3: case 12: segs.push([L, R]); break;
      case 4: case 11: segs.push([T, R]); break;
      case 6: case 9: segs.push([T, B]); break;
      case 7: case 8: segs.push([L, T]); break;
      case 5: { const ctr = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > iso; if (ctr) segs.push([L, T], [B, R]); else segs.push([L, B], [T, R]); break; }
      case 10: { const ctr = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > iso; if (ctr) segs.push([T, R], [L, B]); else segs.push([L, T], [B, R]); break; }
    }
    for (const [e1, e2] of segs) {
      for (const e of [e1, e2]) {
        if (e === T) point(e, i, j, i + 1, j); else if (e === B) point(e, i, j + 1, i + 1, j + 1);
        else if (e === L) point(e, i, j, i, j + 1); else point(e, i + 1, j, i + 1, j + 1);
      }
      link(e1, e2);
    }
  }
  void P;
  const loops = [], used = new Uint8Array(nE * 2);
  for (let s = 0; s < nE * 2; s++) {
    if (used[s] || nb[s * 2] < 0) continue;
    const loop = [];
    let prev = -1, cur = s;
    while (!used[cur]) {
      used[cur] = 1;
      // grid coords -> sample coords (the grid has one cell of padding)
      loop.push([pt[cur * 2] - 1, pt[cur * 2 + 1] - 1]);
      const n0 = nb[cur * 2], n1 = nb[cur * 2 + 1], next = n0 !== prev ? n0 : n1;
      prev = cur; cur = next;
      if (cur < 0) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
// A traced loop smoothed along its length (round 38): a triangular moving average of its points over +-SMOOTH_K
// samples (+-SMOOTH_K / UP source px of arc; at most an eighth of the loop, so small dots and buttons keep their size).
// The labels at an edge follow the art's grain and anti-aliasing pixel by pixel, so every ink line came out with a
// ragged, bumpy edge (a hand-shaken line) and the soft fold lines as frayed dashes; averaged, the edges run smooth
// while a line's width (both of its edges move alike) and its course stay.
function smoothLoop(l) {
  const n = l.length, k = Math.min(SMOOTH_K, Math.floor(n / 8));
  if (k < 1) return l;
  const o = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sw = 0;
    for (let j = -k; j <= k; j++) { const p = l[(i + j + n) % n], wt = k + 1 - Math.abs(j); sx += p[0] * wt; sy += p[1] * wt; sw += wt; }
    o.push([sx / sw, sy / sw]);
  }
  return o;
}
// Douglas-Peucker on a closed loop
// (eps: a number, or a function of the point: a looser tolerance where nothing shows)
function simplifyOpen(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]], tol = typeof eps === 'function' ? pts.map(eps) : null;
  while (st.length) {
    const [a, b] = st.pop();
    let iM = -1, dM = 1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len / (tol ? tol[i] : eps); if (d > dM) { dM = d; iM = i; } }
    if (iM >= 0) { keep[iM] = 1; st.push([a, iM], [iM, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function simplifyLoop(loop, eps) {
  if (loop.length < 8) return loop;
  let far = 0, fd = 0;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = simplifyOpen(loop.slice(0, far + 1), eps), b = simplifyOpen([...loop.slice(far), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}
// the stacked layers of a label map (w x h): [{ color index, loops (source px, pixel-edge coordinates) }]
// The anti-aliasing the art carries, as a sub-pixel edge position: at a pixel whose 8-neighbours hold another label q,
// the pixel's color is read as a mix of its own label's color and q's (projected in RGB), and q gets that share
// (a pixel nearer to q's color keeps its label hard: a thin line). The rebuilt pixels (the outline ring) stay hard.
function coverage(c, lab, pal) {
  const { w, h } = c, other = new Int16Array(w * h).fill(-1), share = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = lab[i];
    if (o < 0 || lab.rebuilt?.[i] || !opaque(c, i)) continue;
    const cnt = new Map();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const u = lab[Y * w + X]; if (u >= 0 && u !== o) cnt.set(u, (cnt.get(u) || 0) + 1); }
    let q = -1, qn = 0; for (const [u, n] of cnt) if (n > qn) { qn = n; q = u; }
    if (q < 0) continue;
    const a = pal.colors[o].rgb, b = pal.colors[q].rgb, v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1;
    const al = ((c.data[i * 4] - a[0]) * v[0] + (c.data[i * 4 + 1] - a[1]) * v[1] + (c.data[i * 4 + 2] - a[2]) * v[2]) / n2;
    // (a pixel nearer to q than to its own color was given its label on purpose: a thin line, a smoothed tooth; hard)
    if (al > 0.5) continue;
    other[i] = q; share[i] = Math.max(0, al);
  }
  return { other, share };
}
function trace(lab, w, h, pal, cov) {
  const M = 3, w2 = w + 2 * M, h2 = h + 2 * M;
  // the label map with a replicated margin (shapes at the box edge run on past it, so no loop closes inside the box)
  const L2 = new Int16Array(w2 * h2), O2 = new Int16Array(w2 * h2), S2 = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const j = Math.max(0, Math.min(h - 1, y - M)) * w + Math.max(0, Math.min(w - 1, x - M));
    L2[y * w2 + x] = lab[j]; O2[y * w2 + x] = cov ? cov.other[j] : -1; S2[y * w2 + x] = cov ? cov.share[j] : 0;
  }
  const area = pal.colors.map(() => 0);
  for (const v of lab) if (v >= 0) area[v]++;
  const order = pal.colors.map((_, i) => i).filter((i) => area[i] > 0).sort((a, b) => (a === pal.ink) - (b === pal.ink) || area[b] - area[a]);
  const layers = [];
  const mask = new Float32Array(w2 * h2), rank = new Int16Array(pal.colors.length).fill(-1);
  order.forEach((c, r) => { rank[c] = r; });
  for (let r = 1; r < order.length; r++) {
    for (let i = 0; i < w2 * h2; i++) mask[i] = (rank[L2[i]] >= r ? 1 - S2[i] : 0) + (O2[i] >= 0 && rank[O2[i]] >= r ? S2[i] : 0);
    const { F, W, H } = upsample(gauss(mask, w2, h2, order[r] === pal.ink ? BLUR_INK : BLUR), w2, h2);
    const loops = contours(F, W, H, 0.5)
      .map((l) => simplifyLoop(smoothLoop(l.map(([X, Y]) => [(X + 0.5) / UP - M, (Y + 0.5) / UP - M])), SIMPLIFY))
      .filter((l) => l.length >= 3 && Math.abs(polyArea(l)) > 0.6);
    layers.push({ color: order[r], loops });
  }
  return { base: order[0], layers };
}
const polyArea = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const [x0, y0] = l[i], [x1, y1] = l[(i + 1) % l.length]; s += x0 * y1 - x1 * y0; } return s / 2; };

// ---------- 5. the warp ----------
// The silhouette spans of the crop (alpha > 128), averaged over +-SPAN_SMOOTH rows: [a, b] (pixel edges) per row.
function smoothSpans(spans, h) {
  const first = spans.find(Boolean), last = [...spans].reverse().find(Boolean);
  const raw = spans.map((s, y) => s || (y < h / 2 ? first : last));
  return raw.map((_, y) => {
    let a = 0, b = 0, n = 0;
    for (let k = -SPAN_SMOOTH; k <= SPAN_SMOOTH; k++) { const s = raw[Math.max(0, Math.min(h - 1, y + k))]; a += s[0]; b += s[1] + 1; n++; }
    return [a / n, b / n];
  });
}
// source point (pixel-edge coordinates) -> texture point (W x H): row y of the crop -> row y * ky; the row's span ->
// the canonical egg's span at that height (eggHalf, at least 0.3 of the half width, as the raster warp did)
function warper(sp, w, h, W, H, eggHalf) {
  const ky = H / h;
  const spanAt = (y) => { const r = Math.max(0, Math.min(h - 1, y - 0.5)), r0 = Math.floor(r), f = r - r0, s0 = sp[r0], s1 = sp[Math.min(h - 1, r0 + 1)]; return [s0[0] * (1 - f) + s1[0] * f, s0[1] * (1 - f) + s1[1] * f]; };
  const fwd = ([x, y]) => {
    const [xa, xb] = spanAt(y), t = (x - xa) / (xb - xa || 1), Y = y * ky, v = Math.max(0, Math.min(1, Y / H));
    const e = Math.max(0.3, eggHalf(v)) * W / 2;
    return [W / 2 - e + t * 2 * e, Y];
  };
  // inverse (texture -> source), for the neck mask
  const inv = (X, Y) => {
    const y = Y / ky, [xa, xb] = spanAt(y), v = Math.max(0, Math.min(1, Y / H)), e = Math.max(0.3, eggHalf(v)) * W / 2;
    const t = (X - (W / 2 - e)) / (2 * e);
    return [xa + t * (xb - xa), y];
  };
  return { fwd, inv };
}
// a loop warped into the egg (null when it lies wholly outside the egg: never seen, the rig clips to the body); the
// parts outside the egg (with a margin for both species' bodies, OUTSIDE) are simplified with a loose tolerance
function warpLoop(loop, fwd, outside) {
  const pts = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SEG));
    for (let k = 0; k < n; k++) pts.push(fwd([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]));
  }
  if (pts.every(outside)) return null;
  return simplifyLoop(pts, (p) => (outside(p) ? LOOSE : SIMPLIFY_OUT));
}

// ---------- 6. the SVG ----------
const n1 = (v) => { const r = Math.round(v * 10) / 10; return (Object.is(r, -0) ? 0 : r).toString(); };
// a loop as a path: absolute M, then relative l in tenths (short and exact: the rounding is accumulated)
function loopD(l) {
  const q = l.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
  let d = `M${n1(q[0][0] / 10)} ${n1(q[0][1] / 10)}l`, px = q[0][0], py = q[0][1];
  const parts = [];
  for (let i = 1; i < q.length; i++) {
    const dx = q[i][0] - px, dy = q[i][1] - py;
    if (!dx && !dy) continue;
    parts.push(`${n1(dx / 10)} ${n1(dy / 10)}`.replace(/(^| )0\./g, '$1.').replace(/(^| )-0\./g, '$1-.'));
    px = q[i][0]; py = q[i][1];
  }
  d += parts.join(' ').replace(/ -/g, '-');
  return `${d}z`;
}
function svg({ W, H, pal, traced, neck }) {
  const col = (i) => hex(pal.colors[i].rgb);
  const body = [`<rect width="${W}" height="${H}" fill="${col(traced.base)}"/>`];
  for (const L of traced.layers) if (L.loops.length) body.push(`<path fill="${col(L.color)}" fill-rule="evenodd" d="${L.loops.map(loopD).join('')}"/>`);
  let clip = '', open = '';
  if (neck) {
    const pts = [];
    for (let i = 0; i + 1 < neck.length; i += 2) pts.push([neck[i] / 1000 * W, neck[i + 1] / 1000 * H]);
    // open at the top (as the rig reads it): the cut runs up past the box's top edge
    const top = neck[1] <= 25 && neck[neck.length - 1] <= 25;
    const poly = top ? [[pts[0][0], -5], ...pts, [pts[pts.length - 1][0], -5]] : pts;
    clip = `<defs><clipPath id="n"><path clip-rule="evenodd" d="M-5 -5H${W + 5}V${H + 5}H-5Z M${poly.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')}Z"/></clipPath></defs>`;
    open = ' clip-path="url(#n)"';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="none">${clip}<g${open}>${body.join('')}</g></svg>\n`;
}

// The outline's thickness: the run of ink pixels walked in from each side on the middle rows (median). Counted on the
// labels, so a dark fill next to the outline (the referee's black stripes) is not taken for outline (the raster tool's
// luma rule measured 13 px there, and its outline removal ate the pocket's edge).
function inkWidth(c, lab, pal) {
  if (pal.ink < 0) return 0;
  const ws = [];
  for (let y = Math.round(c.h * 0.35); y < c.h * 0.65; y += 3) for (const dir of [1, -1]) {
    let x = dir > 0 ? 0 : c.w - 1;
    while (x >= 0 && x < c.w && !opaque(c, y * c.w + x)) x += dir;
    let n = 0;
    while (x >= 0 && x < c.w && lab[y * c.w + x] === pal.ink) { n++; x += dir; }
    if (n > 0 && n < 14) ws.push(n);
  }
  ws.sort((a, b) => a - b);
  return ws.length ? ws[ws.length >> 1] : 0;
}

// ---------- the whole view ----------
// c = the keyed source crop of one view, pal = palette(the garment's views), neck = neckMask() (source px) or null,
// W x H = the published size; helpers from tools/art-v9.js. Returns { svg, neck (outline, thousandths), lab }.
function vectorTexture(c, pal, neck, W, H, hp) {
  const lab0 = labels(c, pal), T = inkWidth(c, lab0, pal) || hp.outlineWidth(c), lab = outline(c, lab0, pal, T, hp.edgeDist);
  const sp = smoothSpans(hp.spans(c), c.h);
  const { fwd, inv } = warper(sp, c.w, c.h, W, H, hp.eggHalf);
  const traced = trace(lab, c.w, c.h, pal, coverage(c, lab, pal));
  const outside = ([X, Y]) => { const e = Math.max(0.3, hp.eggHalf(Math.max(0, Math.min(1, Y / H)))) * W / 2; return Math.abs(X - W / 2) > e + OUTSIDE * W / 2 || Y < -1 || Y > H + 1; };
  for (const L of traced.layers) L.loops = L.loops.map((l) => warpLoop(l, fwd, outside)).filter((l) => l && l.length >= 3);
  // the neck opening: its source mask sampled through the inverse warp at the published size, then the raster tool's
  // own row filling and outline (neckOutline: thousandths of the box)
  let outlineN = null;
  if (neck) {
    const nm = new Uint8Array(W * H);
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
      const [sx, sy] = inv(X + 0.5, Y + 0.5), x = Math.floor(sx), y = Math.floor(sy);
      if (x >= 0 && y >= 0 && x < c.w && y < c.h && neck[y * c.w + x]) nm[Y * W + X] = 1;
    }
    hp.rowFill(nm, W, H);
    outlineN = hp.neckOutline(nm, W, H, W / c.w);
  }
  return { svg: svg({ W, H, pal, traced, neck: outlineN }), neck: outlineN, lab, T };
}

// an SVG rendered to RGBA (contact sheets, checks): resvg, the SVG's own size x scale
function render(svgText, scale = 1) {
  const r = new Resvg(svgText, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } }).render();
  return { data: Buffer.from(r.pixels), w: r.width, h: r.height };
}

module.exports = { palette, labels, outline, trace, vectorTexture, render, contours, upsample, toLab,
  // (the tracing steps, for tools/import-hair.js)
  gauss, smoothLoop, simplifyLoop, loopD, polyArea, UP };
