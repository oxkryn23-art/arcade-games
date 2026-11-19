// Pure matchmaking rules, kept free of sockets and timers so they are easy to test.
//
// Queue entry: { key, games: [gameId], joinedAt, flagged }
// Two entries match when they share at least one game. The queue is FIFO: the oldest waiting player who fits is
// matched first. Flagged players (anticheat.js) are matched with each other first; a flagged player who has waited
// shadowWaitMs is matched normally, so a false positive only waits a little longer.
const crypto = require('crypto');

const sharedGames = (a, b) => a.games.filter((g) => b.games.includes(g));

function compatible(a, b, now, shadowWaitMs) {
  if (a.key === b.key) return false;
  if (!sharedGames(a, b).length) return false;
  if (a.flagged !== b.flagged) {
    const flagged = a.flagged ? a : b;
    if (now - flagged.joinedAt < shadowWaitMs) return false;
  }
  return true;
}

// Returns { a, b, game } for the first compatible pair in FIFO order, or null.
// The game is picked uniformly at random among the shared games.
function findPair(queue, now, { shadowWaitMs, randomInt = crypto.randomInt } = {}) {
  const fifo = [...queue].sort((x, y) => x.joinedAt - y.joinedAt);
  for (let i = 0; i < fifo.length; i++) {
    for (let j = i + 1; j < fifo.length; j++) {
      if (!compatible(fifo[i], fifo[j], now, shadowWaitMs)) continue;
      const shared = sharedGames(fifo[i], fifo[j]);
      return { a: fifo[i], b: fifo[j], game: shared[randomInt(shared.length)] };
    }
  }
  return null;
}

module.exports = { compatible, findPair, sharedGames };
