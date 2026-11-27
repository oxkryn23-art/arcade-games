// The result card, drawn in the browser on a 1200x630 canvas (the link-preview size): the wordmark, the result
// ("QuietOtter won" / "lost" / "Draw"), the game, the opponent, and the player's character in a pose that fits.
// The same picture is the result screen and the image a player shares (Web Share with the file, else a download).
//
//   DuelCard.render({ outcome: 'win'|'loss'|'draw', name, oppName, gameName, look, mode, seed, pose }) -> Promise<Blob>
//   (seed: the match id, picks the pose family; pose: a family index 0..3 directly)
//
// The characters come from the rig (DuelFigures.avatarSvg) as SVG markup; theme tokens (var(--x)) are resolved to
// their computed values first, because an SVG drawn as an image cannot see the page's CSS.
(function () {
  const W = 1200, H = 630;
  // The poses: the four pose families of the original game's result card (one hand on the hip, fists, a three-quarter
  // turn, hands in front of the belly), each with a win, a loss and a draw pose. One family per card, picked from the
  // seed (the match id), so a card always shows the same pose. No arm or hand points straight up: a raised hand is out
  // to the side. Only the player's own character is drawn (the opponent is named in the text).
  const FAMILIES = [
    { win: { a1: [-70, -102, 0.95], a2: [132, -236, 0.35], h1: 'fist', h2: 'open', r2: -48, by: -4, hy: -3, hrot: -4 },
      loss: { a1: [-70, -100, 0.95], a2: [88, -256, 0.9], h1: 'fist', h2: 'open', r2: -140, by: 4, hy: 6, hrot: -9, lx: 0.5, ly: -0.4 },
      draw: { a1: [-70, -102, 0.95], a2: [112, -148, 0.6], h1: 'fist', h2: 'open', hy: 4, hrot: -6 } },
    { win: { a1: [-120, -204, -0.35], a2: [120, -204, 0.35], h1: 'fist', h2: 'fist', by: -6, hy: -4 },
      loss: { a1: [-78, -88, 0.25], a2: [78, -88, -0.25], h1: 'fist', h2: 'fist', by: 4, bsy: 0.96, hy: 4, hrot: 3 },
      draw: { a1: [-74, -100, 0.95], a2: [74, -100, -0.95], h1: 'fist', h2: 'fist', hy: 4, hrot: -6 } },
    { flip: true, win: { turn: 0.55, a1: [-48, -104, 0.9], a2: [124, -262, 0.15], h1: 'fist', h2: 'fist', l1: [-20, -10, 0], l2: [24, -10, 0], by: -4, hy: -3 },
      loss: { turn: 0.55, a1: [-36, -64, 0.3], a2: [62, -66, -0.1], h1: 'ball', h2: 'ball', l1: [-20, -10, 0], l2: [24, -10, 0], by: 10, bsy: 0.97, hy: 12, hrot: 10, ly: 0.7 },
      draw: { turn: 0.55, a1: [-48, -104, 0.9], a2: [92, -124, 0.1], h1: 'fist', h2: 'open', r2: -40, l1: [-20, -10, 0], l2: [24, -10, 0], hy: 4, hrot: -6 } },
    { win: { a1: [-12, -116, 0.7], a2: [14, -120, -0.7], h1: 'fist', h2: 'ball', over1: 1, over2: 1, by: -3, hy: -3, hrot: -4 },
      loss: { a1: [-10, -84, 0.55], a2: [12, -86, -0.55], h1: 'ball', h2: 'ball', over1: 1, over2: 1, by: 8, bsy: 0.97, hy: 10, hrot: 9, ly: 0.7 },
      draw: { a1: [-14, -100, 0.6], a2: [14, -102, -0.6], h1: 'ball', h2: 'ball', over1: 1, over2: 1, hy: 4, hrot: -6, lx: 0.4 } },
  ];
  const MOOD = { win: 'GEN-9', loss: 'GEN-10', draw: 'GEN-11' };
  // FNV-1a of the seed -> a family index (no seed: a random one)
  function family(seed) {
    if (seed == null || seed === '') return Math.floor(Math.random() * FAMILIES.length);
    let h = 0x811c9dc5;
    for (const c of String(seed)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h % FAMILIES.length;
  }
  const OUTCOME_OK = (o) => (MOOD[o] ? o : 'draw');

  const css = () => getComputedStyle(document.documentElement);
  const tok = (name) => css().getPropertyValue(`--${name}`).trim();
  // var(--x) -> its value (nested vars too), so the markup renders on its own
  function resolveVars(markup) {
    const st = css();
    let out = markup;
    for (let i = 0; i < 4 && out.includes('var(--'); i++) out = out.replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => st.getPropertyValue(`--${n}`).trim() || m);
    return out;
  }
  // An SVG drawn as an image loads nothing from outside, so the rig's sprite and texture images (the shoes, the
  // outfit textures, the hands) are put in as data URIs first; without this the card showed bare bodies.
  const dataUris = new Map();
  const toDataUri = (url) => {
    if (!dataUris.has(url)) {
      dataUris.set(url, fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(url)))).then((b) => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result); fr.onerror = rej;
        fr.readAsDataURL(b);
      })).catch(() => null));
    }
    return dataUris.get(url);
  };
  async function inlineImages(markup) {
    // (the SVG image element's href; the tag is spelled from a constant, this file names no image file of its own)
    const TAG = 'image', re = new RegExp(`(<${TAG}\\b[^>]*?\\s(?:xlink:)?href=")([^"]+)(")`, 'g');
    const urls = [...new Set([...markup.matchAll(re)].map((m) => m[2]).filter((u) => !u.startsWith('data:')))];
    const got = new Map(await Promise.all(urls.map(async (u) => [u, await toDataUri(new URL(u.replace(/&amp;/g, '&'), location.href).href)])));
    return markup.replace(re, (m, a, u, b) => (got.get(u) ? `${a}${got.get(u)}${b}` : m));
  }
  async function loadSvg(markup) {
    const inlined = await inlineImages(markup);
    return new Promise((res, rej) => {
      const svg = resolveVars(inlined).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }
  const font = (w, px) => `${w} ${px}px Fredoka, "Atkinson Hyperlegible", system-ui, sans-serif`;
  function fitText(ctx, text, max, weight, px) {
    let s = px;
    ctx.font = font(weight, s);
    while (s > 20 && ctx.measureText(text).width > max) { s -= 2; ctx.font = font(weight, s); }
    return s;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function render({ outcome = 'win', name = 'Player', oppName = 'Opponent', gameName = '', look = null, mode = 'demo', seed = null, pose = null } = {}) {
    await document.fonts?.ready;
    const M = window.DuelFigures;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    // background: the page's calm sky with a soft light, a floor band under the characters
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, tok('ui-sky-2')); bg.addColorStop(1, tok('ui-sky-3'));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(880, 300, 40, 880, 300, 420);
    glow.addColorStop(0, `${tok(outcome === 'loss' ? 'ui-sky-2' : 'ui-glow')}`); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45; ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    ctx.fillStyle = tok('ui-sun'); ctx.fillRect(560, 566, W - 560, 64);
    ctx.fillStyle = tok('ui-line'); ctx.fillRect(560, 564, W - 560, 4);

    // the two characters (you on the left of the pair, the opponent mirrored facing you)
    const fi = pose != null ? pose % FAMILIES.length : family(seed), fam = FAMILIES[fi];
    const mine = OUTCOME_OK(outcome);
    // the player's own character alone, big (the original card's layout); the three-quarter family faces the text
    const img = await loadSvg(M.avatarSvg(look, 'you', { body: true, pose: { ...fam[mine] }, mood: MOOD[mine], flip: !!fam.flip }));
    const h = 540, feet = 352 / 372;
    ctx.drawImage(img, 860 - (h * 340 / 372) / 2, 578 - h * feet, h * 340 / 372, h);

    // the texts: the wordmark, the result, the game, the opponent
    const ink = tok('ui-ink'), ink2 = tok('ui-ink-2');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink; ctx.font = font(700, 40);
    ctx.fillText('Arcade', 64, 92);
    const sw = ctx.measureText('Arcade ').width;
    ctx.fillStyle = tok('ui-play'); ctx.fillText('Games', 64 + sw, 92);
    const head = outcome === 'draw' ? 'Draw' : outcome === 'win' ? 'won' : 'lost';
    if (outcome === 'draw') {
      ctx.fillStyle = ink; fitText(ctx, name, 520, 600, 52); ctx.fillText(name, 64, 236);
      ctx.fillStyle = tok('ui-ink'); ctx.font = font(700, 120); ctx.fillText('Draw', 60, 356);
    } else {
      ctx.fillStyle = ink; fitText(ctx, name, 520, 600, 52); ctx.fillText(name, 64, 236);
      ctx.fillStyle = tok(outcome === 'win' ? 'ui-win' : 'ui-opponent'); ctx.font = font(700, 120); ctx.fillText(head, 60, 356);
    }
    ctx.fillStyle = ink2; fitText(ctx, `at ${gameName}`, 520, 600, 44); ctx.fillText(`at ${gameName}`, 64, 424);
    ctx.font = font(500, 32); ctx.fillText(`vs ${oppName}`, 64, 478);
    // a small tag for the mode (vs AI, a challenge, online)
    const tag = { demo: 'VS AI', friendly: 'CHALLENGE', pvp: 'ONLINE' }[mode] || '';
    if (tag) {
      ctx.font = font(700, 22);
      const tw = ctx.measureText(tag).width + 32;
      roundRect(ctx, 64, 516, tw, 40, 20); ctx.fillStyle = tok('ui-cream'); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = tok('ui-line'); ctx.stroke();
      ctx.fillStyle = ink; ctx.fillText(tag, 80, 544);
    }
    return new Promise((res) => cv.toBlob((blob) => res(blob), 'image/png'));
  }

  window.DuelCard = { render, W, H, FAMILIES };
})();
