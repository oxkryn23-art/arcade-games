// The character rig (public/js/figures/rig.js) in a tiny SVG-only DOM: every look option, every shared pose, every
// hand shape, face and view builds clean SVG (no NaN, no hard-coded colors, no images), the avatars and the expression
// table work, and the two players never wear the same shirt.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'public', 'js');
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const escA = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function makeStyle() {
  const props = {};
  const api = { setProperty(k, v) { props[k] = v; }, removeProperty(k) { delete props[k]; }, toString() { return Object.entries(props).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}:${v}`).join(';'); } };
  return new Proxy(api, { get(t, k) { return k in t ? t[k] : props[kebab(String(k))] ?? ''; }, set(t, k, v) { props[kebab(String(k))] = v; return true; } });
}
class Text { constructor(s) { this.text = s; this.parentNode = null; } get outerHTML() { return escA(this.text); } remove() { this.parentNode?.removeChild(this); } }
class El {
  constructor(tag) { this.tagName = tag; this.attrs = new Map(); this.children = []; this.parentNode = null; this.style = makeStyle(); this.dataset = {}; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  _adopt(c) { if (typeof c === 'string') c = new Text(c); c.parentNode?.removeChild(c); c.parentNode = this; return c; }
  append(...cs) { for (const c of cs) this.children.push(this._adopt(c)); }
  appendChild(c) { this.append(c); return c; }
  prepend(...cs) { this.children.unshift(...cs.map((c) => this._adopt(c))); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get childNodes() { return this.children; }
  set innerHTML(v) { if (v !== '') throw new Error('innerHTML: only clearing'); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
  get isConnected() { return true; }
  getAnimations() { return []; }
  animate() { return { finished: Promise.resolve(), cancel() {}, finish() {} }; }
  querySelectorAll() { return []; }
  get outerHTML() {
    const style = this.style.toString();
    const attrs = [...this.attrs].map(([k, v]) => ` ${k}="${escA(v)}"`).join('') + (style ? ` style="${escA(style)}"` : '');
    if (this.style.display === 'none') return '';
    return `<${this.tagName}${attrs}>${this.children.map((c) => c.outerHTML).join('')}</${this.tagName}>`;
  }
}
const store = {};
const document = { createElementNS: (ns, t) => new El(t), createElement: (t) => new El(t), createTextNode: (s) => new Text(s), documentElement: new El('html'), querySelectorAll: () => [], addEventListener() {} };
const window = { document, matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {} };
window.window = window;
const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const sandbox = { window, document, localStorage, performance: { now: () => 0 }, requestAnimationFrame: () => 0, setTimeout, clearTimeout, console, Math, Promise, JSON };
window.localStorage = localStorage;
vm.createContext(sandbox);
for (const f of ['scenes/kit.js', 'figures/avatar.js', 'figures/figure-art.js', 'figures/human.js', 'figures/rig.js', 'figures/expressions.js', 'figures/props.js']) {
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
}
const M = window.DuelFigures, A = window.DuelAvatar, X = window.DuelExpressions;

function clean(markup, what) {
  assert(!/NaN|undefined|Infinity/.test(markup), `${what}: no NaN / undefined in the SVG`);
  assert(!/#[0-9a-f]{3,8}\b/i.test(markup.replace(/url\(#[^)]+\)|href="#[^"]+"/g, '')), `${what}: no hard-coded color`);
  assert(!/<image|\.webp|\.png|\/assets\//.test(markup), `${what}: no images`);
}
const svgOf = (r) => { const s = new El('svg'); s.append(r.root); return s.outerHTML; };

// every look option, in every shared pose and view
let n = 0;
for (const [kind, ids] of Object.entries(A.OPTIONS)) {
  for (const id of ids) {
    const look = A.valid({ ...A.DEFAULT, [kind]: id });
    for (const pose of [...Object.keys(M.POSES), { turn: 0.55 }, { turn: 1 }, { back: 1 }, { sit: 1, turn: 0.6 }, { rot: 90, y: -40 }]) {
      const r = M.create({ look, pose, idle: false });
      const svg = svgOf(r);
      clean(svg, `${kind}=${id} ${JSON.stringify(pose)}`);
      assert(svg.includes(`var(--${look.skin})`) && svg.includes(`var(--${look.shirt})`), 'skin and shirt colors are the look tokens');
      r.destroy(); n++;
    }
  }
}
// every hand shape (normal and big), every face
for (const shape of Object.keys(M.HANDS)) {
  const r = M.create({ pose: { h1: shape, h2: shape, r2: 0 }, idle: false });
  r.bigHands((k) => k === 2);
  clean(svgOf(r), `hand ${shape}`);
  assert(r.handRadius(2) > r.handRadius(1), `${shape}: the big hand is bigger`);
  const [x, y] = r.handMid(2);
  assert(Number.isFinite(x) && Number.isFinite(y), 'handMid is a point');
  r.destroy();
}
for (const face of Object.keys(M.FACES)) { const r = M.create({ idle: false }); r.face(face); assert.strictEqual(r.faceName, face); clean(svgOf(r), `face ${face}`); r.destroy(); }
// props in hand, the tween API
{
  const r = M.create({ idle: false });
  for (const p of ['revolver', 'shotgun', 'football', 'bullet']) { r.hold(2, p); assert(r.prop(2), `${p} is held`); }
  const muzzle = r.handPoint(2, [10, 0]);
  assert(muzzle.every(Number.isFinite));
  r.to('cheer', 10); r.set('sad');
  assert.strictEqual(r.cur.by, M.POSES.sad.by);
  clean(svgOf(r), 'props');
  r.destroy();
}
// avatars: the head disc and the whole figure
for (const body of [false, true]) clean(M.avatarSvg(A.random(), 'you', { body }), `avatar body=${body}`);
assert(M.handSvg('scissors').startsWith('<svg'), 'control hand icon');
// expressions: every moment has a face, the round mood stays within a round
for (const id of X.ids()) assert(M.FACES[X.pick(id)], `${id} -> a face`);
{
  const key = {};
  const first = X.pick('RPS-2', key);
  for (let i = 0; i < 10; i++) assert.strictEqual(X.pick('RPS-3', key), first, 'the mood holds inside a round');
  assert.strictEqual(X.pick('RPS-5', key), 'grin');
}
// the two players never look the same: a clashing shirt is swapped for the opponent
A.set({ ...A.DEFAULT, shirt: 'shirt-2' });
A.setOpponent({ ...A.DEFAULT, shirt: 'shirt-2' });
assert.notStrictEqual(A.forSide('opp').shirt, A.forSide('you').shirt, 'different shirts');
A.setOpponent({ ...A.DEFAULT, shirt: 'shirt-6' });
assert.strictEqual(A.forSide('opp').shirt, 'shirt-6', 'no clash: the opponent keeps theirs');
// the scene shoulder helper
assert(M.shoulderOf('human', { turn: 0.6 }, 2).every(Number.isFinite));
console.log(`FIGURE TESTS PASSED: ${n} look x pose builds, ${Object.keys(M.HANDS).length} hands, ${Object.keys(M.FACES).length} faces`);
