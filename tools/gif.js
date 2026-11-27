// node tools/gif.js: the short gameplay GIF of the README (docs/screenshots/gameplay.gif). Records the scene lab
// (needs the server running with DEV_MODE=true) playing a reveal of every game, frame by frame through the DevTools
// protocol, and encodes it with ffmpeg (must be on the PATH). BASE_URL = the server (default http://localhost:3000).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch } = require('./cdp');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'gameplay.gif');
const W = 800, H = 450, FPS = 12;
const CLIPS = [
  { game: 'rps', ctx: [], moves: ['paper', 'rock'], ms: 2600 },
  { game: 'penalty', ctx: [['kicker', 'you']], moves: ['right', 'left'], ms: 3000 },
  { game: 'shootout', ctx: [['ammo0', '1'], ['ammo1', '0'], ['turn', '5']], moves: ['shoot', 'reload'], ms: 3000 },
  { game: 'rps_minus_one', ctx: [['phase', 'keep'], ['pair0', 'rock+paper'], ['pair1', 'rock+scissors']], moves: ['paper', 'scissors'], ms: 3000 },
];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-gif-'));
  const b = await launch({ width: W, height: H });
  let n = 0, recorded = 0;
  try {
    for (const c of CLIPS) {
      await b.go(`${BASE}/dev/lab?stage&game=${c.game}`, 1200);
      await b.js(`(async () => {
        DuelSound.setMuted(true);
        const $ = (q) => document.querySelector(q), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (const [k, v] of ${JSON.stringify(c.ctx)}) { const el = $('#ctxBox select[name=' + k + ']'); el.value = v; el.dispatchEvent(new Event('change')); await wait(150); }
        $('#controls').style.display = 'none';
        DuelAvatar.set({ skin: 'skin-2', hair: 'short', hairColor: 'hair-2', shirt: 'shirt-1', hat: 'none', outfit: 'stripedtee', feet: 'sneakers' });
        DuelAvatar.setOpponent({ skin: 'skin-4', hair: 'ponytail', hairColor: 'hair-5', shirt: 'shirt-2', hat: 'none', outfit: 'bomber', feet: 'hightops' });
        lab.mount(); await wait(2700);
        return true;
      })()`);
      b.js(`lab.reveal(${JSON.stringify(c.moves[0])}, ${JSON.stringify(c.moves[1])})`).catch(() => {});
      const t0 = Date.now();
      recorded += c.ms;
      for (let t = 0; t < c.ms; t = Date.now() - t0) {
        await b.shot(path.join(dir, `f${String(n++).padStart(4, '0')}.png`));
        const next = t0 + Math.ceil((Date.now() - t0 + 1) / (1000 / FPS)) * (1000 / FPS);
        await b.sleep(Math.max(0, next - Date.now()));
      }
    }
  } finally { await b.close(); }
  // screenshots come slower than FPS: play them back at the rate they were really taken
  const rate = String(Math.max(4, Math.round((n / (recorded / 1000)) * 10) / 10));
  const pal = path.join(dir, 'palette.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', rate, '-i', path.join(dir, 'f%04d.png'), '-vf', `scale=${W}:-1:flags=lanczos,palettegen=stats_mode=diff`, pal]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', rate, '-i', path.join(dir, 'f%04d.png'), '-i', pal, '-lavfi', `scale=${W}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', OUT]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`saved docs/screenshots/gameplay.gif (${n} frames, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
