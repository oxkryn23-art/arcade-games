// Shared helpers for game engines.

// Winner by score when a match ends: higher score wins, equal = draw.
const byScore = (score) => (score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1);

module.exports = { byScore };
