// Which face a character makes at which moment: the one place to pin expressions per action.
//
// Every moment belongs to one CATEGORY, and each category has a face (rig.js FACES):
//
//   category  what                                              face
//   start     match start, "opponent found", the landing        smile
//   normal    idle, waiting, locked, reveal, every action       the round mood: focus / neutral / think
//   won       round won (a goal, a save, a hit...)              grin
//   lost      round lost (conceded, hit, fooled, missed...)     oops
//   draw      round draw                                        meh
//   matchWon  match won                                         joy
//   matchLost match lost                                        sad
//
// The ROUND MOOD is rolled once per round per character and kept for every "normal" moment of that round, so a face
// changes from round to round without flickering inside one. No leaks: a locked moment is "normal" whatever the move,
// and the mood is random, never derived from the move.
//
// Moment ids are numbered per mini-game: RPS (Rock Paper Scissors), M1 (RPS Minus One), PEN (Penalty), SHO (Shootout)
// and GEN (outside a match). Old moment names (idle, locked, ...) are aliases (ALIAS below).
(function () {
  const FACE = { start: 'smile', won: 'grin', lost: 'oops', draw: 'meh', matchWon: 'joy', matchLost: 'sad' };
  const MOOD = ['focus', 'neutral', 'think'];

  // [id, what happens, category]
  const MOMENTS = [
    ['RPS-1', 'Match start', 'start'], ['RPS-2', 'Waiting for my move', 'normal'], ['RPS-3', 'Locked in', 'normal'],
    ['RPS-4', 'Reveal', 'normal'], ['RPS-5', 'Round won', 'won'], ['RPS-6', 'Round lost', 'lost'], ['RPS-7', 'Draw', 'draw'],
    ['RPS-8', 'Match won', 'matchWon'], ['RPS-9', 'Match lost', 'matchLost'],
    ['M1-1', 'Match start', 'start'], ['M1-2', 'Picking two', 'normal'], ['M1-3', 'Pair locked', 'normal'],
    ['M1-4', 'Both pairs revealed', 'normal'], ['M1-5', 'Keeping one', 'normal'], ['M1-6', 'Keep locked', 'normal'],
    ['M1-7', 'Final reveal', 'normal'], ['M1-8', 'Round won', 'won'], ['M1-9', 'Round lost', 'lost'], ['M1-10', 'Draw', 'draw'],
    ['M1-11', 'Match won', 'matchWon'], ['M1-12', 'Match lost', 'matchLost'],
    ['PEN-1', 'Match start', 'start'], ['PEN-2', 'Kicker, waiting', 'normal'], ['PEN-3', 'Keeper, waiting', 'normal'],
    ['PEN-4', 'Locked in', 'normal'], ['PEN-5', 'Kicking', 'normal'], ['PEN-6', 'The dive', 'normal'],
    ['PEN-7', 'Goal scored', 'won'], ['PEN-8', 'Goal conceded', 'lost'], ['PEN-9', 'Saved it', 'won'], ['PEN-10', 'Shot saved', 'lost'],
    ['PEN-11', 'Missed the move', 'lost'], ['PEN-12', 'Match won', 'matchWon'], ['PEN-13', 'Match lost', 'matchLost'],
    ['SHO-1', 'Match start (stare-down)', 'start'], ['SHO-2', 'Waiting for my move', 'normal'], ['SHO-3', 'Locked in', 'normal'],
    ['SHO-4', 'Reload', 'normal'], ['SHO-5', 'Block', 'normal'], ['SHO-6', 'Block hit', 'normal'], ['SHO-7', 'Shoot', 'normal'],
    ['SHO-8', 'Blast', 'normal'], ['SHO-9', 'Hit (knocked over)', 'lost'], ['SHO-10', 'Fooled (empty gun)', 'normal'],
    ['SHO-11', 'Duel won', 'won'], ['SHO-12', 'Duel lost', 'lost'], ['SHO-13', 'Duel draw', 'draw'],
    ['SHO-14', 'Match won', 'matchWon'], ['SHO-15', 'Match lost', 'matchLost'],
    ['GEN-1', 'Idle (any screen)', 'normal'], ['GEN-2', 'Landing', 'start'], ['GEN-3', 'Lobby', 'normal'],
    ['GEN-4', 'Queue', 'normal'], ['GEN-5', 'Opponent found', 'start'], ['GEN-6', 'Avatar picker', 'matchWon'],
    ['GEN-8', 'Avatar', 'normal'], ['GEN-9', 'Result card: a win', 'matchWon'], ['GEN-10', 'Result card: a loss', 'lost'],
    ['GEN-11', 'Result card: a draw', 'start'],
  ];
  const ALIAS = {
    idle: 'GEN-1', locked: 'RPS-3', reveal: 'RPS-4', roundWon: 'RPS-5', roundLost: 'RPS-6', draw: 'RPS-7',
    celebrate: 'RPS-8', hit: 'SHO-9', keeperDive: 'PEN-6', kick: 'PEN-5', shoot: 'SHO-7', blast: 'SHO-8',
    reload: 'SHO-4', block: 'SHO-5', blockHit: 'SHO-6',
  };
  const GROUP = Object.fromEntries(MOMENTS.map(([id, , group]) => [id, group]));
  const resolve = (moment) => ALIAS[moment] || moment;
  const category = (moment) => GROUP[resolve(moment)] || 'normal';

  // the round mood per character (key = the rig); null = a fresh roll
  const moods = new WeakMap();
  const roll = () => MOOD[Math.floor(Math.random() * MOOD.length)];
  function pick(moment, key = null) {
    const group = category(moment);
    if (group !== 'normal') { if (key) moods.delete(key); return FACE[group]; }
    if (!key) return roll();
    if (!moods.has(key)) moods.set(key, roll());
    return moods.get(key);
  }

  window.DuelExpressions = { FACE, MOOD, MOMENTS, ALIAS, GROUP, resolve, category, pick, ids: () => MOMENTS.map((m) => m[0]) };
})();
