// Traces the character art sheets (art-source/characters/, drawn on a flat #00FF00 green screen in the key colors of
// art-source/characters/README.md) into vector shapes for the rig:
//   node tools/trace-figures.js [--preview <dir>]
// writes public/js/figures/figure-art.js (window.DuelFigureArt). The site stays raster-free for the people: every part
// is paths, each filled with a color CLASS (skin, hair, shirt, ...) that the rig maps to the player's tokens, so one
// drawing serves every skin tone, hair color and shirt.
//
// A piece = { s: the silhouette (drawn in the outline color: the gaps between the fills are the drawn lines),
//             f: [[class, path], ...] (the flat color areas, drawn on top, even-odd) }.
// What is traced:
//   heads[style][view]: the head with that hairstyle (03-hair-a, 04-hair-b), views front / three / side / back. In the
//     front and three-quarter views the neutral face is taken out (the skin runs over it) and `eye` = [x, y, k] says
//     where a face goes (the eyes' middle) and its scale; side and back keep their own drawing.
//   faces[view][name]: the ten expressions (02-heads-faces rows 2-5) as a face layer (lines, eye whites, mouth, tongue,
//     cheeks) around the eyes' middle, for the front and three-quarter views.
//   torso: the T-shirt torso outline in the front and side views (05 row 1), resampled for the rig to blend by turn.
//   shoes[view]: [left, right] (05 row 3), anchor = the middle of the ankle opening, the sole on y = 0.
//   hands[shape]: the hands (06), the wrist on the origin, the fingers toward -y (the rig's hand frame).
// Head frame: the bottom middle of the neck stub on the origin, character units (the head is 126 units from the top of
// the bald head to the stub's bottom, as the rig's old drawn head). Needs sharp (it is not a dependency of the site):
// `npm i --no-save sharp`, or run with NODE_PATH pointing at a node_modules that has it.
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); } catch { console.error('needs sharp: npm i --no-save sharp'); process.exit(1); }

const SRC = path.join(__dirname, '..', 'art-source', 'characters');
const OUT = path.join(__dirname, '..', 'public', 'js', 'figures', 'figure-art.js');
const previewDir = (() => { const i = process.argv.indexOf('--preview'); return i > 0 ? process.argv[i + 1] : null; })();

// ---------------- the key colors (art-source/characters/README.md) ----------------
const KEYS = {
  green: [0, 255, 0], outline: [35, 42, 53], skin: [212, 154, 110], hair: [90, 58, 38], shirt: [217, 87, 59],
  pants: [59, 70, 86], shoe: [46, 52, 64], sole: [233, 236, 240], white: [255, 255, 255], mouth: [122, 52, 52],
  tongue: [226, 120, 122], cheek: [232, 138, 122], glove: [242, 193, 78], band: [46, 140, 153],
};
const NAMES = Object.keys(KEYS);
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));

async function load(file) {
  const { data, info } = await sharp(path.join(SRC, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
// Every pixel -> the nearest allowed key color, then one majority pass (anti-aliasing specks between two colors).
function classify(img, allowed) {
  const { data, w, h } = img, ids = allowed.map((n) => ID[n]);
  const cls = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    let best = 0, bd = 1e9;
    for (const id of ids) { const k = KEYS[NAMES[id]], d = (r - k[0]) ** 2 + (g - k[1]) ** 2 + (b - k[2]) ** 2; if (d < bd) { bd = d; best = id; } }
    cls[i] = best;
  }
  const out = cls.slice();
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = cls[y * w + x];
    let same = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (cls[(y + dy) * w + x + dx] === c) same++;
    if (same >= 3) continue;
    const cnt = new Map();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = cls[(y + dy) * w + x + dx]; cnt.set(v, (cnt.get(v) || 0) + 1); }
    out[y * w + x] = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
  }
  return out;
}

// ---------------- connected components ----------------
function label(mask, w, h) {
  const lab = new Int32Array(w * h).fill(-1), comps = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const c = { id: comps.length, n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0, px: [] };
    lab[i] = c.id; stack.push(i);
    while (stack.length) {
      const j = stack.pop(), x = j % w, y = (j - x) / w;
      c.n++; c.sx += x; c.sy += y; c.px.push(j);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (mask[k] && lab[k] < 0) { lab[k] = c.id; stack.push(k); }
      }
    }
    c.cx = c.sx / c.n; c.cy = c.sy / c.n;
    comps.push(c);
  }
  return { lab, comps };
}
// The drawn items of a sheet: the non-green components (small specks merged into the nearest big one), as boxes,
// in reading order (rows by the boxes' middles).
function items(cls, w, h, { minArea = 400, gap = 3 } = {}) {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = cls[i] !== ID.green ? 1 : 0;
  const { comps } = label(mask, w, h);
  let boxes = comps.filter((c) => c.n >= 30).map((c) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, n: c.n }));
  // merge boxes closer than gap (a ponytail tie, a detached curl)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
        boxes.splice(j, 1); merged = true;
      }
    }
  }
  boxes = boxes.filter((b) => b.n >= minArea);
  boxes.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const b of boxes) {
    const cy = (b.y0 + b.y1) / 2, row = rows.find((r) => Math.abs(r.cy - cy) < (b.y1 - b.y0) * 0.5);
    if (row) row.items.push(b); else rows.push({ cy, items: [b] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x0 - b.x0));
}

// Small specks of one class (anti-aliasing between two other colors: a dark line on skin reads as hair) -> another class.
function specks(cls, w, h, id, minN, to) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = cls[i] === id ? 1 : 0;
  for (const c of label(m, w, h).comps) if (c.n < minN) for (const j of c.px) cls[j] = to;
  return cls;
}

// ---------------- tracing ----------------
// marching squares on a scalar field, chained into closed polylines
function contours(field, w, h, iso) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
  const segs = [];
  const L_ = (a, b, va, vb) => a + (b - a) * ((iso - va) / (vb - va));
  for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
    const v0 = at(x, y), v1 = at(x + 1, y), v2 = at(x + 1, y + 1), v3 = at(x, y + 1);
    const c = (v0 >= iso ? 8 : 0) | (v1 >= iso ? 4 : 0) | (v2 >= iso ? 2 : 0) | (v3 >= iso ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = [L_(x, x + 1, v0, v1), y], R = [x + 1, L_(y, y + 1, v1, v2)];
    const B = [L_(x, x + 1, v3, v2), y + 1], Lf = [x, L_(y, y + 1, v0, v3)];
    const add = (a, b) => segs.push([a, b]);
    switch (c) {
      case 1: add(Lf, B); break; case 2: add(B, R); break; case 3: add(Lf, R); break; case 4: add(T, R); break;
      case 5: add(Lf, T); add(B, R); break; case 6: add(T, B); break; case 7: add(Lf, T); break; case 8: add(T, Lf); break;
      case 9: add(T, B); break; case 10: add(T, R); add(Lf, B); break; case 11: add(T, R); break; case 12: add(Lf, R); break;
      case 13: add(B, R); break; case 14: add(Lf, B); break; default: break;
    }
  }
  const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const byPt = new Map();
  for (const s of segs) for (const p of s) { const k = key(p); if (!byPt.has(k)) byPt.set(k, []); byPt.get(k).push(s); }
  const used = new Set(), out = [];
  for (const s of segs) {
    if (used.has(s)) continue;
    const line = [s[0], s[1]]; used.add(s);
    for (;;) {
      const k = key(line[line.length - 1]);
      const n = (byPt.get(k) || []).find((q) => !used.has(q));
      if (!n) break;
      used.add(n); line.push(key(n[0]) === k ? n[1] : n[0]);
    }
    if (line.length > 6) out.push(line);
  }
  return out;
}
function simplify(pts, eps) {
  if (pts.length < 6) return pts;
  const rdp = (a, b) => {
    let best = -1, bi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > best) { best = d; bi = i; } }
    return best > eps ? [...rdp(a, bi).slice(0, -1), ...rdp(bi, b)] : [pts[a], pts[b]];
  };
  const half = Math.floor(pts.length / 2);
  return [...rdp(0, half).slice(0, -1), ...rdp(half, pts.length - 1).slice(0, -1)];
}
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a / 2; };
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => { const s = String(r1(v)); return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s; };
function smoothPath(pts, closed = true) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), k = 1 / 6;
    d += `C${fmt(p1[0] + (p2[0] - p0[0]) * k)} ${fmt(p1[1] + (p2[1] - p0[1]) * k)} ${fmt(p2[0] - (p3[0] - p1[0]) * k)} ${fmt(p2[1] - (p3[1] - p1[1]) * k)} ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}
// A mask (crop region) -> one even-odd path in character units: blurred a little (smooth sub-pixel edges), iso 0.5.
function tracePath(mask, w, h, map, { eps = 0.7, minArea = 6 } = {}) {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) { n++; continue; }
      s += mask[yy * w + xx]; n++;
    }
    f[y * w + x] = s / n;
  }
  const cs = contours(f, w, h, 0.5).map((c) => simplify(c, eps)).filter((c) => c.length > 3 && Math.abs(area(c)) > minArea);
  return cs.map((c) => smoothPath(c.map(map))).join('');
}
// A crop of the class map
function crop(cls, W, box, pad = 4) {
  const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad), x1 = box.x1 + pad, y1 = box.y1 + pad;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8Array(w * h).fill(ID.green);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < W && sy * W + sx < cls.length) out[y * w + x] = cls[sy * W + sx];
  }
  return { c: out, w, h, x0, y0 };
}
const maskOf = (c, test) => { const m = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) m[i] = test(c[i]) ? 1 : 0; return m; };
// A piece: the silhouette + the fills (in the order given)
function piece(cr, map, fills, opts = {}) {
  const { c, w, h } = cr;
  const s = tracePath(maskOf(c, (v) => v !== ID.green), w, h, map, opts);
  const f = [];
  for (const name of fills) {
    const d = tracePath(maskOf(c, (v) => v === ID[name]), w, h, map, opts);
    if (d) f.push([name, d]);
  }
  return { s, f };
}

// ---------------- measuring ----------------
// the neck stub's bottom middle: the lowest drawn row, the middle of the drawn pixels just above it
function stubOf(cr) {
  const { c, w, h } = cr;
  let yb = -1;
  for (let y = h - 1; y >= 0 && yb < 0; y--) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { yb = y; break; }
  let sx = 0, n = 0;
  for (let y = yb - 10; y <= yb; y++) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { sx += x; n++; }
  let yt = h;
  for (let y = 0; y < h && yt === h; y++) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { yt = y; break; }
  return { x: sx / n, y: yb + 0.5, top: yt };
}
// The face features: the non-skin islands that skin surrounds (not touching the green, the hair or the outline ring).
function features(cr) {
  const { c, w, h } = cr;
  const m = maskOf(c, (v) => v !== ID.skin && v !== ID.green && v !== ID.hair);
  const { comps, lab } = label(m, w, h);
  const out = [];
  for (const comp of comps) {
    let island = true;
    for (const j of comp.px) {
      const x = j % w, y = (j - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { island = false; break; }
        const v = c[ny * w + nx];
        if (lab[ny * w + nx] !== comp.id && v !== ID.skin) { island = false; break; }
      }
      if (!island) break;
    }
    if (island && comp.n < w * h * 0.05) out.push(comp);
  }
  return out;
}
// The face features of an expression cell: the islands plus the non-skin pixels deeper inside the head than its outline
// ring and near the face (an ellipse around the eyes' middle cx, cy with radii rx, ry), so a far eye or a cheek that
// touches the outline in the three-quarter view is kept.
function faceMask(cr, cx, cy, rx, ry) {
  const { c, w, h } = cr, dist = new Int32Array(w * h).fill(-1), q = [];
  for (let i = 0; i < w * h; i++) if (c[i] === ID.green) { dist[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const j = q[qi], x = j % w, y = (j - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (dist[k] < 0) { dist[k] = dist[j] + 1; q.push(k); }
    }
  }
  const m = new Uint8Array(w * h);
  for (const f of features(cr)) for (const j of f.px) m[j] = 1;
  for (let i = 0; i < w * h; i++) {
    if (m[i] || c[i] === ID.skin || c[i] === ID.green || dist[i] <= 9) continue;
    const x = i % w, y = (i - x) / w;
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) m[i] = 1;
  }
  return m;
}
// the two eyes among the features: solid ovals taller than wide; their middle
function eyesOf(feats, cr) {
  const cands = feats.filter((f) => {
    const bw = f.x1 - f.x0 + 1, bh = f.y1 - f.y0 + 1;
    return bh >= bw * 1.1 && f.n / (bw * bh) > 0.55 && f.n > 30;
  }).sort((a, b) => b.n - a.n).slice(0, 2);
  if (cands.length === 0) throw new Error('no eyes found');
  const x = cands.reduce((s, f) => s + f.cx, 0) / cands.length, y = cands.reduce((s, f) => s + f.cy, 0) / cands.length;
  return { x, y, n: cands.length };
}

// ---------------- the sheets ----------------
const VIEWS = ['front', 'three', 'side', 'back'];
const FACE_NAMES = ['neutral', 'focus', 'smile', 'think', 'grin', 'joy', 'oops', 'sad', 'meh', 'shock'];
const HEAD_UNITS = 126;   // the bald head's top to the stub's bottom, character units

async function main() {
  const art = { heads: {}, faces: { front: {}, three: {} }, shoes: {}, hands: {}, torso: {} };
  const report = [];

  // ---- 02: the bald heads and the expressions ----
  const s02 = await load('02-heads-faces.png');
  const c02 = classify(s02, ['green', 'outline', 'skin', 'white', 'mouth', 'tongue', 'cheek']);
  for (const [id, n, to] of [[ID.cheek, 60, ID.skin], [ID.tongue, 30, ID.mouth], [ID.mouth, 30, ID.outline], [ID.white, 20, ID.skin]]) specks(c02, s02.w, s02.h, id, n, to);
  const rows02 = items(c02, s02.w, s02.h);
  if (rows02.length !== 5 || rows02[0].length !== 4 || rows02.slice(1).some((r) => r.length !== 5)) throw new Error(`02: unexpected grid ${rows02.map((r) => r.length)}`);
  const bald = crop(c02, s02.w, rows02[0][0]), baldStub = stubOf(bald);
  const k02 = HEAD_UNITS / (baldStub.y - baldStub.top);
  // per view: the neutral cell's eyes relative to its stub (px), the eye-to-stub distance
  const ref = {};
  for (const [view, row] of [['front', 1], ['three', 3]]) {
    const cr = crop(c02, s02.w, rows02[row][0]), st = stubOf(cr), eyes = eyesOf(features(cr), cr);
    ref[view] = { ex: eyes.x - st.x, ey: eyes.y - st.y };
  }
  // faces: every expression cell, its features around the neutral eyes' middle (aligned by the stub), in character units
  // at the 02 scale (a head scales them by its own eye[2])
  for (const [view, r0] of [['front', 1], ['three', 3]]) {
    FACE_NAMES.forEach((name, i) => {
      const cell = rows02[r0 + Math.floor(i / 5)][i % 5];
      const cr = crop(c02, s02.w, cell), st = stubOf(cr);
      const ox = st.x + ref[view].ex, oy = st.y + ref[view].ey, d = Math.abs(ref[view].ey);
      // the face zone stops short of the ear lines (front: both sides; three-quarter: the near ear on the left)
      const fm = view === 'front' ? faceMask(cr, ox, oy + d * 0.12, d * 0.58, d * 0.62) : faceMask(cr, ox + d * 0.12, oy + d * 0.12, d * 0.6, d * 0.62);
      const map = ([x, y]) => [(x - ox) * k02, (y - oy) * k02];
      const { c, w, h } = cr;
      // the lines and the mouth outline as one dark base (not under the cheeks), the colors on top
      const fill = (test) => { const m = new Uint8Array(w * h); for (let j = 0; j < w * h; j++) m[j] = fm[j] && test(c[j]) ? 1 : 0; return tracePath(m, w, h, map, { eps: 0.5, minArea: 3 }); };
      const face = { s: fill((v) => v !== ID.cheek), f: [] };
      for (const nm of ['white', 'mouth', 'tongue', 'cheek']) { const d = fill((v) => v === ID[nm]); if (d) face.f.push([nm, d]); }
      art.faces[view][name] = face;
    });
  }
  const eyeRig = { front: Math.abs(ref.front.ey) * k02, three: Math.abs(ref.three.ey) * k02 };
  report.push(`02: head scale ${k02.toFixed(3)} units/px, eye-to-stub ${eyeRig.front.toFixed(1)} (front) ${eyeRig.three.toFixed(1)} (three)`);

  // ---- 03 / 04: the heads with hair ----
  const STYLES = [['03-hair-a.png', ['short', 'crop', 'buzz', 'spiky']], ['04-hair-b.png', ['curly', 'long', 'bun', 'ponytail']]];
  for (const [file, styles] of STYLES) {
    const img = await load(file);
    const cl = specks(classify(img, ['green', 'outline', 'skin', 'hair', 'shirt']), img.w, img.h, ID.hair, 60, ID.outline);
    const rows = items(cl, img.w, img.h);
    if (rows.length !== 4 || rows.some((r) => r.length !== 4)) throw new Error(`${file}: unexpected grid ${rows.map((r) => r.length)}`);
    // the sheet's scale: its front heads' eye-to-stub distance = the bald head's
    let sum = 0;
    for (const row of rows) { const cr = crop(cl, img.w, row[0]); sum += Math.abs(eyesOf(features(cr), cr).y - stubOf(cr).y); }
    const k = eyeRig.front / (sum / rows.length);
    styles.forEach((style, r) => {
      art.heads[style] = {};
      VIEWS.forEach((view, v) => {
        const cr = crop(cl, img.w, rows[r][v]), st = stubOf(cr);
        const map = ([x, y]) => [(x - st.x) * k, (y - st.y) * k];
        const head = {};
        // the neck stub's outer half-width a little above its bottom (the rig draws its neck exactly as wide)
        { const y = Math.round(st.y - 7); let a = -1, b2 = -1;
          for (let x = Math.max(0, Math.round(st.x - 30)); x < Math.min(cr.w, st.x + 30); x++) if (cr.c[y * cr.w + x] !== ID.green && cr.c[y * cr.w + x] !== ID.hair) { if (a < 0) a = x; b2 = x; }
          head.neck = r1(((b2 - a + 1) / 2) * k); }
        if (view === 'front' || view === 'three') {
          const feats = features(cr), eyes = eyesOf(feats, cr);
          for (const f of feats) for (const j of f.px) cr.c[j] = ID.skin;   // the neutral face out
          const e = map([eyes.x, eyes.y]);
          head.eye = [r1(e[0]), r1(e[1]), Math.round((Math.abs(e[1]) / eyeRig[view]) * 1000) / 1000];
        }
        Object.assign(head, piece(cr, map, ['skin', 'hair', 'shirt'], { eps: 0.95, minArea: 10 }));
        art.heads[style][view] = head;
      });
    });
    // one neck width per sheet (the same drawn head): the median, as hair covers the stub in some views
    const nw = styles.flatMap((st) => VIEWS.map((v) => art.heads[st][v].neck)).sort((x, y) => x - y);
    const med = nw[Math.floor(nw.length / 2)];
    for (const st of styles) for (const v of VIEWS) art.heads[st][v].neck = med;
    report.push(`${file}: scale ${k.toFixed(3)} units/px`);
  }

  // ---- 05: the torso outline and the shoes ----
  const s05 = await load('05-body-shoes.png');
  const c05 = classify(s05, ['green', 'outline', 'skin', 'shirt', 'pants', 'shoe', 'sole']);
  const rows05 = items(c05, s05.w, s05.h);
  // row 1: four torsos + the sleeve swatch; the torso's outline (outer edge), top = the collar, in units of its height
  const torsoOf = (box) => {
    const cr = crop(c05, s05.w, box, 2), { c, w, h } = cr;
    const m = maskOf(c, (v) => v !== ID.green);
    const cs = contours(m.map((v) => v), w, h, 0.5).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    const ring = cs[0];
    let minY = 1e9, maxY = -1e9, sx = 0;
    for (const p of ring) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); sx += p[0]; }
    // the middle: the collar's middle (the top rows)
    const top = ring.filter((p) => p[1] < minY + 6), mx = top.reduce((s, p) => s + p[0], 0) / top.length;
    const H = maxY - minY;
    // the band line: the first row from the bottom where the shirt ends (the trousers band's top) at the middle column
    let bandY = maxY;
    for (let y = Math.round(maxY) - 2; y > minY; y--) { if (c[Math.min(h - 1, y) * w + Math.round(mx)] === ID.shirt) { bandY = y; break; } }
    // resample: 72 points by angle around the middle of the shape
    const cy = (minY + maxY) / 2, N = 72, pts = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i / N) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
      let best = null, bd = -1;
      for (const p of ring) { const qx = p[0] - mx, qy = p[1] - cy, t = qx * dx + qy * dy, perp = Math.abs(qx * dy - qy * dx); if (t > 0 && perp < 1.5 && t > bd) { bd = t; best = p; } }
      if (!best) best = ring.reduce((b, p) => { const t = (p[0] - mx) * dx + (p[1] - cy) * dy; return t > ((b[0] - mx) * dx + (b[1] - cy) * dy) ? p : b; }, ring[0]);
      pts.push([r1(((best[0] - mx) / H) * 1000) / 1000, r1(((best[1] - minY) / H) * 1000) / 1000]);
    }
    return { pts, band: Math.round(((bandY - minY) / H) * 1000) / 1000, w: (cr.w - 4) / H, H };
  };
  art.torso.front = torsoOf(rows05[0][0]);
  art.torso.three = torsoOf(rows05[0][1]);
  art.torso.side = torsoOf(rows05[0][2]);
  art.torso.back = torsoOf(rows05[0][3]);
  // the shoes: rows05[2] holds 8 shoes (left, right per view)
  const shoesRow = rows05[2];
  if (shoesRow.length !== 8) throw new Error(`05 row 3: ${shoesRow.length} shoes`);
  // the shoe scale: the front torso is the rig's front torso height (set by the rig: 92 units)
  const kShoe = 92 / art.torso.front.H;
  VIEWS.forEach((view, v) => {
    art.shoes[view] = [0, 1].map((side) => {
      const cr = crop(c05, s05.w, shoesRow[v * 2 + side]), { c, w, h } = cr;
      // anchor: the middle of the drawn top (the ankle opening), the sole's bottom
      let yb = 0; for (let y = h - 1; y >= 0 && !yb; y--) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { yb = y + 0.5; break; }
      let yt = -1; for (let y = 0; y < h && yt < 0; y++) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { yt = y; break; }
      let sx = 0, n = 0; for (let y = yt; y < yt + 10; y++) for (let x = 0; x < w; x++) if (c[y * w + x] !== ID.green) { sx += x; n++; }
      const ax = sx / n;
      const map = ([x, y]) => [(x - ax) * kShoe, (y - yb) * kShoe];
      const p = piece(cr, map, ['shoe', 'sole'], { eps: 0.9 });
      p.top = r1((yt - yb) * kShoe);
      p.w = r1((cr.w - 8) * kShoe);
      return p;
    });
  });
  report.push(`05: shoe scale ${kShoe.toFixed(3)} units/px`);

  // ---- 06: the hands ----
  const s06 = await load('06-hands-gloves.png');
  const c06 = classify(s06, ['green', 'outline', 'skin', 'glove', 'band']);
  const rows06 = items(c06, s06.w, s06.h, { gap: 4 });
  // the back of each hand (the palm row 2 and the palm-side glove are not used by the rig)
  const HAND_CELLS = { ready: [0, 0], rock: [0, 1], paper: [0, 2], scissors: [0, 3], open: [2, 0], grip: [2, 1], glove: [2, 2] };
  const ARM_OUTER = 15 / 2 + 4;   // the rig's arm: half its width + the outline
  for (const [name, [r, col]] of Object.entries(HAND_CELLS)) {
    const box = rows06[r][col];
    const full = crop(c06, s06.w, box, 0), { c, w, h } = full;
    // the forearm stub: its thickness in the first columns; the wrist = where the drawing gets 18% thicker
    const colSpan = (x, test) => { let a = -1, b = -1; for (let y = 0; y < h; y++) if (test(c[y * w + x])) { if (a < 0) a = y; b = y; } return [a, b]; };
    const [o0, o1] = colSpan(4, (v) => v !== ID.green), [i0, i1] = colSpan(4, (v) => v === ID.skin);
    const thick = o1 - o0;
    let wx = 4;
    for (let x = 4; x < w; x++) { const [a, b] = colSpan(x, (v) => v !== ID.green); if (b - a > thick * 1.18) { wx = x; break; } }
    const cut = Math.max(0, wx - Math.round(thick * 0.35));   // keep a short stub before the hand
    // re-crop from the cut
    const cr = crop(c06, s06.w, { x0: box.x0 + cut, y0: box.y0, x1: box.x1, y1: box.y1 }, 0);
    const ay = (o0 + o1) / 2, s = ARM_OUTER / (thick / 2);
    // sheet (x right = along the arm, y down) -> hand frame (fingers toward -y, the drawing's top toward -x)
    const map = ([x, y]) => [(y - ay) * s, -x * s];
    const fills = name.startsWith('glove') ? ['band', 'glove', 'skin'] : ['skin'];
    const p = piece(cr, map, fills, { eps: 0.6 });
    // the silhouette's outline without the straight cut at the wrist (stroked to even the outline weight)
    const m = maskOf(cr.c, (v) => v !== ID.green);
    const ring = contours(m, cr.w, cr.h, 0.5).map((q) => simplify(q, 0.6)).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
    const onCut = (q) => q[0] < 1.5;
    let start = ring.findIndex((q, i) => onCut(ring[(i - 1 + ring.length) % ring.length]) && !onCut(q));
    if (start < 0) start = 0;
    const rot = [...ring.slice(start), ...ring.slice(0, start)];
    const endI = rot.findIndex((q, i) => i > 0 && onCut(q));
    const open = smoothPath((endI > 0 ? rot.slice(0, endI) : rot).map(map), false);
    let minX = 0, maxX = 0, minY = 0;
    for (const q of ring.map(map)) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); }
    const len = -minY;
    art.hands[name] = {
      ...p, open,
      wo: r1(ARM_OUTER), wi: r1(((i1 - i0) / 2) * s),
      mid: r1(len * 0.55), r: r1(Math.max(maxX - minX, len) / 2),
      box: [r1(minX), r1(minY), r1(maxX - minX), r1(len)],
    };
  }
  report.push(`06: ${Object.keys(art.hands).length} hands`);

  const body = `// Generated by tools/trace-figures.js from art-source/characters/ (the ChatGPT character sheets). Do not edit.
// Pieces: s = the silhouette (drawn in the outline color), f = [class, path] fills (even-odd) the rig colors per player.
window.DuelFigureArt = ${JSON.stringify(art)};
`;
  fs.writeFileSync(OUT, body);
  report.push(`wrote ${path.relative(process.cwd(), OUT)} (${Math.round(body.length / 1024)} KB)`);
  console.log(report.join('\n'));
  if (previewDir) writePreview(art, previewDir);
}

// A preview page: every traced part drawn in the key colors (open it in a browser to check the trace).
function writePreview(art, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const col = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, `rgb(${v.join(',')})`]));
  const draw = (p, tr = '') => `<g transform="${tr}"><path d="${p.s}" fill="${col.outline}" fill-rule="evenodd"/>${p.f.map(([c, d]) => `<path d="${d}" fill="${col[c]}" fill-rule="evenodd"/>`).join('')}</g>`;
  let out = '';
  let y = 0;
  for (const [style, views] of Object.entries(art.heads)) {
    VIEWS.forEach((v, i) => {
      const h = views[v], x = 120 + i * 200;
      out += draw(h, `translate(${x} ${y + 170})`);
      if (h.eye) { const F = art.faces[v].neutral; out += draw(F, `translate(${x + h.eye[0]} ${y + 170 + h.eye[1]}) scale(${h.eye[2]})`); }
    });
    y += 180;
  }
  let fy = y;
  for (const view of ['front', 'three']) {
    FACE_NAMES.forEach((name, i) => {
      const h = art.heads.short[view], x = 120 + i * 150;
      out += draw(h, `translate(${x} ${fy + 170})`) + draw(art.faces[view][name], `translate(${x + h.eye[0]} ${fy + 170 + h.eye[1]}) scale(${h.eye[2]})`);
    });
    fy += 180;
  }
  let hx = 60;
  for (const h of Object.values(art.hands)) { out += draw(h, `translate(${hx} ${fy + 110})`); hx += 100; }
  fy += 140;
  VIEWS.forEach((v, i) => { art.shoes[v].forEach((s, j) => { out += draw(s, `translate(${80 + i * 200 + j * 70} ${fy + 60})`); }); });
  fy += 90;
  fs.writeFileSync(path.join(dir, 'figure-art.html'), `<!doctype html><body style="margin:0;background:#cfd8e3"><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${fy + 20}" viewBox="0 0 1600 ${fy + 20}">${out}</svg></body>`);
}

main().catch((e) => { console.error(e); process.exit(1); });
