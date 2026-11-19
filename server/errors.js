// What a player may read of an error. The server's deliberate, player-facing errors are
// plain `throw new Error('Pick at least one game')` everywhere (routes, sockets, games, challenges); that is
// how they are told apart today, and it stays the convention. Everything else is unexpected and its text never reaches
// a player: a TypeError / RangeError / SyntaxError (a bug), an error with a `code` (Node system and network errors),
// an error wrapping a `cause`, or a plain Error whose text looks internal (a URL, a file path, a stack frame,
// "fetch failed", "undefined"...). Those get GENERIC and are logged here.
// A deliberate message that must always show can be thrown as `new UserError(text)` (or any error with expose: true).
const GENERIC = 'Something went wrong. Try again in a moment.';
const INTERNAL = /https?:\/\/|\bat [\w$.<>]+ \(|[A-Za-z]:\\|\/node_modules\/|\bSQLITE|\bE[A-Z]{3,}\b|fetch failed|socket hang up|Cannot (read|set) propert|is not (a function|defined|iterable)|\bundefined\b|\bnull\b|Unexpected token|in JSON at position/;

class UserError extends Error {
  constructor(message) { super(message); this.name = 'UserError'; this.expose = true; }
}

// true when the error's own message is meant for the player
function isUserFacing(e) {
  if (!(e instanceof Error)) return false;
  if (e.expose === true) return true;
  if (e.constructor !== Error || e.code != null || e.cause != null) return false;
  const msg = String(e.message || '');
  return msg.length > 0 && msg.length <= 300 && !INTERNAL.test(msg);
}

// The message to send; an unexpected error is logged (with `where`) and replaced by GENERIC.
function publicMessage(e, where = '') {
  if (isUserFacing(e)) return e.message;
  console.error('[unexpected error]', where, e);
  return GENERIC;
}

module.exports = { GENERIC, UserError, isUserFacing, publicMessage };
