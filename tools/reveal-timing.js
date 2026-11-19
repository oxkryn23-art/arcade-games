// Measures every reveal against its animation budget in headless Chrome (npm run timing; needs the server running
// with DEV_MODE=true). Uses the scene lab (/dev/lab?stage): each game, each context variant (Penalty kicker / sudden
// death, Minus One phases, Shootout ammo and turn), every move combination (missed moves included); prints the worst
// time vs budget and exits with code 1 if anything goes over. TIMING_REDUCED=1 adds a reduced-motion pass,
// TIMING_GAMES=rps,shootout limits the run, BASE_URL = the server (default http://localhost:3000).
const { launch } = require('./cdp');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const VARIANTS = {
  rps: [[]],
  rps_minus_one: [[['phase', 'pick']], [['phase', 'keep']]],
  penalty: [[['kicker', 'you']], [['kicker', 'opponent']], [['kicker', 'you'], ['sudden', 'yes']]],
  shootout: [[['ammo0', '3'], ['ammo1', '3'], ['turn', '0']], [['ammo0', '3'], ['ammo1', '3'], ['turn', '11']], [['ammo0', '0'], ['ammo1', '0'], ['turn', '11']]],
};
const ONLY = process.env.TIMING_GAMES ? process.env.TIMING_GAMES.split(',') : null;

(async () => {
  const b = await launch({ width: 1440, height: 900 });
  const rows = [];
  let over = 0;
  for (const reduced of [false, ...(process.env.TIMING_REDUCED ? [true] : [])]) {
    await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await b.go(`${BASE}/dev/lab?stage`, 2000);
    await b.js('DuelSound.setMuted(true)');
    for (const [game, variants] of Object.entries(VARIANTS).filter(([g]) => !ONLY || ONLY.includes(g))) {
      for (const vars of variants) {
        const res = await b.js(`(async () => {
          const $ = (s) => document.querySelector(s), wait = (ms) => new Promise((r) => setTimeout(r, ms));
          if ($('#game').value !== '${game}') { $('#game').value = '${game}'; $('#game').dispatchEvent(new Event('change')); await wait(300); }
          for (const [k, v] of ${JSON.stringify(vars)}) { const s = $('#ctxBox select[name=' + k + ']'); s.value = v; s.dispatchEvent(new Event('change')); await wait(150); }
          window.lab.mount(); await wait(200);
          const opts = (sel) => [...$(sel).options].map((o) => JSON.parse(o.value));
          let n = 0, worst = -Infinity, worstLine = '';
          for (const m0 of opts('#m0')) for (const m1 of opts('#m1')) {
            $('#log').textContent = '';
            await window.lab.reveal(m0, m1);
            const line = $('#log').textContent;
            const ms = +(/, (\\d+) ms/.exec(line)?.[1] || 0), bud = +(/budget (\\d+)/.exec(line)?.[1] || 0);
            n++;
            if (ms - bud > worst) { worst = ms - bud; worstLine = line.trim().replace(/^\\S+ /, ''); }
          }
          return { n, worst, worstLine };
        })()`);
        const label = `${reduced ? '(reduced) ' : ''}${game} ${vars.map((v) => v.join('=')).join(' ')}`;
        rows.push(label);
        if (res.worst > 0) over++;
        console.log(`${label}: ${res.n} reveals, worst ${res.worst >= 0 ? '+' : ''}${res.worst} ms vs budget: ${res.worstLine}`);
      }
    }
  }
  const errors = [...b.errors];
  await b.close();
  console.log(`\n${rows.length} batches, ${over} over budget${errors.length ? `, page errors: ${errors.join(' | ')}` : ', no page errors'}`);
  process.exit(over || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
