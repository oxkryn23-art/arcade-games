// npm run screens: the README screenshots in docs/screenshots/ (needs the server running with DEV_MODE=true for the
// gameplay shots): the home page, the Play page, the avatar picker, a match of every game vs the AI, the result card,
// a challenge card, a landscape phone and the rotate overlay. Flags console errors and horizontal scrolling.
// BASE_URL = the server (default http://localhost:3000).
const path = require('path');
const { launch } = require('./cdp');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const LOOK = JSON.stringify({ skin: 'skin-3', hair: 'curly', hairColor: 'hair-1', shirt: 'shirt-1', hat: 'none', outfit: 'hoodie', feet: 'sneakers' });
// a returning visitor: a saved look and nickname (so the first-visit avatar picker stays closed)
const SEED = `localStorage.removeItem('duel_pid'); localStorage.setItem('duel_avatar', ${JSON.stringify(LOOK)}); localStorage.setItem('duel_name', 'QuietOtter'); localStorage.setItem('duel_tutorials', JSON.stringify({ rps: 'done', rps_minus_one: 'done', penalty: 'done', shootout: 'done' }));`;
const problems = [];

async function page(b, name, url, { setup = '', wait = 900, w = 1440, h = 900, mobile = false } = {}) {
  await b.size(w, h, mobile);
  await b.go(`${BASE}/robots.txt`, 100);   // same origin, no app: seed the storage first
  await b.js(SEED);
  await b.go(`${BASE}${url}`, 1200);
  if (setup) await b.js(`(async () => { const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const $ = (q) => document.querySelector(q); ${setup}; return true; })()`);
  await b.sleep(wait);
  const sw = await b.js('document.documentElement.scrollWidth > innerWidth + 1');
  if (sw) problems.push(`${name}: horizontal scroll at ${w}x${h}`);
  await b.shot(path.join(OUT, `${name}.png`));
  console.log('saved', `docs/screenshots/${name}.png`);
}

// a match vs the AI in one game, shot during the reveal of the first round
const MATCH = (game, at) => `
  localStorage.setItem('duel_games', JSON.stringify(['${game}']));
  location.hash = '#play'; await wait(800);
  DuelSound.setMuted(true);
  $('#btnAi').click();
  for (let i = 0; i < 80 && !document.querySelector('.scene-controls[data-state="open"]'); i++) await wait(150);
  await wait(600);
  const b = [...document.querySelectorAll('.scene-controls .ctl')].find((x) => !x.disabled); b && b.click();
  await wait(${at});`;

(async () => {
  const b = await launch({ width: 1440, height: 900 });
  try {
    await page(b, 'home', '/#home', { wait: 1500 });
    await page(b, 'play', '/#play', { wait: 1500 });
    await page(b, 'avatar-picker', '/#home', { setup: "$('#meAvatar').click(); await wait(400)", wait: 600 });
    await page(b, 'match-rps', '/#play', { setup: MATCH('rps', 2400), wait: 0 });
    await page(b, 'match-rps-minus-one', '/#play', { setup: MATCH('rps_minus_one', 2200), wait: 0 });
    await page(b, 'match-penalty', '/#play', { setup: MATCH('penalty', 1700), wait: 0 });
    await page(b, 'match-shootout', '/#play', { setup: MATCH('shootout', 2300), wait: 0 });
    await page(b, 'result', '/#play', {
      setup: `${MATCH('rps', 600)}
        $('#mForfeit').click(); await wait(200); $('#forfeitYes').click();
        for (let i = 0; i < 60 && !($('#resImg').src && $('#resImg').complete); i++) await wait(150);
        await wait(800);`,
      wait: 300,
    });
    await page(b, 'challenge', '/#play', { setup: "document.querySelector('[data-challenge]').click(); await wait(400); $('#chCreate').click(); await wait(800)", wait: 300 });
    await page(b, 'phone-landscape', '/#play', { setup: MATCH('penalty', 1500), wait: 0, w: 844, h: 390, mobile: true });
    await page(b, 'phone-rotate', '/#home', { w: 390, h: 844, mobile: true, wait: 600 });
    if (b.errors.length) problems.push(...b.errors.map((e) => `console: ${e}`));
  } finally { await b.close(); }
  console.log(problems.length ? `\nproblems:\n${problems.join('\n')}` : '\nno problems');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
