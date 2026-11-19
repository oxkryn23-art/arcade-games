// The result card, drawn in the browser on a 1200x630 canvas (the link-preview size): the wordmark, the result
// ("QuietOtter won" / "lost" / "Draw"), the game, the opponent, and both players' characters in a pose that fits.
// The same picture is the result screen and the image a player shares (Web Share with the file, else a download).
//
//   DuelCard.render({ outcome: 'win'|'loss'|'draw', name, oppName, gameName, look, oppLook, mode }) -> Promise<Blob>
//
// The characters come from the rig (DuelFigures.avatarSvg) as SVG markup; theme tokens (var(--x)) are resolved to
// their computed values first, because an SVG drawn as an image cannot see the page's CSS.
(function () {
  const W = 1200, H = 630;
  const POSE = {
    win: { pose: 'cheer', mood: 'GEN-9' }, loss: { pose: 'sad', mood: 'GEN-10' }, draw: { pose: 'shrug', mood: 'GEN-11' },
  };
  const OTHER = { win: 'loss', loss: 'win', draw: 'draw' };

  const css = () => getComputedStyle(document.documentElement);
  const tok = (name) => css().getPropertyValue(`--${name}`).trim();
  // var(--x) -> its value (nested vars too), so the markup renders on its own
  function resolveVars(markup) {
    const st = css();
    let out = markup;
    for (let i = 0; i < 4 && out.includes('var(--'); i++) out = out.replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => st.getPropertyValue(`--${n}`).trim() || m);
    return out;
  }
  function loadSvg(markup) {
    return new Promise((res, rej) => {
      const svg = resolveVars(markup).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
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

  async function render({ outcome = 'win', name = 'Player', oppName = 'Opponent', gameName = '', look = null, oppLook = null, mode = 'demo' } = {}) {
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
    const me = POSE[outcome] || POSE.draw, them = POSE[OTHER[outcome]] || POSE.draw;
    const [a, b] = await Promise.all([
      loadSvg(M.avatarSvg(look, 'you', { body: true, pose: { ...M.POSES[me.pose] }, mood: me.mood })),
      loadSvg(M.avatarSvg(oppLook, 'opp', { body: true, pose: { ...M.POSES[them.pose] }, mood: them.mood, flip: true })),
    ]);
    const feet = 352 / 372, place = (img, x, h) => ctx.drawImage(img, x, 566 - h * feet, h * 340 / 372, h);
    place(b, 870, 400);
    place(a, 580, 480);

    // the texts: the wordmark, the result, the game, the opponent
    const ink = tok('ui-ink'), ink2 = tok('ui-ink-2');
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink; ctx.font = font(700, 40);
    ctx.fillText('Second', 64, 92);
    const sw = ctx.measureText('Second ').width;
    ctx.fillStyle = tok('ui-play'); ctx.fillText('Guess', 64 + sw, 92);
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

  window.DuelCard = { render, W, H };
})();
