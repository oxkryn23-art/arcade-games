// Rock Paper Scissors, first to 3 round wins. Purely simultaneous moves, no server-side randomness.
const { byScore } = require('./util');

const MOVES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const TARGET = 3;
const MAX_ROUNDS = 15;

module.exports = {
  id: 'rps',
  name: 'Rock Paper Scissors',
  short: 'Read their next move.',
  rules: [
    'Both players secretly pick rock, paper, or scissors.',
    'Rock beats scissors, scissors beats paper, paper beats rock.',
    `The first player to win ${TARGET} rounds takes the match.`,
    'Miss the timer and you lose the round.',
    `After ${MAX_ROUNDS} rounds, the higher score wins. A tied score is a draw.`,
  ],
  anim: { reveal: 2200 },  // client reveal animation budget (ms); the pause after a step leaves a buffer
  revealMs: 2200 + 400,
  MOVES, BEATS,

  init() { return { round: 0, score: [0, 0], history: [] }; },
  stepTimeMs() { return 10000; },

  publicState(s) { return { round: s.round, score: s.score, history: s.history, target: TARGET }; },
  legalMoves() { return MOVES; },

  validateMove(s, p, m) {
    if (!MOVES.includes(m)) throw new Error('Invalid move');
    return m;
  },

  defaultMove() { return null; }, // timeout = round lost

  resolveRound(s, moves) {
    s.round++;
    const [a, b] = moves;
    let w = null;
    if (a && !b) w = 0;
    else if (b && !a) w = 1;
    else if (a && b && a !== b) w = BEATS[a] === b ? 0 : 1;
    if (w != null) s.score[w]++;
    s.history.push({ moves, winner: w });
    const done = s.score[0] >= TARGET || s.score[1] >= TARGET || s.round >= MAX_ROUNDS;
    return { roundWinner: w, done, winner: done ? byScore(s.score) : null };
  },
};
