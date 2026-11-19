// The match scoreboard at the top of the game window (index.html #gameTop): YOU on the left (your name, your
// character's head), the opponent on the right (their real name, a small "AI" tag for the demo bot, their character's head),
// the score in the middle around the timer ring, the round under it, and the game's own pieces inside the bar:
//   Penalty   a role chip per player (football boot = kicking, goalkeeper gloves = keeping; switches every kick) and
//             the ●/✗ kick tracker,
//   Shootout  ammo per player as bullet icons (live: the scene loads and spends them with its animation),
//   RPS       the round score, Minus One also the phase (Pick two / Keep one),
// A status badge on each avatar shows "thinking…" (dots) and "locked in" (a check mark, the Lucide "check"): the only
// sign of a lock in every game (the scenes don't move a locked character; your own lock also plays ui-lock). It replaces the old in-scene
// "thinking…" bubbles. There are no floating name tags in the scenes any more. Games that count rounds to a target
// (RPS, Minus One) also get a pip per round to win under each name ("first to N", filled = won).
// The game-specific data comes from the scene definition (kit.js contract: def.hud(state, you)); scenes push live
// moments through ctx.hud (see kit.js). Markup is built here so the match (index.html #hud) and the scene lab
// (/dev/lab) share it; the styles live in game-ui.css. The timer ring (#timerRing) lives in the middle: app.js
// drives it.
// The look: one framed bar, the score on a dark screen in the middle (game-ui.css).
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
  const SIDES = ['you', 'opp'];

  // ---------------- icons (code-drawn; colors from game-ui.css classes, never in the markup) ----------------
  // Penalty: the football boot (kicking) and the gloves (keeping), drawn in code (public/js/scenes/art-penalty.js).
  const ICON = {
    kick: () => `<span class="hud-ico">${window.DuelArt?.icons?.['pen-boot'] || ''}</span>`,
    keep: () => `<span class="hud-ico">${window.DuelArt?.icons?.['pen-gloves'] || ''}</span>`,
  };
  const ROLE_LABEL = { kick: 'Kicking', keep: 'Keeping' };
  // A cartridge (Shootout ammo).
  const BULLET = '<svg viewBox="0 0 12 22" class="hud-bullet" aria-hidden="true"><path class="b-tip" d="M2 9Q2 2.5 6 1Q10 2.5 10 9Z"/><rect class="b-case" x="2" y="8.6" width="8" height="9.6" rx="1"/><rect class="b-rim" x="1" y="17.4" width="10" height="3.4" rx="1.2"/></svg>';
  const marksHtml = (marks) => marks.map((m) => (m === '|' ? '<i class="mk-sep" aria-hidden="true"></i>' : `<i class="mk mk-${m}" aria-hidden="true"></i>`)).join('');
  const markText = (marks) => {
    const n = (k) => marks.filter((m) => m === k).length;
    return `${n('goal')} scored, ${n('miss')} missed`;
  };

  // ---------------- markup ----------------
  const sideHtml = (side) => `<div class="hud-side hud-${side}" data-side="${side}" data-status="">
      <span class="hud-av"><span class="avatar figure-avatar hud-avatar" data-figure="${side}" data-side="${side}" aria-hidden="true"></span><span class="hud-badge" aria-hidden="true"><i></i><i></i><i></i>${window.DuelIcons?.svg('check', { cls: 'hud-check' }) || ''}</span><span class="hud-role" hidden></span></span>
      <span class="hud-id"><span class="hud-name"></span><span class="hud-extra"></span></span>
    </div>`;
  function build(root) {
    root.classList.add('hud');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Scoreboard');
    root.innerHTML = `${sideHtml('you')}
      <div class="hud-mid">
        <div class="hud-nums"><b class="hud-score hud-score-you" aria-label="Your score">0</b>
          <span class="hud-clock"><i class="hud-dash" aria-hidden="true">–</i><svg class="timer-ring" id="timerRing" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" class="track"/><circle cx="22" cy="22" r="18" class="fill" id="timerFill"/><text x="22" y="23" id="timerText"></text></svg></span>
          <b class="hud-score hud-score-opp" aria-label="Opponent's score">0</b></div>
        <small class="hud-round" aria-live="polite"></small>
      </div>
      ${sideHtml('opp')}`;
    return root;
  }

  let root = null, cur = null;
  const q = (sel) => root?.querySelector(sel);
  const sideEl = (side) => q(`.hud-${side}`);
  function mount(el) {
    if (!el) return null;
    root = el;
    if (!root.querySelector('.hud-mid')) build(root);
    return root;
  }

  function bump(node, v) {
    if (!node) return;
    const t = String(v ?? 0);
    if (node.textContent === t) return;
    const up = Number(t) > Number(node.textContent);
    node.textContent = t;
    if (up && !reduced()) { node.classList.remove('bump'); void node.offsetWidth; node.classList.add('bump'); }
  }

  // Rounds to win as pips ("first to N": filled = won), for the games with no pieces of their own under the names.
  function pips(extra, n, max) {
    if (!extra.classList.contains('hud-pips') || extra.children.length !== max) {
      extra.className = 'hud-extra hud-pips';
      extra.innerHTML = Array.from({ length: max }, () => '<i class="pp" aria-hidden="true"></i>').join('');
    }
    [...extra.children].forEach((p, i) => p.classList.toggle('on', i < n));
    extra.setAttribute('role', 'img');
    extra.setAttribute('aria-label', `${Math.min(n, max)} of ${max} rounds won`);
  }
  const pipsFor = (state) => (state.target >= 2 && state.target <= 9 ? state.target : 0);

  // The generic round line when a scene has no hud(): "Round 3" and "first to 3".
  function genericRound(state) {
    const first = state.target ? `first to ${state.target}` : '';
    if (state.round != null) return { round: `Round ${state.round + 1}`, note: first };
    return { round: '', note: first };
  }

  // Binds the scoreboard to a match (or a tutorial / the scene lab). opts: { gameId, you, players, onScout }.
  // Returns the ctx.hud object handed to the scene (kit.js contract).
  function bind({ gameId, you = 0, players = [], onScout = null } = {}) {
    if (!root) mount(document.getElementById('hud'));
    if (!root) return null;
    const def = window.DuelScenes?.get?.(gameId) || {};
    const idx = { you, opp: 1 - you };
    root.dataset.game = gameId || '';
    root.classList.remove('hidden');
    for (const side of SIDES) {
      const p = players[idx[side]] || {}, el = sideEl(side);
      el.dataset.status = ''; el.classList.remove('pulse');
      // the avatar: each player's OWN look (yours from the avatar store, the opponent's from players[i].look)
      const av = el.querySelector('.hud-avatar');
      av.dataset.figure = side;
      if (side === 'opp' && p.look) av.dataset.look = JSON.stringify(p.look); else delete av.dataset.look;
      delete av.dataset.painted;
      const name = p.name || (side === 'you' ? 'Guest' : 'Opponent');
      const nameHtml = `<b title="${esc(name)}">${esc(name)}</b>`;
      el.querySelector('.hud-name').innerHTML = `${nameHtml}${p.ai && side === 'opp' ? '<i class="hud-ai" title="Computer opponent">AI</i>' : ''}`;
      el.querySelector('.hud-extra').innerHTML = '';
      const role = el.querySelector('.hud-role');
      role.hidden = true; role.innerHTML = ''; role.dataset.role = '';
      el.setAttribute('aria-label', side === 'you' ? `You: ${name}` : `Opponent: ${name}${p.ai ? ' (AI)' : ''}`);
    }
    if (onScout) {
      const sc = document.createElement('button');
      sc.type = 'button'; sc.className = 'scout-btn'; sc.id = 'btnScout'; sc.textContent = 'Scout'; sc.setAttribute('aria-expanded', 'false');
      sc.addEventListener('click', (e) => { e.stopPropagation(); onScout(); });
      sideEl('opp').querySelector('.hud-name').append(sc);
    }
    q('.hud-score-you').textContent = '0'; q('.hud-score-opp').textContent = '0';
    q('.hud-round').innerHTML = '';
    root.classList.remove('is-alert');
    window.DuelFigures?.paintAvatars?.(root);

    const api = {
      // Everything from a publicState (start of a step, or after a reveal). { scoreOnly: true }: just the numbers
      // (mid-reveal, when the point is shown; the round line and the roles change at the end of the reveal).
      set(state, { scoreOnly = false } = {}) {
        if (cur !== api || !state || !Array.isArray(state.score)) return;
        bump(q('.hud-score-you'), state.score[you]);
        bump(q('.hud-score-opp'), state.score[1 - you]);
        if (scoreOnly) {
          for (const side of SIDES) {
            const extra = sideEl(side).querySelector('.hud-extra');
            if (extra.classList.contains('hud-pips')) pips(extra, state.score[side === 'you' ? you : 1 - you] || 0, extra.children.length);
          }
          return;
        }
        const h = (def.hud ? def.hud(state, you) : null) || genericRound(state);
        const r = h.round || genericRound(state).round;
        q('.hud-round').innerHTML = `<span class="r-main">${esc(r)}</span>${h.phase ? `<span class="r-phase">${esc(h.phase)}</span>` : ''}${h.note ? `<span class="r-note">${esc(h.note)}</span>` : ''}`;
        root.classList.toggle('is-alert', !!h.alert);
        for (const side of SIDES) {
          const s = h[side] || {}, el = sideEl(side);
          const role = el.querySelector('.hud-role');
          if (s.role && ICON[s.role]) {
            if (role.dataset.role !== s.role) {
              role.dataset.role = s.role; role.innerHTML = ICON[s.role](); role.title = ROLE_LABEL[s.role];
              role.setAttribute('aria-label', ROLE_LABEL[s.role]); role.setAttribute('role', 'img');
              if (!reduced()) { role.classList.remove('flip'); void role.offsetWidth; role.classList.add('flip'); }
            }
            role.hidden = false;
          } else { role.hidden = true; role.dataset.role = ''; }
          const extra = el.querySelector('.hud-extra');
          if (s.marks) { extra.className = 'hud-extra hud-marks'; extra.innerHTML = marksHtml(s.marks); extra.setAttribute('role', 'img'); extra.setAttribute('aria-label', markText(s.marks)); }
          else if (s.ammo) api.ammo(side, s.ammo[0], s.ammo[1]);
          else if (pipsFor(state)) pips(extra, state.score[side === 'you' ? you : 1 - you] || 0, pipsFor(state));
          else { extra.className = 'hud-extra'; extra.innerHTML = ''; extra.removeAttribute('aria-label'); }
        }
      },
      // 'thinking' | 'locked' | '' (nothing) for a side.
      status(side, s) { if (cur === api) sideEl(side)?.setAttribute('data-status', s || ''); },
      // The side that just won a point: the side pulses in its color.
      pulse(side) {
        const el = sideEl(side);
        if (cur !== api || !el || reduced()) return;
        el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      },
      // Shootout: n of max bullets loaded for a side. A new bullet pops in, a spent one drops out.
      ammo(side, n, max = 3) {
        const el = sideEl(side);
        if (cur !== api || !el) return;
        const extra = el.querySelector('.hud-extra');
        if (!extra.classList.contains('hud-ammo') || extra.children.length !== max) {
          extra.className = 'hud-extra hud-ammo';
          extra.innerHTML = Array.from({ length: max }, () => `<span class="am">${BULLET}</span>`).join('');
        }
        [...extra.children].forEach((b, i) => {
          const on = i < n, was = b.classList.contains('on');
          b.classList.toggle('on', on);
          if (on !== was && !reduced()) { b.classList.remove('pop', 'drop'); void b.offsetWidth; b.classList.add(on ? 'pop' : 'drop'); }
        });
        extra.setAttribute('role', 'img');
        extra.setAttribute('aria-label', `${n} of ${max} bullets loaded`);
      },
      // Coach-mark targets in the bar: 'score', 'round', 'phase', 'role', 'ammo-you', 'ammo-opp', 'marks-you',
      // 'marks-opp', 'you', 'opp', 'scout'.
      target(name) {
        if (cur !== api) return null;
        if (name === 'score' || name === 'scoreboard') return root;
        if (name === 'round' || name === 'phase' || name === 'turn') return q('.hud-mid');
        if (name === 'role') return sideEl('you').querySelector('.hud-role:not([hidden])') || sideEl('you');
        if (name === 'scout') return q('#btnScout');
        const m = /^(ammo|marks)-(you|opp)$/.exec(name);
        if (m) return sideEl(m[2]).querySelector('.hud-extra');
        if (name === 'you' || name === 'opp') return sideEl(name);
        return null;
      },
      root,
    };
    cur = api;
    return api;
  }
  function hide() { cur = null; root?.classList.add('hidden'); }

  if (document.getElementById('hud')) mount(document.getElementById('hud'));
  else document.addEventListener('DOMContentLoaded', () => mount(document.getElementById('hud')));
  window.DuelHud = { mount, bind, hide, ICON, get current() { return cur; }, };
})();
