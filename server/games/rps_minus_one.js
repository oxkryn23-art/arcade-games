// RPS Minus One, first to 3 points. Each round has two phases. Phase 1: both pick two hands (the same gesture twice
// is allowed: rock + rock), both pairs are revealed. Phase 2: seeing the other pair, both keep one hand, then normal
// RPS decides the round.
const { byScore } = require('./util');

const HANDS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const TARGET = 3;
const MAX_ROUNDS = 12;
// Every legal pair (any two gestures, doubles included), in the server's sorted order.
const PAIRS = [['rock', 'rock'], ['paper', 'paper'], ['scissors', 'scissors'], ['paper', 'rock'], ['rock', 'scissors'], ['paper', 'scissors']];

const pairKey = (pair) => [...pair].sort().join('+');

function finishRound(s, picks, w) {
  if (w != null) s.score[w]++;
  s.history.push({ pairs: s.pairs, picks, winner: w });
  s.round++;
  s.phase = 'pick'; s.pairs = null;
  const done = s.score[0] >= TARGET || s.score[1] >= TARGET || s.round >= MAX_ROUNDS;
  return { roundWinner: w, done, winner: done ? byScore(s.score) : null };
}

module.exports = {
  id: 'rps_minus_one',
  name: 'RPS Minus One',
  short: 'Show two hands. Keep one.',
  rules: [
    'Phase 1: both players pick two hands. The same hand twice is allowed (rock + rock). Both pairs are revealed.',
    'Phase 2: seeing the other pair, each player keeps one of their two hands. Then normal rock paper scissors.',
    `The round winner gets 1 point. The first player to ${TARGET} points takes the match.`,
    'Miss the timer in either phase and you lose the round.',
    `After ${MAX_ROUNDS} rounds, the higher score wins. A tied score is a draw.`,
  ],
  anim: { phase: 900, reveal: 2300 }, // client animation budgets (ms): the pair reveal, and the clash
  revealMs: 2300 + 400,
  HANDS, PAIRS, BEATS,

  init() { return { round: 0, phase: 'pick', pairs: null, score: [0, 0], history: [] }; },
  stepTimeMs(s) { return s.phase === 'pick' ? 8000 : 5000; },

  // pairs are only set after both players locked phase 1, so they never leak early.
  publicState(s) {
    return { round: s.round, phase: s.phase, pairs: s.pairs, score: s.score, target: TARGET, history: s.history };
  },

  legalMoves(s, p) { return s.phase === 'pick' ? PAIRS : s.pairs[p]; },

  validateMove(s, p, m) {
    if (s.phase === 'pick') {
      if (!Array.isArray(m) || m.length !== 2 || !m.every((h) => HANDS.includes(h))) throw new Error('Pick two hands');
      return pairKey(m).split('+');
    }
    if (!s.pairs[p].includes(m)) throw new Error('Keep one of your two hands');
    return m;
  },

  defaultMove() { return null; },

  resolveRound(s, moves) {
    const [a, b] = moves;
    if (s.phase === 'pick') {
      // A missed phase 1 loses the round right away.
      if (!a || !b) return finishRound(s, [null, null], !a && !b ? null : a ? 0 : 1);
      s.pairs = [a, b]; s.phase = 'keep';
      return { roundWinner: null, done: false, winner: null, pauseMs: 900 + 400 };
    }
    let w = null;
    if (a && !b) w = 0;
    else if (b && !a) w = 1;
    else if (a && b && a !== b) w = BEATS[a] === b ? 0 : 1;
    return finishRound(s, moves, w);
  },
};
