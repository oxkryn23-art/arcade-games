// The collars of the sprite shoes (the original game's tools/shoe-collars.js, ported for the human kit): where the leg
// goes INTO each shoe sprite (public/art/shoe-<id>-<view>-<l|r>.webp).
// The rig (rig.js drawFoot / apply) draws the leg's end once more OVER the shoe, clipped to the area above the collar's
// front lip, so the leg covers the shoe's back rim and its dark opening and disappears behind the front lip (no empty
// opening, no shoe layered over the leg, no double outline). Per sprite: [cx, top, rx, lip] in sprite px:
//   cx  = the middle of the shaft's top (the opening's center line),
//   top = the top of the shaft at its middle (the back rim; narrow tabs above it are skipped),
//   rx  = the half width of the shaft's top,
//   lip = the lowest point of the front lip (the leg is cut along the lower half of an ellipse from top to lip);
//   lip = top - 1 means "no opening shows in this view" (the leg stays behind the shoe: a tongue, a front strap, a
//   closed back). The lip is measured (the last outline run crossed going down the middle of the collar) and then set
//   per item and view in DEPTH (as a share of rx) where the art needs it; checked on the contact sheet
//   art-source/human-kit/contact/shoe-collars.png (each sprite with the leg's clip region tinted and the lip curve drawn).
// Writes the generated COLLARS block of public/js/mascots/cosmetics.js.
// Run: node tools/shoe-collars.js (after node tools/import-kit.js, when the shoe sprites change). `-- --sheet-only` keeps the COLLARS
// block as it is and only redraws the contact sheet from it (round 34: the sprites were re-encoded with the same geometry;
// a new measurement moved some measured lips by up to 14 px only through the encoding, so the reviewed table was kept).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'art');
const COSMETICS_JS = path.join(ROOT, 'public', 'js', 'mascots', 'cosmetics.js');
const CONTACT = path.join(ROOT, 'art-source', 'human-kit', 'contact', 'shoe-collars.png');
const VIEWS = ['front', 'three', 'side', 'back'];
// The lip depth per item and view as a share of rx (the art's opening, read on the contact sheet); 0 = no opening
// shows (the leg stays behind the shoe). Missing = the measured lip.
const DEPTH = {
  sneakers: { back: 0.4 }, hightops: {}, loafers: { three: 0.45, side: 0.35 }, chelsea: { front: 0.3, three: 0.35, side: 0.35, back: 0.3 }, runners: {},
  cleats: { front: 0.35, three: 0.35, side: 0.35, back: 0.35 }, rainboots: {}, slippers: {},
  skate: { front: 0.4, three: 0.35, side: 0.35 },
};

const r1 = (n) => Math.round(n * 10) / 10;

// The sprites are published at a density (tools/import-kit.js DENSITY: the file has 2 x the logical px of sprites.json):
// measured on the sprite brought back to its logical size (w0 x h0, lanczos3), the scale the thresholds and DEPTH were
// tuned at, so the collars stay where they were.
async function measure(file, ax, w0, h0) {
  const { data, info } = await sharp(file).ensureAlpha().resize(w0, h0, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const A = (x, y) => data[(y * W + x) * 4 + 3];
  const L = (x, y) => { const i = (y * W + x) * 4; return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11; };
  const run = (y, x0) => {
    const x = Math.round(x0);
    if (x < 0 || x >= W || A(x, y) < 128) return null;
    let l = x, r = x;
    while (l > 0 && A(l - 1, y) >= 128) l--;
    while (r < W - 1 && A(r + 1, y) >= 128) r++;
    return [l, r];
  };
  let maxRun = 0;
  for (let y = 0; y < H * 0.5; y++) { const s = run(y, ax); if (s) maxRun = Math.max(maxRun, s[1] - s[0] + 1); }
  let top = 0;
  for (; top < H * 0.5; top++) { const s = run(top, ax); if (s && s[1] - s[0] + 1 >= maxRun * 0.55) break; }
  const s = run(Math.min(H - 1, top + 4), ax) || [ax - 10, ax + 10];
  const cx = (s[0] + s[1]) / 2, rx = (s[1] - s[0]) / 2;
  // the lip: the end of the last dark (outline) run that starts within 0.8 rx under the top, down the middle
  const xs = [-0.15, 0, 0.15].map((k) => Math.round(cx + k * rx));
  let lip = top;
  for (const x of xs) {
    let y = top, last = top;
    while (y < Math.min(H, top + rx * 0.8)) {
      if (A(x, y) >= 128 && L(x, y) < 70) { while (y < H && A(x, y) >= 128 && L(x, y) < 70) y++; last = y; } else y++;
    }
    lip = Math.max(lip, last);
  }
  return { W, H, cx, top, rx, lip };
}

const SHEET_ONLY = process.argv.includes('--sheet-only');
// the COLLARS block now in cosmetics.js: { 'id-view-foot': [cx, top, rx, lip] }
function currentCollars() {
  const js = fs.readFileSync(COSMETICS_JS, 'utf8'), b = js.slice(js.indexOf('const COLLARS'), js.indexOf('// END COLLARS')), o = {};
  for (const m of b.matchAll(/^ {4}([a-z]+): \{(.*)\},$/gm)) for (const v of m[2].matchAll(/([a-z]+):\{l:\[([^\]]*)\],r:\[([^\]]*)\]\}/g)) {
    o[`${m[1]}-${v[1]}-l`] = v[2].split(',').map(Number); o[`${m[1]}-${v[1]}-r`] = v[3].split(',').map(Number);
  }
  return o;
}

async function main() {
  const kept = SHEET_ONLY ? currentCollars() : null;
  const sprites = JSON.parse(fs.readFileSync(path.join(ASSETS, 'sprites.json'), 'utf8'));
  fs.mkdirSync(path.dirname(CONTACT), { recursive: true });
  const table = {};
  const cells = [];
  for (const [name, s] of Object.entries(sprites)) {
    const m = /^shoe-([a-z]+)-(front|three|side|back)-(l|r)$/.exec(name);
    if (!m) continue;
    const [, id, view, foot] = m;
    const me = await measure(path.join(ASSETS, `${name}.webp`), s.ax, s.w, s.h);
    const d = DEPTH[id]?.[view];
    const lip = d === 0 ? me.top - 1 : d != null ? me.top + d * me.rx : me.lip;
    ((table[id] = table[id] || {})[view] = table[id][view] || {})[foot] = [r1(me.cx), r1(me.top), r1(me.rx), r1(lip)];
    const k = kept?.[`${id}-${view}-${foot}`];
    if (kept && !k) throw new Error(`--sheet-only: no COLLARS entry for ${name}`);
    if (foot === 'l') cells.push(k ? { name, file: path.join(ASSETS, `${name}.webp`), w: me.W, h: me.H, cx: k[0], top: k[1], rx: k[2], lip: k[3] } : { name, file: path.join(ASSETS, `${name}.webp`), w: me.W, h: me.H, cx: me.cx, top: me.top, rx: me.rx, lip });
  }
  // the generated block
  const ordered = {};
  for (const id of Object.keys(DEPTH)) if (table[id]) ordered[id] = Object.fromEntries(VIEWS.map((v) => [v, table[id][v]]));
  const body = Object.entries(ordered).map(([id, vs]) => `    ${id}: {${VIEWS.map((v) => `${v}:{l:[${vs[v].l.join(',')}],r:[${vs[v].r.join(',')}]}`).join(',')}},`).join('\n');
  const marker = '  // BEGIN COLLARS (generated by tools/shoe-collars.js: per shoe, view and foot [cx, top, rx, lip] in sprite px; do not edit)\n';
  const block = `${marker}  const COLLARS = {\n${body}\n  };\n  // END COLLARS\n`;
  let js = fs.readFileSync(COSMETICS_JS, 'utf8');
  const a = js.indexOf(marker), b = js.indexOf('  // END COLLARS\n');
  if (a >= 0 && b > a) js = js.slice(0, a) + block + js.slice(b + '  // END COLLARS\n'.length);
  else {
    const at = js.indexOf('  // END SPRITES\n');
    if (at < 0) throw new Error('cosmetics.js: no END SPRITES marker');
    const end = at + '  // END SPRITES\n'.length;
    js = js.slice(0, end) + block + js.slice(end);
  }
  if (!SHEET_ONLY) fs.writeFileSync(COSMETICS_JS, js);
  // the contact sheet: each left sprite at 2x, the leg's clip region tinted, the lip curve, the top line
  const K = 2, CW = 280, CH = 360, cols = 8;
  const rows = Math.ceil(cells.length / cols);
  const comps = [];
  const marks = [];
  for (const [i, c] of cells.entries()) {
    const x0 = (i % cols) * CW, y0 = Math.floor(i / cols) * CH;
    const left = x0 + Math.round((CW - c.w * K) / 2), top = y0 + 20;
    comps.push({ input: await sharp(c.file).resize(Math.round(c.w * K), Math.round(c.h * K), { kernel: 'lanczos3' }).png().toBuffer(), left, top });
    const X = (u) => left + u * K, Y = (v) => top + v * K;
    if (c.lip >= c.top) {
      const ry = Math.max(0.5, (c.lip - c.top) / 2), cy = c.top + ry, pad = 8;
      const d = `M${X(c.cx - c.rx - pad)} ${Y(c.top - 30)}L${X(c.cx + c.rx + pad)} ${Y(c.top - 30)}L${X(c.cx + c.rx + pad)} ${Y(cy)}L${X(c.cx + c.rx)} ${Y(cy)}`
        + `A${c.rx * K} ${ry * K} 0 0 1 ${X(c.cx - c.rx)} ${Y(cy)}L${X(c.cx - c.rx - pad)} ${Y(cy)}Z`;
      marks.push(`<path d="${d}" fill="#00a0ff" fill-opacity="0.35" stroke="#00a0ff" stroke-width="2"/>`);
    } else marks.push(`<line x1="${X(c.cx - c.rx)}" y1="${Y(c.top)}" x2="${X(c.cx + c.rx)}" y2="${Y(c.top)}" stroke="#ff2050" stroke-width="3"/>`);
    marks.push(`<text x="${x0 + CW / 2}" y="${y0 + 14}" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#111">${c.name.replace(/^shoe-/, '')}</text>`);
  }
  const SW = cols * CW, SH = rows * CH;
  await sharp({ create: { width: SW, height: SH, channels: 4, background: '#e8e4dc' } })
    .composite([...comps, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">${marks.join('')}</svg>`), left: 0, top: 0 }])
    .png().toFile(CONTACT);
  console.log(`shoe collars: ${Object.keys(ordered).length} shoes${SHEET_ONLY ? ' (the COLLARS block kept)' : ' -> cosmetics.js COLLARS'}, ${path.relative(ROOT, CONTACT)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
