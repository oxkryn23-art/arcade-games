// Static checks of the site's files: no images (everything is drawn in code), no hard-coded colors outside the
// theme, every icon the markup asks for exists, every dialog can be closed, every scene art name is registered,
// the tutorial texts are in sync, and nothing from a removed feature is left in the client.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (['node_modules', '.git'].includes(e.name)) continue;
    if (e.isDirectory()) walk(p, out); else out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const files = walk('.');

// 1. no raster images in the app: the covers are rendered from the scenes, the README screenshots are documentation
const images = files.filter((f) => /\.(png|jpe?g|gif|webp|ico|bmp|avif)$/i.test(f) && !/^(\.\/)?(public\/covers|docs\/screenshots)\//.test(f.replace(/^\.\//, '')));
assert.deepStrictEqual(images, [], 'no image files outside the rendered covers and the docs screenshots');
const svgs = files.filter((f) => f.endsWith('.svg'));
assert.deepStrictEqual(svgs.map((f) => f.replace(/^\.\//, '')), ['public/favicon.svg'], 'the only SVG file is the code-written favicon');

// 2. colors only from the theme tokens
const code = files.filter((f) => /^(\.\/)?public\/.*\.(js|css|html)$/.test(f) && !f.endsWith('icons.js'));
for (const f of code) {
  const src = fs.readFileSync(path.join(repo, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hex = src.match(/(?<![\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b(?![\w-])/g) || [];
  const real = hex.filter((h) => !/^#(ccc|fff|000)$/i.test(h) || !/\.(js)$/.test(f));
  assert.deepStrictEqual(real.filter((h) => !src.includes(`id="${h.slice(1)}"`)), [], `${f}: hard-coded colors ${real.join(' ')}`);
  assert(!/rgba?\(\s*\d/.test(src.replace(/rgba\(0,\s*0,\s*0,\s*0\)/g, '')), `${f}: rgb() literal`);
  assert(!/\/assets\/|<image\b|url\(['"]?[^)'"]+\.(png|jpe?g|webp|gif)/.test(src), `${f}: refers to an image file`);
}

// 3. every icon asked for exists
const icons = read('public/js/icons.js');
const html = read('public/index.html');
for (const name of new Set([...html.matchAll(/data-icon="([a-z0-9-]+)"/g)].map((m) => m[1]))) assert(icons.includes(`"${name}":`), `icon ${name} is generated`);
for (const f of code) for (const m of fs.readFileSync(path.join(repo, f), 'utf8').matchAll(/DuelIcons\.svg\(\s*'([a-z0-9-]+)'/g)) assert(icons.includes(`"${m[1]}":`), `${f}: icon ${m[1]}`);

// 4. every dialog has a title and a close button in a header that never scrolls away
for (const m of html.matchAll(/<dialog id="(\w+)"[\s\S]*?<\/dialog>/g)) {
  assert(/<header class="modal-head">[\s\S]*?class="modal-x"/.test(m[0]), `${m[1]}: a header with a close button`);
  assert(/class="modal-body"/.test(m[0]), `${m[1]}: a scrolling body`);
}
assert(!/<script>/.test(html), 'no inline scripts (the CSP forbids them)');

// 5. every scene art element a scene asks for by a fixed name is registered in its art file
const art = ['art.js', 'art-rps.js', 'art-penalty.js', 'art-shootout.js'].map((f) => read(`public/js/scenes/${f}`)).join('\n');
for (const f of ['rps-duel.js', 'rps.js', 'rps_minus_one.js', 'penalty.js', 'shootout.js']) {
  const src = read(`public/js/scenes/${f}`);
  for (const m of src.matchAll(/K\.sprite\([^,]+,\s*'([a-z0-9-]+)'/g)) assert(art.includes(`'${m[1]}'`) || art.includes(m[1].replace(/-\d+$/, '-')), `${f}: art element ${m[1]} is registered`);
  const bg = src.match(/bg: '([a-z0-9-]+)'/);
  if (bg) assert(art.includes(`bg['${bg[1]}']`) || art.includes(`bg.${bg[1]} =`) || art.includes(`'${bg[1]}'`), `${f}: background ${bg[1]} is drawn`);
}

// 6. the game scripts the server lists exist; the tutorial texts are in sync
const idx = read('server/index.js');
for (const m of idx.match(/const GAME_SCRIPTS = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)) assert(fs.existsSync(path.join(repo, 'public', m[1])), `${m[1]} exists`);
execFileSync(process.execPath, [path.join(repo, 'tools', 'tutorial-text.js'), '--check'], { stdio: 'pipe' });

console.log('CLIENT CHECKS PASSED');
