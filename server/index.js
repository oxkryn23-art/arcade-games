// HTTP + WebSocket server: serves the static site, a few JSON endpoints and the realtime game over socket.io.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const arena = require('./arena');
const { games, enabled: enabledGames } = require('./games');
const themes = require('./themes');
const challenges = require('./challenges');
const errors = require('./errors');

const NAME = 'Arcade Games';
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(require('compression')());
// Security headers: a strict Content Security Policy (the site runs only its own files, no inline scripts), no
// framing by other sites, no MIME sniffing, a modest referrer. The dev lab (/dev, DEV_MODE only) allows inline code.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
const CSP_DEV = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'self'; object-src 'none'";
app.use((req, res, next) => {
  res.set({
    'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': req.path.startsWith('/dev/') ? CSP_DEV : CSP,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.use(express.json({ limit: '20kb' }));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Absolute site origin for challenge links: PUBLIC_URL, else taken from the request.
function originOf(req) {
  if (config.PUBLIC_URL) return config.PUBLIC_URL;
  const host = req.get('host') || '';
  return /^[\w.:[\]-]+$/.test(host) ? `${req.protocol === 'https' ? 'https' : 'http'}://${host}` : '';
}

// Cache busting: the site's own scripts and stylesheets get ?v=<size + mtime hash>, so they can be cached for a year
// and a new version still reaches every browser at once.
function fileV(p) {
  try {
    const st = fs.statSync(path.join(PUBLIC_DIR, p));
    return st.isFile() ? `?v=${crypto.createHash('sha1').update(`${st.size}:${st.mtimeMs}`).digest('hex').slice(0, 10)}` : '';
  } catch { return ''; }
}
const LOCAL_JS_CSS_RE = /\b(src|href)="(\/(?:js|css)\/[\w./-]+\.(?:js|css))"/g;
// The game code the landing does not need (scenes, previews, tutorials): app.js loads it on demand in this order.
// The game covers (public/covers/<game>.webp, rendered from the scenes by `npm run covers`): listed here so the site
// never probes for missing files; their hash is the cache key.
const COVER_DIR = path.join(PUBLIC_DIR, 'covers');
const coverIds = () => { try { return fs.readdirSync(COVER_DIR).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort(); } catch { return []; } };
function coverV() {
  const h = crypto.createHash('sha1');
  for (const id of coverIds()) { try { const st = fs.statSync(path.join(COVER_DIR, `${id}.webp`)); h.update(`${id}:${st.size}:${st.mtimeMs}`); } catch {} }
  return h.digest('hex').slice(0, 10);
}
const GAME_SCRIPTS = ['js/scenes/art.js', 'js/scenes/art-rps.js', 'js/scenes/art-penalty.js', 'js/scenes/art-shootout.js', 'js/scenes/rps-duel.js', 'js/scenes/rps.js', 'js/scenes/shootout.js', 'js/scenes/penalty.js', 'js/scenes/rps_minus_one.js', 'js/scenes/preview.js', 'js/tutorial.js'];

// index.html with versioned local files; `meta` = { title, description } for a challenge link's preview.
async function sendIndex(req, res, meta = null) {
  let html = await fs.promises.readFile(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  html = html.replace(LOCAL_JS_CSS_RE, (m, attr, p) => `${attr}="${p}${fileV(p)}"`);
  if (meta) {
    const set = (prop, value) => { html = html.replace(new RegExp(`(<meta property="${prop}" content=")[^"]*(")`), (m, a, b) => `${a}${escapeHtml(value)}${b}`); };
    set('og:title', meta.title); set('og:description', meta.description);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(`${NAME} — ${meta.title}`)}</title>`);
  }
  res.type('html').set('Cache-Control', 'no-cache').send(html);
}
app.get('/', (req, res, next) => sendIndex(req, res).catch(next));

// A challenge link: the site, with a preview that names the challenger.
app.get('/c/:code', (req, res, next) => {
  const row = challenges.get(req.params.code);
  const meta = row ? { title: `${row.creatorName} challenges you`, description: 'A free 1v1 mind game. Accept and play in your browser.' } : null;
  sendIndex(req, res, meta).catch(next);
});
app.get('/api/challenge/:code', (req, res) => {
  const row = challenges.get(req.params.code);
  if (!row) return res.status(404).json({ error: 'This challenge does not exist' });
  res.set('Cache-Control', 'no-store').json({ challenge: challenges.view(row) });
});

// The game engines, wrapped for the browser: tutorials and previews run the real rules locally.
const GAMES_DIR = path.join(__dirname, 'games');
function enginesBundle() {
  const files = ['util', ...games.map((g) => g.id)];
  const defs = files.map((f) => `defs[${JSON.stringify(f)}] = function (module, exports, require) {
${fs.readFileSync(path.join(GAMES_DIR, `${f}.js`), 'utf8')}
};`).join('\n');
  return `// Generated from server/games/*.js. Do not edit.
(function () {
const defs = {}, cache = {};
function req(name) {
  name = name.replace('./', '');
  if (cache[name]) return cache[name].exports;
  const m = { exports: {} }; cache[name] = m; defs[name](m, m.exports, req); return m.exports;
}
${defs}
window.DuelEngines = Object.fromEntries(${JSON.stringify(games.map((g) => g.id))}.map((id) => [id, req(id)]));
})();
`;
}
const ENGINES = enginesBundle();
app.get('/js/engines.js', (req, res) => res.type('js').set('Cache-Control', 'no-cache').send(ENGINES));

// The color tokens as CSS, and the client config (loaded in <head>, before anything else runs).
app.get('/css/theme.css', (req, res) => res.type('css').set('Cache-Control', 'no-cache').send(themes.css()));
app.get('/js/config.js', (req, res) => {
  const cfg = {
    name: NAME,
    devMode: config.DEV_MODE,
    gameScripts: GAME_SCRIPTS.map((p) => `/${p}${fileV(p)}`),
    games: enabledGames().map(gameCfg),
    showWaitingCounts: config.SHOW_WAITING_COUNTS,
    covers: coverIds(),
    coverV: coverV(),
  };
  res.type('js').set('Cache-Control', 'no-cache').send(`window.DUEL_CONFIG = ${JSON.stringify(cfg)};\n`);
});
function gameCfg(g) { return { id: g.id, name: g.name, short: g.short, rules: g.rules, timing: g.anim }; }
app.get('/api/config', (req, res) => res.json({ devMode: config.DEV_MODE, publicUrl: originOf(req), games: enabledGames().map(gameCfg) }));

// The web app manifest: the name and the code-drawn icon, colors from the theme tokens.
app.get('/site.webmanifest', (req, res) => {
  res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify({
    name: NAME, short_name: NAME, description: '1v1 mind games in the browser.',
    start_url: '/', display: 'standalone', background_color: themes.token('ui-sky'), theme_color: themes.token('ui-sky'),
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }));
});

// Sound files that exist; the client synthesizes the rest.
const SFX_DIR = path.join(PUBLIC_DIR, 'sfx');
app.get('/sfx/manifest.json', (req, res) => {
  const list = fs.existsSync(SFX_DIR) ? fs.readdirSync(SFX_DIR).filter((f) => /\.(mp3|ogg|opus)$/.test(f)) : [];
  res.set('Cache-Control', 'no-cache').json(list);
});

app.get('/robots.txt', (req, res) => res.type('text').set('Cache-Control', 'public, max-age=3600').send('User-agent: *\nDisallow: /api/\nDisallow: /dev/\n'));
// A cheap liveness check: no secrets, no counts.
const STARTED = Date.now();
app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true, uptimeSec: Math.round((Date.now() - STARTED) / 1000) }));

// The scene lab (DEV_MODE only, and only from this machine): every scene, pose and reveal without playing.
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && !req.get('x-forwarded-for');
app.get('/dev/lab', (req, res, next) => {
  if (!config.DEV_MODE || !isLocal(req)) return next();
  res.type('html').sendFile(path.join(__dirname, 'dev', 'lab.html'));
});

// Static files: versioned ones (?v=) are cached for a year, the rest briefly.
app.use((req, res, next) => {
  const age = typeof req.query.v === 'string' && /^\/(js|css)\//.test(req.path) ? '31536000, immutable'
    : req.path.startsWith('/fonts/') ? '2592000' : req.path.startsWith('/sfx/') ? '604800' : '3600';
  res.set('Cache-Control', `public, max-age=${age}`);
  next();
});
app.use(express.static(PUBLIC_DIR, { index: false, cacheControl: false }));

// Errors no route answered: a short message, never a stack trace or a file path.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('request error', req.method, req.path, err);
  if (res.headersSent) return res.end();
  const message = { 404: 'Not found', 413: 'Request too large' }[status] || (status < 500 ? 'Bad request' : 'Something went wrong');
  if (req.path.startsWith('/api/')) res.status(status).json({ error: message });
  else res.status(status).type('text').send(message);
});
app.use((req, res) => res.status(404).type('text').send('Not found'));

// ---- sockets ----
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 64 * 1024 });
io.on('connection', (socket) => {
  try { arena.onConnect(socket); } catch (e) { errors.publicMessage(e, 'connect'); socket.disconnect(true); }
});
arena.init(io);

if (require.main === module || process.env.START_SERVER === '1') {
  server.listen(config.PORT, () => console.log(`${NAME} is running at http://localhost:${config.PORT}  (DEV_MODE=${config.DEV_MODE})`));
}

module.exports = { server, app };
