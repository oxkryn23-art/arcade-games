// The site: the home page, the Play page, the match (the scene plays everything), the result, challenges, the
// avatar picker and the sound settings. Talks to the server over socket.io (server/arena.js); the server decides
// everything, the page only sends moves.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };
  const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
  const CFG = window.DUEL_CONFIG || { games: [], gameScripts: [] };
  const NAME = CFG.name || 'Second Guess';
  const A = window.DuelAvatar;

  const S = { socket: null, view: null, match: null, queueSince: null, lastQueue: null, lastDemo: null, clockOffset: 0, stats: { waiting: null }, tutorial: null };

  // ---------------- the player: a stable random id (for coming back into a running match) and a nickname ----------------
  function playerId() {
    let id = LS.get('duel_pid');
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      id = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      LS.set('duel_pid', id);
    }
    return id;
  }
  function myName() {
    const saved = DuelNames.clean(LS.get('duel_name') || '');
    if (saved && !DuelNames.problem(saved)) return saved;
    const name = DuelNames.random();
    LS.set('duel_name', name);
    return name;
  }
  const me = () => ({ name: myName(), look: A.get() });

  // ---------------- small helpers ----------------
  function toast(msg, err = false, action = null) {
    $('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status');
    t.append(Object.assign(document.createElement('span'), { textContent: msg }));
    if (action) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-sm btn-play', textContent: action.label, type: 'button' });
      b.addEventListener('click', () => { t.remove(); action.run(); });
      t.append(b);
    }
    document.body.append(t); clearTimeout(toast.t); toast.t = setTimeout(() => t.remove(), action ? 6000 : 3500);
  }
  const gameCfg = (id) => CFG.games.find((g) => g.id === id);
  const gameName = (id) => gameCfg(id)?.name || id;
  const SHORT_NAME = { rps: 'RPS', rps_minus_one: 'Minus One', penalty: 'Penalty', shootout: 'Shootout' };
  const keyRule = (id) => window.DuelScenes?.get(id)?.keyRule || gameCfg(id)?.short || '';
  const ORDER = ['rps', 'rps_minus_one', 'penalty', 'shootout'];
  const displayGames = () => [...CFG.games].sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));
  const allIds = () => displayGames().map((g) => g.id);
  const gamesText = (ids) => { const n = ids.map((id) => SHORT_NAME[id] || gameName(id)); return n.length > 1 ? `${n.slice(0, -1).join(', ')} or ${n.at(-1)}` : n[0] || ''; };
  function TT(id, vars = {}) {
    const t = window.DuelTutorialText?.[id] ?? id;
    return String(t).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  const checkMark = (cls) => `<span class="${cls}" aria-hidden="true">${DuelIcons.svg('check')}</span>`;

  // ---------------- covers: pictures rendered from the scenes (npm run covers), else a live still of the scene ----------------
  const covers = Object.fromEntries((CFG.covers || []).map((id) => [id, `/covers/${id}.webp${CFG.coverV ? `?v=${CFG.coverV}` : ''}`]));
  const stills = new Map();
  // the cover markup of a game: its picture (always shown whole), or a host for a live still filled by fillStills()
  const coverHtml = (id, cls = 'cover-img') => (covers[id] ? `<img class="${cls}" src="${covers[id]}" alt="" decoding="async" loading="lazy">` : `<span class="scene-host cover-still" data-still="${id}"></span>`);
  function fillStills(root) {
    const hosts = $$('[data-still]', root).filter((h) => !stills.has(h));
    if (!hosts.length) return;
    loadGames().then(() => hosts.forEach((h) => { if (h.isConnected && !stills.has(h)) stills.set(h, DuelPreview.still(h.dataset.still, h)); })).catch(() => {});
  }
  function dropStills(root) { stills.forEach((st, h) => { if (!h.isConnected || root.contains(h)) { st?.stop(); stills.delete(h); } }); }

  // ---------------- the game code, on demand ----------------
  // The scenes, their previews and the tutorials are not needed on the home page: loadGames() adds them (in order,
  // versioned by the server: DUEL_CONFIG.gameScripts) the first time anything needs them. The match socket events
  // wait for them, in their order (viaGames).
  let gamesLoading = null, gamesReady = false;
  function loadGames() {
    if (!gamesLoading) {
      gamesLoading = Promise.all((CFG.gameScripts || []).map((src) => new Promise((res, rej) => {
        const el = document.createElement('script');
        el.src = src; el.async = false;
        el.onload = res; el.onerror = () => rej(new Error(`Could not load ${src}`));
        document.body.append(el);
      }))).then(() => { gamesReady = true; }, (e) => { gamesLoading = null; throw e; });
    }
    return gamesLoading;
  }
  let gameChain = Promise.resolve(), gameQueued = 0;
  const viaGames = (fn) => (...args) => {
    if (gamesReady && !gameQueued) return fn(...args);
    gameQueued++;
    gameChain = gameChain.then(loadGames).then(() => fn(...args)).catch((e) => { console.error(e); toast('Could not load the game. Check your connection and reload.', true); }).finally(() => { gameQueued--; });
  };

  // ---------------- views ----------------
  const VIEWS = { viewHome: 'home', viewPlay: 'play', viewMatch: 'match' };
  const VIEW_HASH = { viewPlay: '#play', viewHome: '#home' };
  const setTitle = (t) => { document.title = t ? `${NAME} — ${t}` : NAME; };
  function show(view) {
    const wasMatch = S.view === 'viewMatch';
    S.view = view;
    Object.keys(VIEWS).forEach((v) => $('#' + v).classList.toggle('hidden', v !== view));
    const inMatch = view === 'viewMatch';
    const cur = { viewPlay: 'play', viewHome: 'home' }[view] || '';
    $$('#mainNav [data-nav]').forEach((b) => (b.dataset.nav === cur ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    if (!inMatch) { DuelHud.hide(); askForfeit(false); closeHelp(); DuelSound.ambient(null); }
    if (wasMatch && !inMatch) A.setOpponent(null);
    // leaving a finished match: the scene goes too (a tutorial cleans up its own scene)
    if (wasMatch && !inMatch && !S.match && !S.tutorial && scene) { scene.destroy(); scene = null; }
    document.body.classList.toggle('is-tutorial', inMatch && !!S.tutorial);
    document.body.dataset.bg = inMatch ? '' : 'page';
    document.body.dataset.view = VIEWS[view];
    if (!inMatch) { try { history.replaceState(null, '', VIEW_HASH[view] || location.pathname + location.search); } catch {} }
    window.scrollTo(0, 0);
    if (view === 'viewPlay') renderPlay();
    if (view === 'viewHome') showcase.start(); else showcase.stop();
    if (view === 'viewPlay') setTitle('Play'); else if (view === 'viewHome') setTitle('');
  }

  // ---------------- tutorial progress (this browser) ----------------
  const tutLocal = () => json(LS.get('duel_tutorials'), {});
  const tutStatus = (game) => tutLocal()[game] || null;
  function setTut(game, status) {
    const t = tutLocal();
    if (!(status === 'seen' && t[game])) t[game] = status;
    LS.set('duel_tutorials', JSON.stringify(t));
  }

  // ---------------- the match card: the scene's safeBottom says how much the controls may cover ----------------
  function prepareStage(gameId) {
    const def = DuelScenes.get(gameId) || {};
    const corner = def.controls === 'corner';
    $('#viewMatch').dataset.ctl = corner ? 'corner' : 'center';
    const safe = Number((corner && def.safeCorner) || def.safeBottom) || 0;
    $('#matchStage').style.setProperty('--safe', String(Math.max(0, Math.min(0.4, safe))));
  }

  // ---------------- the home page: a featured game showcase ----------------
  const SHOWCASE = {
    rps: { head: 'A childhood<br>classic.', text: 'Read your opponent, then throw.' },
    rps_minus_one: { head: 'Two hands.<br>Keep one.', text: 'Show two, see theirs, keep the one that wins.' },
    penalty: { head: 'Left, center<br>or right?', text: 'A battle of minds, not feet.' },
    shootout: { head: 'It&rsquo;s high<br>noon.', text: 'Reload, block or shoot. Guess right.' },
  };
  const hookOf = (g) => SHOWCASE[g.id]?.text || g.short;
  const cardName = (g) => `<span class="nm-full">${esc(g.name)}</span><span class="nm-short">${esc(SHORT_NAME[g.id] || g.name)}</span>`;
  const ROTATE_MS = 5000;
  const showcase = (() => {
    let idx = 0, timer = 0, left = ROTATE_MS, startedAt = 0, paused = false, running = false;
    const games = () => displayGames();
    const cur = () => games()[idx % Math.max(1, games().length)];
    function render() {
      const list = games(), g = cur();
      if (!g) return;
      const sc = SHOWCASE[g.id] || { head: esc(g.name), text: esc(g.short) };
      $('#scName').textContent = g.name;
      dropStills($('#showcase')); dropStills($('#coverStrip'));
      $('#scCover').innerHTML = coverHtml(g.id, 'sc-img');
      $('#scHead').innerHTML = sc.head;
      $('#scText').textContent = sc.text;
      $('#showcase').dataset.game = g.id;
      $('#scDots').innerHTML = list.map((x, i) => `<button type="button" class="sc-dot" data-sc="${i}" aria-label="${esc(x.name)}" aria-pressed="${i === idx}"></button>`).join('');
      $('#coverStrip').innerHTML = list.filter((x) => x.id !== g.id).map((x) => `<button type="button" class="mini-card" data-feature="${x.id}">
          <span class="mc-cover">${coverHtml(x.id)}</span>
          <span class="mc-meta"><b>${cardName(x)}</b><small>${esc(hookOf(x))}</small></span>
        </button>`).join('');
      fillStills($('#showcase')); fillStills($('#coverStrip'));
      $('#showcase').classList.remove('swap'); void $('#showcase').offsetWidth; $('#showcase').classList.add('swap');
    }
    const remaining = () => (paused || !startedAt ? left : Math.max(0, left - (Date.now() - startedAt)));
    function schedule() {
      clearTimeout(timer);
      if (!running || paused) return;
      if (document.querySelector('dialog[open]')) { timer = setTimeout(schedule, 1000); return; }
      startedAt = Date.now();
      timer = setTimeout(() => go(idx + 1), left);
    }
    function go(i, user = false) {
      const n = games().length || 1;
      idx = ((i % n) + n) % n;
      left = ROTATE_MS;
      render();
      if (user) DuelSound.play('ui-click', { volume: 0.6 });
      schedule();
    }
    function pause(on) {
      if (on === paused) return;
      if (on) { left = remaining(); clearTimeout(timer); paused = true; } else { paused = false; schedule(); }
    }
    return {
      start() { if (running) return; running = true; left = ROTATE_MS; render(); schedule(); },
      stop() { running = false; clearTimeout(timer); },
      go, pause, cur, render,
      feature(id) { const i = games().findIndex((g) => g.id === id); if (i >= 0) go(i, true); },
    };
  })();

  // ---------------- the Play page ----------------
  // The ticked games (duel_games; all by default). Every game can be OFF: with none ON the buttons are disabled.
  const pickedGames = () => {
    const all = allIds(), saved = json(LS.get('duel_games'), null);
    return Array.isArray(saved) ? saved.filter((x) => all.includes(x)) : all;
  };
  function toggleGame(id) {
    const all = allIds(), on = new Set(pickedGames());
    if (id === 'all') { LS.set('duel_games', JSON.stringify(all.every((g) => on.has(g)) ? [] : all)); return; }
    if (on.has(id)) on.delete(id); else on.add(id);
    LS.set('duel_games', JSON.stringify(all.filter((g) => on.has(g))));
  }
  function selectGame(id) {
    const on = new Set(pickedGames()); on.add(id);
    LS.set('duel_games', JSON.stringify(allIds().filter((g) => on.has(g))));
  }
  let tilesBuilt = false;
  function renderTiles() {
    const host = $('#playTiles');
    if (!tilesBuilt) {
      tilesBuilt = true;
      dropStills(host);
      host.innerHTML = displayGames().map((g) => `<div class="ptile" data-game="${g.id}">
          <button type="button" class="ptile-pick" data-pick="${g.id}" aria-pressed="false">
            <span class="tile-cover">${coverHtml(g.id, '')}</span>
            <span class="tile-meta"><b>${cardName(g)}</b><small>${esc(hookOf(g))}</small></span>
            ${checkMark('ptile-check')}
          </button>
          <button type="button" class="tile-help" data-help="${g.id}" aria-label="${esc(TT('app.tile-button'))} ${esc(g.name)}">${esc(TT('app.tile-button'))}</button>
        </div>`).join('');
      fillStills(host);
    }
    const on = pickedGames(), all = allIds(), every = all.every((g) => on.includes(g));
    $$('[data-pick]', host).forEach((b) => b.setAttribute('aria-pressed', String(on.includes(b.dataset.pick))));
    $('#gamesAll').setAttribute('aria-pressed', String(every));
    $('#gamesAll').textContent = every ? 'Clear all' : 'Select all';
    $('#gamesCount').textContent = `${on.length} of ${all.length} picked`;
  }
  const waitingFor = (ids) => (CFG.showWaitingCounts && S.stats.waiting ? Math.max(0, ...ids.map((g) => S.stats.waiting[g] || 0)) : 0);
  function renderPlay() {
    renderTiles();
    const on = pickedGames(), none = !on.length;
    $('#btnFind').disabled = none; $('#btnAi').disabled = none;
    const w = waitingFor(on);
    $('#summary').innerHTML = none ? '' : `<div class="ss-main">${esc(gamesText(on))}</div><div class="ss-tok">${w ? `${w} waiting now` : 'Free, as many matches as you like'}</div>`;
    $('#panelNote').textContent = none ? 'Pick at least one game' : '';
    $('#viewPlay').classList.toggle('no-games', none);
  }
  function openPlay() {
    loadGames().catch(() => {});
    show('viewPlay');
  }

  // ---------------- quick match (the queue) and vs AI ----------------
  function findMatch(games = pickedGames()) {
    if (!games.length) return toast('Pick at least one game');
    S.lastQueue = games; S.lastDemo = null;
    S.socket.emit('queue:join', { games, ...me() }, (r) => { if (!r.ok) toast(r.error, true); });
  }
  function startDemo(gameId) {
    S.lastDemo = gameId; S.lastQueue = null;
    loadGames().then(() => S.socket.emit('demo:start', { gameId, ...me() }, (r) => { if (!r.ok) toast(r.error, true); })).catch((e) => toast(e.message, true));
  }
  const randomOf = (list) => list[Math.floor(Math.random() * list.length)];
  function playAi() {
    const on = pickedGames();
    if (!on.length) return toast('Pick at least one game');
    startDemo(randomOf(on));
  }

  // "New to Shootout? 30-second tutorial. Play it / Skip"
  function offerTutorial(id) {
    const g = gameCfg(id);
    $('#tutOfferText').innerHTML = esc(TT('app.offer', { game: '\u0000' })).replace('\u0000', `<b>${esc(g.name)}</b>`);
    $('#tutOffer').classList.remove('hidden');
    $('#tutPlay').textContent = TT('app.offer-play'); $('#tutSkip').textContent = TT('app.offer-skip');
    $('#tutPlay').onclick = () => { $('#tutOffer').classList.add('hidden'); runTutorial(id, () => goBack()); };
    $('#tutSkip').onclick = () => { $('#tutOffer').classList.add('hidden'); setTut(id, 'skipped'); };
  }

  // ---------------- challenge a friend (server/challenges.js) ----------------
  // Each side keeps its seat secret in this browser (duel_challenges); the server stores only its hash.
  const SEATS_KEY = 'duel_challenges', CH_HOLD_MS = 2 * 60_000;
  const CODE_PATH = /^\/c\/([a-z2-9]{8})\/?$/i;
  const chSeats = () => json(LS.get(SEATS_KEY), []).filter((x) => x && x.code && x.secret && x.until > Date.now());
  function saveSeat(code, role, secret) {
    const l = chSeats().filter((x) => !(x.code === code && x.role === role));
    l.unshift({ code, role, secret, until: Date.now() + 2 * 86400_000 });
    LS.set(SEATS_KEY, JSON.stringify(l.slice(0, 30)));
  }
  const seatOf = (code) => chSeats().find((x) => x.code === code);
  const chLink = (code) => `${location.origin}/c/${code}`;
  const chMine = new Map();   // code -> the challenge as the server shows it to me (with my role)
  function untilText(ts) {
    const ms = ts - Date.now();
    if (ms <= 0) return '0 min';
    const min = Math.ceil(ms / 60_000), h = Math.floor(min / 60), m = min % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  }
  const CH_STATUS = { waiting: 'Waiting', accepted: 'Accepted', started: 'Played', cancelled: 'Cancelled', expired: 'Expired' };

  let chDraft = null;
  function openChallenge() {
    if (S.match || S.tutorial) return toast('Finish the match first.', true);
    chDraft = { games: new Set(pickedGames().length ? pickedGames() : allIds()), result: null };
    renderChallenge();
    $('#dlgChallenge').open || $('#dlgChallenge').showModal();
  }
  function renderChallenge() {
    renderChBadges();
    const d = chDraft;
    if (!d) return;
    const r = d.result;
    $('#chForm').classList.toggle('hidden', !!r);
    $('#chResult').classList.toggle('hidden', !r);
    $('#chCreate').classList.toggle('hidden', !!r);
    $('#chNew').classList.toggle('hidden', !r);
    if (r) renderChResult();
    else {
      const every = allIds().every((g) => d.games.has(g));
      $('#chAll').setAttribute('aria-pressed', String(every));
      $('#chAll').textContent = every ? 'Clear all' : 'Select all';
      dropStills($('#chGames'));
      $('#chGames').innerHTML = displayGames().map((g) => `<button type="button" class="ch-gpick" data-chg="${g.id}" aria-pressed="${d.games.has(g.id)}">
          <span class="ch-gcover">${coverHtml(g.id, '')}</span>
          <b><span>${esc(SHORT_NAME[g.id] || g.name)}</span></b>
          ${checkMark('ch-gcheck')}
        </button>`).join('');
      fillStills($('#chGames'));
      $('#chAs').innerHTML = `You play as <b>${esc(myName())}</b>. <button type="button" class="rules-link" data-customize>Change</button>`;
      $('#chCreate').disabled = !d.games.size;
      $('#chErr').textContent = d.games.size ? '' : 'Pick at least one game';
    }
    renderChList();
  }
  function renderChResult() {
    const v = { ...chDraft.result, ...(chMine.get(chDraft.result.code) || {}) };
    $('#chReadyText').innerHTML = `Your challenge is ready: <b>${esc(gamesText(v.games))}</b>. Send the link to a friend.`;
    $('#chLink').value = chLink(v.code);
    $('#chStatus').innerHTML = (v.status === 'waiting' ? esc(`Waiting for someone to accept. Expires in ${untilText(v.expiresAt)}.`)
      : v.status === 'accepted' ? esc(`${v.to?.name || 'Someone'} accepted.`) : esc(CH_STATUS[v.status] || ''))
      + (['waiting', 'accepted'].includes(v.status) ? ` <button type="button" class="rules-link" data-ch-cancel="${v.code}">Cancel</button>` : '');
  }
  function renderChList() {
    const v = [...chMine.values()]
      .filter((x) => (x.role === 'creator' && ['waiting', 'accepted'].includes(x.status)) || (x.role === 'accepter' && x.status === 'accepted'))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const showIt = !!v && !(chDraft?.result && chDraft.result.code === v.code);
    $('#chMineBox').classList.toggle('hidden', !showIt);
    if (!showIt) { $('#chList').innerHTML = ''; return; }
    const acts = [];
    if (v.status === 'waiting' && v.role === 'creator') acts.push(`<button type="button" class="btn btn-ghost btn-sm" data-ch-copy="${v.code}">Copy link</button>`);
    if (v.status === 'accepted') acts.push(`<button type="button" class="btn btn-play btn-sm" data-ch-play="${v.code}">Play now</button>`);
    if (v.role === 'creator') acts.push(`<button type="button" class="rules-link" data-ch-cancel="${v.code}">Cancel</button>`);
    if (v.role === 'accepter') acts.push(`<button type="button" class="rules-link" data-ch-withdraw="${v.code}">Withdraw</button>`);
    const vs = v.role === 'accepter' ? `vs ${v.from.name}` : v.to ? `vs ${v.to.name}` : '';
    const left = v.status === 'waiting' ? `${untilText(v.expiresAt)} left` : '';
    $('#chList').innerHTML = `<div class="ch-item st-${v.status}"><span class="pill">${CH_STATUS[v.status] || ''}</span>
        <span class="ch-what"><b>${esc(gamesText(v.games))}</b><small>${esc([vs, left].filter(Boolean).join(', '))}</small></span>
        <span class="ch-acts">${acts.join('')}</span></div>`;
  }
  function renderChBadges() {
    const n = [...chMine.values()].filter((v) => v.status === 'accepted').length;
    $$('[data-challenge]').forEach((b) => { b.dataset.news = n ? String(n) : ''; });
  }
  function createChallenge() {
    const d = chDraft;
    if (!d || !d.games.size) return;
    $('#chCreate').disabled = true; $('#chErr').textContent = '';
    S.socket.emit('challenge:create', { games: [...d.games], ...me() }, (r) => {
      $('#chCreate').disabled = false;
      if (!r?.ok) { $('#chErr').textContent = r?.error || 'Could not create the challenge.'; return; }
      saveSeat(r.challenge.code, 'creator', r.secret);
      chMine.set(r.challenge.code, { ...r.challenge, role: 'creator' });
      d.result = r.challenge;
      renderChallenge();
    });
  }
  function chEmit(ev, code, extra = {}) {
    return new Promise((res) => S.socket.emit(ev, { code, secret: seatOf(code)?.secret, ...extra }, (r) => {
      if (!r?.ok) toast(r?.error || 'Something went wrong.', true);
      else if (r.challenge) {
        const prev = chMine.get(code) || {};
        chMine.set(code, { ...prev, ...r.challenge, role: r.challenge.role || prev.role || null });
      }
      res(r); renderChallenge(); renderCard();
    }));
  }
  async function copyLink(code) {
    const link = chLink(code);
    try { await navigator.clipboard.writeText(link); toast('Link copied'); }
    catch { $('#chLink')?.select?.(); toast(link); }
  }
  function notifyAccepted(code, delay = 700) {
    setTimeout(() => {
      const v = chMine.get(code);
      if (!v || v.status !== 'accepted' || v.role !== 'creator' || S.match || S.tutorial) return;
      DuelSound.play('ui-match-found');
      toast(`${v.to?.name || 'Your friend'} accepted your challenge`, false, { label: 'Play now', run: () => chEmit('challenge:play', code) });
    }, delay);
  }
  function onChallengeUpdate({ challenge: v } = {}) {
    if (!v?.code) return;
    const prev = chMine.get(v.code);
    chMine.set(v.code, v);
    if (v.role === 'creator' && v.status === 'accepted' && prev?.status !== 'accepted') notifyAccepted(v.code);
    if (v.role === 'accepter' && prev?.status === 'accepted' && ['cancelled', 'expired'].includes(v.status) && !S.match) {
      toast(v.status === 'cancelled' ? `${v.from.name} cancelled the challenge.` : "The challenge didn't start in time.");
    }
    renderChallenge(); renderCard();
  }
  function challengeHello() {
    S.socket.emit('challenge:hello', { seats: chSeats().map(({ code, secret }) => ({ code, secret })) }, (r) => {
      if (!r?.ok) return;
      chMine.clear();
      for (const v of r.challenges) chMine.set(v.code, v);
      for (const v of r.challenges) if (v.status === 'accepted' && v.role === 'creator') notifyAccepted(v.code, 1500);
      renderChallenge(); renderCard();
    });
  }

  // ---- the challenge card: what a friend sees on /c/<code> ----
  let card = null;
  async function openChallengeCard(code) {
    loadGames().catch(() => {});
    const dlg = $('#dlgChallengeCard');
    card?.stage?.destroy();
    card = { code, view: null, stage: null, timer: null };
    $('#ccTitle').textContent = "You're challenged";
    $('#ccBody').innerHTML = '<p class="note">Loading…</p>'; $('#ccFoot').innerHTML = '';
    dlg.open || dlg.showModal();
    try {
      const r = await fetch(`/api/challenge/${encodeURIComponent(code)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'This challenge does not exist');
      card.view = j.challenge;
    } catch (e) {
      $('#ccBody').innerHTML = `<p class="cc-msg">${esc(e.message)}</p>`;
      $('#ccFoot').innerHTML = '<button type="button" class="btn btn-ghost" data-cc="demo">Play vs AI</button><button type="button" class="btn btn-play" data-cc="close">OK</button>';
      return;
    }
    renderCard(true);
  }
  function renderCard(fresh = false) {
    if (!card?.view || !$('#dlgChallengeCard').open) return;
    const v = { ...card.view, ...(chMine.get(card.code) || {}) };
    card.view = v;
    const mine = v.role === 'creator';
    const seated = v.role === 'accepter' && v.status === 'accepted';
    $('#ccTitle').textContent = mine ? 'Your challenge' : seated ? 'Challenge accepted' : "You're challenged";
    const games = v.games.map((id) => `<span class="cc-game"><span class="cc-cover">${coverHtml(id, '')}</span><b>${esc(SHORT_NAME[id] || gameName(id))}</b></span>`).join('');
    let state = '', foot = '';
    const closed = { accepted: 'Someone already accepted this challenge.', started: 'This challenge was already played.', cancelled: 'This challenge was cancelled.', expired: 'This challenge has expired.' };
    clearTimeout(card.timer);
    if (mine) {
      state = v.status === 'waiting'
        ? `<p class="cc-msg">Send the link to a friend. It expires in ${untilText(v.expiresAt)}.</p><div class="ch-link"><input readonly value="${esc(chLink(v.code))}" aria-label="Challenge link"><button type="button" class="btn btn-play btn-sm" data-ch-copy="${v.code}">Copy</button></div>`
        : v.status === 'accepted' ? `<p class="cc-msg"><b>${esc(v.to?.name || 'Your friend')}</b> accepted.</p>` : `<p class="cc-msg">${closed[v.status] || ''}</p>`;
      foot = (v.status === 'accepted' ? `<button type="button" class="btn btn-play" data-ch-play="${v.code}">Play now</button>` : '')
        + '<button type="button" class="btn btn-ghost" data-cc="close">Close</button>';
    } else if (seated) {
      const holding = (v.acceptedAt || 0) + CH_HOLD_MS > Date.now();
      state = holding
        ? `<p class="cc-msg cc-wait"><span class="cc-spin" aria-hidden="true"></span>Waiting for <b>${esc(v.from.name)}</b>… The match starts as soon as they're here.</p>`
        : `<p class="cc-msg"><b>${esc(v.from.name)}</b> isn't here right now. Your seat is held for ${untilText(v.startBy)}: the match starts when one of you presses Play now while the other is on the site.</p>`;
      foot = `<button type="button" class="rules-link" data-ch-withdraw="${v.code}">Withdraw</button>`
        + (holding ? '' : `<button type="button" class="btn btn-play" data-ch-play="${v.code}">Play now</button>`)
        + '<button type="button" class="btn btn-ghost" data-cc="close">Close</button>';
      if (holding) card.timer = setTimeout(() => renderCard(), (v.acceptedAt + CH_HOLD_MS) - Date.now() + 200);
    } else if (v.status !== 'waiting') {
      state = `<p class="cc-msg">${closed[v.status] || 'This challenge is closed.'}</p>`;
      foot = '<button type="button" class="btn btn-ghost" data-cc="demo">Play vs AI</button><button type="button" class="btn btn-play" data-cc="close">OK</button>';
    } else {
      state = `<div class="cc-me"><span class="cc-me-head"><span class="avatar figure-avatar" data-figure="you" aria-hidden="true"></span></span>
          <div><label for="ccNick">Your nickname</label><input id="ccNick" maxlength="18" autocomplete="off" spellcheck="false" value="${esc(myName())}"></div>
          <button type="button" class="btn btn-ghost btn-sm" data-customize>Your avatar</button></div><p class="note err" id="ccErr"></p>`;
      foot = '<button type="button" class="btn btn-ghost" data-cc="decline">Decline</button><button type="button" class="btn btn-play" data-cc="accept">Accept</button>';
    }
    const who = mine ? 'You' : v.from.name;
    $('#ccBody').innerHTML = `<div class="cc-hero">
        <div class="cc-stage" role="img" aria-label="${esc(`${who}'s avatar`)}"><div class="cc-rig"></div></div>
        <div class="cc-info">
          <p class="cc-kicker">${mine ? 'You challenge' : 'Challenge from'}</p>
          <h3 class="cc-name">${esc(mine ? 'a friend' : v.from.name)}</h3>
          <div class="cc-games">${games}</div>
          ${v.games.length > 1 ? '<p class="note cc-pick">One of these, picked at random when the match starts.</p>' : ''}
          <div class="cc-free ch-sum"><div class="ss-main">Free</div><div class="ss-tok">Just for fun</div></div>
        </div>
      </div>${state}`;
    $('#ccFoot').innerHTML = foot;
    card.stage?.destroy();
    card.stage = DuelFigures.stage($('#ccBody .cc-rig'), v.from.look || A.random(), { mood: 'GEN-5' });
    DuelFigures.paintAvatars($('#ccBody'));
    fillStills($('#ccBody'));
    if (fresh) $('#ccBody').scrollTop = 0;
  }
  function closeCard() {
    clearTimeout(card?.timer);
    card?.stage?.destroy(); card = null;
    dropStills($('#ccBody'));
    if (CODE_PATH.test(location.pathname)) { try { history.replaceState(null, '', '/'); } catch {} }
  }
  function acceptCard() {
    const v = card?.view; if (!v) return;
    const err = (m) => { const e = $('#ccErr'); if (e) e.textContent = m; };
    const nick = $('#ccNick');
    if (nick) {
      const n = DuelNames.clean(nick.value);
      const bad = DuelNames.problem(n);
      if (bad) return err(bad);
      LS.set('duel_name', n);
    }
    const b = $('#ccFoot [data-cc="accept"]'); if (b) b.disabled = true;
    S.socket.emit('challenge:accept', { code: v.code, ...me(), secret: seatOf(v.code)?.secret }, (r) => {
      if (!r?.ok) { if (b) b.disabled = false; return err(r?.error || 'Could not accept the challenge.'); }
      saveSeat(v.code, 'accepter', r.secret);
      if (!chMine.get(v.code) || chMine.get(v.code).status !== 'started') chMine.set(v.code, { ...r.challenge, role: 'accepter' });
      renderCard(); renderChBadges();
    });
  }
  function routeChallenge() {
    const m = location.pathname.match(CODE_PATH);
    if (m) openChallengeCard(m[1].toLowerCase());
  }
  function onChallengeClick(e) {
    const t = e.target;
    if (t.closest('[data-challenge]')) { openChallenge(); return true; }
    const chg = t.closest('[data-chg]');
    if (chg && chDraft) {
      const all = allIds(), g = chg.dataset.chg;
      if (g === 'all') chDraft.games = new Set(all.every((x) => chDraft.games.has(x)) ? [] : all);
      else if (chDraft.games.has(g)) chDraft.games.delete(g); else chDraft.games.add(g);
      renderChallenge(); return true;
    }
    const cp = t.closest('[data-ch-copy]'); if (cp) { copyLink(cp.dataset.chCopy); return true; }
    const pl = t.closest('[data-ch-play]'); if (pl) { chEmit('challenge:play', pl.dataset.chPlay); return true; }
    const cn = t.closest('[data-ch-cancel]'); if (cn) { if (confirm('Cancel this challenge? The link stops working.')) chEmit('challenge:cancel', cn.dataset.chCancel); return true; }
    const wd = t.closest('[data-ch-withdraw]'); if (wd) { chEmit('challenge:withdraw', wd.dataset.chWithdraw).then((r) => { if (r?.ok) chMine.delete(wd.dataset.chWithdraw); renderChallenge(); renderCard(); }); return true; }
    const cc = t.closest('[data-cc]');
    if (cc) {
      const a = cc.dataset.cc;
      if (a === 'accept') acceptCard();
      else if (a === 'close') $('#dlgChallengeCard').close();
      else if (a === 'decline') { $('#dlgChallengeCard').close(); toast('Challenge declined. The link still works if you change your mind.'); }
      else if (a === 'demo') { $('#dlgChallengeCard').close(); openPlay(); }
      return true;
    }
    return false;
  }

  // ---------------- the avatar picker: skin, hairstyle, hair color, shirt color, and the nickname ----------------
  let cust = null;
  const OPT_KINDS = ['skin', 'hair', 'hairColor', 'shirt'];
  function swatch(kind, id) {
    if (kind === 'hair') return `<span class="opt-hair">${DuelFigures.avatarSvg({ ...cust.draft, hair: id }, 'you', { face: 'smile' })}</span>`;
    return `<span class="opt-dot" style="background: var(--${id})"></span>`;
  }
  function openCustomizer({ first = false } = {}) {
    cust = { draft: A.get(), first, stage: null };
    $('#custNick').value = myName();
    $('#custErr').textContent = '';
    renderCust();
    cust.stage = DuelFigures.stage($('#custRig'), cust.draft, { mood: 'GEN-6' });
    $('#dlgCustomize').open || $('#dlgCustomize').showModal();
  }
  function renderCust() {
    if (!cust) return;
    $('#custOpts').innerHTML = OPT_KINDS.map((kind) => `<div class="opt-row" role="radiogroup" aria-label="${esc(A.LABELS[kind])}"><span class="opt-label">${esc(A.LABELS[kind])}</span>
      <div class="opt-list">${A.OPTIONS[kind].map((id, i) => `<button type="button" class="opt" role="radio" data-kind="${kind}" data-opt="${id}" aria-checked="${cust.draft[kind] === id}" aria-label="${esc(A.LABELS[id] || `${A.LABELS[kind]} ${i + 1}`)}" title="${esc(A.LABELS[id] || `${A.LABELS[kind]} ${i + 1}`)}">${swatch(kind, id)}</button>`).join('')}</div></div>`).join('');
  }
  function custSet(kind, id) {
    cust.draft = A.valid({ ...cust.draft, [kind]: id });
    cust.stage?.set(cust.draft);
    cust.stage?.rig?.mood('GEN-6');
    renderCust();
  }
  function custSave() {
    const n = DuelNames.clean($('#custNick').value);
    const bad = DuelNames.problem(n);
    if (bad) { $('#custErr').textContent = bad; return; }
    LS.set('duel_name', n);
    A.set(cust.draft);
    DuelSound.play('ui-lock');
    $('#dlgCustomize').close();
    toast('Saved');
  }
  function custClosed() {
    cust?.stage?.destroy(); cust = null;
    renderMeAvatar();
    renderCard();
    if ($('#dlgChallenge').open) renderChallenge();
  }
  function renderMeAvatar() {
    const b = $('#meAvatar');
    b.innerHTML = '<span class="figure-avatar" data-figure="you"></span>';
    b.title = `${myName()}: change your avatar`;
    DuelFigures.paintAvatars(b);
  }

  // ---------------- help sheet, forfeit confirm ----------------
  function placeSheet(sheet) {
    if (sheet.classList.contains('hidden')) return;
    const controlsTop = $('#controls').getBoundingClientRect().top || window.innerHeight;
    sheet.style.bottom = `${Math.max(8, window.innerHeight - controlsTop + 8)}px`;
    sheet.style.maxHeight = `${Math.max(140, controlsTop - 72)}px`;
  }
  let askT = 0;
  function askForfeit(open) {
    const box = $('#forfeitAsk');
    clearTimeout(askT);
    if (!open || !S.match) { box.classList.add('hidden'); $('#mForfeit').setAttribute('aria-expanded', 'false'); return; }
    $('#forfeitAskText').textContent = 'Forfeit? You lose this match.';
    box.classList.remove('hidden');
    $('#mForfeit').setAttribute('aria-expanded', 'true');
    $('#forfeitNo').focus({ preventScroll: true });
    askT = setTimeout(() => askForfeit(false), 6000);
  }
  // Rules card during a match: a looping mini preview + the rules. Purely local: the server timer keeps running.
  let helpLoop = null;
  function openHelp() {
    const g = S.match?.game;
    if (!g) return;
    $('#helpTitle').textContent = `How to play ${g.name}`;
    $('#helpRules').innerHTML = g.rules.map((r) => `<li>${esc(r)}</li>`).join('');
    const keys = DuelScenes.get(g.id)?.shortcuts || [];
    $('#helpKeys').hidden = !keys.length;
    $('#helpKeys').innerHTML = keys.length ? `<h4>Keyboard</h4><dl>${keys.map(([k, what]) => `<dt>${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</dt><dd>${esc(what)}</dd>`).join('')}</dl>` : '';
    $('#helpSheet').classList.remove('hidden');
    $('#mHelp').classList.remove('pulse');
    placeSheet($('#helpSheet'));
    helpLoop?.stop();
    helpLoop = DuelPreview.loop(g.id, $('#helpScene'), { pause: 300 });
  }
  function closeHelp() {
    const was = !$('#helpSheet').classList.contains('hidden');
    helpLoop?.stop(); helpLoop = null;
    $('#helpSheet').classList.add('hidden');
    if (was && $('#helpSheet').contains(document.activeElement)) $('#mHelp').focus({ preventScroll: true });
  }

  // ---------------- queue: you, face to face with a question mark ----------------
  let qTick;
  function showQueue(d) {
    S.queueSince = d.since || Date.now();
    $('#qInfo').innerHTML = `<b>${esc(d.games.length === CFG.games.length ? 'Any game' : d.games.map(gameName).join(', '))}</b>`;
    $('#qScene').innerHTML = `<span class="q-fig">${DuelFigures.avatarSvg(null, 'you', { body: true, pose: 'idle3', mood: 'GEN-4' })}</span><span class="q-vs">?</span>`;
    $('#queueOverlay').classList.remove('hidden');
    clearInterval(qTick);
    qTick = setInterval(() => {
      const s = Math.floor((Date.now() - S.queueSince) / 1000);
      $('#qTimer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
  }
  function hideQueue() { clearInterval(qTick); $('#queueOverlay').classList.add('hidden'); }

  // ---------------- match: the scene plays everything; scene calls are queued so reveals never overlap ----------------
  let scene = null, sceneQ = Promise.resolve(), timerRaf, overlayT, hud = null;
  const queueScene = (fn) => (sceneQ = sceneQ.then(fn).catch((e) => console.error('scene', e)));
  const AMBIENT = { penalty: 'ambient-stadium', shootout: 'ambient-western' };
  function matchPlayers(info) {
    return info.players.map((p, i) => (i === info.you ? { ...p, name: p.name || myName(), look: p.look || A.get() } : p));
  }
  function mountScene(info, g) {
    scene?.destroy();
    const def = DuelScenes.get(g.id);
    DuelSound.preload(g.id);
    scene = def.create();
    prepareStage(g.id);
    const players = matchPlayers(info);
    hud = DuelHud.bind({ gameId: g.id, you: info.you, players });
    scene.mount($('#sceneHost'), { you: info.you, mode: info.mode, mini: false, controlsEl: $('#controls'), players, send: sendMove, sound: DuelSound, timing: g.timing, hud });
  }
  // "Matched: Shootout", the 3-2-1 countdown with ticks, and for a game you've never seen a short "How to play" splash
  function preMatchOverlay(info, g) {
    const ov = $('#matchOverlay');
    const unseen = !tutStatus(g.id);
    if (unseen) { setTut(g.id, 'seen'); $('#mHelp').classList.add('pulse'); }
    ov.innerHTML = `<div class="ov-matched"><small>${{ demo: 'Vs AI', friendly: 'Challenge' }[info.mode] || 'Matched'}</small>${esc(g.name)}</div>
      <div class="ov-count" id="ovCount">3</div>
      ${unseen ? `<div class="ov-howto"><div><b>How to play ${esc(g.name)}</b><p>${esc(keyRule(g.id))}</p></div></div>` : ''}`;
    ov.classList.remove('hidden');
    DuelSound.play('ui-match-found');
    clearTimeout(overlayT);
    [3, 2, 1].forEach((n, i) => setTimeout(() => {
      const c = $('#ovCount'); if (!c) return;
      c.textContent = n; c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
      DuelSound.play('ui-countdown-tick');
    }, i * 950));
    overlayT = setTimeout(hideOverlay, 2900);
  }
  const hideOverlay = () => { clearTimeout(overlayT); $('#matchOverlay').classList.add('hidden'); };

  function onMatchFound(info) {
    $('#dlgResult').open && $('#dlgResult').close();
    ['#dlgChallenge', '#dlgChallengeCard', '#dlgCustomize', '#dlgSettings', '#dlgRules'].forEach((d) => $(d).open && $(d).close());
    hideQueue(); closeHelp();
    $('#tutOffer').classList.add('hidden');
    S.tutorial = null;
    const g = gameCfg(info.gameId);
    S.match = { info, game: g, state: null, locked: false };
    A.setOpponent(info.players?.[1 - info.you]?.look || null);
    $('#mMode').textContent = { demo: 'Vs AI', friendly: 'Challenge', pvp: 'Online match' }[info.mode] || '';
    $('#mMode').classList.add('is-demo');
    $('#mForfeitLbl').textContent = 'Forfeit';
    $('#mForfeit').setAttribute('aria-label', 'Forfeit and leave the match');
    $('#controls').innerHTML = '';
    show('viewMatch');
    setTitle(g.name);
    sceneQ = Promise.resolve();
    mountScene(info, g);
    DuelSound.ambient(AMBIENT[g.id] || null);
    if (!info.resumed) preMatchOverlay(info, g);
    setTimer(null);
  }
  function onRound(d) {
    const m = S.match; if (!m) return;
    m.locked = !!d.locked;
    m.oppLocked = !!d.oppLocked;
    S.clockOffset = d.serverNow - Date.now();
    queueScene(() => {
      if (S.match !== m) return;
      hideOverlay();
      m.state = d.state;
      hud?.set(d.state);
      hud?.status('you', m.locked ? 'locked' : 'thinking');
      hud?.status('opp', m.oppLocked ? 'locked' : 'thinking');
      scene.setRound(d.state);
      if (m.locked) scene.setLocked('you');
      if (m.oppLocked) scene.setLocked('opp');
      setTimer(d.deadline, d.stepMs);
      placeSheet($('#helpSheet'));
    });
  }
  // The "pick now" ticks of a turn's last 2 s, scheduled against the server's deadline.
  function hurryOn(m) {
    if (!m?.hurryAt || m.locked || m.sending) { DuelSound.hurry?.(null); return; }
    DuelSound.hurry?.(m.hurryAt, () => S.match === m && !m.locked && !m.sending && !S.tutorial && S.view === 'viewMatch');
  }
  function setTimer(deadline, total) {
    cancelAnimationFrame(timerRaf);
    const ring = $('#timerRing'), fill = $('#timerFill'), Cf = 2 * Math.PI * 18;
    if (!ring || !fill) return;
    fill.style.strokeDasharray = Cf;
    ring.classList.toggle('idle', !deadline);
    if (S.match) { S.match.hurryAt = deadline ? deadline - S.clockOffset : null; S.match.sending = false; }
    hurryOn(deadline ? S.match : null);
    if (!deadline) { fill.style.strokeDashoffset = 0; $('#timerText').textContent = ''; ring.classList.remove('low'); return; }
    const tick = () => {
      const left = deadline - (Date.now() + S.clockOffset);
      const f = Math.max(0, Math.min(1, left / total));
      fill.style.strokeDashoffset = Cf * (1 - f);
      $('#timerText').textContent = Math.max(0, Math.ceil(left / 1000));
      ring.classList.toggle('low', left < Math.min(3000, total / 3));
      if (left > 0) timerRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function sendMove(move) {
    const m = S.match; if (!m || m.locked) return;
    m.sending = true; hurryOn(null);
    S.socket.emit('match:move', { matchId: m.info.matchId, move }, (r) => {
      m.sending = false;
      if (!r.ok) { toast(r.error, true); if (S.match === m && !m.locked) { scene?.setControlsEnabled(true); hurryOn(m); } }
    });
  }
  function lockedUi() {
    if (!S.match) return;
    S.match.locked = true;
    hurryOn(null);
    hud?.status('you', 'locked');
    scene?.setLocked('you');
  }
  function onOpponentLocked() {
    if (!S.match) return;
    S.match.oppLocked = true;
    hud?.status('opp', 'locked');
    scene?.setLocked('opp');
  }
  function onRoundResult(d) {
    const m = S.match; if (!m) return;
    setTimer(null);
    queueScene(async () => {
      const prev = m.state;
      m.state = d.state;
      $('#mHelp').classList.remove('pulse');
      hud?.status('you', ''); hud?.status('opp', '');
      await scene.reveal({ moves: d.moves, roundWinner: d.roundWinner, state: d.state, prev });
      if (S.match === m) hud?.set(d.state, { scoreOnly: !!m.ended });
    });
  }
  function onMatchEnd(d) {
    const info = S.match?.info;
    if (S.match) S.match.ended = true;
    askForfeit(false);
    hurryOn(null);
    queueScene(async () => {
      await scene?.end({ winner: d.winner });
      showResult(d, info);
    });
  }

  // ---------------- the result: the card, Play again, Share, Back ----------------
  let cardUrl = null;
  async function showResult(d, info) {
    closeHelp();
    const win = d.winner === d.you, draw = d.winner == null;
    const outcome = draw ? 'draw' : win ? 'win' : 'loss';
    DuelSound.play(draw ? 'ui-draw-match' : win ? 'ui-win-match' : 'ui-lose-match');
    const gName = gameName(d.gameId);
    const players = info ? matchPlayers(info) : [];
    const mine = players[d.you] || { name: myName(), look: A.get() }, opp = players[1 - d.you] || { name: 'Opponent' };
    const forfeit = d.reason === 'forfeit';
    $('#resTitle').textContent = draw ? 'Draw' : win ? 'You won' : 'You lost';
    $('#resTitle').className = 'result-title ' + (draw ? '' : win ? 'win' : 'loss');
    $('#resAmt').textContent = forfeit ? (win ? 'Your opponent forfeited.' : 'You forfeited.') : `at ${gName}`;
    $('#dlgResult').className = draw ? 'res-draw' : win ? 'res-win' : 'res-loss';
    const cardEl = $('#resCard'), pic = $('#resImg');
    cardEl.classList.add('failed');   // the text version until the card is drawn
    pic.removeAttribute('src');
    pic.alt = `${draw ? 'Draw' : win ? 'You won' : 'You lost'} at ${gName}`;
    $('#dlgResult').showModal();
    S.match = null;
    let blob = null;
    try {
      blob = await DuelCard.render({ outcome, name: mine.name, oppName: opp.name, gameName: gName, look: A.get(), oppLook: opp.look || null, mode: d.mode });
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      pic.onload = () => cardEl.classList.remove('failed');
      pic.src = cardUrl;
    } catch (e) { console.error('result card', e); }
    // Share: a phone that can share files attaches the card itself; elsewhere the card is saved and the text copied
    $('#btnShare').onclick = async () => {
      const text = draw ? `A draw at ${gName} on ${NAME}! ${location.origin}` : win ? `I just won at ${gName} on ${NAME}! ${location.origin}` : `Rematch at ${gName} on ${NAME}? ${location.origin}`;
      const file = blob && new File([blob], 'result.png', { type: 'image/png' });
      if (file && navigator.canShare?.({ files: [file], text })) {
        try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      if (cardUrl) { const a = Object.assign(document.createElement('a'), { href: cardUrl, download: 'result.png' }); document.body.append(a); a.click(); a.remove(); }
      try { await navigator.clipboard.writeText(text); toast('Card saved, text copied'); } catch { toast('Card saved'); }
    };
  }

  // ---------------- tutorials: the real scene in a sandbox, inside the match view ----------------
  function runTutorial(gameId, then) {
    if (S.match) return toast('Finish the match first.', true);
    if (!gamesReady) { loadGames().then(() => runTutorial(gameId, then), (e) => toast(e.message, true)); return; }
    const g = gameCfg(gameId);
    if (!g) return;
    $('#tutOffer').classList.add('hidden');
    $('#dlgRules').open && $('#dlgRules').close();
    scene?.destroy(); scene = null;
    S.tutorial = gameId;
    $('#mMode').textContent = TT('app.badge', { game: g.name });
    $('#mMode').classList.add('is-demo');
    $('#mForfeitLbl').textContent = TT('app.exit');
    $('#mForfeit').setAttribute('aria-label', 'Exit the tutorial');
    $('#controls').innerHTML = '';
    const coach = A.random();
    A.setOpponent(coach);
    show('viewMatch');
    setTitle(TT('app.title', { game: g.name }));
    setTimer(null);
    const players = [{ name: myName(), look: A.get() }, { name: 'Coach Bot', ai: true, look: coach }];
    hud = DuelHud.bind({ gameId, you: 0, players });
    prepareStage(gameId);
    DuelSound.preload(gameId);
    S.tutorialRun = DuelTutorial.start(gameId, {
      host: $('#sceneHost'), controlsEl: $('#controls'), timing: g.timing, sound: DuelSound, cover: covers[gameId] || null, hud, players,
      onFinish: (status) => {
        setTut(gameId, status);
        S.tutorial = null; S.tutorialRun = null;
        if (status === 'done') toast(TT('app.done', { game: g.name }));
        then?.(status);
      },
    });
  }

  function openRules(g) {
    if (!g) return;
    $('#rulesTitle').textContent = g.name;
    dropStills($('#rulesCover'));
    $('#rulesCover').innerHTML = coverHtml(g.id);
    fillStills($('#rulesCover'));
    $('#rulesList').innerHTML = g.rules.map((r) => `<li>${esc(r)}</li>`).join('');
    $('#rulesTutorial').dataset.game = g.id;
    $('#rulesTutorial').classList.toggle('hidden', !!S.match || !!S.tutorial);
    $('#dlgRules').showModal();
  }

  // ---------------- socket ----------------
  function connectSocket() {
    const s = io({ auth: { pid: playerId() } });
    S.socket = s;
    s.on('lobby:stats', (st) => {
      const changed = JSON.stringify(st.waiting) !== JSON.stringify(S.stats.waiting);
      S.stats = st;
      if (changed && S.view === 'viewPlay') renderPlay();
    });
    s.on('queue:joined', viaGames(showQueue));
    s.on('queue:left', viaGames(hideQueue));
    s.on('match:found', viaGames(onMatchFound));
    s.on('match:round', viaGames(onRound));
    s.on('match:locked', viaGames(lockedUi));
    s.on('match:opponentLocked', viaGames(onOpponentLocked));
    s.on('match:roundResult', viaGames(onRoundResult));
    s.on('match:end', viaGames(onMatchEnd));
    s.on('connect', challengeHello);
    s.on('challenge:update', onChallengeUpdate);
  }

  // ---------------- routing ----------------
  function routeHash() {
    if (location.hash === '#home') { show('viewHome'); return true; }
    if (location.hash === '#play') { openPlay(); return true; }
    return false;
  }
  // the page's view from the address, unless a match (resumed after a reload) or a tutorial is on screen
  const routeTo = (fallback) => { if (S.match || S.tutorial) return; if (!routeHash()) fallback(); };
  const goBack = () => openPlay();

  // ---------------- landscape only: the rotate overlay, fullscreen on phones ----------------
  const PORTRAIT_MQ = '(orientation: portrait) and (max-width: 900px) and (pointer: coarse), (orientation: portrait) and (max-width: 520px)';
  function rotateGuard() {
    const mq = window.matchMedia?.(PORTRAIT_MQ), ov = $('#rotateOverlay');
    if (!mq || !ov) return;
    const apply = () => {
      const on = mq.matches;
      for (const el of document.body.children) {
        if (el === ov || el.tagName === 'SCRIPT') continue;
        if (on && !el.inert) { el.inert = true; el.dataset.rotateInert = '1'; }
        else if (!on && el.dataset.rotateInert) { el.inert = false; delete el.dataset.rotateInert; }
      }
      if (on) ov.focus({ preventScroll: true });
    };
    mq.addEventListener?.('change', apply);
    apply();
  }
  function goLandscape() {
    if (!window.matchMedia?.('(pointer: coarse)').matches || Math.min(screen.width, screen.height) > 900) return;
    const lock = () => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not supported */ } };
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) { lock(); return; }
    try { el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {}); } catch { /* not allowed */ }
  }
  const PLAY_STARTS = '#btnPlay, #btnDemo, #btnFind, #btnAi, #resAgain, #ccFoot [data-cc="accept"]';
  document.addEventListener('click', (e) => { if (e.target.closest?.(PLAY_STARTS)) goLandscape(); }, true);

  // ---------------- wiring ----------------
  function bindSound() {
    const sync = (st) => {
      $('#mMute').classList.toggle('muted', st.muted);
      $('#mMute').setAttribute('aria-pressed', String(st.muted));
      $('#mMute').setAttribute('aria-label', st.muted ? 'Unmute' : 'Mute');
      $('#mMute').title = st.muted ? 'Unmute' : 'Mute';
      $('#sndFx').checked = st.sfx; $('#sndVol').value = st.volume;
    };
    sync(DuelSound.state());
    DuelSound.onChange(sync);
    $('#sndFx').addEventListener('change', (e) => { if (e.target.checked && DuelSound.state().muted) DuelSound.setMuted(false); DuelSound.setEffects(e.target.checked); });
    $('#mMute').addEventListener('click', () => DuelSound.setMuted(!DuelSound.state().muted));
    $('#sndVol').addEventListener('input', (e) => { DuelSound.setVolume(e.target.value); if (DuelSound.state().muted) DuelSound.setMuted(false); if (!DuelSound.state().sfx) DuelSound.setEffects(true); });
    $('#sndVol').addEventListener('change', () => DuelSound.play('ui-lock'));
  }
  function bind() {
    $('#settingsBtn').addEventListener('click', () => $('#dlgSettings').showModal());
    $('#meAvatar').addEventListener('click', () => openCustomizer());
    $('#btnPlay').addEventListener('click', () => { const g = showcase.cur(); if (g) selectGame(g.id); openPlay(); });
    $('#btnDemo').addEventListener('click', () => { const g = showcase.cur(); if (g) startDemo(g.id); });
    $('#footDemo').addEventListener('click', () => openPlay());
    for (const b of [$('#btnPlay'), $('#btnDemo')]) for (const ev of ['pointerenter', 'focus', 'touchstart']) b.addEventListener(ev, () => loadGames().catch(() => {}), { once: true, passive: true });
    $('#scDots').addEventListener('click', (e) => { const b = e.target.closest('[data-sc]'); if (b) showcase.go(Number(b.dataset.sc), true); });
    $('#coverStrip').addEventListener('click', (e) => { const b = e.target.closest('[data-feature]'); if (b) showcase.feature(b.dataset.feature); });
    for (const el of [$('#showcase'), $('#coverStrip')]) {
      el.addEventListener('pointerenter', () => showcase.pause(true));
      el.addEventListener('pointerleave', () => { if (!$('#showcase').contains(document.activeElement)) showcase.pause(false); });
      el.addEventListener('focusin', () => showcase.pause(true));
      el.addEventListener('focusout', (e) => { if (!el.contains(e.relatedTarget)) showcase.pause(false); });
    }
    document.addEventListener('visibilitychange', () => showcase.pause(document.hidden));
    $('#gamesAll').addEventListener('click', () => { toggleGame('all'); renderPlay(); });
    $('#playTiles').addEventListener('click', (e) => {
      const h = e.target.closest('[data-help]');
      if (h) return runTutorial(h.dataset.help, () => goBack());
      const b = e.target.closest('[data-pick]'); if (!b) return;
      DuelSound.play('ui-click', { volume: 0.7 });
      toggleGame(b.dataset.pick); renderPlay();
    });
    $('#mainNav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-nav]'); if (!b) return;
      if (S.match || S.tutorial) { toast(S.tutorial ? TT('app.busy') : 'Finish the match first, or forfeit it (top right of the game).'); return; }
      ({ home: () => show('viewHome'), play: () => openPlay() })[b.dataset.nav]?.();
    });
    $('#btnFind').addEventListener('click', () => findMatch());
    $('#btnAi').addEventListener('click', playAi);
    $('#qCancel').addEventListener('click', () => S.socket.emit('queue:leave', {}, () => hideQueue()));
    $('#mForfeit').addEventListener('click', (e) => {
      e.stopPropagation();
      if (S.tutorial) { S.tutorialRun?.stop(); return; }
      if (S.match) askForfeit($('#forfeitAsk').classList.contains('hidden'));
    });
    $('#forfeitNo').addEventListener('click', () => askForfeit(false));
    $('#forfeitYes').addEventListener('click', () => { askForfeit(false); if (S.match) S.socket.emit('match:forfeit', { matchId: S.match.info.matchId }); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#forfeitAsk, #mForfeit')) askForfeit(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      askForfeit(false);
      if (!$('#helpSheet').classList.contains('hidden')) { closeHelp(); $('#mHelp').focus({ preventScroll: true }); }
    });
    $('#mRules').addEventListener('click', () => openRules(S.match?.game || (S.tutorial && gameCfg(S.tutorial))));
    $('#mHelp').addEventListener('click', () => (S.match ? ($('#helpSheet').classList.contains('hidden') ? openHelp() : closeHelp()) : null));
    $('#helpClose').addEventListener('click', closeHelp);
    $('#rulesTutorial').textContent = TT('app.rules-button');
    $('#rulesTutorial').addEventListener('click', () => { const id = $('#rulesTutorial').dataset.game; $('#dlgRules').close(); runTutorial(id, () => goBack()); });
    window.addEventListener('resize', () => placeSheet($('#helpSheet')));
    let ctlH = -1, ctlRaf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(ctlRaf);
      ctlRaf = requestAnimationFrame(() => {
        const h = Math.ceil($('#controls').getBoundingClientRect().height);
        if (h !== ctlH) { ctlH = h; $('#matchStage').style.setProperty('--ctl-h', `${h}px`); }
        placeSheet($('#helpSheet'));
      });
    }).observe($('#controls'));
    window.addEventListener('hashchange', () => { if (!S.match && !S.tutorial) routeHash(); });
    $('#resLobby').addEventListener('click', () => { $('#dlgResult').close(); goBack(); });
    $('#resClose').addEventListener('click', () => $('#resLobby').click());
    $('#dlgResult').addEventListener('cancel', (e) => { e.preventDefault(); $('#resLobby').click(); });
    $('#resAgain').addEventListener('click', () => {
      $('#dlgResult').close();
      if (S.lastDemo) startDemo(S.lastDemo); else if (S.lastQueue) { openPlay(); findMatch(S.lastQueue); } else openPlay();
    });
    $('#custSave').addEventListener('click', custSave);
    $('#custRandom').addEventListener('click', () => { if (!cust) return; cust.draft = A.random(); cust.stage?.set(cust.draft); cust.stage?.rig?.mood('GEN-6'); renderCust(); DuelSound.play('ui-click', { volume: 0.6 }); });
    $('#custDice').addEventListener('click', () => { $('#custNick').value = DuelNames.random(); });
    $('#custOpts').addEventListener('click', (e) => { const b = e.target.closest('[data-opt]'); if (b && cust) { DuelSound.play('ui-click', { volume: 0.6 }); custSet(b.dataset.kind, b.dataset.opt); } });
    $('#dlgCustomize').addEventListener('close', custClosed);
    $('#dlgCustomize').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'custNick') { e.preventDefault(); custSave(); } });
    $('#brand').addEventListener('click', (e) => { e.preventDefault(); if (!S.match && !S.tutorial) show('viewHome'); });
    $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    $('#chCreate').addEventListener('click', createChallenge);
    $('#chNew').addEventListener('click', () => { if (chDraft) { chDraft.result = null; renderChallenge(); } });
    $('#chCopy').addEventListener('click', () => chDraft?.result && copyLink(chDraft.result.code));
    $('#dlgChallengeCard').addEventListener('close', closeCard);
    document.addEventListener('click', (e) => {
      if (onChallengeClick(e)) return;
      if (e.target.closest('[data-customize]')) { openCustomizer(); return; }
      if (e.target.closest('.btn, .main-nav button, .gt-btn, .gt-forfeit, .rules-link')) DuelSound.play('ui-click', { volume: 0.7 });
    });
    bindSound();
  }

  (function init() {
    bind();
    rotateGuard();
    renderMeAvatar();
    connectSocket();
    routeTo(() => show('viewHome'));
    routeChallenge();
    if (!A.saved() && !CODE_PATH.test(location.pathname)) setTimeout(() => { if (!S.match) openCustomizer({ first: true }); }, 400);
  })();
})();
