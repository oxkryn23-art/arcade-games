// Unit tests of the pure server modules: matchmaking, the anti-bot check, challenges, avatars, names, the theme.
const assert = require('assert');
const matchmaking = require('../server/matchmaking');
const anticheat = require('../server/anticheat');
const challenges = require('../server/challenges');
const avatar = require('../server/avatar');
const names = require('../public/js/names.js');
const themes = require('../server/themes');
const config = require('../server/config');
const errors = require('../server/errors');
const { games, check } = require('../server/games');

function testMatchmaking() {
  const e = (key, gs, joinedAt, flagged = false) => ({ key, games: gs, joinedAt, flagged });
  const fixed = { shadowWaitMs: 20000, randomInt: () => 0 };
  assert.strictEqual(matchmaking.findPair([e('a', ['rps'], 1), e('b', ['penalty'], 2)], 10, fixed), null, 'no shared game');
  const p = matchmaking.findPair([e('a', ['rps', 'penalty'], 1), e('b', ['penalty'], 2)], 10, fixed);
  assert.deepStrictEqual([p.a.key, p.b.key, p.game], ['a', 'b', 'penalty'], 'the shared game');
  const fifo = matchmaking.findPair([e('c', ['rps'], 5), e('a', ['rps'], 1), e('b', ['rps'], 2)], 10, fixed);
  assert.deepStrictEqual([fifo.a.key, fifo.b.key], ['a', 'b'], 'oldest first');
  assert.strictEqual(matchmaking.findPair([e('a', ['rps'], 1), e('a', ['rps'], 2)], 10, fixed), null, 'never with yourself');
  // a flagged player waits in the shadow pool, then plays normally
  const q = [e('bot', ['rps'], 0, true), e('human', ['rps'], 1)];
  assert.strictEqual(matchmaking.findPair(q, 1000, fixed), null, 'flagged waits first');
  assert(matchmaking.findPair(q, 25000, fixed), 'then is matched normally');
  assert(matchmaking.findPair([e('b1', ['rps'], 0, true), e('b2', ['rps'], 1, true)], 10, fixed), 'flagged players meet each other');
  console.log('matchmaking OK');
}

function testAnticheat() {
  const fast = Array.from({ length: 12 }, () => 100);
  const human = Array.from({ length: 12 }, (_, i) => 400 + i * 97);
  for (let i = 0; i < config.BOT_MIN_MATCHES; i++) anticheat.recordMatch(['p:bot', 'p:human'], [fast, human]);
  assert(anticheat.isFlagged('p:bot'), 'scripted timing over several matches is flagged');
  assert(!anticheat.isFlagged('p:human'), 'human timing is not');
  anticheat.unflag('p:bot');
  assert(!anticheat.isFlagged('p:bot'));
  const st = anticheat.timingStats([100, null, 300]);
  assert.deepStrictEqual([st.moves, st.median], [2, 200], 'missed moves are ignored');
  let ok = 0; for (let i = 0; i < 5; i++) if (anticheat.rateLimit('unit:rl', 3, 60000)) ok++;
  assert.strictEqual(ok, 3, 'rate limit');
  console.log('anticheat OK');
}

function testChallenges() {
  const look = avatar.valid({});
  const { row, secret } = challenges.create({ name: 'Ann', look, games: ['rps', 'nope', 'rps'] }, 1000);
  assert.deepStrictEqual(row.games, ['rps'], 'unknown and doubled games are dropped');
  assert.throws(() => challenges.create({ name: 'Ann', look, games: ['tic_tac_toe'] }), /Pick at least one game/);
  const v = challenges.view(row, { secret }, 1000);
  assert.strictEqual(v.role, 'creator');
  assert(!JSON.stringify(challenges.view(row)).includes(row.creatorSeat), 'the seat hash is never shown');
  assert.throws(() => challenges.accept(row.code, { secret }, { name: 'Ann', look }, 2000), /your own/);
  const acc = challenges.accept(row.code, { secret: null }, { name: 'Bob', look }, 2000);
  assert.strictEqual(challenges.roleOf(row, { secret: acc.secret }), 'accepter');
  assert.throws(() => challenges.accept(row.code, {}, { name: 'Cid', look }, 2000), /already accepted/);
  challenges.withdraw(row.code, { secret: acc.secret });
  assert.strictEqual(row.status, 'waiting', 'withdrawn: the link waits again');
  assert.throws(() => challenges.cancel(row.code, { secret: 'wrong' }), /Only the challenger/);
  challenges.cancel(row.code, { secret });
  assert.strictEqual(row.status, 'cancelled');
  const { row: r2 } = challenges.create({ name: 'Ann', look, games: ['penalty'] }, 0);
  challenges.sweep(challenges.TTL_MS + 1);
  assert.strictEqual(r2.status, 'expired', 'expires after 24 h');
  assert.strictEqual(challenges.get('NOT-A-CODE'), null);
  console.log('challenges OK');
}

function testAvatarAndNames() {
  assert.deepStrictEqual(avatar.valid({ skin: 'skin-5', hair: 'mohawk', shirt: 'shirt-9' }), { skin: 'skin-5', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1' });
  for (let i = 0; i < 50; i++) { const r = avatar.random(); assert.deepStrictEqual(avatar.valid(r), r); }
  // every avatar option is a theme token (or a hair style id)
  for (const kind of ['skin', 'hairColor', 'shirt']) for (const id of avatar.OPTIONS[kind]) assert(themes.ALL[id], `--${id} is a token`);
  // the browser's option lists are the same
  const fs = require('fs'), src = fs.readFileSync(require.resolve('../public/js/figures/avatar.js'), 'utf8');
  for (const [kind, ids] of Object.entries(avatar.OPTIONS)) assert(src.includes(`${kind}: [${ids.map((x) => `'${x}'`).join(', ')}]`), `${kind}: same list in the browser`);
  for (let i = 0; i < 200; i++) { const n = names.random(); assert(!names.problem(n), `random name ${n} is valid`); }
  for (const bad of ['ab', 'x'.repeat(19), 'admin', 'You', 'AI', '<b>hi</b>']) assert(names.problem(names.clean(bad)), `refused: ${bad}`);
  console.log('avatars and names OK');
}

function testThemeAndConfig() {
  for (const [k, v] of Object.entries(themes.ALL)) assert(/^#[0-9A-F]{6}$/i.test(v), `--${k} is #RRGGBB`);
  // text on panels and the page passes AA
  const T = themes.ALL;
  for (const [fg, bg] of [['ui-ink', 'ui-cream'], ['ui-ink-2', 'ui-cream'], ['ui-ink', 'ui-sky'], ['ui-ink-2', 'ui-sky'], ['ui-on-play', 'ui-play'], ['ui-accent-2', 'ui-cream'], ['ui-money', 'ui-cream'], ['ui-ink', 'ui-cream-2']]) {
    assert(themes.contrast(T[fg], T[bg]) >= 4.5, `--${fg} on --${bg}: ${themes.contrast(T[fg], T[bg]).toFixed(2)}`);
  }
  assert(themes.css().startsWith('/* Generated'));
  assert.strictEqual(config.DEV_MODE, false, 'dev tools are off by default');
  assert.deepStrictEqual(games.map((g) => g.id).sort(), ['penalty', 'rps', 'rps_minus_one', 'shootout']);
  assert.throws(() => check('tic_tac_toe'), /Unknown game/);
  assert.strictEqual(errors.publicMessage(new TypeError('x is undefined')), 'Something went wrong. Try again in a moment.');
  assert.strictEqual(errors.publicMessage(new Error('Pick at least one game')), 'Pick at least one game');
  console.log('theme and config OK');
}

testMatchmaking();
testAnticheat();
testChallenges();
testAvatarAndNames();
testThemeAndConfig();
console.log('ALL UNIT TESTS PASSED');
