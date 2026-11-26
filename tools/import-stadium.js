// Imports the Penalty stadium and its fans from the ChatGPT sheets (art-source/characters/07-stadium.png and
// 08-fans.png): node tools/import-stadium.js
//   public/art/penalty-stadium.webp  the stadium, the sheet's middle 16:9 (the grey bars at the top and the bottom cut
//                                    off), 1600 x 900: the goal and the seat grid sit where art-penalty.js A.pen says
//   public/art/fans/<pose>-<n>.webp  the ten fans (n = 1..10) seated, cheering and disappointed (pose sit / cheer / sad),
//                                    the green keyed out, trimmed
//   public/js/scenes/art-fans.js     registers them as scene elements (el-fan-sit-n, el-fan-back-n, el-fan-cheer-n,
//                                    el-fan-sad-n; the anchor = the feet, the bottom middle)
// Needs sharp (not a dependency of the site): `npm i --no-save sharp`, or NODE_PATH pointing at one that has it.
const fs = require('fs');
const path = require('path');

let sharp;
try { sharp = require('sharp'); } catch { console.error('needs sharp: npm i --no-save sharp'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'art-source', 'characters');
const ART = path.join(ROOT, 'public', 'art');
const FANS = path.join(ART, 'fans');
const POSES = ['sit', 'cheer', 'sad'];
// the fans' element units: a seated fan is 203 units tall (the size penalty.js places them at)
const SIT_UNITS = 203;
// the fan files are stored at FAN_K x the sheet's pixels (a fan is about 70 px tall in the 1600-wide scene, so this is
// still sharp on a 2x screen)
const FAN_K = 0.62;

async function stadium() {
  const img = sharp(path.join(SRC, '07-stadium.png'));
  const { width, height } = await img.metadata();
  const h = Math.round((width * 9) / 16), top = Math.round((height - h) / 2);
  const file = path.join(ART, 'penalty-stadium.webp');
  await img.extract({ left: 0, top, width, height: h }).resize(1600, 900, { kernel: 'lanczos3' }).webp({ quality: 82, effort: 6 }).toFile(file);
  return `stadium: rows ${top}..${top + h} of ${width} x ${height} -> 1600 x 900 (${Math.round(fs.statSync(file).size / 1024)} KB)`;
}

// green screen -> alpha (a soft edge), the green spill on the edge taken out
function key(data, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const spill = g - Math.max(r, b);
    const a = spill > 120 ? 0 : spill < 40 ? 255 : Math.round(255 * (120 - spill) / 80);
    out[i * 4] = r; out[i * 4 + 1] = a < 255 ? Math.min(g, Math.max(r, b)) : g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
    if (a < 255) out[i * 4 + 1] = Math.min(g, Math.max(r, b));
  }
  return out;
}

async function fans() {
  const { data, info } = await sharp(path.join(SRC, '08-fans.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const rgba = key(data, W, H);
  const solid = (x, y) => rgba[(y * W + x) * 4 + 3] > 128;
  // the rows: bands of rows with drawn pixels; the fans in a row: bands of columns with drawn pixels
  const rowHas = (y) => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; };
  const bands = (n, has, minGap) => {
    const out = []; let start = -1, gap = 0;
    for (let i = 0; i < n; i++) {
      if (has(i)) { if (start < 0) start = i; gap = 0; }
      else if (start >= 0 && ++gap >= minGap) { out.push([start, i - gap]); start = -1; gap = 0; }
    }
    if (start >= 0) out.push([start, n - 1]);
    return out;
  };
  const rows = bands(H, rowHas, 12).filter(([a, b]) => b - a > 60);
  if (rows.length !== 3) throw new Error(`08: ${rows.length} rows of fans`);
  fs.mkdirSync(FANS, { recursive: true });
  const sizes = {};
  for (const [ri, [y0, y1]] of rows.entries()) {
    const colHas = (x) => { for (let y = y0; y <= y1; y++) if (solid(x, y)) return true; return false; };
    const cols = bands(W, colHas, 6).filter(([a, b]) => b - a > 30);
    if (cols.length !== 10) throw new Error(`08 row ${ri + 1}: ${cols.length} fans`);
    sizes[POSES[ri]] = [];
    for (const [ci, [x0, x1]] of cols.entries()) {
      // the fan's own rows inside the band
      let t = y1, b = y0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) { if (y < t) t = y; if (y > b) b = y; }
      const pad = 3, cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, t - pad), cw = Math.min(W - 1, x1 + pad) - cx0 + 1, ch = Math.min(H - 1, b + pad) - cy0 + 1;
      const buf = Buffer.alloc(cw * ch * 4);
      for (let y = 0; y < ch; y++) rgba.copy(buf, y * cw * 4, ((cy0 + y) * W + cx0) * 4, ((cy0 + y) * W + cx0 + cw) * 4);
      const w = Math.round(cw * FAN_K), h = Math.round(ch * FAN_K);
      await sharp(buf, { raw: { width: cw, height: ch, channels: 4 } }).resize(w, h, { kernel: 'lanczos3' })
        .webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(path.join(FANS, `${POSES[ri]}-${ci + 1}.webp`));
      sizes[POSES[ri]].push([cw, ch]);
    }
  }
  // element units: the seated fans' mean height is SIT_UNITS
  const k = SIT_UNITS / (sizes.sit.reduce((s, [, h]) => s + h, 0) / sizes.sit.length);
  const els = {};
  for (const pose of POSES) els[pose] = sizes[pose].map(([w, h]) => [Math.round(w * k), Math.round(h * k)]);
  const js = `// Generated by tools/import-stadium.js from art-source/characters/08-fans.png. Do not edit.
// The Penalty fans (public/art/fans/<pose>-<n>.webp, n = 1..10) as scene elements: el-fan-sit-n (seated),
// el-fan-back-n (the same, smaller, for the back row), el-fan-cheer-n (standing, the scarf overhead) and el-fan-sad-n
// (seated, hands on the head); [w, h] in element units, the anchor at the feet (the bottom middle).
(function () {
  const A = window.DuelArt;
  if (!A) return;
  const base = new URL('../../art/fans/', document.currentScript ? document.currentScript.src : location.href).href;
  const SIZES = ${JSON.stringify(els)};
  const BACK_K = 174 / 203;
  const img = (K, pose, n, w, h) => K.el('image', { href: \`\${base}\${pose}-\${n}.webp\`, width: w, height: h, preserveAspectRatio: 'none' });
  for (const [pose, list] of Object.entries(SIZES)) {
    list.forEach(([w, h], i) => {
      const n = i + 1;
      A.add(\`el-fan-\${pose}-\${n}\`, w, h, w / 2, h, (K) => img(K, pose, n, w, h));
      if (pose === 'sit') {
        const bw = Math.round(w * BACK_K), bh = Math.round(h * BACK_K);
        A.add(\`el-fan-back-\${n}\`, bw, bh, bw / 2, bh, (K) => img(K, pose, n, bw, bh));
      }
    });
  }
  A.fans = { looks: SIZES.sit.length };
})();
`;
  fs.writeFileSync(path.join(ROOT, 'public', 'js', 'scenes', 'art-fans.js'), js);
  const total = fs.readdirSync(FANS).reduce((s, f) => s + fs.statSync(path.join(FANS, f)).size, 0);
  return `fans: 3 x 10 -> public/art/fans/ (${Math.round(total / 1024)} KB), element scale ${k.toFixed(3)}`;
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  console.log(await stadium());
  console.log(await fans());
})().catch((e) => { console.error(e); process.exit(1); });
