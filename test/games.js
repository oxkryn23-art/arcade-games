// Unit tests for every game engine: resolution rules, timeouts, caps and hidden information.
const assert = require('assert');
const { byId } = require('../server/games');

const { rps, shootout, penalty, rps_minus_one: minus } = byId;
const throws = (fn, msg) => assert.throws(fn, Error, msg);

// Plays steps [[m0, m1], ...] through validate (null = timeout -> defaultMove) and resolve.
function play(game, steps, s = game.init(1)) {
  let res;
  for (const pair of steps) {
    assert(!res?.done, 'match already over');
    const moves = pair.map((m, i) => (m === null ? game.defaultMove(s, i) : game.validateMove(s, i, m)));
    res = game.resolveRound(s, moves);
  }
  return { s, res };
}
const repeat = (n, step) => Array.from({ length: n }, () => step);

function testRps() {
  let { s, res } = play(rps, [['rock', 'scissors']]);
  assert.strictEqual(res.roundWinner, 0);
  ({ res } = play(rps, [['paper', 'rock']], s)); assert.strictEqual(res.roundWinner, 0);
  ({ res } = play(rps, [['rock', 'paper']], s)); assert.strictEqual(res.roundWinner, 1);
  ({ res } = play(rps, [['rock', 'rock']], s)); assert.strictEqual(res.roundWinner, null);
  ({ res } = play(rps, [[null, 'rock']], s)); assert.strictEqual(res.roundWinner, 1, 'missing a move loses the round');
  ({ res } = play(rps, [[null, null]], s)); assert.strictEqual(res.roundWinner, null);
  throws(() => rps.validateMove(s, 0, 'nuke'));
  ({ s, res } = play(rps, repeat(2, ['scissors', 'paper'])));
  assert(!res.done, '2 wins are not enough');
  assert.strictEqual(rps.publicState(s, 0).target, 3, 'the scoreboard reads "first to 3"');
  ({ res } = play(rps, [['scissors', 'paper']], s));
  assert(res.done); assert.strictEqual(res.winner, 0, 'first to 3');
  ({ res } = play(rps, repeat(15, ['rock', 'rock'])));
  assert(res.done); assert.strictEqual(res.winner, null, '15 rounds, equal = draw');
  console.log('rps OK');
}

function testShootout() {
  const fresh = () => shootout.init(1);
  let s = fresh();
  // Disabled moves: no ammo to shoot, blast needs exactly 3.
  throws(() => shootout.validateMove(s, 0, 'shoot'), /ammo/);
  throws(() => shootout.validateMove(s, 0, 'blast'), /3 ammo/);
  throws(() => shootout.validateMove(s, 0, 'idle'));
  assert.deepStrictEqual(shootout.legalMoves(s, 0), ['reload', 'block']);

  // Shoot vs Reload -> shooter wins the duel.
  ({ s } = play(shootout, [['reload', 'reload'], ['shoot', 'reload']], fresh()));
  assert.deepStrictEqual(s.score, [1, 0]);
  assert.deepStrictEqual(s.ammo, [0, 0], 'ammo resets after a duel');
  assert.strictEqual(s.duel, 2);

  // Shoot vs Block, Shoot vs Shoot: nothing, but ammo is spent.
  ({ s } = play(shootout, [['reload', 'reload'], ['shoot', 'block']], fresh()));
  assert.deepStrictEqual(s.score, [0, 0]); assert.deepStrictEqual(s.ammo, [0, 1]);
  ({ s } = play(shootout, [['reload', 'reload'], ['shoot', 'shoot']], fresh()));
  assert.deepStrictEqual(s.score, [0, 0]); assert.deepStrictEqual(s.ammo, [0, 0], 'bullets collide');

  // Reload caps at 3; Blast beats Reload, Block and Shoot; Blast vs Blast cancels.
  const loaded = () => play(shootout, repeat(4, ['reload', 'reload']), fresh()).s;
  assert.deepStrictEqual(loaded().ammo, [3, 3]);
  for (const other of ['reload', 'block', 'shoot']) {
    const r = play(shootout, [['blast', other]], loaded());
    assert.deepStrictEqual(r.s.score, [1, 0], `blast beats ${other}`);
  }
  let r = play(shootout, [['blast', 'blast']], loaded());
  assert.deepStrictEqual(r.s.score, [0, 0]); assert.deepStrictEqual(r.s.ammo, [0, 0]);
  r = play(shootout, [['block', 'block'], ['reload', 'block']], fresh());
  assert.deepStrictEqual(r.s.score, [0, 0], 'anything else: nothing happens');

  // Timeout = reload without gaining ammo, and open to a shot.
  r = play(shootout, [['reload', null]], fresh());
  assert.deepStrictEqual(r.s.ammo, [1, 0]);
  r = play(shootout, [['shoot', null]], r.s);
  assert.deepStrictEqual(r.s.score, [1, 0], 'a player who missed the timer can be shot');

  // 12 turns without a hit: no point, new duel.
  r = play(shootout, repeat(12, ['block', 'block']), fresh());
  assert.deepStrictEqual(r.s.score, [0, 0]); assert.strictEqual(r.s.duel, 2); assert.strictEqual(r.s.turn, 0);
  assert(r.s.history.at(-1).duelOver);

  // First to 3 duels.
  r = play(shootout, repeat(3, null).flatMap(() => [['reload', 'reload'], ['shoot', 'reload']]), fresh());
  assert(r.res.done); assert.strictEqual(r.res.winner, 0);
  // Max 9 duels, then equal score = draw.
  r = play(shootout, repeat(9 * 12, ['block', 'block']), fresh());
  assert(r.res.done); assert.strictEqual(r.res.winner, null);
  // Ammo is public.
  assert.deepStrictEqual(shootout.publicState(loaded(), 1).ammo, [3, 3]);
  console.log('shootout OK');
}

function testPenalty() {
  let s = penalty.init(1);
  assert.strictEqual(penalty.publicState(s, 0).role, 'kicker', 'player 0 kicks first');
  assert.strictEqual(penalty.publicState(s, 1).role, 'keeper');
  let r = play(penalty, [['left', 'left']], s);
  assert.strictEqual(r.s.kicks[0].goal, false, 'same side = saved');
  assert.strictEqual(penalty.publicState(r.s, 1).role, 'kicker', 'roles alternate');
  r = play(penalty, [['right', 'center']], r.s); // player 1 kicks right, keeper 0 dives center
  assert.strictEqual(r.s.kicks[1].goal, true); assert.deepStrictEqual(r.s.score, [0, 1]);
  // Kicker missing = miss, keeper missing = goal.
  r = play(penalty, [[null, 'left']]);
  assert.strictEqual(r.s.kicks[0].goal, false);
  r = play(penalty, [['left', null]]);
  assert.strictEqual(r.s.kicks[0].goal, true);

  // Early end: player 0 scores 3, player 1 misses 3 -> 3:0 with 2 kicks left for player 1.
  const goal0 = ['left', 'right'], miss1 = ['left', 'left'];
  r = play(penalty, [goal0, miss1, goal0, miss1, goal0, miss1]);
  assert(r.res.done, 'ends early when one side can no longer catch up'); assert.strictEqual(r.res.winner, 0);
  assert.strictEqual(r.s.kicks.length, 6);
  // Not decided yet at 2:0 after 4 kicks (player 1 still has 3 kicks, player 0 has 3).
  r = play(penalty, [goal0, miss1, goal0, miss1]);
  assert(!r.res.done);

  // Tied after 5 each -> sudden death; decided after a full pair.
  const save = ['left', 'left'];
  r = play(penalty, repeat(10, save));
  assert(!r.res.done); assert(penalty.publicState(r.s, 0).sudden);
  r = play(penalty, [['left', 'right']], r.s); // player 0 scores
  assert(!r.res.done, 'sudden death waits for the pair');
  r = play(penalty, [['left', 'left']], r.s);  // player 1 is saved
  assert(r.res.done); assert.strictEqual(r.res.winner, 0);
  // Sudden death cap: 10 pairs without a decision = draw.
  r = play(penalty, repeat(10 + 20, save));
  assert(r.res.done); assert.strictEqual(r.res.winner, null);
  assert.strictEqual(r.s.kicks.length, 30);
  console.log('penalty OK');
}

function testRpsMinusOne() {
  let s = minus.init(1);
  assert.strictEqual(minus.stepTimeMs(s), 8000);
  assert.strictEqual(minus.publicState(s, 0).target, 3, 'first to 3');
  throws(() => minus.validateMove(s, 0, 'rock'));
  throws(() => minus.validateMove(s, 0, ['rock', 'lizard']));
  throws(() => minus.validateMove(s, 0, ['rock']));
  throws(() => minus.validateMove(s, 0, ['rock', 'rock', 'paper']));
  // The same gesture twice is a legal pair, and every legal pair validates.
  assert.deepStrictEqual(minus.validateMove(s, 0, ['rock', 'rock']), ['rock', 'rock']);
  assert.strictEqual(minus.legalMoves(s, 0).length, 6, '3 doubles + 3 mixed pairs');
  for (const p of minus.legalMoves(s, 0)) minus.validateMove(s, 0, p);
  const pairA = minus.validateMove(s, 0, ['paper', 'rock']);
  const pairB = minus.validateMove(s, 1, ['scissors', 'rock']);
  // Before both locked, publicState shows no pairs at all.
  assert.strictEqual(minus.publicState(s, 0).pairs, null);
  assert.strictEqual(minus.publicState(s, 1).pairs, null);
  let res = minus.resolveRound(s, [pairA, pairB]);
  assert.strictEqual(res.roundWinner, null); assert(!res.done);
  assert.strictEqual(s.phase, 'keep'); assert.strictEqual(minus.stepTimeMs(s), 5000);
  assert.deepStrictEqual(minus.publicState(s, 1).pairs, [['paper', 'rock'], ['rock', 'scissors']], 'pairs revealed after both locked');
  throws(() => minus.validateMove(s, 0, 'scissors'), /one of your two/);
  const keepA = minus.validateMove(s, 0, 'rock');
  // A phase-2 pick is not in publicState before both are locked.
  assert(!JSON.stringify(minus.publicState(s, 1)).includes('picks'), 'no picks before the round resolves');
  res = minus.resolveRound(s, [keepA, minus.validateMove(s, 1, 'scissors')]);
  assert.strictEqual(res.roundWinner, 0); assert.deepStrictEqual(s.score, [1, 0]);
  assert.strictEqual(s.phase, 'pick'); assert.strictEqual(s.pairs, null);
  assert.deepStrictEqual(s.history[0].picks, ['rock', 'scissors']);

  // Missing phase 1 loses the round right away; missing phase 2 loses too.
  s = minus.init(1);
  res = minus.resolveRound(s, [null, ['rock', 'paper']]);
  assert.strictEqual(res.roundWinner, 1); assert.strictEqual(s.phase, 'pick');
  minus.resolveRound(s, [['rock', 'paper'], ['rock', 'paper']]);
  res = minus.resolveRound(s, ['rock', null]);
  assert.strictEqual(res.roundWinner, 0);

  // A double: either hand keeps the same gesture, the other gesture is not allowed.
  s = minus.init(1);
  minus.resolveRound(s, [minus.validateMove(s, 0, ['scissors', 'scissors']), minus.validateMove(s, 1, ['rock', 'paper'])]);
  assert.deepStrictEqual(s.pairs, [['scissors', 'scissors'], ['paper', 'rock']]);
  assert.deepStrictEqual(minus.legalMoves(s, 0), ['scissors', 'scissors']);
  throws(() => minus.validateMove(s, 0, 'rock'), /one of your two/);
  res = minus.resolveRound(s, [minus.validateMove(s, 0, 'scissors'), minus.validateMove(s, 1, 'paper')]);
  assert.strictEqual(res.roundWinner, 0); assert.deepStrictEqual(s.history[0].pairs[0], ['scissors', 'scissors']);
  // Double vs double: both forced, normal RPS.
  s = minus.init(1);
  minus.resolveRound(s, [['rock', 'rock'], ['paper', 'paper']]);
  res = minus.resolveRound(s, ['rock', 'paper']);
  assert.strictEqual(res.roundWinner, 1);

  // First to 3 (2 wins are not enough), and a 12-round cap with a draw.
  s = minus.init(1);
  for (let i = 0; i < 2; i++) { minus.resolveRound(s, [['rock', 'paper'], ['rock', 'scissors']]); res = minus.resolveRound(s, ['paper', 'rock']); }
  assert(!res.done);
  s = minus.init(1);
  for (let i = 0; i < 3; i++) { minus.resolveRound(s, [['rock', 'paper'], ['rock', 'scissors']]); res = minus.resolveRound(s, ['paper', 'rock']); }
  assert(res.done); assert.strictEqual(res.winner, 0);
  s = minus.init(1);
  for (let i = 0; i < 12; i++) { minus.resolveRound(s, [['rock', 'paper'], ['rock', 'paper']]); res = minus.resolveRound(s, ['rock', 'rock']); }
  assert(res.done); assert.strictEqual(res.winner, null);
  console.log('rps_minus_one OK');
}

// The pause after each step must cover the client's reveal animation plus a buffer.
function testTiming() {
  const BUFFER = 300;
  for (const g of Object.values(byId)) {
    assert(g.anim && g.anim.reveal > 0, `${g.id}: anim.reveal`);
    assert(g.revealMs >= g.anim.reveal + BUFFER, `${g.id}: revealMs covers the reveal animation`);
  }
  // Steps with their own pause: a turn that ends a duel, and the RPS Minus One pair reveal.
  let s = shootout.init(1);
  const duelEnd = play(shootout, [['reload', 'reload'], ['shoot', 'reload']], s).res;
  assert(duelEnd.pauseMs >= shootout.anim.duelOver + BUFFER);
  const pick = minus.resolveRound(minus.init(1), [['rock', 'paper'], ['rock', 'scissors']]);
  assert(pick.pauseMs >= minus.anim.phase + BUFFER);
  console.log('timing OK');
}

// Seeded random play of thousands of full matches per game (legal moves, random timeouts) checking the end, score and
// draw invariants on every step: every match ends within its cap, the score always equals what the history says,
// nobody passes the target, the winner matches the score, no step after the end, publicState never carries a pending
// move, and Penalty ends early exactly when one side can no longer catch up.
function testFuzz() {
  let a = 20261117;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const { byScore } = require('../server/games/util');
  const CAP = { rps: 15, rps_minus_one: 24, penalty: 30, shootout: 9 * 12 };
  const TARGET = { rps: 3, rps_minus_one: 3, shootout: 3 };
  const N = 3000;
  for (const g of Object.values(byId)) {
    const ends = { 0: 0, 1: 0, draw: 0 };
    for (let n = 0; n < N; n++) {
      const s = g.init(n);
      const timeoutP = [0, 0.05, 0.3, 1][n % 4];   // never, rarely, often, always (a player who left)
      let res = null, steps = 0;
      while (!res?.done) {
        assert(steps < CAP[g.id], `${g.id}: match ${n} runs past its cap of ${CAP[g.id]} steps`);
        const moves = [0, 1].map((i) => {
          const legal = g.legalMoves(s, i);
          assert(legal.length > 0, `${g.id}: no legal move`);
          for (const m of legal) g.validateMove(s, i, m);
          return rnd() < (i === 0 ? timeoutP : timeoutP / 2) ? g.defaultMove(s, i) : g.validateMove(s, i, pick(legal));
        });
        // the moves live only in the arena until the step resolves: validating them never changes publicState
        const pub = JSON.stringify([g.publicState(s, 0), g.publicState(s, 1)]);
        moves.forEach((m, i) => { if (m != null && m !== g.defaultMove(s, i)) g.validateMove(s, i, m); });
        assert.strictEqual(JSON.stringify([g.publicState(s, 0), g.publicState(s, 1)]), pub, `${g.id}: publicState changed before the reveal`);
        res = g.resolveRound(s, moves);
        steps++;
        assert([0, 1, null].includes(res.roundWinner), `${g.id}: roundWinner`);
        const st = g.publicState(s, 0);
        assert(Array.isArray(st.score) && st.score.every((x) => Number.isInteger(x) && x >= 0), `${g.id}: score`);
        // the score is exactly what the history says
        const hist = g.id === 'penalty' ? s.kicks : s.history;
        const counted = [0, 1].map((p) => hist.filter((h) => (g.id === 'penalty' ? h.goal && h.kicker === p : h.winner === p)).length);
        assert.deepStrictEqual(s.score, counted, `${g.id}: score vs history`);
        if (TARGET[g.id]) assert(Math.max(...s.score) <= TARGET[g.id], `${g.id}: score past the target`);
        if (g.id === 'shootout') assert(s.ammo.every((x) => x >= 0 && x <= shootout.MAX_AMMO), 'shootout: ammo range');
        if (g.id === 'penalty' && s.kicks.length <= 10) {
          const left = [0, 1].map((p) => 5 - s.kicks.filter((k) => k.kicker === p).length);
          const hopeless = s.score[0] + left[0] < s.score[1] || s.score[1] + left[1] < s.score[0];
          const regEnd = s.kicks.length === 10 && s.score[0] !== s.score[1];
          assert.strictEqual(!!res.done, hopeless || regEnd, `penalty: early end only when one side can't catch up (kick ${s.kicks.length})`);
        }
        if (g.id === 'penalty' && s.kicks.length > 10 && s.kicks.length % 2 === 1) assert(!res.done, 'penalty: sudden death waits for the pair');
        if (res.done) {
          if (g.id === 'penalty') {
            if (res.winner == null) assert.strictEqual(s.score[0], s.score[1], 'penalty: a draw is a tied score');
            else assert(s.score[res.winner] > s.score[1 - res.winner], 'penalty: the winner has more goals');
          } else assert.strictEqual(res.winner, byScore(s.score), `${g.id}: winner = byScore`);
          if (g.id === 'rps_minus_one') assert.strictEqual(s.phase, 'pick', 'minus one: never ends mid-round');
        } else assert.strictEqual(res.winner, null, `${g.id}: winner before the end`);
      }
      ends[res.winner ?? 'draw']++;
    }
    // both sides win a fair share, and a match that always times out on one side still ends
    assert(ends[0] > 0 && ends[1] > 0, `${g.id}: both sides win sometimes ${JSON.stringify(ends)}`);
  }
  console.log(`fuzz OK (${N} random matches per game)`);
}

testTiming();
testFuzz();
testRps();
testShootout();
testPenalty();
testRpsMinusOne();
console.log('ALL GAME TESTS PASSED');
