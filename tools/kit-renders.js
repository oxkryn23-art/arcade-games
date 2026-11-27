// The human kit's reference images (art-source/human-kit/references/), drawn by the game's own rig in headless
// Chrome, as the original game's cosmetics kit did for its mascots (marketing/cosmetics-kit there):
//   people/bare-human.png       the human in the 4 views (front, 3/4 right, side right, back), no outfit, natural feet
//   people/torso-shapes.png     only the body egg per view: the exact shape a garment covers
//   people/head-shapes.png      only the bald head with its ears and the neck per view: where hair and a hat sit
//   people/feet-shapes.png      only the legs and the natural feet per view: what a shoe replaces
//   current/outfits.png         the current T-shirt in the 4 views (three shirt colors)
//   current/hair.png            the current 8 hairstyles in the 4 views (heads only)
//   current/people.png          four players in the 4 views (skin tones, hair, shirts): the level of detail
//   palette.png + palette.md    the character and scene tokens with their hex (server/themes.js)
// Needs the server running with DEV_MODE=true (the scene lab) and a local Chrome or Edge:
//   BASE_URL=http://localhost:3000 node tools/kit-renders.js
const fs = require('fs');
const path = require('path');
const { launch } = require('./cdp');
const themes = require('../server/themes');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'art-source', 'human-kit', 'references');
const VIEWS = [{ turn: 0 }, { turn: 0.55 }, { turn: 1 }, { back: 1 }];

// one sheet: rows of cells, each cell = { look, pose, part } drawn at one scale on a cream background
const SHEETS = {
  'people/bare-human': { rows: [VIEWS.map((v) => ({ look: { hair: 'bald', outfit: 'none' }, pose: v }))] },
  'people/torso-shapes': { rows: [VIEWS.map((v) => ({ look: { hair: 'bald', outfit: 'none' }, pose: v, part: 'body' }))] },
  'people/head-shapes': { rows: [VIEWS.map((v) => ({ look: { hair: 'bald', outfit: 'none' }, pose: v, part: 'head' }))] },
  'people/feet-shapes': { rows: [VIEWS.map((v) => ({ look: { hair: 'bald', outfit: 'none' }, pose: v, part: 'legs' }))] },
  'current/outfits': { rows: ['shirt-1', 'shirt-2', 'shirt-4'].map((shirt) => VIEWS.map((v) => ({ look: { hair: 'short', shirt }, pose: v }))) },
  'current/hair': { rows: [['short', 'crop', 'buzz', 'spiky'], ['curly', 'long', 'bun', 'ponytail']].flatMap((styles) => styles.map((hair) => VIEWS.map((v) => ({ look: { hair, outfit: 'none' }, pose: v, part: 'head' })))) },
  'current/people': {
    rows: [
      { skin: 'skin-1', hair: 'long', hairColor: 'hair-4', shirt: 'shirt-1' },
      { skin: 'skin-3', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-2' },
      { skin: 'skin-4', hair: 'curly', hairColor: 'hair-1', shirt: 'shirt-6' },
      { skin: 'skin-5', hair: 'bun', hairColor: 'hair-1', shirt: 'shirt-4' },
    ].map((look) => VIEWS.map((v) => ({ look, pose: v }))),
  },
};

const page = (sheets) => `(async () => {
  const M = window.VersoMascots, K = window.DuelKit;
  const out = {};
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:var(--ui-cream, #FFF9F0)';
  for (const [name, sheet] of Object.entries(${JSON.stringify(sheets)})) {
    const rows = sheet.rows.length, cols = sheet.rows[0].length;
    const head = sheet.rows[0][0].part === 'head';
    // a cell: 300 x 440 character units (a head cell: 300 x 300 around the head)
    const cw = 300, ch = head ? 300 : 440;
    const svg = K.el('svg', { viewBox: \`0 0 \${cols * cw} \${rows * ch}\`, width: cols * cw, height: rows * ch, style: 'display:block;background:#FFF9F0' });
    document.body.innerHTML = '';
    document.body.append(svg);
    sheet.rows.forEach((row, ri) => row.forEach((cell, ci) => {
      const r = M.create({ species: 'human', idle: false, hat: false, pose: { ...cell.pose }, loadout: { skin: 'skin-3', hairColor: 'hair-2', shirt: 'shirt-1', feet: 'natural', hat: 'none', outfit: 'tee', ...cell.look } });
      r.face('neutral', true);
      r.apply(r.cur, performance.now());
      const n = r.n;
      if (cell.part === 'body') { for (const k of ['shadow', 'legs', 'head', 'armBack', 'armMid', 'armFront']) n[k].remove(); }
      if (cell.part === 'legs') { for (const k of ['shadow', 'body', 'head', 'armBack', 'armMid', 'armFront']) n[k].remove(); }
      if (cell.part === 'head') { for (const k of ['shadow', 'legs', 'body', 'armBack', 'armMid', 'armFront']) n[k].remove(); }
      const y = head ? ri * ch + 300 + 140 : ri * ch + 410;
      r.place(ci * cw + cw / 2, y, 1);
      svg.append(r.root);
      r.destroy();
    }));
    await new Promise((res) => setTimeout(res, 150));
    out[name] = { w: cols * cw, h: rows * ch };
    window.__shots = window.__shots || [];
    window.__shots.push(name);
  }
  return out;
})()`;

(async () => {
  for (const d of ['people', 'current']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const b = await launch({ width: 1200, height: 1800, scale: 2 });
  try {
    for (const [name, sheet] of Object.entries(SHEETS)) {
      await b.go(`${BASE}/dev/lab`, 1500);
      const size = await b.js(page({ [name]: sheet }));
      const { w, h } = size[name];
      await b.size(w, h);
      await b.sleep(300);
      await b.shot(path.join(OUT, `${name}.png`), { clip: { x: 0, y: 0, width: w, height: h } });
      console.log('saved', name);
    }
  } finally { await b.close(); }
  // the palette: the character and scene tokens with their hex
  const T = themes.ALL || {};
  const keep = Object.entries(T).filter(([k]) => /^(outline|skin-|hair-|shirt-|pants|shoe|eye|mouth|tongue|cheek|glove|wood|gunmetal|ball|pen-|rps-|sho-)/.test(k));
  const md = ['# Palette', '', 'The game\'s colors (server/themes.js). Draw the clothes in these first; a new color is fine when an item needs it.', '', '| Token | Hex |', '|---|---|', ...keep.map(([k, v]) => `| \`${k}\` | \`${v}\` |`)].join('\n');
  fs.writeFileSync(path.join(OUT, 'palette.md'), `${md}\n`);
  const sw = keep.filter(([k]) => /^(outline|skin-|hair-|shirt-|pants|shoe|eye|mouth|cheek|glove)/.test(k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${6 * 200}" height="${Math.ceil(sw.length / 6) * 120}"><rect width="100%" height="100%" fill="#FFF9F0"/>${sw.map(([k, v], i) => `<g transform="translate(${(i % 6) * 200 + 20} ${Math.floor(i / 6) * 120 + 14})"><rect width="160" height="64" rx="10" fill="${v}" stroke="#232A35" stroke-width="3"/><text x="0" y="90" font-family="Arial" font-size="18" fill="#232A35">${k} ${v}</text></g>`).join('')}</svg>`;
  const b2 = await launch({ width: 1200, height: Math.ceil(sw.length / 6) * 120 });
  try {
    await b2.go(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, 500);
    await b2.shot(path.join(OUT, 'palette.png'));
  } finally { await b2.close(); }
  console.log('saved palette');
})().catch((e) => { console.error(e); process.exit(1); });
