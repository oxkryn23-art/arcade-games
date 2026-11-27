// Imports the human clothes kit (art-source/human-kit/output/, the ChatGPT batches of tools/human-kit.js) the way the
// original game imported its cosmetics kit: this is its tools/art-v9.js, ported. Run:
//   NODE_PATH=<a node_modules with sharp and @resvg/resvg-js> node tools/import-kit.js
// then node tools/shoe-collars.js (the shoes' collars) and node tools/import-hair.js (the hairstyles).
//
// Every sheet is #00FF00 green screen, 5 rows (one item each), 4 views per row (front, 3/4 right, side right, back) and,
// on the outfit sheets, a 5th column with the sleeve swatch (full-body pieces: a leg bar below it). Slicing goes by the
// green gaps, never by fixed positions (see the functions below).
//   - hats: public/art/hat-<id>-<view>.webp; anchor = the bottom center of the hat band.
//   - shoes: public/art/shoe-<id>-<view>-<l|r>.webp; anchor ax = the ankle, ay = the sole; sl = the sole length.
//     Each sheet is scaled so its median side-view shoe is SHOE_REF px long (the rig maps SHOE_REF px onto the foot).
//   - outfits: public/art/outfit-<id>-<view>.svg = a VECTOR TEXTURE for the body egg (tools/outfit-vector.js), the neck
//     opening (NECK) clipped out so the body's skin shows there as the neck. The sleeve swatch is measured into
//     art-source/human-kit/outfit-colors.json (the outfit tokens in server/themes.js and SPEC in outfits.js come from it).
// Contact sheets: art-source/human-kit/contact/<sheet>.png. The sizes and anchors go to public/art/sprites.json and to
// the generated SPRITES block of public/js/mascots/cosmetics.js.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { key, trimBox, crop } = require('./kit-lib');
const OV = require('./outfit-vector');
const NECKS = require('./outfit-necks');
const THEME = require('../server/themes');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art-source', 'human-kit', 'output');
const OUT = path.join(ROOT, 'public', 'art');
const CONTACT = path.join(ROOT, 'art-source', 'human-kit', 'contact');
const SLICED = path.join(ROOT, 'art-source', 'human-kit', 'sliced');
const COLORS = path.join(ROOT, 'art-source', 'human-kit', 'outfit-colors.json');
const COSMETICS_JS = path.join(ROOT, 'public', 'js', 'mascots', 'cosmetics.js');
const WEBP = { quality: 95, alphaQuality: 100, effort: 6, smartSubsample: true };
const DENSITY = 2;
const VIEWS = ['front', 'three', 'side', 'back'];

// the batches in the kit's order (art-source/human-kit/prompts/INDEX.md), the item ids per row
const SHEETS = [
  ['outfits-1-tops', 'outfit', ['stripedtee', 'polo', 'jersey', 'aloha', 'ringer']],
  ['outfits-2-casual', 'outfit', ['hoodie', 'denim', 'sweater', 'flannel', 'tracktop']],
  ['outfits-3-jackets', 'outfit', ['bomber', 'leather', 'puffer', 'raincoat', 'blazer']],
  ['outfits-4-full-body', 'outfit', ['overalls', 'mechanic', 'pajamas', 'tracksuit', 'western']],
  ['shoes-1-everyday', 'feet', ['sneakers', 'hightops', 'loafers', 'chelsea', 'runners']],
  ['shoes-2-sport', 'feet', ['cleats', 'cowboyboots', 'rainboots', 'slippers', 'skate']],
  // (hats-1 is not imported: the owner dropped the hats)
];
const ID_OF = { outfit: {}, feet: {}, hat: {} };
const CODE_SHOES = new Set();
const REMOVED = new Set(['cowboyboots']);   // (in the sheet, dropped by the owner)
// shorter shafts for the tall shoes (keep = the share of each view's height that stays; see shorten())
const SHAFT = { hightops: { keep: 0.85 }, chelsea: { keep: 0.85 }, rainboots: { keep: 0.78 } };
const SHAFT_BAND = [[0.04, 0.62], [0.04, 0.6]];   // [front/back, three/side]
const SHAFT_MAX = 0.5;
const SQUASH_MIN = 0.82;
const DESEAM = new Set(['hightops']);
const MIRROR = new Set();
const HAT_BAND = {};
const SHOE_REF = 120;       // px: a sheet's median side-view shoe length after scaling
const HAT_MAX = 256, SHOE_MAX = 256, OUTFIT_MAX = 384;
// The canonical body egg the garments are warped into (rig.js egg(): rxT / rx at the top, the widest point at mid):
// the human's body (human.js SKEL: bodyTop 24 / bodyRx 46, the belly at (neck - belly) / (neck - bottom) of the height).
const EGG = { rxT: 0.52, mid: 0.67 };

// ---------- masks and slicing ----------
const A = (img, x, y) => img.data[(y * img.w + x) * 4 + 3];
// drop opaque specks (keying leftovers) smaller than min px (4-connected components of alpha > 96)
function despeck(img, min = 40) {
  const { w, h, data } = img, lab = new Int32Array(w * h).fill(-1);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0 || data[i * 4 + 3] <= 96) continue;
    const st = [i], mem = [i]; lab[i] = n;
    while (st.length) {
      const j = st.pop(), x = j % w;
      for (const k of [j - 1, j + 1, j - w, j + w]) {
        if (k < 0 || k >= w * h || (k === j - 1 && x === 0) || (k === j + 1 && x === w - 1)) continue;
        if (lab[k] < 0 && data[k * 4 + 3] > 96) { lab[k] = n; st.push(k); mem.push(k); }
      }
    }
    if (mem.length < min) for (const j of mem) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = (j % w) + dx, y = ((j / w) | 0) + dy;
      if (x >= 0 && y >= 0 && x < w && y < h) data[(y * w + x) * 4 + 3] = 0;
    }
    n++;
  }
  return img;
}
// runs of non-empty positions in a projection, merged across gaps < gap, dropping runs shorter than minLen
function runs(proj, gap, minLen) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= proj.length; i++) {
    const on = i < proj.length && proj[i] > 0;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push([s, i]); s = -1; }
  }
  const merged = [];
  for (const r of out) { const l = merged[merged.length - 1]; if (l && r[0] - l[1] < gap) l[1] = r[1]; else merged.push([...r]); }
  return merged.filter(([a, b]) => b - a >= minLen);
}
// merge the closest neighbours until n runs remain (a cell whose parts are split by a thin green gap)
function toCount(list, n) {
  const l = list.map((r) => [...r]);
  while (l.length > n) {
    let best = 1;
    for (let i = 1; i < l.length; i++) if (l[i][0] - l[i - 1][1] < l[best][0] - l[best - 1][1]) best = i;
    l[best - 1][1] = l[best][1]; l.splice(best, 1);
  }
  return l;
}
function cellsOf(img, rowsWant, colsWant, sheet, { pairs = false } = {}) {
  const { w, h } = img;
  const rowProj = new Array(h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (A(img, x, y) > 96) rowProj[y]++;
  let bands = runs(rowProj, 12, 12);
  const issues = [];
  if (bands.length > rowsWant) bands = toCount(bands, rowsWant);
  if (bands.length !== rowsWant) issues.push(`${bands.length} rows found, ${rowsWant} expected`);
  const rows = bands.map(([y0, y1]) => {
    const colProj = new Array(w).fill(0);
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) if (A(img, x, y) > 96) colProj[x]++;
    let segs = runs(colProj, 3, 6);
    // shoes: the two shoes of a view are two segments; group them pairwise when every shoe stands alone
    if (pairs && segs.length === colsWant * 2) segs = Array.from({ length: colsWant }, (_, i) => [segs[2 * i][0], segs[2 * i + 1][1]]);
    if (segs.length > colsWant) segs = toCount(segs, colsWant);
    if (segs.length !== colsWant) issues.push(`row at y ${y0}: ${segs.length} cells found, ${colsWant} expected`);
    return segs.map(([x0, x1]) => trimBox(img, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 1)).filter(Boolean);
  });
  if (issues.length) console.warn(`${sheet}: ${issues.join('; ')}`);
  return { rows, issues };
}

// ---------- measuring ----------
const luma = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
// per row: the opaque span [a, b] (alpha > 128) or null
function spans(c) {
  const out = [];
  for (let y = 0; y < c.h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < c.w; x++) if (c.data[(y * c.w + x) * 4 + 3] > 128) { if (a < 0) a = x; b = x; }
    out.push(a < 0 ? null : [a, b]);
  }
  return out;
}
// distance (4-neighbour steps) of every opaque pixel from the nearest transparent one (or the box edge)
function edgeDist(c, cap = 40) {
  const { w, h, data } = c, d = new Int16Array(w * h).fill(cap);
  const q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (data[i * 4 + 3] <= 128) { d[i] = 0; q.push(i); } else if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { d[i] = 1; q.push(i); }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= w * h || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
// the outline's thickness: dark pixels walked in from the left edge on the middle rows (median)
function outlineWidth(c) {
  const ws = [];
  for (let y = Math.round(c.h * 0.35); y < c.h * 0.65; y += 3) {
    let x = 0;
    while (x < c.w && c.data[(y * c.w + x) * 4 + 3] <= 128) x++;
    let n = 0;
    while (x + n < c.w && luma(c.data, (y * c.w + x + n) * 4) < 95) n++;
    if (n > 0 && n < 14) ws.push(n);
  }
  ws.sort((a, b) => a - b);
  return ws.length ? ws[ws.length >> 1] : 4;
}
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
// the dominant color of the given pixel indices (quantized to 4 bits per channel, then the bin's mean)
function dominant(c, idx) {
  const bins = new Map();
  for (const i of idx) {
    const p = i * 4, k = ((c.data[p] >> 4) << 8) | ((c.data[p + 1] >> 4) << 4) | (c.data[p + 2] >> 4);
    const b = bins.get(k) || [0, 0, 0, 0];
    b[0]++; b[1] += c.data[p]; b[2] += c.data[p + 1]; b[3] += c.data[p + 2];
    bins.set(k, b);
  }
  let best = null;
  for (const b of bins.values()) if (!best || b[0] > best[0]) best = b;
  return best ? [best[1] / best[0], best[2] / best[0], best[3] / best[0]] : [0, 0, 0];
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// a crop flipped left-right
function mirror(c) {
  const o = { data: Buffer.alloc(c.data.length), w: c.w, h: c.h };
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.data.copy(o.data, (y * c.w + (c.w - 1 - x)) * 4, (y * c.w + x) * 4, (y * c.w + x) * 4 + 4);
  return o;
}

// ---------- hats ----------
function hatAnchor(c, band = 0.5) {
  const sp = spans(c), wid = sp.map((s) => (s ? s[1] - s[0] + 1 : 0)), maxW = Math.max(...wid);
  let ay = c.h;
  for (let y = c.h - 1; y >= 0; y--) if (wid[y] >= maxW * band) { ay = y + 1; break; }
  // the crown: the pixels of the upper part above the band's bottom
  let sx = 0, n = 0;
  const top = Math.round(ay * 0.55);
  for (let y = 0; y < top; y++) for (let x = 0; x < c.w; x++) if (c.data[(y * c.w + x) * 4 + 3] > 128) { sx += x; n++; }
  return [n ? sx / n : c.w / 2, ay];
}

// ---------- shoes ----------
// split a shoe cell into its two shoes: the widest empty column gap, else the column with the fewest pixels near the middle
// Each shoe = one of the two biggest 8-connected pieces of the cell (smaller pieces join the nearer one), so a sliver
// of the neighbour never rides along; returns [{ x, w, c }] with c = the shoe alone (the other pixels cleared).
function splitShoes(c) {
  const { w, h, data } = c, lab = new Int32Array(w * h).fill(-1), comps = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0 || data[i * 4 + 3] <= 40) continue;
    const st = [i], mem = [i]; lab[i] = comps.length;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * w + X;
        if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && lab[k] < 0 && data[k * 4 + 3] > 40) { lab[k] = comps.length; st.push(k); mem.push(k); }
      }
    }
    let sx = 0;
    for (const j of mem) sx += j % w;
    comps.push({ mem, cx: sx / mem.length });
  }
  const big = [...comps].sort((a, b) => b.mem.length - a.mem.length).slice(0, 2).sort((a, b) => a.cx - b.cx);
  if (big.length < 2 || big[1].mem.length < big[0].mem.length * 0.25) return null;
  const own = new Int8Array(comps.length).fill(-1);
  comps.forEach((cp, i) => { own[i] = Math.abs(cp.cx - big[0].cx) <= Math.abs(cp.cx - big[1].cx) ? 0 : 1; });
  return [0, 1].map((s) => {
    const o = { data: Buffer.from(data), w, h };
    for (let i = 0; i < w * h; i++) if (lab[i] < 0 || own[lab[i]] !== s) o.data[i * 4 + 3] = 0;
    const t = trimBox(o, { x: 0, y: 0, w, h }, 1);
    return { x: t.x, w: t.w, c: crop(o, t) };
  });
}
function splitPair(c) {
  const comp = splitShoes(c);
  if (comp) return comp;
  const col = new Array(c.w).fill(0);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.data[(y * c.w + x) * 4 + 3] > 96) col[x]++;
  const r = runs(col, 1, 3);
  if (r.length >= 2) {
    const two = toCount(r, 2);
    return two.map(([a, b]) => ({ x: a, w: b - a }));
  }
  let best = Math.round(c.w / 2);
  for (let x = Math.round(c.w * 0.35); x < c.w * 0.65; x++) if (col[x] < col[best]) best = x;
  return [{ x: 0, w: best }, { x: best, w: c.w - best }];
}
function shoeAnchor(c) {
  const sp = spans(c);
  let y0 = 0;
  while (y0 < c.h && !sp[y0]) y0++;
  const band = Math.max(3, Math.round((c.h - y0) * 0.22));
  let sx = 0, n = 0;
  for (let y = y0; y < y0 + band && y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.data[(y * c.w + x) * 4 + 3] > 128) { sx += x; n++; }
  let sl = 0;
  for (let y = c.h - 1; y >= c.h * 0.6; y--) if (sp[y]) sl = Math.max(sl, sp[y][1] - sp[y][0] + 1);
  return { ax: n ? sx / n : c.w / 2, ay: c.h, sl };
}
// A shoe with a shorter shaft (SHAFT): up to R = (1 - keep) x h rows come out of the shaft's straight part (minus a
// margin), resampled evenly onto its new height (each output row the alpha-weighted average of the source rows it
// covers); the rows above and below are copied unchanged. The caller squeezes the rest (SQUASH_MIN).
// The straight part of a shoe's shaft in rows [from, to) of the band: the longest run of rows where both silhouette
// edges move at most `step` px per row (a straight side, upright or slanted) and stay within `drift` px of a straight
// line between the run's ends (no flare, no waist, no toe). Returns [a, b] or null.
function straightZone(c, band) {
  const { w, h, data } = c, L = [], Rr = [];
  for (let y = 0; y < h; y++) {
    let l = 0, r = w - 1;
    while (l < w && data[(y * w + l) * 4 + 3] <= 128) l++;
    while (r > l && data[(y * w + r) * 4 + 3] <= 128) r--;
    L.push(l); Rr.push(r);
  }
  const y0 = Math.round(band[0] * h), y1 = Math.round(band[1] * h), step = Math.max(1, w * 0.015), drift = Math.max(2, w * 0.03);
  const ok = (a, b) => {
    for (const E of [L, Rr]) for (let y = a; y <= b; y++) {
      if (y > a && Math.abs(E[y] - E[y - 1]) > step) return false;
      if (Math.abs(E[y] - (E[a] + ((E[b] - E[a]) * (y - a)) / Math.max(1, b - a))) > drift) return false;
    }
    return true;
  };
  let best = null;
  for (let a = y0; a < y1; a++) for (let b = y1 - 1; b > a + (best ? best[1] - best[0] : 4); b--) if (ok(a, b)) { best = [a, b]; break; }
  return best;
}
function shorten(c, keep, band) {
  const { w, h, data } = c;
  // the rows come out of the shaft's straight part (minus a margin at both ends), squeezed evenly: a straight side stays
  // straight, so no waist or kink appears; never more than SHAFT_MAX of that part
  const z = straightZone(c, band);
  if (!z) return c;
  const m = Math.round((z[1] - z[0]) * 0.08), a = z[0] + m, b = z[1] - m, Ls = b - a;
  const R = Math.min(Math.round(h * (1 - keep)), Math.round(Ls * SHAFT_MAX));
  if (R <= 0) return c;
  const Lo = Ls - R, H = h - R, out = Buffer.alloc(w * H * 4);
  const copy = (sy, oy) => data.copy(out, oy * w * 4, sy * w * 4, (sy + 1) * w * 4);
  for (let y = 0; y < a; y++) copy(y, y);
  for (let y = b; y < h; y++) copy(y, y - R);
  const u = (yo) => (yo * Ls) / Lo;
  for (let yo = 0; yo < Lo; yo++) {
    const s0 = a + u(yo), s1 = a + u(yo + 1);
    for (let x = 0; x < w; x++) {
      let wa = 0, r = 0, g = 0, bl = 0, al = 0;
      for (let sy = Math.floor(s0); sy < Math.ceil(s1) && sy < h; sy++) {
        const wt = Math.min(s1, sy + 1) - Math.max(s0, sy);
        if (wt <= 0) continue;
        const i = (sy * w + x) * 4, al1 = data[i + 3] * wt;
        r += data[i] * al1; g += data[i + 1] * al1; bl += data[i + 2] * al1; al += al1; wa += wt;
      }
      const o = ((a + yo) * w + x) * 4;
      if (al > 0) { out[o] = Math.round(r / al); out[o + 1] = Math.round(g / al); out[o + 2] = Math.round(bl / al); }
      out[o + 3] = wa ? Math.round(al / wa) : 0;
    }
  }
  return { w, h: H, data: out };
}
// Paints over the vertical seam lines inside a shoe's shaft (DESEAM, back views): in the rows [y0, y1) a pixel well
// inside the outline is a "line" pixel when it is clearly darker than its row's fill (the median of the row's inner
// pixels); a seam column is a column (+-1 px) where at least 35% of the rows have one. The line pixels of the seam
// columns (grown by 1 px for the soft edge) are replaced by the blend of the nearest clean pixels left and right in
// their row. Only vertical lines go: a horizontal line or a fill change never fills a column.
function deseam(c, y0, y1) {
  const { w, data } = c, ow = outlineWidth(c);
  const lum = (x, y) => luma(data, (y * w + x) * 4);
  const rows = [];
  const hits = new Array(w).fill(0);
  for (let y = y0; y < y1; y++) {
    let l = 0, r = w - 1;
    while (l < w && data[(y * w + l) * 4 + 3] <= 128) l++;
    while (r > l && data[(y * w + r) * 4 + 3] <= 128) r--;
    const lo = l + ow + 3, hi = r - ow - 3;
    if (hi - lo < 6) { rows.push(null); continue; }
    const ls = []; for (let x = lo; x <= hi; x++) ls.push(lum(x, y));
    const med = [...ls].sort((p, q) => p - q)[ls.length >> 1];
    const dark = new Uint8Array(w);
    for (let x = lo; x <= hi; x++) if (lum(x, y) < med - 22) { dark[x] = 1; hits[x]++; }
    rows.push({ y, lo, hi, dark });
  }
  const n = rows.filter(Boolean).length, seam = new Uint8Array(w);
  for (let x = 1; x < w - 1; x++) if (hits[x - 1] + hits[x] + hits[x + 1] >= n * 0.35 * 1.5 && hits[x] >= n * 0.2) seam[x] = 1;
  for (const row of rows) {
    if (!row) continue;
    const { y, lo, hi, dark } = row, kill = new Uint8Array(w);
    for (let x = lo; x <= hi; x++) if (seam[x] && dark[x]) for (let d = -2; d <= 2; d++) if (x + d > lo && x + d < hi) kill[x + d] = 1;
    for (let x = lo + 1; x < hi; x++) {
      if (!kill[x]) continue;
      let e = x; while (e < hi && kill[e]) e++;
      const iL = (y * w + x - 1) * 4, iR = (y * w + e) * 4;
      for (let k = x; k < e; k++) {
        const t = (k - x + 1) / (e - x + 1), i = (y * w + k) * 4;
        for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.round(data[iL + ch] * (1 - t) + data[iR + ch] * t);
      }
      x = e;
    }
  }
  return c;
}

// ---------- outfits ----------
// half-width of the canonical body egg (rig.js egg(), rx = 1, top 0, bottom 1) at v (0..1, top to bottom)
function eggHalf(v, rxT = EGG.rxT, mid = EGG.mid) {
  const k = 0.56, bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
  const solve = (fy, y) => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const t = (lo + hi) / 2; if (fy(t) < y) lo = t; else hi = t; } return (lo + hi) / 2; };
  if (v <= 0 || v >= 1) return 0;
  if (v <= mid) { const t = solve((t) => bez(0, 0, mid - mid * k, mid, t), v); return bez(0, rxT, 1, 1, t); }
  const t = solve((t) => bez(mid, mid + (1 - mid) * k, 1, 1, t), v);
  return bez(1, 1, k, 0, t);
}
// ---------- the neck opening (round 33) ----------
// The kit drew every garment on an invisible mannequin: the neck opening at the top of each view shows what the sheet
// had there (a taupe mannequin neck, the dark inside of a collar or hood, a lighter inner shade), fully opaque. The rig
// has no neck: the head sits on the torso and covers only its top 3 to 4 units, so that patch showed under the chin.
// The opening is baked TRANSPARENT here, so the body's own fill (the species fur) shows through it as the neck, and
// its outline goes to the sprite table (outfits.js cuts the base fill there and strokes the collar edge).
// NECK = per garment and view, seed points [x %, y %] of the source cell (the sliced view, before the warp) inside the
// opening, an optional color tolerance (tol), dark (a dark opening: the seeds never slide off an ink line) and up
// (false: not closed upward); the opening = the pixels connected to each seed whose color stays within tol of that
// seed's color (the collar's ink line and the garment around it stop it), then closed upward to the garment's top edge
// (the back of a collar seen through the opening sits behind the neck) and grown 1 px into the collar's line. Views
// without an entry have no opening (a side view, a back view behind the head, the tuxedo's bow tie, the knight's
// chainmail mantle, the sailor's cream V: the shirt front, a closed neckline like the tuxedo's; in fur the monkey's
// orange V merged with the orange tie). Checked on the outfit contact sheets (the opening shows the
// checkerboard in the 'in game' cells) and in the grids (art-source/screens/v33/neckline/).
// (human kit) every garment was drawn over the mannequin's skin-colored neck: the opening is seeded at the top middle
// of every view (the 3/4 and side views a little toward the face), tuned per item where needed (TUNE).
const NECK_ALL = { front: { seeds: [[50, 4]] }, three: { seeds: [[56, 4]] }, side: { seeds: [[54, 4]] }, back: { seeds: [[50, 4]] } };
const TUNE = {};
const NECK = Object.fromEntries(["stripedtee","polo","jersey","aloha","ringer","hoodie","denim","sweater","flannel","tracktop","bomber","leather","puffer","raincoat","blazer","overalls","mechanic","pajamas","tracksuit","western"].map((id) => [id, { ...NECK_ALL, ...(TUNE[id] || {}) }]));
const NECK_TOL = 36, NECK_STEP = 30, NECK_MAX = 0.08;
// The opening of a source cell (key = 'outfit-<id>-<view>') as a mask (1 = the opening) or null, + the seeds' issues.
function neckMask(c, id, view) {
  const e = NECK[id]?.[view];
  if (!e) return null;
  const { w, h, data } = c, tol = e.tol || NECK_TOL;
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const opaque = (i) => data[i * 4 + 3] > 128;
  // (a seed on a line of ink, max channel < 50, slides down to the first pixel past it; a dark opening, e.dark, never)
  const seeds = e.seeds.map(([sx, sy]) => {
    const x = Math.round(sx / 100 * w);
    let y = Math.round(sy / 100 * h);
    while (!e.dark && y < h * 0.4 && (!opaque(y * w + x) || Math.max(...px(y * w + x)) < 50)) y++;
    // (and past the line's soft edge, into the flat color of the opening)
    for (let k = 0; !e.dark && k < 6 && dist3(px(y * w + x), px((y + 2) * w + x)) > 20; k++) y++;
    return y * w + x;
  });
  // each seed floods with its own color (the mean of its 3 x 3 patch, the pixels close to its center)
  const m = new Uint8Array(w * h);
  for (const s of seeds) {
    if (!opaque(s)) continue;
    const c = px(s), near = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const p = px(s + dy * w + dx); if (dist3(p, c) < 24) near.push(p); }
    const mean = [0, 1, 2].map((k) => near.reduce((t, p) => t + p[k], 0) / near.length);
    const seen = new Uint8Array(w * h), q = [s], got = [s];
    let edge = false;
    seen[s] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i / w) | 0, c0 = px(i);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy, j = Y * w + X;
        if (X < 0 || Y < 0 || X >= w || Y >= h * 0.45 || seen[j]) continue;
        if (!opaque(j)) { edge = true; continue; }
        const cj = px(j);
        if (dist3(cj, mean) < tol && dist3(cj, c0) < NECK_STEP) { seen[j] = 1; got.push(j); q.push(j); }
      }
    }
    // (a flood that ran out into the garment, more than NECK_MAX of the cell, or along the outer outline to the
    // garment's edge, is a seed off the opening: dropped)
    if (got.length > NECK_MAX * w * h || edge) { console.warn(`neck ${id} ${view}: the seed at ${s % w}, ${(s / w) | 0} floods ${got.length} px${edge ? ' to the edge' : ''}, dropped`); continue; }
    for (const j of got) m[j] = 1;
  }
  // closed upward to the garment's top edge, column by column (not where the garment rises above it: e.up false)
  for (let x = 0; x < w && e.up !== false; x++) {
    let y0 = -1;
    for (let y = 0; y < h * 0.45; y++) if (m[y * w + x]) { y0 = y; break; }
    if (y0 < 0) continue;
    for (let y = 0; y < y0; y++) if (opaque(y * w + x)) m[y * w + x] = 1;
  }
  // grown 1 px (into the collar's line), every row filled between its ends
  const g = Uint8Array.from(m);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (m[y * w + x]) continue;
    if ((x > 0 && m[y * w + x - 1]) || (x < w - 1 && m[y * w + x + 1]) || (y > 0 && m[(y - 1) * w + x]) || (y < h - 1 && m[(y + 1) * w + x])) g[y * w + x] = opaque(y * w + x) ? 1 : 0;
  }
  rowFill(g, w, h);
  return g;
}
// every row of a mask filled between its first and last set pixel (the opening is one span per row)
function rowFill(m, w, h) {
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (m[y * w + x]) { if (a < 0) a = x; b = x; }
    for (let x = a; a >= 0 && x <= b; x++) m[y * w + x] = 1;
  }
}
// The opening's outline in the texture (a mask after the warp): the left ends of its rows from the top down, then the
// right ends back up, simplified, as [x, y, x, y, ...] in thousandths of the texture's width and height (y 0 = the top).
// The row ends are smoothed first (a moving average over NECK_SMOOTH rows of the source scale, sc = the published
// scale: the warp makes the top rows stair-stepped)
// and the mask is redrawn from them, so the transparent pixels and the outline agree.
const NECK_SMOOTH = 3;
function neckOutline(m, w, h, sc = 1) {
  const SM = Math.round(NECK_SMOOTH * sc);
  let L = [], R = [];
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (m[y * w + x]) { if (a < 0) a = x; b = x; }
    if (a < 0) { if (L.length) break; continue; }
    L.push([a, y]); R.push([b + 1, y]);
  }
  if (!L.length) return null;
  // (an opening that starts within 3 rows of the top reaches the top: the rows above it are the removed outline)
  for (let y = L[0][1] - 1; L[0][1] <= 3 * sc && y >= 0; y--) { L.unshift([L[0][0], y]); R.unshift([R[0][0], y]); }
  const avg =(arr, i) => { let s = 0, n = 0; for (let k = i - SM; k <= i + SM; k++) if (k >= 0 && k < arr.length) { s += arr[k][0]; n++; } return s / n; };
  const L2 = L.map(([, y], i) => [avg(L, i), y]), R2 = R.map(([, y], i) => [Math.max(avg(R, i), avg(L, i) + 1), y]);
  L = L2; R = R2;
  m.fill(0);
  for (const [i, [a, y]] of L.entries()) for (let x = Math.round(a); x < Math.round(R[i][0]); x++) m[y * w + x] = 1;
  // the ends of each row as edges: the left side at the top of the row's first pixel ... the bottom of the last row
  const last = L.length - 1;
  const left = [[L[0][0], L[0][1]], ...L.map(([x, y]) => [x, y + 0.5]), [L[last][0], L[last][1] + 1]];
  const right = [[R[last][0], R[last][1] + 1], ...R.slice().reverse().map(([x, y]) => [x, y + 0.5]), [R[0][0], L[0][1]]];
  const pts = simplify([...left, ...right], 0.7 * sc);
  return pts.flatMap(([x, y]) => [Math.round((x / w) * 1000), Math.round((y / h) * 1000)]);
}
// Douglas-Peucker
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let iMax = 0, dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > dMax) { dMax = d; iMax = i; }
  }
  if (dMax <= eps) return [a, b];
  return [...simplify(pts.slice(0, iMax + 1), eps).slice(0, -1), ...simplify(pts.slice(iMax), eps)];
}

// a preview of the texture as the rig draws it (contact sheets): clipped to the canonical egg, the outline on top
function eggPreview(t) {
  const o = { data: Buffer.from(t.data), w: t.w, h: t.h }, lw = Math.max(2, t.w / 46);
  for (let y = 0; y < t.h; y++) {
    const e = eggHalf((y + 0.5) / t.h) * t.w / 2;
    for (let x = 0; x < t.w; x++) {
      const i = (y * t.w + x) * 4, dx = Math.abs(x + 0.5 - t.w / 2);
      if (dx > e) o.data[i + 3] = 0; else if (dx > e - lw || y < lw * 0.6 || y > t.h - lw) { o.data[i] = 34; o.data[i + 1] = 28; o.data[i + 2] = 30; }
    }
  }
  return o;
}
// the interior pixels (well inside the outline) of a crop
function interior(c, minD) {
  const d = edgeDist(c), idx = [];
  for (let i = 0; i < c.w * c.h; i++) if (d[i] > minD && luma(c.data, i * 4) > 30) idx.push(i);
  return idx;
}
// The sleeve swatch: a horizontal bar (the sleeve, the cuff at its right end) and, for full-body pieces, a vertical bar
// below it (the leg, the ankle cuff at its bottom). Colors are read along the bar's center line, inside the outline.
function swatch(c) {
  const sp = spans(c), wid = sp.map((s) => (s ? s[1] - s[0] + 1 : 0)), maxW = Math.max(...wid);
  // the horizontal bar: the rows at least 70% of the widest; the leg: the rows below them
  let y0 = wid.findIndex((x) => x >= maxW * 0.7), y1 = y0;
  while (y1 < c.h && wid[y1] >= maxW * 0.7) y1++;
  const T = outlineWidth({ ...c, h: c.h }) || 4;
  const lineColors = (pts) => pts.map(([x, y]) => { const i = (y * c.w + x) * 4; return c.data[i + 3] > 128 ? [c.data[i], c.data[i + 1], c.data[i + 2]] : null; });
  const read = (pts) => {
    const cols = lineColors(pts).filter(Boolean).filter((p) => p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11 > 0);
    const inner = cols.slice(T + 2, cols.length - T - 2);
    if (inner.length < 6) return null;
    // runs of similar colors (the outline / seam lines are short dark runs between them)
    const segs = [];
    for (const p of inner) { const l = segs[segs.length - 1]; if (l && dist3(l.c, p) < 40) { l.n++; l.sum = l.sum.map((v, k) => v + p[k]); l.c = l.sum.map((v) => v / l.n); } else segs.push({ c: p, n: 1, sum: [...p] }); }
    const big = segs.filter((s) => s.n >= 3);
    const main = big.reduce((a, b) => (b.n > a.n ? b : a), big[0]);
    const last = big[big.length - 1];
    const cuff = last && last !== main && dist3(last.c, main.c) > 30 ? last : null;
    return { color: hex(main.c), cuff: cuff ? hex(cuff.c) : null, cuffW: cuff ? Math.round((cuff.n / inner.length) * 100) / 100 : 0, stripes: big.filter((s) => dist3(s.c, main.c) > 30 && s !== cuff).length > 1 ? hex(big.find((s) => dist3(s.c, main.c) > 30 && s !== cuff).c) : null };
  };
  const yc = Math.round((y0 + y1) / 2), s = sp[yc];
  const sleeve = s ? read(Array.from({ length: s[1] - s[0] + 1 }, (_, i) => [s[0] + i, yc])) : null;
  const sleeveLen = s ? (s[1] - s[0] + 1) : 0, barH = y1 - y0;
  // the leg bar below
  let leg = null;
  const below = sp.slice(y1 + 2).findIndex((r) => r);
  if (below >= 0 && c.h - (y1 + 2 + below) > barH * 1.5) {
    const ly0 = y1 + 2 + below, rows = sp.slice(ly0).filter(Boolean);
    const xs = rows.map((r) => (r[0] + r[1]) / 2).sort((a, b) => a - b), xc = Math.round(xs[xs.length >> 1]);
    const pts = [];
    for (let y = ly0; y < c.h; y++) pts.push([xc, y]);
    leg = read(pts);
  }
  return { sleeve, leg, long: sleeveLen > barH * 2.6 };
}

// ---------- output ----------
const r1 = (v) => Math.round(v * 10) / 10;
// The sprite c scaled by k (x) and k * ky (y) = its logical size { w, h } (sprites.json), written at density x that
// size (lanczos3 straight from the source crop: exactly density x w by density x h, so the aspect is the logical one).
async function webp(c, k, file, ky = 1, density = 1) {
  let img = sharp(c.data, { raw: { width: c.w, height: c.h, channels: 4 } });
  let w = c.w, h = c.h;
  if (Math.abs(k - 1) > 0.01 || Math.abs(ky - 1) > 0.001) { w = Math.max(1, Math.round(c.w * k)); h = Math.max(1, Math.round(c.h * k * ky)); }
  if (w !== c.w || h !== c.h || density !== 1) img = img.resize(w * density, h * density, { kernel: 'lanczos3', fit: 'fill' });
  const buf = await img.webp(WEBP).toBuffer();
  fs.writeFileSync(file, buf);
  return { buf, w, h };
}
async function contactSheet(sheet, rows) {
  fs.mkdirSync(CONTACT, { recursive: true });
  const cell = 200, label = 20, cols = Math.max(...rows.map((r) => r.length));
  const W = cols * cell, H = rows.length * (cell + label);
  let checker = '';
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) if (((x + y) / 16) % 2 === 0) checker += `<rect x="${x}" y="${y}" width="16" height="16" fill="#d8d8d8"/>`;
  const parts = [], marks = [];
  for (const [ri, row] of rows.entries()) for (const [ci, s] of row.entries()) {
    const k = Math.min((cell - 20) / s.w, (cell - 20) / s.h, 2.5);
    const w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k));
    const x0 = ci * cell, y0 = ri * (cell + label), left = x0 + Math.round((cell - w) / 2), top = y0 + Math.round((cell - h) / 2);
    parts.push({ input: await sharp(s.buf).resize(w, h).png().toBuffer(), left, top });
    if (s.ax != null) marks.push(`<circle cx="${left + s.ax * k}" cy="${top + s.ay * k}" r="4" fill="#ff00aa" stroke="#fff" stroke-width="1.5"/>`);
    marks.push(`<text x="${x0 + cell / 2}" y="${y0 + cell + 14}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#111">${s.name}</text>`);
  }
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f2f2f2"/>${checker}</svg>`);
  const over = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${marks.join('')}</svg>`);
  await sharp(bg).composite([...parts, { input: over, left: 0, top: 0 }]).png().toFile(path.join(CONTACT, `${sheet}.png`));
}

// Writes the sprites (and their sprites.json entries into `sprites`), the contact sheets, outfit-colors.json and the
// SPRITES block of cosmetics.js. Returns { sprites, report }.
async function run(sprites = {}) {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SLICED, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^(hat|shoe|outfit)-.*\.webp$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  for (const k of Object.keys(sprites)) if (/^(hat|shoe|outfit)-/.test(k)) delete sprites[k];
  const table = { hat: {}, feet: {}, outfit: {} }, colors = {}, report = [];
  for (const [sheet, kind, ids] of SHEETS) {
    const img = despeck(await key(path.join(SRC, `${sheet}.png`)));
    const { rows, issues } = cellsOf(img, 5, kind === 'outfit' ? 5 : 4, sheet, { pairs: kind === 'feet' });
    const contactRows = [];
    report.push({ sheet, issues });
    if (kind === 'feet') {
      // one scale for the whole sheet: its median side-view shoe -> SHOE_REF px
      const sides = rows.map((r) => r[2]).filter(Boolean).map((b) => splitPair(crop(img, b))).flatMap((p) => p.map((q) => q.w)).sort((a, b) => a - b);
      const k = Math.min(SHOE_REF / sides[sides.length >> 1], 3);
      for (const [ri, row] of rows.entries()) {
        const kit = ids[ri], id = ID_OF.feet[kit] || kit, code = CODE_SHOES.has(kit), crow = [];
        if (REMOVED.has(kit)) continue;
        let kk = k;
        for (const [vi, box] of row.entries()) {
          const c = crop(img, box);
          for (const [si, part] of splitPair(c).entries()) {
            let s = part.c || crop(c, trimBox(c, { x: part.x, y: 0, w: part.w, h: c.h }, 1));
            let ky = 1;
            if (SHAFT[id]) {
              const sh = SHAFT[id], side = VIEWS[vi] === 'three' || VIEWS[vi] === 'side', h0 = s.h;
              if (DESEAM.has(id) && VIEWS[vi] === 'back') s = deseam({ ...s, data: Buffer.from(s.data) }, Math.round(s.h * 0.12), Math.round(s.h * 0.82));
              s = shorten(s, sh.keep, SHAFT_BAND[side ? 1 : 0]);
              ky = Math.max(SQUASH_MIN, Math.min(1, (sh.keep * h0) / s.h));
            }
            kk = Math.min(kk, SHOE_MAX / Math.max(s.w, s.h));
            const an = shoeAnchor(s), name = `shoe-${id}-${VIEWS[vi]}-${si ? 'r' : 'l'}`;
            const o = await webp(s, kk, path.join(code ? SLICED : OUT, `${name}.webp`), ky, code ? 1 : DENSITY);
            const e = { w: o.w, h: o.h, ax: r1(an.ax * kk), ay: r1(an.ay * kk * ky), sl: r1(an.sl * kk) };
            if (!code) { sprites[name] = e; ((table.feet[id] = table.feet[id] || {})[VIEWS[vi]] = table.feet[id][VIEWS[vi]] || {})[si ? 'r' : 'l'] = [e.w, e.h, e.ax, e.ay, e.sl]; }
            crow.push({ name: name.replace(/^shoe-/, ''), buf: o.buf, w: o.w, h: o.h, ax: e.ax, ay: e.ay });
          }
        }
        contactRows.push(crow);
      }
    } else if (kind === 'hat') {
      for (const [ri, row] of rows.entries()) {
        const kit = ids[ri], id = ID_OF.hat[kit] || kit, crow = [];
        const cs = row.map((b, vi) => (MIRROR.has(`hat-${id}-${VIEWS[vi]}`) ? mirror(crop(img, b)) : crop(img, b)));
        const k = Math.min(1, HAT_MAX / Math.max(...cs.map((c) => Math.max(c.w, c.h))));
        for (const [vi, c] of cs.entries()) {
          const name = `hat-${id}-${VIEWS[vi]}`, [ax, ay] = hatAnchor(c, HAT_BAND[name]);
          const o = await webp(c, k, path.join(OUT, `${name}.webp`), 1, DENSITY);
          const e = { w: o.w, h: o.h, ax: r1(ax * k), ay: r1(ay * k) };
          sprites[name] = e; (table.hat[id] = table.hat[id] || {})[VIEWS[vi]] = [e.w, e.h, e.ax, e.ay];
          crow.push({ name: name.replace(/^hat-/, ''), buf: o.buf, w: o.w, h: o.h, ax: e.ax, ay: e.ay });
        }
        contactRows.push(crow);
      }
    } else {
      for (const [ri, row] of rows.entries()) {
        const kit = ids[ri], id = ID_OF.outfit[kit] || kit, crow = [];
        const cs = row.slice(0, 4).map((b) => crop(img, b));
        // the textures are drawn large (the customizer, the result card): published up to OUTFIT_MAX (a lanczos upscale)
        const k = Math.min(2, OUTFIT_MAX / Math.max(...cs.map((c) => Math.max(c.w, c.h))));
        // one palette for the garment's four views (tools/outfit-vector.js)
        const pal = OV.palette(cs);
        for (const [vi, c] of cs.entries()) {
          const name = `outfit-${id}-${VIEWS[vi]}`;
          const raw = await webp(c, k, path.join(SLICED, `${name}.webp`));
          crow.push({ name: `${id}-${VIEWS[vi]} (sheet)`, buf: raw.buf, w: raw.w, h: raw.h });
          // the published size (the logical size in sprites.json: the SVG's viewBox, the rig stretches it anyway)
          const W = Math.max(1, Math.round(c.w * k)), H = Math.max(1, Math.round(c.h * k));
          const t = OV.vectorTexture(c, pal, neckMask(c, id, VIEWS[vi]), W, H, { outlineWidth, edgeDist, spans, eggHalf, rowFill, neckOutline });
          // the mannequin's skin at the neck in the garment's color (the collar band ends the neck there)
          t.svg = NECKS.recolor(t.svg, String((THEME.ALL || THEME.LIGHT || THEME)[`outfit-${id}`] || '').toLowerCase()).svg;
          fs.writeFileSync(path.join(OUT, `${name}.svg`), t.svg);
          sprites[name] = { w: W, h: H, ...(t.neck ? { neck: t.neck } : {}) };
          (table.outfit[id] = table.outfit[id] || {})[VIEWS[vi]] = t.neck ? [W, H, t.neck] : [W, H];
          // the contact sheet's 'in game' cell: the SVG rendered (resvg, as the server cards do) and clipped to the egg
          const rd = OV.render(t.svg, 1), pv = await sharp(eggPreview({ data: rd.data, w: rd.w, h: rd.h }).data, { raw: { width: rd.w, height: rd.h, channels: 4 } }).png().toBuffer();
          crow.push({ name: `${id}-${VIEWS[vi]} (in game)`, buf: pv, w: rd.w, h: rd.h });
        }
        const sw = row[4] ? swatch(crop(img, row[4])) : null;
        const front = cs[0];
        colors[id] = { kit, main: hex(dominant(front, interior(front, outlineWidth(front) + 3))), ...(sw || {}) };
        if (row[4]) { const sc = crop(img, row[4]); const raw = await webp(sc, 1, path.join(SLICED, `outfit-${id}-swatch.webp`)); crow.push({ name: `${id} swatch`, buf: raw.buf, w: raw.w, h: raw.h }); }
        contactRows.push(crow);
      }
    }
    await contactSheet(sheet, contactRows);
  }
  fs.writeFileSync(COLORS, JSON.stringify(colors, null, 2) + '\n');
  writeTable(table);
  return { sprites, report, colors };
}

// The generated SPRITES block of public/js/mascots/cosmetics.js (between its BEGIN / END markers).
function writeTable(table) {
  const src = fs.readFileSync(COSMETICS_JS, 'utf8');
  const a = src.indexOf('// BEGIN SPRITES'), b = src.indexOf('// END SPRITES');
  if (a < 0 || b < 0) { console.warn('cosmetics.js: no SPRITES markers, table not written'); return; }
  const line = (o) => JSON.stringify(o).replace(/"([a-z]+)":/g, '$1:');
  const body = ['  const SPRITES = {'];
  for (const kind of ['hat', 'feet', 'outfit']) {
    body.push(`    ${kind}: {`);
    for (const [id, v] of Object.entries(table[kind])) body.push(`      ${id}: ${line(v)},`);
    body.push('    },');
  }
  body.push('  };');
  const head = src.slice(0, a), tail = src.slice(b);
  const marker = '// BEGIN SPRITES (generated by tools/import-kit.js from public/art/sprites.json: [w, h, ax, ay] per view; shoes per foot l/r [w, h, ax, ay, sole length]; outfits [w, h] or [w, h, neck opening outline]; do not edit)\n';
  fs.writeFileSync(COSMETICS_JS, `${head}${marker}${body.join('\n')}\n  ${tail}`);
}

module.exports = { run, SHEETS, ID_OF, CODE_SHOES, SHOE_REF, EGG, eggHalf, shorten, deseam, straightZone, SHAFT, DESEAM,
  // (the outfit helpers, for checks and debugging of one garment: tools/outfit-vector.js vectorTexture takes them)
  lib: { SRC, VIEWS, OUTFIT_MAX, key, despeck, cellsOf, crop, spans, edgeDist, outlineWidth, rowFill, neckOutline, neckMask } };

if (require.main === module) {
  (async () => {
    const file = path.join(OUT, 'sprites.json');
    const sprites = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const { report, colors } = await run(sprites);
    // merged into the file as it is NOW (another tool may have written its own entries meanwhile): only the hat,
    // shoe and outfit entries are this tool's
    const fresh = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const k of Object.keys(fresh)) if (/^(hat|shoe|outfit)-/.test(k)) delete fresh[k];
    for (const [k, v] of Object.entries(sprites)) if (/^(hat|shoe|outfit)-/.test(k)) fresh[k] = v;
    fs.writeFileSync(file, JSON.stringify(fresh, null, 0) + '\n');
    const n = Object.keys(sprites).filter((k) => /^(hat|shoe|outfit)-/.test(k)).length;
    console.log(`human kit: ${n} sprites, ${Object.keys(colors).length} outfit color sets, contact sheets in art-source/human-kit/contact/`);
    for (const r of report) if (r.issues.length) console.log(`  ${r.sheet}: ${r.issues.join('; ')}`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
