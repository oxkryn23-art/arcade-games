// Integration: real sockets against a real server. Scripted players play every game PvP from the queue and vs the AI,
// a challenge link end to end, coming back into a running match after a disconnect, and the guards (bad input, a move
// out of turn, never seeing the opponent's move before the reveal).
process.env.PORT = process.env.SIM_PORT || '3999';
process.env.REJOIN_GRACE_MS = '1500';
process.env.SHOW_WAITING_COUNTS = 'true';
const assert = require('assert');
const crypto = require('crypto');
const { io } = require('socket.io-client');
const { server } = require('../server/index');
const arena = require('../server/arena');
const { byId: games } = require('../server/games');
const URL = `http://localhost:${process.env.PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const pid = () => crypto.randomBytes(16).toString('hex');
const look = { skin: 'skin-2', hair: 'curly', hairColor: 'hair-3', shirt: 'shirt-4', hat: 'none', outfit: 'hoodie', feet: 'chelsea' };
async function waitFor(fn, ms = 20000, what = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await sleep(25); }
  throw new Error(`timeout: ${what}`);
}

// A scripted player: plays a random legal move every step (or none when `idle`), records everything it was sent.
// pick(gameId, legal): the move to play (default: a random legal one). A Shootout between two random players can run
// for minutes, so the long-game tests give one side a decisive habit (shoot when loaded, the other keeps reloading).
const shooter = (gameId, legal) => (gameId === 'shootout' ? (legal.includes('shoot') ? 'shoot' : 'reload') : null);
const reloader = (gameId, legal) => (gameId === 'shootout' && legal.includes('reload') ? 'reload' : null);
function player(name, { id = pid(), idle = false, pick = null } = {}) {
  const s = io(URL, { auth: { pid: id }, transports: ['websocket'], forceNew: true });
  const p = { s, id, name, found: null, rounds: [], results: [], end: null, events: [], idle };
  s.onAny((ev, data) => p.events.push([ev, data]));
  s.on('match:found', (d) => { p.found = d; p.end = null; });
  s.on('match:roundResult', (d) => p.results.push(d));
  s.on('match:end', (d) => { p.end = d; });
  s.on('match:round', (d) => {
    p.rounds.push(d);
    if (p.idle) return;
    const g = games[p.found.gameId], legal = g.legalMoves(d.state, p.found.you);
    const move = pick?.(p.found.gameId, legal) ?? legal[Math.floor(Math.random() * legal.length)];
    setTimeout(() => s.emit('match:move', { matchId: d.matchId, move }, () => {}), 30 + Math.random() * 80);
  });
  p.ready = new Promise((r) => s.on('connect', r));
  return p;
}
const close = (...ps) => ps.forEach((p) => p.s.close());

async function testPvpAllGames() {
  await Promise.all(Object.keys(games).map(async (gameId) => {
    const a = player('QuietOtter', { pick: shooter }), b = player('CoralKite', { pick: reloader });
    await Promise.all([a.ready, b.ready]);
    const ra = await emit(a.s, 'queue:join', { games: [gameId], name: a.name, look });
    assert(ra.ok, ra.error);
    const rb = await emit(b.s, 'queue:join', { games: [gameId, 'rps'].filter((x, i, l) => l.indexOf(x) === i), name: b.name, look: { ...look, shirt: 'shirt-1' } });
    assert(rb.ok, rb.error);
    await waitFor(() => a.end && b.end, 120000, `${gameId}: both players see the end`);
    assert.strictEqual(a.found.gameId, gameId, 'the shared game is played');
    assert.strictEqual(a.found.mode, 'pvp');
    assert.deepStrictEqual(a.found.players.map((x) => x.name), ['QuietOtter', 'CoralKite'], 'both names');
    assert.deepStrictEqual(a.found.players[0].look, look, 'the look as sent');
    assert.strictEqual(b.found.you, 1);
    assert.strictEqual(a.end.winner, b.end.winner, 'the same result for both');
    // never the opponent's move before both are locked: a round state has no pending move of anyone
    for (const r of a.rounds) assert(!JSON.stringify(r.state).includes('pending'), 'no pending move in a round state');
    close(a, b);
  }));
  console.log('PvP: every game played to the end from the queue');
}

async function testDemoAllGames() {
  await Promise.all(Object.keys(games).map(async (gameId) => {
    const a = player('SneakyPretzel', { pick: shooter });
    await a.ready;
    const r = await emit(a.s, 'demo:start', { gameId, name: a.name, look });
    assert(r.ok, r.error);
    await waitFor(() => a.end, 120000, `${gameId}: the demo ends`);
    assert.strictEqual(a.found.mode, 'demo');
    assert(a.found.players[1].ai, 'the AI is marked');
    assert(!/^(ai|you)$/i.test(a.found.players[1].name), 'the AI plays under a nickname');
    close(a);
  }));
  console.log('demo: every game played to the end vs the AI');
}

async function testGuards() {
  const a = player('Guard Test');
  await a.ready;
  for (const bad of [{ gameId: 'nope' }, { gameId: '__proto__' }, { gameId: 'tic_tac_toe' }, {}]) {
    const r = await emit(a.s, 'demo:start', bad);
    assert(!r.ok, `refused: ${JSON.stringify(bad)}`);
  }
  assert(!(await emit(a.s, 'queue:join', { games: [] })).ok, 'no games: refused');
  assert(!(await emit(a.s, 'queue:join', { games: ['tic_tac_toe'] })).ok, 'an unknown game: refused');
  assert(!(await emit(a.s, 'match:move', { matchId: 'x', move: 'rock' })).ok, 'a move outside a match: refused');
  assert((await emit(a.s, 'queue:join', { games: ['rps'], name: '<script>', look: { skin: 'nope' } })).ok, 'a bad name and look still queue');
  assert(!(await emit(a.s, 'queue:join', { games: ['rps'] })).ok, 'no double join');
  assert((await emit(a.s, 'queue:leave', {})).ok);
  const e = arena._internal.queue.find((x) => x.key && x.name === '<script>');
  assert(!e, 'an unsafe name is replaced');
  // a bad name gets a random fun one; the look falls back to the default
  const b = player('Bob'), c = player('Ann');
  await Promise.all([b.ready, c.ready]);
  await emit(b.s, 'queue:join', { games: ['rps'], name: 'admin', look: { skin: 'x' } });
  await emit(c.s, 'queue:join', { games: ['rps'], name: 'Ann', look });
  await waitFor(() => b.found && c.found, 5000, 'matched');
  assert.notStrictEqual(c.found.players[0].name.toLowerCase(), 'admin', 'reserved names are replaced');
  assert.strictEqual(c.found.players[0].look.skin, 'skin-3', 'an unknown look part falls back');
  // an illegal move is refused; a second move in the same step too
  await waitFor(() => b.rounds.length, 8000, 'first round');
  b.idle = true;
  close(a, c);
  close(b);
  console.log('guards OK');
}

async function testOpponentMoveHidden() {
  const a = player('Hider', { idle: true }), b = player('Seeker', { idle: true });
  await Promise.all([a.ready, b.ready]);
  await emit(a.s, 'queue:join', { games: ['rps'], name: a.name, look });
  await emit(b.s, 'queue:join', { games: ['rps'], name: b.name, look });
  await waitFor(() => a.rounds.length && b.rounds.length, 8000, 'a round');
  const mid = a.rounds[0].matchId;
  assert((await emit(a.s, 'match:move', { matchId: mid, move: 'rock' })).ok);
  assert(!(await emit(a.s, 'match:move', { matchId: mid, move: 'paper' })).ok, 'a second move in one step: refused');
  await sleep(150);
  const seen = JSON.stringify(b.events.filter(([ev]) => ev !== 'match:roundResult'));
  assert(!/"rock"/.test(seen), "the opponent's move is never sent before the reveal");
  assert(b.events.some(([ev]) => ev === 'match:opponentLocked'), 'only that the opponent locked');
  assert(!(await emit(b.s, 'match:move', { matchId: mid, move: 'banana' })).ok, 'an illegal move: refused');
  close(a, b);
  console.log('hidden moves OK');
}

// A reload / lost connection: the same browser id comes back to the same match, the same round and deadline, a
// locked move stays locked; gone for longer than REJOIN_GRACE_MS, a demo ends and a match vs a person is forfeited.
async function testRejoin() {
  const id = pid();
  let a = player('Comeback', { id, idle: true });
  await a.ready;
  await emit(a.s, 'demo:start', { gameId: 'shootout', name: a.name, look });
  await waitFor(() => a.rounds.length, 8000, 'the demo starts');
  const r0 = a.rounds.at(-1);
  assert((await emit(a.s, 'match:move', { matchId: r0.matchId, move: 'reload' })).ok);
  a.s.close();
  await sleep(200);
  a = player('Comeback', { id, idle: true });
  await waitFor(() => a.found && a.rounds.length, 5000, 'resumed');
  assert(a.found.resumed, 'match:found says resumed');
  assert.strictEqual(a.found.matchId, r0.matchId, 'the same match');
  const r1 = a.rounds[0];
  if (r1.deadline === r0.deadline) assert(r1.locked, 'a locked move stays locked');
  a.s.close();
  await sleep(2200);
  assert(![...arena._internal.matches.values()].some((m) => m.id === r0.matchId && !m.ended), 'gone too long: the demo ends');
  // PvP: the one who stays wins by forfeit
  const b = player('Stayer'), c = player('Leaver', { idle: true });
  await Promise.all([b.ready, c.ready]);
  await emit(b.s, 'queue:join', { games: ['penalty'], name: b.name, look });
  await emit(c.s, 'queue:join', { games: ['penalty'], name: c.name, look });
  await waitFor(() => b.found && c.found, 5000, 'matched');
  c.s.close();
  await waitFor(() => b.end, 8000, 'forfeit after the grace');
  assert.strictEqual(b.end.reason, 'forfeit');
  assert.strictEqual(b.end.winner, b.found.you, 'the one who stayed wins');
  close(b);
  console.log('rejoin OK');
}

async function testChallenge() {
  const a = player('Challenger'), b = player('Friend');
  await Promise.all([a.ready, b.ready]);
  const cr = await emit(a.s, 'challenge:create', { games: ['rps', 'penalty'], name: a.name, look });
  assert(cr.ok, cr.error);
  const code = cr.challenge.code;
  assert.match(code, /^[a-z2-9]{8}$/);
  const page = await fetch(`${URL}/c/${code}`).then((r) => r.text());
  assert(page.includes('Challenger challenges you'), 'the link preview names the challenger');
  const api = await fetch(`${URL}/api/challenge/${code}`).then((r) => r.json());
  assert.strictEqual(api.challenge.status, 'waiting');
  assert(!JSON.stringify(api).includes(cr.secret), 'the seat secret is never shown');
  assert(!(await emit(a.s, 'challenge:accept', { code, name: a.name, look, secret: cr.secret })).ok, "you can't accept your own");
  const ac = await emit(b.s, 'challenge:accept', { code, name: b.name, look });
  assert(ac.ok, ac.error);
  await waitFor(() => a.found && b.found, 6000, 'the challenge starts');
  assert.strictEqual(a.found.mode, 'friendly');
  assert(['rps', 'penalty'].includes(a.found.gameId));
  assert(!(await emit(b.s, 'challenge:accept', { code, name: 'Third', look })).ok, 'one-time link');
  await waitFor(() => a.end && b.end, 120000, 'the challenge ends');
  // a cancelled one is closed
  const c2 = await emit(a.s, 'challenge:create', { games: ['rps'], name: a.name, look });
  assert((await emit(a.s, 'challenge:cancel', { code: c2.challenge.code, secret: c2.secret })).ok);
  assert(!(await emit(b.s, 'challenge:accept', { code: c2.challenge.code, name: b.name, look })).ok, 'cancelled: refused');
  assert(!(await emit(b.s, 'challenge:create', { games: [], name: b.name, look })).ok, 'no games: refused');
  close(a, b);
  console.log('challenge OK');
}

async function testLobbyStats() {
  const a = player('Counter');
  await a.ready;
  await emit(a.s, 'queue:join', { games: ['shootout'], name: a.name, look });
  await waitFor(() => a.events.some(([ev, d]) => ev === 'lobby:stats' && d.waiting?.shootout >= 1), 3000, 'waiting count');
  const st = a.events.filter(([ev]) => ev === 'lobby:stats').at(-1)[1];
  assert(!('online' in st) && !JSON.stringify(st).includes('online'), 'no online count');
  close(a);
  console.log('lobby stats OK');
}

(async () => {
  await new Promise((r) => server.listen(Number(process.env.PORT), r));
  await testGuards();
  await testOpponentMoveHidden();
  await testLobbyStats();
  await testRejoin();
  await testChallenge();
  await Promise.all([testPvpAllGames(), testDemoAllGames()]);
  console.log('ALL SIM TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
