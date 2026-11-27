// Keying and trimming of the kit's green-screen sheets: the original game's tools/art-v3.js lib (key, trimBox, crop).
// key(): alpha from greenness g' = G - max(R, B) (the artwork has no green in it), g' <= LO fully opaque, g' >= HI the
// background; the color is unmixed from the soft edges (obs = a * F + (1 - a) * green) and the spill clamped.
const sharp = require('sharp');

const LO = 24, HI = 200;
async function key(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const gp = g - Math.max(r, b);
    let a = gp <= LO ? 1 : gp >= HI ? 0 : 1 - (gp - LO) / (HI - LO);
    let fr = r, fg = g, fb = b;
    if (a > 0 && a < 1) { fr = r / a; fg = (g - (1 - a) * 255) / a; fb = b / a; }
    fg = Math.min(fg, Math.max(fr, fb));
    if (a < 0.04) a = 0;
    out[i * 4] = Math.max(0, Math.min(255, Math.round(fr)));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(fg)));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(fb)));
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return { data: out, w, h };
}
// exact trim of a region (alpha > 8), with a little padding
function trimBox(img, box, pad = 2) {
  const { data, w, h } = img;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const X0 = Math.max(0, box.x - 8), Y0 = Math.max(0, box.y - 8), X1 = Math.min(w, box.x + box.w + 8), Y1 = Math.min(h, box.y + box.h + 8);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (data[(y * w + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(img, b) {
  const buf = Buffer.alloc(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) img.data.copy(buf, y * b.w * 4, ((b.y + y) * img.w + b.x) * 4, ((b.y + y) * img.w + b.x + b.w) * 4);
  return { data: buf, w: b.w, h: b.h };
}
module.exports = { key, trimBox, crop };
