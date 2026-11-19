// Avatar looks: the same option lists as public/js/figures/avatar.js. A look only changes how a player is drawn and never touches
// matchmaking or results; anything unknown falls back to the default.
const crypto = require('crypto');

const OPTIONS = {
  skin: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
  hair: ['short', 'crop', 'curly', 'long', 'bun', 'ponytail', 'spiky', 'buzz'],
  hairColor: ['hair-1', 'hair-2', 'hair-3', 'hair-4', 'hair-5', 'hair-6'],
  shirt: ['shirt-1', 'shirt-2', 'shirt-3', 'shirt-4', 'shirt-5', 'shirt-6', 'shirt-7', 'shirt-8'],
};
const DEFAULT = { skin: 'skin-3', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1' };

function valid(l) {
  const src = l && typeof l === 'object' ? l : {};
  return Object.fromEntries(Object.entries(OPTIONS).map(([k, ids]) => [k, ids.includes(src[k]) ? src[k] : DEFAULT[k]]));
}
const random = () => Object.fromEntries(Object.entries(OPTIONS).map(([k, ids]) => [k, ids[crypto.randomInt(ids.length)]]));

module.exports = { OPTIONS, DEFAULT, valid, random };
