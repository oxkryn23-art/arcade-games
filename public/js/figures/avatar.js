// The avatar store: my look { skin, hair, hairColor, shirt } (kept in this browser) and the opponent's look of the
// current match. Every value is a theme token name (skin-1.., hair-1.., shirt-1..) or a hair style id, so the colors
// stay in server/themes.js. The same option lists are validated by the server (server/avatar.js).
//
// The two players never look alike: when the opponent's shirt is the same as mine, forSide('opp') shows them in
// their next shirt color (display only).
(function () {
  const OPTIONS = {
    skin: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
    hair: ['short', 'crop', 'curly', 'long', 'bun', 'ponytail', 'spiky', 'buzz'],
    hairColor: ['hair-1', 'hair-2', 'hair-3', 'hair-4', 'hair-5', 'hair-6'],
    shirt: ['shirt-1', 'shirt-2', 'shirt-3', 'shirt-4', 'shirt-5', 'shirt-6', 'shirt-7', 'shirt-8'],
  };
  const LABELS = {
    skin: 'Skin tone', hair: 'Hairstyle', hairColor: 'Hair color', shirt: 'Shirt color',
    short: 'Short', crop: 'Crop', curly: 'Curly', long: 'Long', bun: 'Bun', ponytail: 'Ponytail', spiky: 'Spiky', buzz: 'Buzz',
  };
  const DEFAULT = { skin: 'skin-3', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1' };
  const KEY = 'duel_avatar';
  const pick = (l) => l[Math.floor(Math.random() * l.length)];

  function valid(l) {
    const out = {};
    for (const [k, ids] of Object.entries(OPTIONS)) out[k] = l && ids.includes(l[k]) ? l[k] : DEFAULT[k];
    return out;
  }
  const random = () => Object.fromEntries(Object.entries(OPTIONS).map(([k, ids]) => [k, pick(ids)]));

  let mine = null;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) mine = valid(s); } catch { /* storage off */ }
  const firstVisit = !mine;
  if (!mine) mine = random();
  let opponent = null;
  const subs = new Set();
  const notify = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  function get() { return { ...mine }; }
  function set(l) {
    mine = valid({ ...mine, ...l });
    try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch { /* storage off */ }
    notify();
    return get();
  }
  function setOpponent(l) { opponent = l ? valid(l) : null; notify(); }
  // The look a side shows: mine, or the opponent's with a different shirt when it clashes with mine.
  function forSide(side) {
    if (side !== 'opp') return get();
    const o = opponent ? { ...opponent } : { ...DEFAULT, shirt: 'shirt-5', hair: 'curly', hairColor: 'hair-4', skin: 'skin-2' };
    if (o.shirt === mine.shirt) { const s = OPTIONS.shirt; o.shirt = s[(s.indexOf(o.shirt) + 3) % s.length]; }
    return o;
  }

  window.DuelAvatar = {
    OPTIONS, LABELS, DEFAULT, valid, random, get, set, setOpponent, forSide, firstVisit,
    opponent: () => (opponent ? { ...opponent } : null),
    saved: () => { try { return !!localStorage.getItem(KEY); } catch { return false; } },
    onChange: (f) => { subs.add(f); return () => subs.delete(f); },
  };
})();
