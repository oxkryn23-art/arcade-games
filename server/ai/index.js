// AI opponent for demo matches. Demo play is free and never stored.
//
// Each demo match gets a random hidden personality. The AI only sees publicState (with the history of
// revealed steps), the same as a player. The opponent's current move never reaches it.
//   createAi() -> { personality, name, favorite }
//   chooseMove(gameId, publicState, ai, myIndex) -> a legal move
const { byId: games } = require('../games');

const PERSONALITIES = ['random', 'repeat_winner', 'switch_after_loss', 'favorite', 'mirror', 'cautious', 'aggressive'];
// The AI plays under a plain nickname like a player (the client adds a small "AI" tag from players[i].ai).
const NICKNAMES = ['Ace', 'Blitz', 'Clover', 'Dash', 'Echo', 'Fizz', 'Ghost', 'Jinx', 'Maverick', 'Nova', 'Pixel', 'Rook', 'Scout', 'Tango', 'Vex', 'Zed',
  'Biscuit', 'Comet', 'Domino', 'Gizmo', 'Kiwi', 'Lucky', 'Mango', 'Noodle', 'Pepper', 'Rocket', 'Sprout', 'Waffle'];
const NOISE = 0.2;                      // every personality plays a random legal move this often
const MIN_DELAY_MS = 600, MAX_DELAY_MS = 2500;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

function createAi() {
  return { personality: pick(PERSONALITIES), name: pick(NICKNAMES), seed: Math.random() };
}

const moveDelayMs = (stepTimeMs) => Math.min(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS), stepTimeMs - 400);

// The last revealed step from this player's point of view.
function lastStep(state, me) {
  const h = state.history?.at(-1);
  if (!h) return null;
  const moves = h.picks || h.moves;
  return { mine: moves[me], theirs: moves[1 - me], won: h.winner === me, lost: h.winner === 1 - me };
}

// A stable favorite per match among the options it applies to.
const favoriteOf = (ai, options) => options[Math.floor(ai.seed * options.length)];

// Generic personality over a list of legal options.
function generic(ai, options, last, counter) {
  const has = (m) => m != null && options.includes(m);
  switch (ai.personality) {
    case 'repeat_winner': if (last?.won && has(last.mine) && chance(0.75)) return last.mine; break;
    case 'switch_after_loss':
      if (last?.lost && chance(0.8)) { const other = options.filter((m) => m !== last.mine); if (other.length) return pick(other); }
      break;
    case 'favorite': { const f = favoriteOf(ai, options); if (chance(0.55)) return f; break; }
    case 'mirror': if (has(last?.theirs) && chance(0.7)) return last.theirs; break;
    case 'cautious': if (has(last?.mine) && chance(0.6)) return last.mine; break;     // sticks to what it did
    case 'aggressive': if (counter && has(counter(last?.theirs)) && chance(0.6)) return counter(last.theirs); break;
  }
  return pick(options);
}

function shootout(ai, s, me, last) {
  const ammo = s.ammo[me], theirs = s.ammo[1 - me];
  const options = games.shootout.legalMoves(s, me);
  if (options.includes('blast') && chance(0.7)) return 'blast';
  if (ai.personality === 'cautious') {
    if (theirs > 0 && chance(0.6)) return 'block';
    return ammo < 3 && chance(0.7) ? 'reload' : pick(options);
  }
  if (ai.personality === 'aggressive') {
    if (ammo > 0 && chance(0.75)) return 'shoot';
    return 'reload';
  }
  // Nobody can shoot an empty-handed opponent who reloads, so an unarmed opponent invites a reload.
  if (theirs === 0 && ammo < 3 && chance(0.5)) return 'reload';
  return generic(ai, options, last);
}

// How often a personality shows a double (rock + rock) in RPS Minus One: a double gives up the choice in phase 2
// (the opponent sees exactly what it will keep), so it is a rare bluff, a bit more often for the bold ones.
const DOUBLE = { aggressive: 0.22, favorite: 0.18, cautious: 0.04 };

function rpsMinusOne(ai, s, me, last) {
  if (s.phase === 'pick') {
    const lead = generic(ai, ['rock', 'paper', 'scissors'], last, (m) => COUNTER[m]);
    if (chance(DOUBLE[ai.personality] ?? 0.1)) return [lead, lead];
    return [lead, pick(['rock', 'paper', 'scissors'].filter((h) => h !== lead))];
  }
  const mine = s.pairs[me], theirs = s.pairs[1 - me];
  const value = (h) => theirs.reduce((v, t) => v + (BEATS[h] === t ? 1 : BEATS[t] === h ? -1 : 0), 0);
  if (chance(0.35)) return pick(mine);
  const best = Math.max(...mine.map(value));
  return pick(mine.filter((h) => value(h) === best));
}

function chooseMove(gameId, s, ai, me) {
  const game = games[gameId];
  const last = lastStep(s, me);
  if (gameId === 'rps_minus_one') return rpsMinusOne(ai, s, me, last);
  const options = game.legalMoves(s, me);
  if (chance(NOISE)) return pick(options);
  if (gameId === 'shootout') return shootout(ai, s, me, last);
  return generic(ai, options, last, gameId === 'rps' ? (m) => COUNTER[m] : null);
}

module.exports = { PERSONALITIES, NICKNAMES, MIN_DELAY_MS, MAX_DELAY_MS, createAi, chooseMove, moveDelayMs };
