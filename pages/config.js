// server/config.js for the static build (GitHub Pages): the defaults, no environment, no .env file.
module.exports = {
  PORT: 0,
  PUBLIC_URL: '',
  DEV_MODE: false,
  REJOIN_GRACE_MS: 30000,
  BOT_MIN_MOVES: 30,
  BOT_MIN_MATCHES: 3,
  BOT_MEDIAN_MS: 150,
  BOT_MAX_STDEV_MS: 30,
  SHADOW_POOL_WAIT_MS: 20000,
  SHOW_WAITING_COUNTS: false,
};
