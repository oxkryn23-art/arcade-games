// Every AI personality always returns a valid move in every game, in every state it can meet,
// and it only gets publicState (which never holds a pending move).
const assert = require('assert');
const { games } = require('../server/games');
const ai = require('../server/ai');

const pick = (a) => a[Math.floor(Math.random() * a.length)];

let moves = 0;
for (const game of games) {
  for (const personality of ai.PERSONALITIES) {
    for (let run = 0; run < 150; run++) {
      const bot = { ...ai.createAi(), personality };
      const s = game.init(run);
      for (let step = 0; step < 400; step++) {
        const pub = game.publicState(s, 1);
        const before = JSON.stringify(pub);
        const move = game.validateMove(s, 1, ai.chooseMove(game.id, pub, bot, 1)); // throws on an invalid move
        assert.strictEqual(JSON.stringify(pub), before, `${game.id}/${personality}: the AI must not change the state`);
        moves++;
        // The other side: a random legal move, sometimes a missed timer.
        const other = Math.random() < 0.15 ? game.defaultMove(s, 0) : game.validateMove(s, 0, pick(game.legalMoves(game.publicState(s, 0), 0)));
        if (game.resolveRound(s, [other, move]).done) break;
      }
    }
  }
}
// RPS Minus One: the AI sometimes shows a double (rock + rock), but mostly two different hands.
{
  const m1 = games.find((g) => g.id === 'rps_minus_one');
  let doubles = 0;
  for (let i = 0; i < 2000; i++) {
    const pair = ai.chooseMove('rps_minus_one', m1.publicState(m1.init(i), 1), ai.createAi(), 1);
    if (pair[0] === pair[1]) doubles++;
  }
  assert(doubles > 40 && doubles < 600, `Minus One doubles stay occasional: ${doubles} / 2000`);
}
for (let i = 0; i < 1000; i++) {
  const d = ai.moveDelayMs(3000);
  assert(d >= ai.MIN_DELAY_MS && d <= 2600, `think delay ${d}`);
}
for (let i = 0; i < 50; i++) {
  const name = ai.createAi().name;
  assert(ai.NICKNAMES.includes(name) && !/^(ai|you)$/i.test(name), `the AI plays under a plain nickname: ${name}`);
}
console.log(`AI OK: ${games.length} games × ${ai.PERSONALITIES.length} personalities, ${moves} valid moves`);
