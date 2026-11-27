// The bridge between the original game's mascot rig (public/js/mascots/rig.js, outfits.js: the same code, unchanged
// in how it builds, poses, dresses and animates a character) and this site. Load after scenes/kit.js and
// figures/avatar.js, before mascots/cosmetics.js and mascots/rig.js.
//   VersoKit      = DuelKit + the raster sprite table of the characters (public/art/sprites.json: the hand sprites)
//   VersoTeam     = the one species of this site, the human
//   VersoProps / VersoExpressions = the site's props and expression picker (figures/props.js, figures/expressions.js)
(function () {
  const K = window.DuelKit;
  // the site root (public/), from this script's own URL: works on the server, in the scene lab and on GitHub Pages
  const ROOT = new URL('../../', document.currentScript ? document.currentScript.src : location.href).href;
  let SPR = null;
  const sprReady = (typeof fetch === 'function' ? fetch(`${ROOT}art/sprites.json`) : Promise.reject(new Error('no fetch')))
    .then((r) => (r.ok ? r.json() : {})).then((j) => { SPR = j; return j; }).catch(() => { SPR = {}; return SPR; });
  window.VersoKit = Object.assign(Object.create(K), {
    spriteInfo: (name) => SPR?.[name] || null,
    sprReady,
    // where a character sprite file is (the rig asks for hands; cosmetics.js for shoes, hats and outfit textures)
    asset: (file) => `${ROOT}art/${file}`,
  });
  window.VersoTeam = { get: () => 'human', ids: () => ['human'], onChange() {} };
  Object.defineProperty(window, 'VersoProps', { configurable: true, get: () => window.DuelProps });
  window.VersoExpressions = { pick: (species, moment, rig) => window.DuelExpressions?.pick?.(moment, rig) || null };
})();
