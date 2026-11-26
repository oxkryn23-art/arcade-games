// Browser stand-ins for the few Node modules the game server uses (bundled by tools/build-pages.js). The static
// build has one player per page, so these need to work, not to be cryptographically strong.

// crypto: random bytes / ints from the browser's CSPRNG, and a stable 256-bit string hash (FNV-1a lanes) where the
// server uses sha256 only to turn an id or a secret into a key.
function bytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return wrap(b);
}
function wrap(b) {
  b.toString = function (enc) {
    if (enc === 'hex') return Array.from(this, (x) => x.toString(16).padStart(2, '0')).join('');
    if (enc === 'base64url' || enc === 'base64') {
      const s = btoa(String.fromCharCode(...this));
      return enc === 'base64' ? s : s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return Array.prototype.join.call(this, ',');
  };
  return b;
}
function randomInt(a, b) {
  const [min, max] = b === undefined ? [0, a] : [a, b];
  const span = max - min;
  if (!(span > 0)) throw new RangeError('randomInt: empty range');
  const u = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / span) * span;
  do globalThis.crypto.getRandomValues(u); while (u[0] >= limit);
  return min + (u[0] % span);
}
function createHash() {
  let text = '';
  const h = {
    update(s) { text += String(s); return h; },
    digest(enc) {
      let out = '';
      for (let lane = 0; lane < 8; lane++) {
        let x = (0x811c9dc5 ^ (lane * 0x9e3779b1)) >>> 0;
        for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
        x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12;
        out += x.toString(16).padStart(8, '0');
      }
      return enc === 'hex' ? out : wrap(Uint8Array.from(out.match(/../g), (p) => parseInt(p, 16)));
    },
  };
  return h;
}
module.exports = { randomBytes: bytes, randomInt, createHash };
