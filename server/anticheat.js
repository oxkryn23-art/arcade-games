// Very light anti-bot layer. It never bans, never blocks and never shows anything to the player.
// It only flags extreme, sustained timing: scripted-looking moves (median below BOT_MEDIAN_MS with almost no
// variance) repeated over at least BOT_MIN_MATCHES PvP matches and BOT_MIN_MOVES moves. A flagged player is matched
// with other flagged players first (see matchmaking.js). Kept in memory: a restart forgets it.
const config = require('./config');

const suspicious = new Map();   // player key -> { matches, moves }
const flagged = new Map();      // player key -> { reason, ts }

function timingStats(times) {
  const t = times.filter((x) => x != null).sort((a, b) => a - b);
  if (!t.length) return null;
  const median = t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2;
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  const stdev = Math.sqrt(t.reduce((a, b) => a + (b - mean) ** 2, 0) / t.length);
  return { moves: t.length, median, stdev };
}

// Called after every finished PvP match with each player's key and move times (null = missed move).
function recordMatch(keys, moveTimes) {
  keys.forEach((key, i) => {
    const st = timingStats(moveTimes[i]);
    if (!st || flagged.has(key)) return;
    if (!(st.median < config.BOT_MEDIAN_MS && st.stdev < config.BOT_MAX_STDEV_MS)) return;
    const s = suspicious.get(key) || { matches: 0, moves: 0 };
    s.matches++; s.moves += st.moves;
    suspicious.set(key, s);
    if (s.matches >= config.BOT_MIN_MATCHES && s.moves >= config.BOT_MIN_MOVES) {
      flagged.set(key, { reason: `${s.matches} matches, ${s.moves} moves with median < ${config.BOT_MEDIAN_MS} ms and stdev < ${config.BOT_MAX_STDEV_MS} ms`, ts: Date.now() });
    }
  });
}
const isFlagged = (key) => flagged.has(key);
function unflag(key) { flagged.delete(key); suspicious.delete(key); }

// Simple in-memory rate limit
const buckets = new Map();
let sweptAt = 0;
function rateLimit(key, max, perMs) {
  const now = Date.now();
  key = String(key).slice(0, 200);
  // expired buckets are dropped once a minute, so the map never grows without bound
  if (now - sweptAt > 60_000) { sweptAt = now; for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k); }
  const b = buckets.get(key) || { n: 0, reset: now + perMs };
  if (now > b.reset) { b.n = 0; b.reset = now + perMs; }
  b.n++;
  buckets.set(key, b);
  return b.n <= max;
}

module.exports = { timingStats, recordMatch, isFlagged, unflag, rateLimit, _flagged: flagged };
