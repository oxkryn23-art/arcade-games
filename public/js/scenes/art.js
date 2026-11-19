// The code-drawn art registry: every scene background, scene element, effect and control icon is drawn here in code
// (plain SVG built with DuelKit.el, every color a theme token), so the project ships no images at all.
//
//   DuelArt.bg[name](K)        -> an SVG <g> filling the 1600x900 scene viewBox (kit.js background())
//   DuelArt.el[name]           -> { w, h, ax, ay, draw(K) -> <g> drawn in its own w x h box } (kit.js sprite();
//                                  (ax, ay) is the anchor: the bottom center for things that stand, else the center)
//   DuelArt.fx[kind](size, K)  -> an effect <g> centered on 0,0 (kit.js fx(): RPS outcome effects)
//   DuelArt.icons[name]        -> SVG markup for a control button icon (currentColor where it should follow the text)
//
// Each game's art lives in its own file (art-rps.js, art-penalty.js, art-shootout.js), loaded after this one, and its
// colors in server/theme-scenes/<game>.js.
(function () {
  const A = window.DuelArt = window.DuelArt || { bg: {}, el: {}, fx: {}, icons: {} };
  const T = (n) => `var(--${n})`;
  // shared helpers for the art files
  A.T = T;
  A.ink = (w = 4) => ({ stroke: T('outline'), 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  // a deterministic pseudo-random sequence (the same scene every time it is drawn)
  A.rand = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // registers an element: A.add('el-cloud-1', 300, 200, 150, 100, (K) => K.g({}, ...))
  A.add = (name, w, h, ax, ay, draw) => { A.el[name] = { w, h, ax, ay, draw }; };
  // an icon as markup from a builder (K) => node, in a viewBox
  A.icon = (viewBox, build) => {
    const K = window.DuelKit;
    return K.el('svg', { viewBox, class: 'ico art-ico', 'aria-hidden': 'true' }, build(K)).outerHTML;
  };
})();
