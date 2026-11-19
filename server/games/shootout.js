// Shootout: a match of duels, first to 3 duel wins. Each turn both pick Reload, Block, Shoot or Blast.
// Ammo is public. A turn without a hit changes nothing except ammo.
const { byScore } = require('./util');

const MOVES = ['reload', 'block', 'shoot', 'blast'];
const IDLE = 'idle';          // recorded on timeout: like Reload, but without gaining ammo
const MAX_AMMO = 3;
const TARGET = 3;
const MAX_DUELS = 9;
const MAX_TURNS = 12;         // a duel this long without a hit ends with no point

const OPEN = new Set(['reload', IDLE]);

// Who wins the duel this turn: 0 | 1 | null.
function hit(a, b) {
  if (a === 'blast' && b !== 'blast') return 0;
  if (b === 'blast' && a !== 'blast') return 1;
  if (a === 'shoot' && OPEN.has(b)) return 0;
  if (b === 'shoot' && OPEN.has(a)) return 1;
  return null;
}

function canAfford(move, ammo) {
  if (move === 'shoot') return ammo >= 1;
  if (move === 'blast') return ammo === MAX_AMMO;
  return move === 'reload' || move === 'block';
}

module.exports = {
  id: 'shootout',
  name: 'Shootout',
  short: 'Reload, block or fire. Read the draw.',
  rules: [
    `A match is made of duels. The first player to win ${TARGET} duels takes the match.`,
    `Each duel, both start with 0 ammo. Each turn pick Reload (+1 ammo, max ${MAX_AMMO}), Block, Shoot (costs 1 ammo) or Blast (costs ${MAX_AMMO} ammo, needs exactly ${MAX_AMMO}).`,
    'Shoot hits a player who reloads. Shoot is blocked by Block, and two shots collide.',
    'Blast beats Reload, Block and Shoot. Two blasts cancel out.',
    'Spent ammo is gone even if nothing happens. Ammo resets at the start of each duel.',
    `A duel that lasts ${MAX_TURNS} turns without a hit ends with no point.`,
    'Miss the timer and you stand still without reloading, open to a shot.',
    `After ${MAX_DUELS} duels, the higher score wins. A tied score is a draw.`,
  ],
  anim: { reveal: 1500, duelOver: 2300 }, // client animation budgets (ms): a turn, and a turn that ends a duel
  revealMs: 1500 + 400,
  MOVES, IDLE, MAX_AMMO, hit,

  init() { return { duel: 1, turn: 0, duels: 0, ammo: [0, 0], score: [0, 0], history: [] }; },
  stepTimeMs() { return 6000; },

  publicState(s) {
    return {
      duel: s.duel, turn: s.turn, ammo: s.ammo, score: s.score, target: TARGET, maxAmmo: MAX_AMMO, maxTurns: MAX_TURNS,
      history: s.history,
    };
  },

  legalMoves(s, p) { return MOVES.filter((m) => canAfford(m, s.ammo[p])); },

  validateMove(s, p, m) {
    if (!MOVES.includes(m)) throw new Error('Invalid move');
    if (!canAfford(m, s.ammo[p])) throw new Error(m === 'blast' ? `Blast needs ${MAX_AMMO} ammo` : 'No ammo to shoot');
    return m;
  },

  defaultMove() { return IDLE; },

  resolveRound(s, moves) {
    const [a, b] = moves;
    const before = [...s.ammo];
    moves.forEach((m, i) => {
      if (m === 'reload') s.ammo[i] = Math.min(MAX_AMMO, s.ammo[i] + 1);
      else if (m === 'shoot') s.ammo[i] -= 1;
      else if (m === 'blast') s.ammo[i] -= MAX_AMMO;
    });
    s.turn++;
    const w = hit(a, b);
    const duelOver = w != null || s.turn >= MAX_TURNS;
    s.history.push({ moves, duel: s.duel, turn: s.turn, ammoBefore: before, ammo: [...s.ammo], winner: w, duelOver });
    if (w != null) s.score[w]++;
    if (duelOver) {
      s.duels++;
      s.duel++; s.turn = 0; s.ammo = [0, 0];
    }
    const done = s.score[0] >= TARGET || s.score[1] >= TARGET || s.duels >= MAX_DUELS;
    return { roundWinner: w, done, winner: done ? byScore(s.score) : null, pauseMs: duelOver ? 2300 + 400 : undefined };
  },
};
