// Traces the cartoon hand drawings (one PNG/WebP per gesture: the back of a hand, the wrist stub on the left, the
// fingers to the right, a dark outline, transparent around) into vector shapes for the rig:
//   node tools/trace-hands.js <dir with hand-<name>-back.webp> <sprites.json with their wrist anchors>
// writes public/js/figures/hand-shapes.js (window.DuelHandShapes). The site stays raster-free: the hands are paths,
// filled with the character's skin token and outlined in the outline token at the rig's own outline weight.
//
// Per gesture: sil = the whole silhouette (drawn in the outline color and stroked a little wider, so the outline is as
// thick as the rest of the rig), skin = the light areas inside it (the skin; the gaps between them are the creases),
// open = the silhouette's outline WITHOUT the straight cut across the wrist (the stroke must not draw a line where the
// arm joins), wo / wi = the outer / inner half-width of the wrist stub, mid / r = the middle of the hand along the arm
// and its radius (scenes aim effects at it). Hand frame: the wrist at the origin, the fingers toward -y, the thumb
// toward -x (the drawing's top), units = character units for a hand on an arm 15 units thick.
// Needs sharp (`npm i --no-save sharp`, it is not a dependency of the site).
const fs = require('fs');
const path = require('path');

const [dir, spritesJson] = process.argv.slice(2);
if (!dir || !spritesJson) { console.error('usage: node tools/trace-hands.js <sprite dir> <sprites.json>'); process.exit(1); }
let sharp;
try { sharp = require('sharp'); } catch { sharp = require(require.resolve('sharp', { paths: [path.dirname(path.resolve(spritesJson)), dir, process.cwd()] })); }
const SPRITES = JSON.parse(fs.readFileSync(spritesJson, 'utf8'));
const OUT = path.join(__dirname, '..', 'public', 'js', 'figures', 'hand-shapes.js');

const GESTURES = { rock: 'rock', ready: 'ready', paper: 'paper', scissors: 'scissors' };
const ARM_OUTER = 15 / 2 + 4;   // the rig's arm: half its width + the outline

// ---- marching squares on a scalar field (iso line, linear interpolation), chained into closed polylines ----
function contours(field, w, h, iso) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : field[y * w + x]);
  const segs = [];
  const lerp = (a, b, va, vb) => a + (b - a) * ((iso - va) / (vb - va));
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const v0 = at(x, y), v1 = at(x + 1, y), v2 = at(x + 1, y + 1), v3 = at(x, y + 1);
      const c = (v0 >= iso ? 8 : 0) | (v1 >= iso ? 4 : 0) | (v2 >= iso ? 2 : 0) | (v3 >= iso ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = [lerp(x, x + 1, v0, v1), y], R = [x + 1, lerp(y, y + 1, v1, v2)];
      const B = [lerp(x, x + 1, v3, v2), y + 1], L = [x, lerp(y, y + 1, v0, v3)];
      const add = (a, b) => segs.push([a, b]);
      switch (c) {
        case 1: add(L, B); break; case 2: add(B, R); break; case 3: add(L, R); break; case 4: add(T, R); break;
        case 5: add(L, T); add(B, R); break; case 6: add(T, B); break; case 7: add(L, T); break; case 8: add(T, L); break;
        case 9: add(T, B); break; case 10: add(T, R); add(L, B); break; case 11: add(T, R); break; case 12: add(L, R); break;
        case 13: add(B, R); break; case 14: add(L, B); break; default: break;
      }
    }
  }
  const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
  const byStart = new Map();
  for (const s of segs) { const k = key(s[0]); if (!byStart.has(k)) byStart.set(k, []); byStart.get(k).push(s); }
  const ends = new Map();
  for (const s of segs) { const k = key(s[1]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(s); }
  const used = new Set(), out = [];
  for (const s of segs) {
    if (used.has(s)) continue;
    const line = [s[0], s[1]]; used.add(s);
    let grew = true;
    while (grew) {
      grew = false;
      const k = key(line[line.length - 1]);
      for (const n of [...(byStart.get(k) || []), ...(ends.get(k) || [])]) {
        if (used.has(n)) continue;
        used.add(n); line.push(key(n[0]) === k ? n[1] : n[0]); grew = true; break;
      }
    }
    if (line.length > 8) out.push(line);
  }
  return out;
}
// Ramer-Douglas-Peucker on a closed polyline
function simplify(pts, eps) {
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
// a smooth closed (or open) path through the points: Catmull-Rom as cubic Beziers
function smoothPath(pts, closed = true) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), k = 1 / 6;
    d += `C${r1(p1[0] + (p2[0] - p0[0]) * k)} ${r1(p1[1] + (p2[1] - p0[1]) * k)} ${r1(p2[0] - (p3[0] - p1[0]) * k)} ${r1(p2[1] - (p3[1] - p1[1]) * k)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

async function trace(name) {
  const file = path.join(dir, `hand-monkey-${name}-back.webp`);
  const meta = SPRITES[`hand-monkey-${name}-back`];
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const alpha = new Float32Array(w * h), light = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3], L = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    alpha[i] = a;
    light[i] = a < 128 ? 0 : L;
  }
  // the scale: the wrist stub's outer half-width becomes the arm's
  const s = ARM_OUTER / meta.wo;
  // sprite (x right = along the arm, y down) -> hand frame (fingers toward -y, the drawing's top toward -x)
  const map = ([x, y]) => [(y - meta.ay) * s, -(x - meta.ax) * s];
  const toPaths = (field, iso, eps, minArea) => contours(field, w, h, iso)
    .map((c) => simplify(c, eps)).filter((c) => c.length > 3 && Math.abs(area(c)) > minArea);
  const sil = toPaths(alpha, 128, 0.6, 40).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0];
  const skins = toPaths(light, 120, 0.6, 12);
  // the silhouette's outline minus the wrist cut: rotate it to start just after the cut and stop just before it
  const onCut = (p) => p[0] < 1.5;
  let start = sil.findIndex((p, i) => onCut(sil[(i - 1 + sil.length) % sil.length]) && !onCut(p));
  if (start < 0) start = 0;
  const ring = [...sil.slice(start), ...sil.slice(0, start)];
  const openPts = ring.slice(0, ring.findIndex((p, i) => i > 0 && onCut(p)) + 0 || ring.length);
  let minY = 0, maxY = 0, minX = 0, maxX = 0;
  for (const p of sil.map(map)) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const len = -minY, mid = r1(len * 0.55), r = r1(Math.max(maxX - minX, len) / 2);
  return {
    sil: smoothPath(sil.map(map)),
    skin: skins.map((c) => smoothPath(c.map(map))).join(''),
    open: smoothPath(openPts.map(map), false),
    wo: r1(meta.wo * s), wi: r1(meta.wi * s), mid, r,
    box: [r1(minX), r1(minY), r1(maxX - minX), r1(maxY - minY)],
  };
}

(async () => {
  const shapes = {};
  for (const [id, name] of Object.entries(GESTURES)) shapes[id] = await trace(name);
  const body = `// Generated by tools/trace-hands.js from the cartoon hand drawings (the back of a hand per gesture). Do not edit.
// Hand frame: the wrist at the origin, the fingers toward -y, the thumb toward -x; character units.
window.DuelHandShapes = ${JSON.stringify(shapes, null, 1)};
`;
  fs.writeFileSync(OUT, body);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${Object.keys(shapes).join(', ')} (${Math.round(body.length / 1024)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
