// HTTP hardening: security headers and a strict CSP, no stack traces or file paths in errors, the dev lab closed when
// DEV_MODE is off, nothing private served, socket input that can't hurt the server.
process.env.PORT = process.env.SEC_PORT || '3998';
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('../server/index');
const URL = `http://localhost:${process.env.PORT}`;
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));

async function testHeaders() {
  const r = await fetch(URL + '/');
  assert.strictEqual(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert(/default-src 'self'/.test(csp) && /script-src 'self'(;|$)/.test(csp), 'a strict CSP: no inline scripts');
  assert(/frame-ancestors 'self'/.test(csp) && /object-src 'none'/.test(csp));
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert(!r.headers.get('x-powered-by'), 'no x-powered-by');
  const html = await r.text();
  assert(!/<script>(?!\s*<\/script>)|<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html), 'index.html has no inline script');
  console.log('headers OK');
}

async function testErrors() {
  const bad = await fetch(URL + '/api/nope');
  assert.strictEqual(bad.status, 404);
  const r = await fetch(URL + '/%E0%A4%A', {});
  const t = await r.text();
  assert(!/at |node_modules|[A-Z]:\\|\/home\//.test(t), 'no stack trace or path in an error page');
  const ch = await fetch(URL + '/api/challenge/zzzzzzzz');
  assert.strictEqual(ch.status, 404);
  assert.deepStrictEqual(Object.keys(await ch.json()), ['error']);
  console.log('errors OK');
}

async function testPrivate() {
  assert.strictEqual((await fetch(URL + '/dev/lab')).status, 404, 'the dev lab is closed without DEV_MODE');
  for (const p of ['/.env', '/../.env', '/server/config.js', '/package.json', '/.git/config', '/test/sim.js']) {
    const r = await fetch(URL + p);
    assert.notStrictEqual(r.status, 200, `${p} is not served`);
  }
  const robots = await fetch(URL + '/robots.txt').then((x) => x.text());
  assert(robots.includes('Disallow: /api/'));
  const health = await fetch(URL + '/healthz').then((x) => x.json());
  assert.deepStrictEqual(Object.keys(health).sort(), ['ok', 'uptimeSec'], 'healthz says nothing more');
  console.log('private files OK');
}

async function testSocketInput() {
  const s = io(URL, { auth: { pid: '../../etc' }, transports: ['websocket'], forceNew: true });
  await new Promise((r) => s.on('connect', r));
  for (const [ev, d] of [['demo:start', null], ['demo:start', { gameId: { toString: 1 } }], ['queue:join', { games: 'rps' }], ['queue:join', { games: [1, {}, null] }],
    ['match:move', { matchId: { $gt: '' }, move: 'rock' }], ['challenge:accept', { code: '../../x' }], ['challenge:hello', { seats: 'x' }], ['challenge:create', { games: ['rps'], name: 'x'.repeat(5000) }]]) {
    const r = await emit(s, ev, d);
    assert(r && typeof r.ok === 'boolean', `${ev}: answered`);
    if (!r.ok) assert(!/\bat \S+ \(|TypeError|\bundefined\b|\bnull\b/.test(r.error), `${ev}: a plain message (${r.error})`);
  }
  // flooding events is cut off
  let refused = 0;
  await Promise.all(Array.from({ length: 80 }, () => emit(s, 'queue:leave', {}).then((r) => { if (!r.ok) refused++; })));
  assert(refused > 0, 'a flood of events is rate limited');
  s.close();
  console.log('socket input OK');
}

(async () => {
  await new Promise((r) => server.listen(Number(process.env.PORT), r));
  await testHeaders();
  await testErrors();
  await testPrivate();
  await testSocketInput();
  console.log('ALL SECURITY TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
