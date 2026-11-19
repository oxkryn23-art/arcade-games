// "Challenge a friend": a one-time link (/c/<code>) that starts a free 1v1 match between its creator and whoever
// accepts it, with no queue. Kept in memory (a restart forgets open challenges).
// - Games: one or several; with several, the server picks one at random when the match starts.
// - Lifetime: waiting for 24 h, then expired. The creator can cancel it. Accepting it twice, or your own, is refused.
//   An accepted challenge must start within START_WINDOW_MS, else it expires (sweep()); the accepter may also
//   withdraw before the start (the link waits for someone else again).
// - Seats: each side gets a secret its browser keeps; only its sha256 is stored.
// arena.js owns presence, readiness and starting the match; this module owns the records.
const crypto = require('crypto');
const { isEnabled } = require('./games');

const TTL_MS = 24 * 3600_000;
const START_WINDOW_MS = 60 * 60_000;
const KEEP_CLOSED_MS = 24 * 3600_000;   // closed challenges are forgotten after this
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_RE = /^[a-z2-9]{8}$/;

const rows = new Map();   // code -> row

const hash = (secret) => crypto.createHash('sha256').update(String(secret || '')).digest('hex');
const newSecret = () => crypto.randomBytes(18).toString('base64url');
function newCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!rows.has(code)) return code;
  }
}
const normCode = (code) => { const c = String(code || '').toLowerCase(); return CODE_RE.test(c) ? c : null; };
const get = (code) => { const c = normCode(code); return c ? rows.get(c) || null : null; };

// Who is asking: { secret } (the seat secret the browser sent).
const isCreator = (row, who) => !!who?.secret && hash(who.secret) === row.creatorSeat;
const isAccepter = (row, who) => !!row.accepterSeat && !!who?.secret && hash(who.secret) === row.accepterSeat;
const roleOf = (row, who) => (isCreator(row, who) ? 'creator' : isAccepter(row, who) ? 'accepter' : null);

// The status a viewer sees: a waiting challenge past its 24 h reads as expired before the sweep catches it.
const statusOf = (row, now = Date.now()) => (row.status === 'waiting' && row.expiresAt <= now ? 'expired' : row.status);

// What anyone with the link may see (never the seats). `role` is filled in for its creator / accepter.
function view(row, who = null, now = Date.now()) {
  return {
    code: row.code,
    status: statusOf(row, now),
    from: { name: row.creatorName, look: row.creatorLook },
    to: row.accepterName ? { name: row.accepterName, look: row.accepterLook } : null,
    games: row.games.filter(isEnabled),
    createdAt: row.createdAt, expiresAt: row.expiresAt, acceptedAt: row.acceptedAt, startBy: row.startBy,
    game: row.game,
    ...(who ? { role: roleOf(row, who) } : {}),
  };
}

// create({ name, look, games }) -> { row, secret }. name / look are already sanitized by the caller (arena.js).
function create({ name, look, games: wanted }, now = Date.now()) {
  const ids = [...new Set(Array.isArray(wanted) ? wanted : [])].filter(isEnabled);
  if (!ids.length) throw new Error('Pick at least one game');
  const secret = newSecret(), code = newCode();
  const row = {
    code, creatorName: name, creatorLook: look, creatorSeat: hash(secret), games: ids, status: 'waiting',
    createdAt: now, expiresAt: now + TTL_MS, accepterName: null, accepterLook: null, accepterSeat: null,
    acceptedAt: null, startBy: null, matchId: null, game: null, startedAt: null, closedAt: null,
  };
  rows.set(code, row);
  return { row, secret };
}

// accept(code, who, { name, look }) -> { row, secret }
function accept(code, who, { name, look }, now = Date.now()) {
  const row = get(code);
  if (!row) throw new Error('This challenge does not exist');
  if (isCreator(row, who)) throw new Error("You can't accept your own challenge");
  const st = statusOf(row, now);
  if (st !== 'waiting') throw new Error({ accepted: 'This challenge was already accepted', started: 'This challenge was already played', cancelled: 'This challenge was cancelled', expired: 'This challenge has expired' }[st] || 'This challenge is closed');
  const secret = newSecret();
  Object.assign(row, {
    status: 'accepted', accepterName: name, accepterLook: look, accepterSeat: hash(secret),
    acceptedAt: now, startBy: now + START_WINDOW_MS, matchId: crypto.randomBytes(8).toString('hex'),
  });
  return { row, secret };
}

const close = (row, status, now = Date.now()) => { row.status = status; row.closedAt = now; return row; };

// The creator cancels a waiting or accepted (not yet started) challenge.
function cancel(code, who) {
  const row = get(code);
  if (!row) throw new Error('This challenge does not exist');
  if (!isCreator(row, who)) throw new Error('Only the challenger can cancel it');
  if (!['waiting', 'accepted'].includes(row.status)) throw new Error('This challenge is already closed');
  return close(row, 'cancelled');
}

// The accepter withdraws before the match starts: the link waits for someone else again.
function withdraw(code, who) {
  const row = get(code);
  if (!row || row.status !== 'accepted' || !isAccepter(row, who)) throw new Error("There's nothing to withdraw");
  Object.assign(row, { status: 'waiting', accepterName: null, accepterLook: null, accepterSeat: null, acceptedAt: null, startBy: null, matchId: null });
  return row;
}

// Marks an accepted challenge as started with the picked game. Returns false when it isn't accepted any more.
function markStarted(code, game, now = Date.now()) {
  const row = get(code);
  if (!row || row.status !== 'accepted') return false;
  Object.assign(row, { status: 'started', game, startedAt: now, closedAt: now });
  return true;
}

// A random game of the challenge (the server's pick when several were offered).
function pickGame(row) {
  const ids = row.games.filter(isEnabled);
  return ids.length ? ids[crypto.randomInt(ids.length)] : null;
}

// Expires waiting challenges past 24 h and accepted ones that never started; forgets old closed ones.
// Returns the rows that changed.
function sweep(now = Date.now()) {
  const out = [];
  for (const row of rows.values()) {
    if (row.status === 'waiting' && row.expiresAt <= now) out.push(close(row, 'expired', now));
    else if (row.status === 'accepted' && row.startBy <= now) out.push(close(row, 'expired', now));
    else if (row.closedAt && now - row.closedAt > KEEP_CLOSED_MS) rows.delete(row.code);
  }
  return out;
}

const accepted = () => [...rows.values()].filter((r) => r.status === 'accepted');

module.exports = { TTL_MS, START_WINDOW_MS, get, normCode, view, create, accept, cancel, withdraw, markStarted, pickGame, sweep, accepted, roleOf, isCreator, isAccepter, statusOf, _rows: rows };
