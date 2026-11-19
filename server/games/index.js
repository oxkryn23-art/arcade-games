// Game registry. New game = new file with the same interface + a line here.
//
// All games are simultaneous: both players lock a move, then the server reveals both.
// A "step" is one simultaneous move by both players: a round, a turn, a kick or a phase.
//
// Game interface:
//   id, name, short, rules[]           player-facing texts
//   anim                               client animation budgets in ms ({ reveal, phase?, duelOver? });
//                                      every scene reveal must fit its budget
//   revealMs                           pause after a step before the next one starts (animation + buffer)
//   init(seed) -> state
//   stepTimeMs(state) -> timer for the current step
//   publicState(state, playerIndex) -> what the client sees: score, history of revealed steps,
//                                      role/phase/ammo where the game has them. NEVER a pending move.
//   legalMoves(state, playerIndex) -> moves a player may submit now (used by the AI and the tests)
//   validateMove(state, playerIndex, move) -> normalized move | throw (illegal or unaffordable)
//   defaultMove(state, playerIndex) -> what is recorded when the timer runs out (null = no move)
//   resolveRound(state, [moveP0, moveP1]) -> { roundWinner, done, winner, pauseMs? }
//       Resolves one step. roundWinner = 0 | 1 | null (null also for steps that score nothing,
//       e.g. phase 1 of RPS Minus One). pauseMs overrides revealMs for this step.
const games = [require('./rps'), require('./shootout'), require('./penalty'), require('./rps_minus_one')];
const byId = Object.fromEntries(games.map((g) => [g.id, g]));

const isEnabled = (id) => typeof id === 'string' && Object.hasOwn(byId, id);
const enabled = () => games;

// The engine of a game, or a clear error for an unknown id.
function check(id) {
  if (!isEnabled(id)) throw new Error('Unknown game');
  return byId[id];
}

module.exports = { games, byId, isEnabled, enabled, check };
