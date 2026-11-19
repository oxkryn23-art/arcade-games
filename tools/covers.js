// npm run covers: renders the game covers FROM THE SCENES (no drawn or downloaded pictures): each game's scene in the
// scene lab (/dev/lab?stage, needs the server running with DEV_MODE=true), caught at a lively moment of a reveal,
// cropped to 16:10 and saved as public/covers/<game>.webp. BASE_URL = the server (default http://localhost:3000).
const path = require('path');
const fs = require('fs');
const { launch } = require('./cdp');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'public', 'covers');
const W = 1152, H = 648;   // the 16:9 stage; the cover is its middle 16:10 (1037 x 648)
// per game: the lab context (selects), the reveal and when to catch it (ms after it starts)
const SHOTS = {
  rps: { ctx: [], moves: ['rock', 'scissors'], at: 900 },
  rps_minus_one: { ctx: [['phase', 'pick']], moves: [['rock', 'paper'], ['scissors', 'rock']], at: 1100 },
  penalty: { ctx: [['kicker', 'you']], moves: ['left', 'right'], at: 700 },
  shootout: { ctx: [['ammo0', '1'], ['ammo1', '0'], ['turn', '5']], moves: ['shoot', 'reload'], at: 520 },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await launch({ width: W, height: H });
  try {
    for (const [game, s] of Object.entries(SHOTS)) {
      await b.go(`${BASE}/dev/lab?stage&game=${game}`, 1500);
      await b.js(`(async () => {
        DuelSound.setMuted(true);
        const $ = (q) => document.querySelector(q), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (const [k, v] of ${JSON.stringify(s.ctx)}) { const el = $('#ctxBox select[name=' + k + ']'); el.value = v; el.dispatchEvent(new Event('change')); await wait(150); }
        $('#controls').style.display = 'none';
        document.querySelectorAll('.you-arrow, .scene-you').forEach((n) => n.remove());
        lab.mount(); await wait(2800);
        lab.reveal(${JSON.stringify(s.moves[0])}, ${JSON.stringify(s.moves[1])});
        await wait(${s.at});
        document.querySelectorAll('.scene-punch, .scene-plus, .scene-label').forEach((n) => { n.style.visibility = 'hidden'; });
        return true;
      })()`);
      const cw = Math.round(H * 1.6), file = path.join(OUT, `${game}.webp`);
      await b.shot(file, { format: 'webp', quality: 86, clip: { x: Math.round((W - cw) / 2), y: 0, width: cw, height: H } });
      console.log('saved', path.relative(process.cwd(), file));
    }
    if (b.errors.length) console.log('page errors:\n' + b.errors.join('\n'));
  } finally { await b.close(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
