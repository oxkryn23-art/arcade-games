// The characters' cosmetics, in the original game's format (window.VersoCosmetics: the rig and outfits.js read it):
// a character's LOADOUT = its look { skin, hair, hairColor, shirt } (figures/avatar.js, the avatar picker) + the
// clothes { hat, outfit, feet }. Until the human clothes kit is imported (art-source/human-kit/, the same pipeline as
// the original game's cosmetics: sprite hats, sprite shoes, vector outfit textures), every character wears the code
// drawn T-shirt in its shirt color (outfit 'tee', outfits.js), trousers and its natural shoes.
(function () {
  const K = window.VersoKit;
  const A = () => window.DuelAvatar;
  const VIEWS = ['front', 'three', 'side', 'back'];
  // the clothes (ids; the kit's items join these lists on import)
  const ITEMS = {
    hat: [{ id: 'none', label: 'No hat' }],
    outfit: [{ id: 'tee', label: 'T-shirt' }, { id: 'none', label: 'No outfit', hidden: true }],
    feet: [{ id: 'natural', label: 'Sneakers' }],
  };
  const DEFAULT = Object.freeze({ hat: 'none', outfit: 'tee', feet: 'natural' });
  const LOOK = Object.freeze({ skin: 'skin-3', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1' });
  const ids = (slot) => ITEMS[slot].map((i) => i.id);
  // sprite tables (filled by the kit import: { [id]: { [view]: { w, h, ax, ay, ... } } })
  const SPRITES = { hat: {}, shoe: {}, outfit: {} };

  function valid(l) {
    const o = { ...LOOK, ...DEFAULT, ...(l || {}) };
    const look = A()?.valid ? A().valid(o) : o;
    for (const slot of ['hat', 'outfit', 'feet']) if (!ids(slot).includes(o[slot])) o[slot] = DEFAULT[slot];
    // ('bald': the kit's reference renders only)
    return { species: 'human', skin: look.skin, hair: o.hair === 'bald' ? 'bald' : look.hair, hairColor: look.hairColor, shirt: look.shirt, hat: o.hat, outfit: o.outfit, feet: o.feet };
  }
  const forSide = (side) => valid(A()?.forSide ? A().forSide(side) : LOOK);
  const listeners = new Set();
  A()?.onChange?.(() => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }));

  const view = (turn, back) => (back ? 'back' : Math.abs(turn) < 0.28 ? 'front' : Math.abs(turn) < 0.8 ? 'three' : 'side');
  const sprite = (table, prefix) => (item, v, foot) => {
    const s = SPRITES[table][item]?.[foot ? `${v}-${foot}` : v];
    return s ? { ...s, href: K.asset(`${prefix}-${item}-${v}${foot ? `-${foot}` : ''}.${table === 'outfit' ? 'svg' : 'webp'}`) } : null;
  };

  window.VersoCosmetics = {
    ITEMS, DEFAULT, VIEWS, valid, view,
    get: () => forSide('you'),
    opponent: () => forSide('opp'),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    SHOE: { ref: 120, k: 1.3 }, HAT_FIT: {}, CODE_HAT_FIT: {},
    hatSprite: sprite('hat', 'hat'), shoeSprite: sprite('shoe', 'shoe'), outfitSprite: sprite('outfit', 'outfit'),
    cowboyLook: () => '1',
  };
})();
