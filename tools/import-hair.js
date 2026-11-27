// Imports the hairstyles of the human clothes kit (art-source/human-kit/output/hair-1.png, hair-2.png: 4 styles x 4
// views each, drawn on the bald reference head, the hair in the key brown, ties in cream) as VECTORS the game recolors
// per player: public/js/mascots/hair-art.js (window.DuelHairArt[style][view] = { hair, tie, ink } path data in HEAD
// space: the head's center at 0,0, its radius 70 units, y down, a profile facing right). Run:
//   NODE_PATH=<a node_modules with sharp> node tools/import-hair.js
// Per cell:
//   1. classes: every opaque pixel is hair (the key brown), tie (cream), skin, ink (the dark outline) or other.
//   2. the fit: the rig's head (an ellipse R x 1.02 R with the neck under it, human.js) is laid over the drawing by a
//      search over the scale and the position that puts the model's inside on the drawing's skin (hair and lines
//      there are fine: they cover it) and never on the background, and keeps the skin outside it small. The scale is
//      then fixed per sheet (the median of the front, 3/4 and side views: the back view is mostly hair) and the
//      position searched again with it.
//   3. the hair: the hair and tie pixels, plus the ink lines that touch them (the hairline, the strand lines, the hair's
//      outline; not the face's lines), holes closed; traced like the outfits (tools/outfit-vector.js: a light blur, a
//      Catmull-Rom upsample, marching squares, smoothed and simplified loops) into three stacked layers (hair, tie,
//      ink) and moved into head space.
// The rig (human.js) draws it whole OVER the head, as the kit's drawing has it (its own outline covers the head's). Contact sheet: art-source/human-kit/contact/hair.png.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const OV = require('./outfit-vector');
const { lib } = require('./import-kit');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art-source', 'human-kit', 'output');
const OUT = path.join(ROOT, 'public', 'js', 'mascots', 'hair-art.js');
const CONTACT = path.join(ROOT, 'art-source', 'human-kit', 'contact', 'hair.png');
const SHEETS = [['hair-1', ['short', 'crop', 'buzz', 'spiky']], ['hair-2', ['curly', 'long', 'bun', 'ponytail']]];
const DROPPED = new Set(['long', 'ponytail']);   // (in the sheet, dropped by the owner)
const VIEWS = ['front', 'three', 'side', 'back'];
const R = 70, RY = 1.02 * R, NECK_W = 30;
const HAIR = [0x5A, 0x3A, 0x26], TIE = [0xFB, 0xE4, 0xC6], SKIN = [0xD4, 0x9A, 0x6E];
const dist = (d, i, c) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2]);
const INK_REACH = 7;   // px: ink this close to hair counts as the hair's line

// 1. classes: 0 bg, 1 hair, 2 tie, 3 skin, 4 ink, 5 other
function classes(c) {
  const { w, h, data } = c, k = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (data[p + 3] <= 128) continue;
    const l = data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11;
    k[i] = dist(data, p, HAIR) < 48 ? 1 : dist(data, p, TIE) < 30 ? 2 : dist(data, p, SKIN) < 50 ? 3 : l < 75 ? 4 : 5;
  }
  // hair only where the hair is SOLID (a core pixel: close to the key with its 3 x 3 neighbourhood hair too, plus the
  // pixels next to a core): the anti-aliased rim of every dark line on the skin is hair-brown too
  const core = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (k[i] !== 1 || dist(data, i * 4, HAIR) > 30) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (k[i + dy * w + dx] !== 1) { ok = false; break; }
    core[i] = ok ? 1 : 0;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (k[i] !== 1 || core[i]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && core[Y * w + X]) { near = true; break; } }
    if (!near) k[i] = data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11 < 75 ? 4 : 5;
  }
  return k;
}

// 2. the fit: model points in head space (inside / outside the head + neck), scored against the classes
const MODEL = [];
for (let y = -100; y <= 130; y += 4) for (let x = -104; x <= 104; x += 4) {
  const e = Math.hypot(x / R, y / RY), neck = Math.abs(x) < NECK_W / 2 - 2 && y > 0.6 * R && y < 0.6 * R + 34;
  const neckOut = Math.abs(x) < NECK_W / 2 + 4 && y > 0.5 * R;
  if (e < 0.92 || neck) MODEL.push([x, y, 1]);
  else if (e > 1.08 && !neckOut) MODEL.push([x, y, 0]);
}
const IN = [-2, 0.3, 0.3, 1, 0.5, 0.5];      // inside: bg -2, hair / tie +0.3 (it covers the skull), skin +1, lines / eyes +0.5
const OUTS = [0.1, 0, 0, -1, 0, 0];           // outside: bg +0.1, skin -1
function score(k, w, h, s, cx, cy) {
  let t = 0;
  for (const [x, y, inside] of MODEL) {
    const X = Math.round(cx + x * s), Y = Math.round(cy + y * s);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    t += (inside ? IN : OUTS)[k[Y * w + X]];
  }
  return t;
}
function fit(k, w, h, fixedS) {
  let best = { v: -1e9 };
  const ss = fixedS ? [fixedS] : Array.from({ length: 14 }, (_, i) => 0.8 + i * 0.08);
  for (const s of ss) for (let cx = w * 0.2; cx < w * 0.8; cx += 5) for (let cy = h * 0.15; cy < h * 0.75; cy += 5) {
    const v = score(k, w, h, s, cx, cy);
    if (v > best.v) best = { v, s, cx, cy };
  }
  const b0 = best;
  for (let ds = fixedS ? 0 : -0.08; ds <= (fixedS ? 0 : 0.08) + 1e-9; ds += 0.01) for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) {
    const s = b0.s + ds, v = score(k, w, h, s, b0.cx + dx, b0.cy + dy);
    if (v > best.v) best = { v, s, cx: b0.cx + dx, cy: b0.cy + dy };
  }
  return best;
}

// 3. the hair masks
function hairMasks(k, w, h) {
  const hair = new Uint8Array(w * h), tie = new Uint8Array(w * h), ink = new Uint8Array(w * h);
  // ties: cream components ringed by more hair than skin (across their outline: up to TIE_REACH px away); the eye
  // whites are ringed by the skin
  const seen = new Uint8Array(w * h), TIE_REACH = 9;
  for (let i = 0; i < w * h; i++) {
    if (k[i] !== 2 || seen[i]) continue;
    const st = [i], mem = [i]; seen[i] = 1;
    while (st.length) {
      const j = st.pop();
      for (const q of [j - 1, j + 1, j - w, j + w]) if (q >= 0 && q < w * h && !seen[q] && k[q] === 2) { seen[q] = 1; st.push(q); mem.push(q); }
    }
    if (mem.length <= 20) continue;
    let nh = 0, ns = 0;
    for (const j of mem) {
      const x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[TIE_REACH, 0], [-TIE_REACH, 0], [0, TIE_REACH], [0, -TIE_REACH]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const c = k[Y * w + X]; if (c === 1) nh++; else if (c === 3) ns++;
      }
    }
    if (nh > ns) for (const j of mem) tie[j] = 1;
  }
  for (let i = 0; i < w * h; i++) if (k[i] === 1) hair[i] = 1;
  // ink: 8-connected ink components; their pixels within INK_REACH of hair / tie, when the component touches them
  const near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!hair[y * w + x] && !tie[y * w + x]) continue;
    for (let dy = -INK_REACH; dy <= INK_REACH; dy++) for (let dx = -INK_REACH; dx <= INK_REACH; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && dx * dx + dy * dy <= INK_REACH * INK_REACH) near[Y * w + X] = Math.max(near[Y * w + X], dx * dx + dy * dy <= 4 ? 2 : 1);
    }
  }
  const lab = new Int32Array(w * h).fill(-1), touches = [];
  for (let i = 0; i < w * h; i++) {
    if (k[i] !== 4 || lab[i] >= 0) continue;
    const id = touches.length, st = [i]; lab[i] = id; let t = false;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      if (near[j] === 2) t = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy, q = Y * w + X; if (X >= 0 && Y >= 0 && X < w && Y < h && lab[q] < 0 && k[q] === 4) { lab[q] = id; st.push(q); } }
    }
    touches.push(t);
  }
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && touches[lab[i]] && near[i]) ink[i] = 1;
  // the whole hair: its holes closed (not connected to the cell's edge through the rest)
  const all = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) all[i] = hair[i] | tie[i] | ink[i];
  const out = new Uint8Array(w * h), q = [];
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!all[y * w + x]) { out[y * w + x] = 1; q.push(y * w + x); }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!all[y * w + x] && !out[y * w + x]) { out[y * w + x] = 1; q.push(y * w + x); }
  while (q.length) { const j = q.pop(), x = j % w; for (const n of [j - 1, j + 1, j - w, j + w]) { if (n < 0 || n >= w * h || (n === j - 1 && x === 0) || (n === j + 1 && x === w - 1)) continue; if (!all[n] && !out[n]) { out[n] = 1; q.push(n); } } }
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = out[i] ? 0 : 1;
  // (an enclosed hole bigger than an ear is the face or the neck seen through: kept open)
  return { all: filled, tie, ink };
}
function traceMask(m, w, h, toHead, blur = 0.5) {
  const M = 3, w2 = w + 2 * M, h2 = h + 2 * M, f = new Float32Array(w2 * h2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[(y + M) * w2 + x + M] = m[y * w + x];
  const { F, W, H } = OV.upsample(OV.gauss(f, w2, h2, blur), w2, h2);
  return OV.contours(F, W, H, 0.5)
    .map((l) => OV.simplifyLoop(OV.smoothLoop(l.map(([X, Y]) => [(X + 0.5) / OV.UP - M, (Y + 0.5) / OV.UP - M])), 0.18))
    .filter((l) => l.length >= 3 && Math.abs(OV.polyArea(l)) > 2)
    .map((l) => l.map(toHead));
}

// The head's circle from its lower outline (front, 3/4 and side views): rays from the face's middle, down and to the
// sides (clear of the ears and the neck), each ends where the face's skin ends for good (the head's outline: the skin
// then the line, then the background, an ear or the hair); a least-squares circle through those ends, twice (the
// second time from the first circle's center). The back view has no face: see the main loop.
function circleFit(k, w, h) {
  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (k[y * w + x] === 3) { cx += x; cy += y; n++; }
  if (n < 200) return null;
  cx /= n; cy /= n;
  let best = null;
  for (let it = 0; it < 3; it++) {
    const pts = [];
    for (const [a0, a1] of [[20, 68], [112, 160]]) for (let a = a0; a <= a1; a += 2) {
      const dx = Math.cos((a * Math.PI) / 180), dy = Math.sin((a * Math.PI) / 180);
      let last = -1;
      for (let r = 4; r < 260; r++) {
        const X = Math.round(cx + dx * r), Y = Math.round(cy + dy * r);
        if (X < 0 || Y < 0 || X >= w || Y >= h) break;
        if (k[Y * w + X] === 3) last = r;
        else if (last > 0 && r - last > 14) break;
      }
      if (last > 0) pts.push([cx + dx * (last + 2.5), cy + dy * (last + 2.5)]);
    }
    if (pts.length < 10) return best;
    // algebraic circle fit (Kasa): x^2 + y^2 + D x + E y + F = 0
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
    for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z; }
    const m = pts.length, A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, m]], B = [-sxz, -syz, -sz];
    const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const d0 = det(A), col = (i) => A.map((row, r) => row.map((v, c) => (c === i ? B[r] : v)));
    const D = det(col(0)) / d0, E = det(col(1)) / d0, F = det(col(2)) / d0;
    const ncx = -D / 2, ncy = -E / 2, r = Math.sqrt(ncx * ncx + ncy * ncy - F);
    best = { cx: ncx, cy: ncy, r, n: pts.length };
    cx = ncx; cy = ncy;
  }
  return best;
}
// the neck stub: from the cell's bottom up, the opaque run around the stub's middle; returns its middle x, its width and
// the chin (the first row up where that run gets wider than 1.7 x the stub: the head's bottom)
function neckOf(k, w, h) {
  const run = (y, x0) => { x0 = Math.round(x0); if (!k[y * w + x0]) return null; let a = x0, b = x0; while (a > 0 && k[y * w + a - 1]) a--; while (b < w - 1 && k[y * w + b + 1]) b++; return [a, b]; };
  let yb = h - 1;
  while (yb > 0 && !k.subarray(yb * w, yb * w + w).some(Boolean)) yb--;
  let sx = 0, n = 0;
  for (let x = 0; x < w; x++) if (k[(yb - 3) * w + x]) { sx += x; n++; }
  let mid = sx / n;
  const spans = [];
  for (let y = yb - 3; y > yb - 10; y--) { const r = run(y, mid); if (r) { spans.push(r[1] - r[0] + 1); mid = (r[0] + r[1]) / 2; } }
  const nw = spans.sort((p, q) => p - q)[spans.length >> 1];
  let chin = yb;
  for (let y = yb - 3; y > 0; y--) { const r = run(y, mid); if (!r) continue; if (r[1] - r[0] + 1 > nw * 1.7) { chin = y; break; } mid = (r[0] + r[1]) / 2; }
  return { x: mid, w: nw, chin, bottom: yb };
}

if (require.main !== module) module.exports = { classes, fit, score, hairMasks, circleFit };
else (async () => {
  const art = {}, cells = [];
  let sheetScale = null;
  for (const [sheet, styles] of SHEETS) {
    const img = lib.despeck(await lib.key(path.join(SRC, `${sheet}.png`)));
    const { rows } = lib.cellsOf(img, 4, 4, sheet);
    // The head's place in a cell: x over the neck stub (the neck sits under the head's middle in every view), y = the
    // chin minus the head's half height (the back view: its row's median center, a row shares one baseline). The scale:
    // sheet 1 (short hair hugging the head) from the circles through the faces' lower outlines; every other sheet by
    // its neck stubs' width against sheet 1's.
    const cellsN = rows.map((row) => row.map((b) => { const c = lib.crop(img, b), k = classes(c); return { b, c, k, f: circleFit(k, c.w, c.h), neck: neckOf(k, c.w, c.h) }; }));
    const med = (a) => { const q = a.filter((v) => Number.isFinite(v)).sort((p, r) => p - r); return q[q.length >> 1]; };
    const neckW = med(cellsN.flat().map((x) => x.neck.w));
    if (!sheetScale) sheetScale = { S: med(cellsN.map((r) => r[0].f?.r)) / ((R + RY) / 2), neckW };
    const S = sheetScale.S * (neckW / sheetScale.neckW);
    for (const [ri, row] of cellsN.entries()) {
      const style = styles[ri];
      art[style] = {};
      const ys = row.slice(0, 3).map((x) => x.b.y + x.neck.chin - RY * S);
      for (const [vi, cell] of row.entries()) {
        const { c, k, b, neck } = cell;
        // (a chin found off its row's line, long hair touching the neck, takes the row's line)
        const own = b.y + neck.chin - RY * S, my = med(ys);
        const f = { cx: neck.x, cy: (vi === 3 || Math.abs(own - my) > 6 * S ? my : own) - b.y };
        const toHead = ([x, y]) => [(x - f.cx) / S, (y - f.cy) / S];
        const m = hairMasks(k, c.w, c.h);
        const layer = (mask, blur) => traceMask(mask, c.w, c.h, toHead, blur).map(OV.loopD).join('');
        art[style][VIEWS[vi]] = { hair: layer(m.all), tie: m.tie.some(Boolean) ? layer(m.tie) : '', ink: layer(m.ink, 0.35) };
        cells.push({ style, view: VIEWS[vi], c, f: { ...f, s: S } });
      }
      console.log(`${style}: fitted at scale ${S.toFixed(2)}`);
    }
  }
  const js = `// The hairstyles of the human clothes kit (art-source/human-kit/output/hair-*.png), traced by tools/import-hair.js:
// [style][view] = { hair, tie, ink } SVG path data in head space (the head's center at 0,0, radius 70, a profile facing
// right). Generated, do not edit. human.js fills hair with the player's hair color, tie with the hair-tie token and
// ink with the outline.
window.DuelHairArt = ${JSON.stringify(Object.fromEntries(Object.entries(art).filter(([k]) => !DROPPED.has(k))))};
`;
  fs.writeFileSync(OUT, js);
  // contact sheet: each cell with the fitted head ellipse in magenta
  const cw = 300, chh = 260, cols = 4, rowsN = Math.ceil(cells.length / cols);
  const comps = [], marks = [];
  for (const [i, x] of cells.entries()) {
    const k = Math.min((cw - 20) / x.c.w, (chh - 30) / x.c.h, 1.5), left = (i % cols) * cw + 10, top = Math.floor(i / cols) * chh + 20;
    comps.push({ input: await sharp(x.c.data, { raw: { width: x.c.w, height: x.c.h, channels: 4 } }).resize(Math.round(x.c.w * k), Math.round(x.c.h * k)).png().toBuffer(), left, top });
    marks.push(`<ellipse cx="${left + x.f.cx * k}" cy="${top + x.f.cy * k}" rx="${R * x.f.s * k}" ry="${RY * x.f.s * k}" fill="none" stroke="#ff00aa" stroke-width="2"/>`);
    marks.push(`<text x="${left}" y="${top - 6}" font-family="sans-serif" font-size="12">${x.style} ${x.view}</text>`);
  }
  const W = cols * cw, H = rowsN * chh;
  fs.mkdirSync(path.dirname(CONTACT), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#e8e4dc' } })
    .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${marks.join('')}</svg>`), left: 0, top: 0 }])
    .png().toFile(CONTACT);
  console.log(`hair: ${Object.keys(art).length} styles -> ${path.relative(ROOT, OUT)}, ${path.relative(ROOT, CONTACT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
