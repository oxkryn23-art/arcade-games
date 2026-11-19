// Matchmaking queue + running matches. The server is the single source of truth: clients only send moves, and an
// opponent's move is never sent before both are locked.
// Three modes, all free: 'pvp' (quick match from the queue), 'demo' (vs the AI) and 'friendly' (a challenge link,
// server/challenges.js). Nothing is stored: a match lives in memory until it ends.
//
// Players: a socket brings a random id its browser keeps (socket auth `pid`, 32 hex characters); the player's key is
// a hash of it ('p:<hash>'), so a reload or a reopened tab is the same player and comes back to a running match.
// Without one, the socket's own id ('s:<socketId>'). The AI is 'ai'. Names and looks come with each request
// (validated: public/js/names.js, server/avatar.js); they only change how players look.
const crypto = require('crypto');
const config = require('./config');
const anticheat = require('./anticheat');
const matchmaking = require('./matchmaking');
const { byId: games, check: checkGame, isEnabled } = require('./games');
const ai = require('./ai');
const avatar = require('./avatar');
const challenges = require('./challenges');
const names = require('../public/js/names.js');
const errors = require('./errors');

const START_DELAY_MS = 3000;   // "Matched: <game>" reveal before the first step

let io;
const queue = [];              // FIFO entries, see matchmaking.js
const state = new Map();       // key -> { status: 'queue'|'match', matchId? }
const matches = new Map();     // matchId -> match
const online = new Map();      // key -> number of connected sockets

const emitTo = (key, ev, data) => { if (key !== 'ai') io.to(`p:${key}`).emit(ev, data); };
const stateOf = (key) => state.get(key) || { status: 'idle' };

// A player's nickname: the shared name rules (public/js/names.js), or a random fun one when it breaks them.
const cleanName = (name) => {
  const n = names.clean(typeof name === 'string' ? name : '');
  return n && !names.problem(n) ? n : names.random();
};
const who = (d) => ({ name: cleanName(d?.name), look: avatar.valid(d?.look) });
function wantedGames(list) {
  const ids = [...new Set(Array.isArray(list) ? list : [])].filter(isEnabled);
  if (!ids.length) throw new Error('Pick at least one game');
  return ids;
}

// ---------------- QUEUE ----------------
function joinQueue(key, d) {
  if (stateOf(key).status !== 'idle') throw new Error("You're already in a queue or a match");
  if (!anticheat.rateLimit(`q:${key}`, 20, 60_000)) throw new Error('Too many attempts, try again in a moment');
  const ids = wantedGames(d.games);
  const entry = { key, ...who(d), games: ids, joinedAt: Date.now(), flagged: anticheat.isFlagged(key) };
  queue.push(entry);
  state.set(key, { status: 'queue' });
  emitTo(key, 'queue:joined', { games: ids, since: entry.joinedAt });
  tryMatch();
}

function leaveQueue(key) {
  if (stateOf(key).status !== 'queue') return;
  const i = queue.findIndex((e) => e.key === key);
  if (i >= 0) queue.splice(i, 1);
  state.delete(key);
  emitTo(key, 'queue:left', {});
}

function tryMatch() {
  for (;;) {
    const pair = matchmaking.findPair(queue, Date.now(), { shadowWaitMs: config.SHADOW_POOL_WAIT_MS });
    if (!pair) return;
    for (const e of [pair.a, pair.b]) queue.splice(queue.indexOf(e), 1);
    launchMatch({
      id: crypto.randomBytes(8).toString('hex'), mode: 'pvp', gameId: pair.game,
      players: [pair.a, pair.b].map((e) => ({ key: e.key, name: e.name, look: e.look })),
    });
  }
}

// ---------------- DEMO (vs the AI) ----------------
// demo:start { gameId, name, look }. The AI gets a random nickname and a random look, fixed for the match.
function startDemo(key, d = {}) {
  if (stateOf(key).status !== 'idle') throw new Error("You're already in a queue or a match");
  checkGame(d.gameId);
  if (!anticheat.rateLimit(`demo:${key}`, 30, 60_000)) throw new Error('Too many attempts, try again in a moment');
  const bot = ai.createAi();
  launchMatch({
    id: crypto.randomBytes(8).toString('hex'), mode: 'demo', gameId: d.gameId, bot,
    players: [{ key, ...who(d) }, { key: 'ai', name: bot.name, look: avatar.random() }],
  });
}

// ---------------- CHALLENGES (server/challenges.js) ----------------
// A challenge starts as soon as both of its players are online and free (idle or in the queue, which they then leave)
// and at least one of them is "ready": the accepter for HOLD_MS after accepting (so a creator who comes back within
// that time gets the match right away), either of them for HOLD_MS after pressing "Play now". Otherwise it stays
// accepted; its players see it (challenge:update, challenge:hello) with a "Play now" button.
// Seats: the socket that last showed a seat's secret holds it (seatKeys).
const HOLD_MS = 2 * 60_000;
const seatKeys = new Map();    // `${code}:${role}` -> key of the player holding that seat
const ready = new Map();       // code -> { creator: until, accepter: until }
function partyKey(row, role) {
  const k = seatKeys.get(`${row.code}:${role}`);
  return k && online.has(k) ? k : null;
}
const isFree = (key) => ['idle', 'queue'].includes(stateOf(key).status);
// Sends the challenge's new state to both of its players (and to extra keys, e.g. one who just withdrew).
function notifyChallenge(row, extraKeys = {}) {
  for (const role of ['creator', 'accepter']) {
    const keys = new Set(extraKeys[role] || []);
    const k = seatKeys.get(`${row.code}:${role}`);
    if (k) keys.add(k);
    for (const k2 of keys) emitTo(k2, 'challenge:update', { challenge: { ...challenges.view(row), role } });
  }
}
function tryChallenges(now = Date.now()) {
  for (const row of challenges.accepted()) {
    const r = ready.get(row.code) || {};
    if (!((r.creator || 0) > now || (r.accepter || 0) > now)) continue;
    const ka = partyKey(row, 'creator'), kb = partyKey(row, 'accepter');
    if (!ka || !kb || ka === kb || !isFree(ka) || !isFree(kb)) continue;
    startChallenge(row, ka, kb);
  }
}
function startChallenge(row, ka, kb) {
  const gameId = challenges.pickGame(row);
  if (!gameId || !challenges.markStarted(row.code, gameId)) return;
  ready.delete(row.code);
  leaveQueue(ka); leaveQueue(kb);
  launchMatch({
    id: row.matchId, mode: 'friendly', gameId,
    players: [{ key: ka, name: row.creatorName, look: row.creatorLook }, { key: kb, name: row.accepterName, look: row.accepterLook }],
  });
  notifyChallenge(row);
}
function sweepChallenges(now = Date.now()) {
  for (const row of challenges.sweep(now)) { ready.delete(row.code); notifyChallenge(row); }
}

function challengeHandlers(socket, key, safe) {
  const seat = (secret) => ({ secret: typeof secret === 'string' ? secret.slice(0, 64) : null });
  socket.on('challenge:create', safe((d) => {
    if (!anticheat.rateLimit(`ch:create:${key}`, 10, 3600_000) || !anticheat.rateLimit(`ch:create-ip:${ipOf(socket)}`, 30, 3600_000)) throw new Error('Too many challenges, try again later');
    const { row, secret } = challenges.create({ ...who(d), games: d.games });
    seatKeys.set(`${row.code}:creator`, key);
    return { challenge: challenges.view(row, seat(secret)), secret };
  }));
  socket.on('challenge:accept', safe((d) => {
    if (!anticheat.rateLimit(`ch:accept:${key}`, 20, 60_000)) throw new Error('Too many attempts, try again in a moment');
    const row0 = challenges.get(d.code);
    if (row0 && seatKeys.get(`${row0.code}:creator`) === key) throw new Error("You can't accept your own challenge");
    if (stateOf(key).status === 'match') throw new Error('Finish your match first');
    const { row, secret } = challenges.accept(d.code, seat(d.secret), who(d));
    seatKeys.set(`${row.code}:accepter`, key);
    ready.set(row.code, { accepter: Date.now() + HOLD_MS });
    notifyChallenge(row);
    tryChallenges();
    return { challenge: challenges.view(challenges.get(row.code), seat(secret)), secret };
  }));
  socket.on('challenge:cancel', safe((d) => {
    const row = challenges.cancel(d.code, seat(d.secret));
    ready.delete(row.code); notifyChallenge(row);
    return { challenge: challenges.view(row, seat(d.secret)) };
  }));
  socket.on('challenge:withdraw', safe((d) => {
    const before = challenges.get(d.code);
    const accKey = before && seatKeys.get(`${before.code}:accepter`);
    const row = challenges.withdraw(d.code, seat(d.secret));
    ready.delete(row.code); seatKeys.delete(`${row.code}:accepter`);
    notifyChallenge(row, { accepter: accKey ? [accKey] : [] });
    return { challenge: challenges.view(row) };
  }));
  // "Play now" on an accepted challenge: ready for HOLD_MS; it starts as soon as the other player is here too.
  socket.on('challenge:play', safe((d) => {
    const row = challenges.get(d.code);
    const role = row && challenges.roleOf(row, seat(d.secret));
    if (!role) throw new Error('This challenge is not yours');
    if (row.status !== 'accepted') throw new Error({ started: 'This challenge was already played', waiting: 'Nobody has accepted it yet' }[row.status] || 'This challenge is closed');
    if (stateOf(key).status === 'match') throw new Error('Finish your match first');
    seatKeys.set(`${row.code}:${role}`, key);
    ready.set(row.code, { ...(ready.get(row.code) || {}), [role]: Date.now() + HOLD_MS });
    tryChallenges();
    return { challenge: challenges.view(challenges.get(row.code), seat(d.secret)) };
  }));
  // On connect the client shows its seats (the secrets it keeps): this socket now holds them and gets their state.
  socket.on('challenge:hello', safe((d) => {
    const out = [];
    for (const s of (Array.isArray(d.seats) ? d.seats : []).slice(0, 30)) {
      const row = challenges.get(s?.code);
      const role = row && challenges.roleOf(row, seat(s.secret));
      if (!role) continue;
      seatKeys.set(`${row.code}:${role}`, key);
      out.push(challenges.view(row, seat(s.secret)));
    }
    tryChallenges();
    return { challenges: out };
  }));
}

// ---------------- MATCH ----------------
function launchMatch({ id, mode, gameId, players, bot = null }) {
  const game = games[gameId];
  const seed = crypto.randomInt(0, 2 ** 31);
  const m = {
    id, mode, gameId, game, players, bot, seed,
    state: game.init(seed), moves: [undefined, undefined], moveTimes: [[], []], steps: [], timer: null, aiTimer: null, ended: false,
  };
  matches.set(id, m);
  players.forEach((p) => { if (p.key !== 'ai') state.set(p.key, { status: 'match', matchId: id }); });
  players.forEach((p, i) => emitTo(p.key, 'match:found', matchInfo(m, i)));
  m.timer = setTimeout(() => startStep(m), START_DELAY_MS);
}

function matchInfo(m, i) {
  return {
    matchId: m.id, gameId: m.gameId, mode: m.mode, you: i,
    players: m.players.map((p) => ({ name: p.name, look: { ...p.look }, ...(p.key === 'ai' ? { ai: true } : {}) })),
  };
}

function startStep(m) {
  if (m.ended) return;
  m.moves = [undefined, undefined];
  const stepMs = m.game.stepTimeMs(m.state);
  m.stepStartedAt = Date.now();
  m.deadline = m.stepStartedAt + stepMs;
  m.players.forEach((p, i) => emitTo(p.key, 'match:round', {
    matchId: m.id, deadline: m.deadline, serverNow: Date.now(), stepMs, state: m.game.publicState(m.state, i),
  }));
  m.timer = setTimeout(() => endStep(m), stepMs + 300); // small latency tolerance
  if (m.bot) scheduleAiMove(m, stepMs);
}

// The AI picks its move at the start of the step from publicState only; the player's move doesn't exist yet.
function scheduleAiMove(m, stepMs) {
  const i = m.players.findIndex((p) => p.key === 'ai');
  const move = ai.chooseMove(m.gameId, m.game.publicState(m.state, i), m.bot, i);
  m.aiTimer = setTimeout(() => {
    try { submitMove('ai', m.id, move); }
    catch (e) { console.error('AI move', m.gameId, m.bot.personality, e.message); }
  }, ai.moveDelayMs(stepMs));
}

function submitMove(key, matchId, move) {
  const m = matches.get(matchId);
  if (!m || m.ended || !m.stepStartedAt) throw new Error('This match is not running');
  const i = m.players.findIndex((p) => p.key === key);
  if (i < 0) throw new Error("You're not in this match");
  if (m.moves[i] !== undefined) throw new Error('Your move is already locked');
  if (Date.now() > m.deadline + 300) throw new Error('Too late');
  m.moves[i] = m.game.validateMove(m.state, i, move);
  m.moveTimes[i].push(Date.now() - m.stepStartedAt);
  emitTo(key, 'match:locked', { matchId });
  emitTo(m.players[1 - i].key, 'match:opponentLocked', { matchId });
  if (m.moves[0] !== undefined && m.moves[1] !== undefined) { clearTimeout(m.timer); endStep(m); }
}

function endStep(m) {
  if (m.ended) return;
  clearTimeout(m.aiTimer);
  m.stepStartedAt = null;
  for (let i = 0; i < 2; i++) {
    if (m.moves[i] === undefined) { m.moves[i] = m.game.defaultMove(m.state, i); m.moveTimes[i].push(null); }
  }
  const moves = [...m.moves];
  const res = m.game.resolveRound(m.state, moves);
  m.steps.push({ moves, winner: res.roundWinner });
  m.players.forEach((p, i) => emitTo(p.key, 'match:roundResult', {
    matchId: m.id, moves, roundWinner: res.roundWinner, state: m.game.publicState(m.state, i),
  }));
  const pause = res.pauseMs ?? m.game.revealMs;
  // decided: a forfeit in the pause before the result can no longer override it
  if (res.done) { m.decided = true; m.timer = setTimeout(() => finish(m, res.winner, 'normal'), Math.round(pause * 0.7)); }
  else m.timer = setTimeout(() => startStep(m), pause);
}

function forfeit(key, matchId) {
  const m = matches.get(matchId);
  if (!m || m.ended || m.decided) return;
  const i = m.players.findIndex((p) => p.key === key);
  if (i < 0) return;
  finish(m, 1 - i, 'forfeit');
}

// Ends a demo match without a result (its player left for good).
function abort(m) {
  m.ended = true;
  clearTimeout(m.timer); clearTimeout(m.aiTimer);
  m.players.forEach((p) => state.delete(p.key));
  matches.delete(m.id);
}

function finish(m, winnerIdx, reason) {
  if (m.ended) return;
  m.ended = true;
  clearTimeout(m.timer); clearTimeout(m.aiTimer);
  m.players.forEach((p, i) => {
    state.delete(p.key);
    emitTo(p.key, 'match:end', { matchId: m.id, winner: winnerIdx, you: i, reason, mode: m.mode, gameId: m.gameId, state: m.game.publicState(m.state, i) });
  });
  if (m.mode === 'pvp') anticheat.recordMatch(m.players.map((p) => p.key), m.moveTimes);
  setTimeout(() => matches.delete(m.id), 60_000);
}

// ---------------- SOCKETS ----------------
const ipOf = (socket) => socket.handshake.address || socket.conn.remoteAddress || '';
const playerKey = (socket) => {
  const a = socket.handshake?.auth?.pid;
  return typeof a === 'string' && /^[a-f0-9]{32}$/.test(a) ? `p:${crypto.createHash('sha256').update(a).digest('hex').slice(0, 32)}` : `s:${socket.id}`;
};
// the grace timers of players who lost their connection during a match (key -> timer)
const rejoinGrace = new Map();
function onConnect(socket) {
  const key = playerKey(socket);
  // back in time: the match goes on as if nothing happened
  if (rejoinGrace.has(key)) { clearTimeout(rejoinGrace.get(key)); rejoinGrace.delete(key); }
  socket.join(`p:${key}`);
  online.set(key, (online.get(key) || 0) + 1);
  socket.emit('lobby:stats', lobbyStats());

  // back into a running match (a reload, a reopened tab, a lost connection): the same round, score and deadline
  const st = stateOf(key);
  if (st.status === 'match') {
    const m = matches.get(st.matchId);
    if (m && !m.ended) {
      const i = m.players.findIndex((p) => p.key === key);
      socket.emit('match:found', { ...matchInfo(m, i), resumed: true });
      if (m.stepStartedAt) socket.emit('match:round', { matchId: m.id, deadline: m.deadline, serverNow: Date.now(), stepMs: m.deadline - m.stepStartedAt, state: m.game.publicState(m.state, i), locked: m.moves[i] !== undefined, oppLocked: m.moves[1 - i] !== undefined });
    }
  } else if (st.status === 'queue') {
    const e = queue.find((x) => x.key === key);
    if (e) socket.emit('queue:joined', { games: e.games, since: e.joinedAt });
  }

  const safe = (fn) => async (data, ack) => {
    try {
      if (!anticheat.rateLimit(`ev:${socket.id}`, 40, 1000)) throw new Error('Slow down');
      const r = await fn(data && typeof data === 'object' ? data : {});
      if (typeof ack === 'function') ack({ ok: true, ...(r && typeof r === 'object' && !Array.isArray(r) ? r : {}) });
    } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: errors.publicMessage(e, 'socket') }); }
  };
  socket.on('queue:join', safe((d) => joinQueue(key, d)));
  socket.on('queue:leave', safe(() => leaveQueue(key)));
  socket.on('demo:start', safe((d) => {
    if (!anticheat.rateLimit(`demo-ip:${ipOf(socket)}`, 60, 60_000)) throw new Error('Too many attempts, try again in a moment');
    return startDemo(key, d);
  }));
  socket.on('match:move', safe((d) => submitMove(key, d.matchId, d.move)));
  socket.on('match:forfeit', safe((d) => forfeit(key, d.matchId)));
  challengeHandlers(socket, key, safe);

  socket.on('disconnect', () => {
    const n = (online.get(key) || 1) - 1;
    if (n > 0) { online.set(key, n); return; }
    online.delete(key);
    leaveQueue(key);
    for (const [s, k] of seatKeys) if (k === key) seatKeys.delete(s);
    // REJOIN_GRACE_MS to come back (the same browser id); after that a demo ends without a result and a match
    // against a person is forfeited. Meanwhile the match runs on: a turn without a move gets the default move.
    const s = stateOf(key);
    if (s.status === 'match') {
      const ends = () => {
        rejoinGrace.delete(key);
        if (online.get(key)) return;
        const m = matches.get(s.matchId);
        if (m && m.mode === 'demo') abort(m); else if (m) forfeit(key, m.id);
      };
      if (key.startsWith('s:')) ends();   // no id to come back with
      else { clearTimeout(rejoinGrace.get(key)); rejoinGrace.set(key, setTimeout(ends, config.REJOIN_GRACE_MS)); }
    }
  });
}

// Public lobby stats: how many players wait per game (never who, never the online count).
function lobbyStats() {
  if (!config.SHOW_WAITING_COUNTS) return {};
  const waiting = Object.fromEntries(Object.keys(games).map((g) => [g, 0]));
  for (const e of queue) for (const g of e.games) waiting[g]++;
  return { waiting };
}

function init(_io) {
  io = _io;
  let tick = 0;
  setInterval(() => {
    tryMatch();                                     // releases flagged players after SHADOW_POOL_WAIT_MS
    tryChallenges();                                // a player of an accepted challenge came back or finished a match
    if (++tick % 15 === 0) sweepChallenges();       // expired challenges
    io.emit('lobby:stats', lobbyStats());
  }, 1000).unref();
}

module.exports = { init, onConnect, lobbyStats, cleanName, _internal: { queue, matches, state, sweepChallenges, ready, seatKeys, rejoinGrace } };
