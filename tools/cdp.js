// A tiny Chrome DevTools Protocol driver (Node's built-in WebSocket, no extra packages): launches a local headless
// Chrome or Edge and returns helpers to navigate, run JavaScript, wait and take screenshots. Used by tools/shot.js,
// tools/covers.js and tools/screens.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BROWSERS = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ port = 9300 + Math.floor(Math.random() * 500), width = 1440, height = 900, mobile = false, scale = 1 } = {}) {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome/Edge found; set CHROME=/path/to/chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-cdp-'));
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); }
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map(), handlers = [], errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else handlers.forEach((h) => h(m));
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  handlers.push((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
  });
  await send('Page.enable'); await send('Runtime.enable');
  const size = (w, h, mob = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: mob, screenOrientation: mob ? { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } : undefined })
    .then(() => (mob ? send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }) : null));
  await size(width, height, mobile);
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await js(`!!(${expr})`).catch(() => false)) return true; await sleep(100); }
    throw new Error(`timeout waiting for ${expr}${errors.length ? `; console: ${errors.join(' | ')}` : ''}`);
  };
  const go = async (url, settle = 600) => { await send('Page.navigate', { url }); await sleep(250); await waitFor('document.readyState === "complete"'); await sleep(settle); };
  const shot = async (file, { format = 'png', quality, clip } = {}) => {
    const { data } = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}), ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(data, 'base64')); }
    return Buffer.from(data, 'base64');
  };
  const close = async () => { try { ws.close(); } catch {} proc.kill(); await sleep(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
  return { send, js, waitFor, go, shot, size, close, errors, sleep, on: (fn) => handlers.push(fn) };
}

module.exports = { launch, sleep };
