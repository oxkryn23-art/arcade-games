// Penalty Shootout: players alternate as kicker and keeper, player 0 kicks first. 5 kicks each,
// early end when one side can't catch up, then sudden death in pairs (capped, then a draw).
const MOVES = ['left', 'center', 'right'];
const REGULATION = 5;     // kicks per player
const SUDDEN_CAP = 10;    // sudden death pairs before a draw

const kicksTaken = (s, p) => s.kicks.filter((k) => k.kicker === p).length;

// Decides the match after each kick. Returns { done, winner }.
function outcome(s) {
  const n = s.kicks.length;
  if (n <= REGULATION * 2) {
    const left = [0, 1].map((p) => REGULATION - kicksTaken(s, p));
    if (s.score[0] + left[0] < s.score[1]) return { done: true, winner: 1 };
    if (s.score[1] + left[1] < s.score[0]) return { done: true, winner: 0 };
    if (n < REGULATION * 2) return { done: false };
    if (s.score[0] !== s.score[1]) return { done: true, winner: s.score[0] > s.score[1] ? 0 : 1 };
    return { done: false };
  }
  // Sudden death: decided only after a full pair.
  if (n % 2 === 1) return { done: false };
  const [k0, k1] = s.kicks.slice(-2);
  if (k0.goal !== k1.goal) return { done: true, winner: k0.goal ? 0 : 1 };
  if ((n - REGULATION * 2) / 2 >= SUDDEN_CAP) return { done: true, winner: null };
  return { done: false };
}

module.exports = {
  id: 'penalty',
  name: 'Penalty Shootout',
  short: 'Pick a corner. Guess theirs.',
  rules: [
    'Players take turns as kicker and keeper. The screen shows your role before every kick.',
    'The kicker picks left, center or right. The keeper dives left, center or right.',
    'Same side: saved. Different side: goal.',
    `${REGULATION} kicks each. It ends early when one side can no longer catch up.`,
    `Tied after ${REGULATION} each: sudden death, one kick each until one scores and the other doesn't. After ${SUDDEN_CAP} pairs it's a draw.`,
    'If the kicker misses the timer, it is a miss. If the keeper misses the timer, it is a goal.',
  ],
  anim: { reveal: 2300 },  // client reveal animation budget (ms); the pause after a kick leaves a buffer
  revealMs: 2300 + 400,
  MOVES, REGULATION, SUDDEN_CAP,

  init() { return { score: [0, 0], kicks: [] }; },
  stepTimeMs() { return 6000; },

  kickerOf(s) { return s.kicks.length % 2; },

  publicState(s, p) {
    const kicker = s.kicks.length % 2;
    return {
      score: s.score, kicks: s.kicks, kicker, role: p === kicker ? 'kicker' : 'keeper',
      kickNo: s.kicks.length + 1, sudden: s.kicks.length >= REGULATION * 2, regulation: REGULATION,
      history: s.kicks,
    };
  },

  legalMoves() { return MOVES; },

  validateMove(s, p, m) {
    if (!MOVES.includes(m)) throw new Error('Invalid move');
    return m;
  },

  defaultMove() { return null; },

  resolveRound(s, moves) {
    const kicker = s.kicks.length % 2, keeper = 1 - kicker;
    const shot = moves[kicker], dive = moves[keeper];
    const goal = shot != null && shot !== dive;
    if (goal) s.score[kicker]++;
    s.kicks.push({ kicker, moves, shot, dive, goal, winner: goal ? kicker : keeper });
    const { done, winner } = outcome(s);
    return { roundWinner: goal ? kicker : null, done, winner: done ? winner : null };
  },
};
