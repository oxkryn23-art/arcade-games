// The RPS hand sprites of the human, cut from the hand sheet the way the original game cut its mascots' hands
// (tools/art-v3.js there): node tools/hand-sprites.js
//   art-source/characters/06-hands-gloves.png rows 1 (the back of the hand) and 2 (the palm): ready, rock, paper,
//   scissors, each a forearm stub coming in from the left, the fingers to the right, on a #00FF00 green screen
//   -> public/art/hands/hand-human-<gesture>-<back|palm>.webp (keyed, cut at the wrist: the stub keeps CUT px, the
//      rig fades the first 16 px over the arm) and their entries in public/art/sprites.json:
//      { w, h, ax, ay (the wrist on the cut edge, the stub's middle), wi / wo (the stub's inner / outer half-width:
//        the skin, the skin + the outline), wa (the stub's angle, deg) }
// Needs sharp (not a dependency of the site): `npm i --no-save sharp`, or NODE_PATH pointing at one that has it.
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); } catch { console.error('needs sharp: npm i --no-save sharp'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art-source', 'characters', '06-hands-gloves.png');
const OUT = path.join(ROOT, 'public', 'art', 'hands');
const TABLE = path.join(ROOT, 'public', 'art', 'sprites.json');
const GESTURES = ['ready', 'rock', 'paper', 'scissors'];
const SIDES = ['back', 'palm'];
const CUT = 34;   // px of forearm kept before the hand

(async () => {
  const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  // key: green -> transparent (a soft edge), the spill taken out
  const rgba = Buffer.alloc(W * H * 4);
  const skinLike = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2], spill = g - Math.max(r, b);
    const a = spill > 120 ? 0 : spill < 40 ? 255 : Math.round(255 * (120 - spill) / 80);
    rgba[i * 4] = r; rgba[i * 4 + 1] = a < 255 ? Math.min(g, Math.max(r, b)) : g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
    skinLike[i] = a > 200 && r > 150 ? 1 : 0;   // the skin (light), not the dark outline
  }
  const solid = (x, y) => rgba[(y * W + x) * 4 + 3] > 128;
  const bands = (n, has, minGap) => {
    const out = []; let start = -1, gap = 0;
    for (let i = 0; i < n; i++) {
      if (has(i)) { if (start < 0) start = i; gap = 0; } else if (start >= 0 && ++gap >= minGap) { out.push([start, i - gap]); start = -1; gap = 0; }
    }
    if (start >= 0) out.push([start, n - 1]);
    return out;
  };
  const rows = bands(H, (y) => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; }, 10).filter(([a, b]) => b - a > 60);
  if (rows.length !== 3) throw new Error(`06: ${rows.length} rows`);
  fs.mkdirSync(OUT, { recursive: true });
  const table = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : {};
  for (const [ri, side] of SIDES.entries()) {
    const [y0, y1] = rows[ri];
    const cols = bands(W, (x) => { for (let y = y0; y <= y1; y++) if (solid(x, y)) return true; return false; }, 8).filter(([a, b]) => b - a > 60);
    if (cols.length !== 4) throw new Error(`06 row ${ri + 1}: ${cols.length} hands`);
    for (const [ci, [x0, x1]] of cols.entries()) {
      // the stub: its outer and skin spans at a column a little in from its start
      const span = (x, test) => { let a = -1, b = -1; for (let y = y0; y <= y1; y++) if (test(x, y)) { if (a < 0) a = y; b = y; } return [a, b]; };
      const sx = x0 + 6, [o0, o1] = span(sx, solid), [i0, i1] = span(sx, (x, y) => skinLike[y * W + x]);
      const thick = o1 - o0;
      // the wrist: where the drawing gets 18% thicker than the stub
      let wx = sx;
      for (let x = sx; x < x1; x++) { const [a, b] = span(x, solid); if (b - a > thick * 1.18) { wx = x; break; } }
      const cx0 = Math.max(x0, wx - CUT);
      let t = y1, bt = y0;
      for (let y = y0; y <= y1; y++) for (let x = cx0; x <= x1; x++) if (solid(x, y)) { if (y < t) t = y; if (y > bt) bt = y; }
      const pad = 3, top = Math.max(0, t - pad), w = x1 + pad - cx0 + 1, h = Math.min(H - 1, bt + pad) - top + 1;
      const buf = Buffer.alloc(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sxx = cx0 + x, syy = top + y;
        if (sxx >= W) continue;
        rgba.copy(buf, (y * w + x) * 4, (syy * W + sxx) * 4, (syy * W + sxx) * 4 + 4);
      }
      const name = `hand-human-${GESTURES[ci]}-${side}`;
      await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92, alphaQuality: 95, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
      const r1 = (v) => Math.round(v * 10) / 10;
      table[name] = { w, h, ax: 0, ay: r1((o0 + o1) / 2 - top), wi: r1((i1 - i0 + 1) / 2), wo: r1((thick + 1) / 2), wa: 0 };
    }
  }
  fs.writeFileSync(TABLE, JSON.stringify(table));
  console.log(`wrote ${Object.keys(table).filter((k) => k.startsWith('hand-human')).length} hand sprites to public/art/hands/ and their wrists to public/art/sprites.json`);
})().catch((e) => { console.error(e); process.exit(1); });
