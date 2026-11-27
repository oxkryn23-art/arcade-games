// The garment textures' neck openings: the kit's sheets were drawn on a mannequin, so the traced textures
// (tools/outfit-vector.js) keep its skin where a collar or a V-neck opens. With the collar band (rig.js neckBand) the
// neck ends at the collar, so that skin is repainted in the garment's main color near the top of the texture.
// The textures are stacked color layers (each color's path covers its own area and the areas painted over it later),
// so the skin layer is not cut: a copy of it in the garment's color, clipped to the top band (NECK_BAND of the
// height), goes right after it, and every later layer still paints over it. A skin-like layer in the garment's own
// color family (the bomber's orange) is left alone.
// node tools/outfit-necks.js rewrites public/art/outfit-*.svg once (it skips a texture it already did);
// tools/import-kit.js calls recolor() on each texture it writes.
const fs = require('fs');
const path = require('path');

const NECK_BAND = 0.26;
const hsl = (h) => {
  const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let hh = 0;
  if (d) { hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, d ? (d / (1 - Math.abs(2 * l - 1))) * 100 : 0, l * 100];
};
const skinLike = (c) => { const [h, s, l] = hsl(c); return h >= 18 && h <= 34 && s >= 45 && l >= 55 && l <= 82; };
const near = (a, b) => {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 40;
};

// recolor(svg, mainHex): the svg with the neck band's skin in the garment's main color ({ svg, layers })
function recolor(svg, main) {
  if (!main || svg.includes('id="nk"')) return { svg, layers: 0 };
  const [W, H] = (svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/) || [0, 300, 384]).slice(1).map(Number);
  let layers = 0;
  let out = svg.replace(/<path([^>]*?) fill="(#[0-9a-fA-F]{6})"([^>]*?)\/>/g, (m, a, fill, b) => {
    const col = fill.toLowerCase();
    if (!skinLike(col) || near(col, main)) return m;
    layers++;
    return `${m}<path${a} fill="${main}"${b} clip-path="url(#nk)"/>`;
  });
  if (layers) out = out.replace('<defs>', `<defs><clipPath id="nk"><rect width="${W}" height="${Math.round(H * NECK_BAND)}"/></clipPath>`);
  return { svg: out, layers };
}

module.exports = { recolor, skinLike, NECK_BAND };

if (require.main === module) {
  const themes = require('../server/themes');
  const T = themes.ALL || themes.LIGHT || themes;
  const dir = path.join(__dirname, '..', 'public', 'art');
  for (const f of fs.readdirSync(dir).filter((n) => /^outfit-.*\.svg$/.test(n))) {
    const id = f.replace(/^outfit-|-(front|three|side|back)\.svg$/g, '');
    const main = (T[`outfit-${id}`] || '').toLowerCase();
    if (!main) continue;
    const r = recolor(fs.readFileSync(path.join(dir, f), 'utf8'), main);
    if (r.layers) { fs.writeFileSync(path.join(dir, f), r.svg); console.log(`${f}: ${r.layers} skin layers -> ${main} at the neck`); }
  }
}
