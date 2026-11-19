// One screenshot of a page: node tools/shot.js <url> <out.png> [WIDTHxHEIGHT] [--wait=ms] [--eval=<js run before the shot>]
// Prints the page's console errors, if any. Needs a local Chrome or Edge.
const { launch } = require('./cdp');

(async () => {
  const [url, out, dims = '1600x900'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  if (!url || !out) { console.log('usage: node tools/shot.js <url> <out.png> [1600x900] [--wait=ms] [--eval=js]'); process.exit(1); }
  const [w, h] = dims.split('x').map(Number);
  const b = await launch({ width: w, height: h });
  try {
    await b.go(url, Number(opt('wait', 1200)));
    const ev = opt('eval', '');
    if (ev) { await b.js(ev); await b.sleep(Number(opt('after', 800))); }
    await b.shot(out);
    if (b.errors.length) console.log('console errors:\n' + b.errors.join('\n'));
    console.log('saved', out);
  } finally { await b.close(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
