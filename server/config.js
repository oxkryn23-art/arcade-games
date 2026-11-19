// Server settings from the environment (or a local .env file, see .env.example). Every value has a safe default, so
// `npm start` works without any configuration.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => Number(env(k, d));
const bool = (k, d) => String(env(k, d)).toLowerCase() === 'true';

module.exports = {
  PORT: num('PORT', 3000),
  // optional absolute origin for challenge links (e.g. https://example.com); empty = taken from the request
  PUBLIC_URL: env('PUBLIC_URL', '').replace(/\/$/, ''),
  // dev tools: the scene lab (/dev/lab); never needed to play
  DEV_MODE: bool('DEV_MODE', 'false'),
  // a player who loses the connection mid-match has this long to come back (a reload, a reopened tab)
  REJOIN_GRACE_MS: num('REJOIN_GRACE_MS', 30000),
  // The light anti-bot check (server/anticheat.js): scripted-looking timing over several matches moves a player to
  // a separate pool; it never blocks anyone or tells them anything.
  BOT_MIN_MOVES: num('BOT_MIN_MOVES', 30),          // moves across the suspicious matches
  BOT_MIN_MATCHES: num('BOT_MIN_MATCHES', 3),       // matches that each look scripted
  BOT_MEDIAN_MS: num('BOT_MEDIAN_MS', 150),         // median move time below this...
  BOT_MAX_STDEV_MS: num('BOT_MAX_STDEV_MS', 30),    // ...with variance this low
  SHADOW_POOL_WAIT_MS: num('SHADOW_POOL_WAIT_MS', 20000),
  // show how many players wait per game on the Play page
  SHOW_WAITING_COUNTS: bool('SHOW_WAITING_COUNTS', 'true'),
};
