// RPS Minus One scene: the two players sit on their chairs across the table (staging, gesture hands and ambient life
// in rps-duel.js) and use BOTH hands: slot 0 = the upper hand, slot 1 = the lower one (rps-duel.js SLOTS: the far arm
// from behind the body shows the upper hand, the near arm the lower one), in the order of state.pairs[player]; yours
// come from the left, the opponent's from the right.
// Phase 'pick': tap two gesture buttons (the same one twice is a double: rock + rock; Backspace undoes the first tap),
// then both pairs pump once with the READY fists and snap open. Phase 'keep': tap one of your own hands (or its button;
// the keep buttons carry the slot 0 | 1, so a double's two hands are two buttons and either one works); the dropped
// hand pulls back (to the lap or the table) with a whoosh and the kept ones clash like in rps.js. Faces: moments M1-1..12
// (expressions.js). The phase (Pick two / Keep one) and the score are in the top scoreboard (def.hud).
// Coach-mark targets: 'rock' | 'paper' | 'scissors' (phase-1 buttons), 'keep-0' | 'keep-1' (your hands in phase 2),
// 'opp-hands' (the opponent); 'phase', 'score' and 'scout' are in the top scoreboard (scenes/hud.js).
(function () {
  const K = window.DuelKit;
  const { C, el, g } = K;
  const D = () => window.DuelRpsDuel;
  const GESTURES = ['rock', 'paper', 'scissors'];
  const PAIRS = [['rock', 'paper'], ['rock', 'scissors'], ['paper', 'scissors'], ['rock', 'rock']]; // preview samples (a double too)
  const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
  const SIDES = ['you', 'opp'];
  const norm = (pair) => [...pair].sort(); // the server's pair order
  // Phase changes move the hands along smooth arcs (rig.to bow): the return to the ready pose at a round / phase start
  // and the dropped hand's pull back to the lap.
  const ARC_MS = 420, BOW = 0.22;

  function create() {
    let b, ctx, st, rigs, P1, P2, H, life, controls, unbindKeys, cur = null, chosen = [], myKeep = null, myKeepSlot = null, hits = [];
    const sideOf = (idx) => (idx === ctx.you ? 'you' : 'opp');
    const keepPhase = () => cur?.phase === 'keep' && !!cur.pairs;
    const armOf = (side, slot) => D().SLOTS[slot];
    const handMid = (side, slot) => H.mid(side, armOf(side, slot));
    const radius = (side, slot) => H.radius(side, armOf(side, slot));
    const dim = (side, on) => H.dim(side, on);
    const markChosen = () => controls?.buttons.forEach((bt) => bt.setAttribute('aria-pressed', String(chosen.includes(bt.dataset.v))));

    // Clickable rings over your own two hands in phase 2: '' | 'pickable' | 'hover' | 'press' | 'kept'.
    function hitStyle(h, mode) {
      h.ring.setAttribute('fill-opacity', { '': 0, pickable: 0.06, hover: 0.16, press: 0.26, kept: 0.14 }[mode]);
      h.ring.setAttribute('stroke-opacity', mode ? 1 : 0);
      h.ring.setAttribute('stroke-dasharray', mode === 'pickable' ? '18 14' : 'none');
    }
    function makeHits() {
      if (ctx.mini) return;
      hits = [0, 1].map((i) => {
        const ring = el('circle', { r: 10, fill: C.you, stroke: C.you, 'stroke-width': 3, 'fill-opacity': 0, 'stroke-opacity': 0 });
        const node = g({ class: 'm1-hit' }, ring);
        node.style.pointerEvents = 'none';
        const h = { i, node, ring, pickable: false };
        node.addEventListener('pointerenter', () => { if (h.pickable) { hitStyle(h, 'hover'); ctx.sound?.play('ui-hover', { volume: 0.4 }); } });
        node.addEventListener('pointerleave', () => h.pickable && hitStyle(h, 'pickable'));
        node.addEventListener('pointerdown', () => h.pickable && hitStyle(h, 'press'));
        node.addEventListener('click', () => { if (h.pickable && cur?.pairs) controls?.press(i); });
        st.tbl.fx.append(node);
        return h;
      });
    }
    function placeHits() {
      hits.forEach((h) => { const [x, y] = handMid('you', h.i); h.node.setAttribute('transform', `translate(${x} ${y})`); h.ring.setAttribute('r', radius('you', h.i) * 0.95); });
    }
    function setPickable(on) {
      hits.forEach((h) => {
        const bt = cur?.pairs?.[ctx.you]?.[h.i] ? controls?.button(h.i) : null;
        h.pickable = !!(on && bt && !bt.disabled);
        h.node.style.cursor = h.pickable ? 'pointer' : '';
        h.node.style.pointerEvents = h.pickable ? '' : 'none';
        if (!h.pickable && !myKeep) hitStyle(h, '');
        else if (h.pickable) hitStyle(h, 'pickable');
      });
    }

    function buildControls(state) {
      if (!ctx.controlsEl) return;
      const icon = (v) => D().icon(v);
      if (state.phase === 'keep' && state.pairs) {
        const pair = state.pairs[ctx.you];
        // one button per hand (value = the slot), so a double (rock + rock) shows two buttons and either one keeps it
        controls = K.buttons(ctx, pair.map((v, i) => ({ v: i, label: LABEL[v], icon: icon(v), key: i ? 'ArrowRight' : 'ArrowLeft' })), { cls: 'rps rps-keep', prompt: 'Keep one hand.' });
        controls.onPick = (i) => {
          myKeep = pair[i]; myKeepSlot = i;
          setPickable(false);
          hits.forEach((h) => hitStyle(h, h.i === i ? 'kept' : ''));
          ctx.send(pair[i]);
        };
      } else {
        controls = K.buttons(ctx, GESTURES.map((v, i) => ({ v, label: LABEL[v], icon: icon(v), key: String(i + 1) })), { cls: 'rps', prompt: 'Pick two hands.', hint: 'The same hand twice is allowed. Your pair locks in on the second tap.' });
        // The first tap picks one hand, the second tap (any gesture, the same one again for a double) sends the pair.
        controls.onPick = (v) => {
          chosen.push(v);
          if (chosen.length === 2) {
            if (chosen[0] === chosen[1]) { const lb = controls.button(v)?.querySelector('.ctl-label'); if (lb) lb.textContent = `${LABEL[v]} x2`; }
            ctx.send([...chosen]);
          } else { controls.enable(() => true); controls.setPrompt('Now your second hand.'); }
          markChosen();
        };
      }
    }

    // Backspace before the second tap: the first hand is picked again (the pair is not sent yet).
    function undoFirst() {
      if (keepPhase() || chosen.length !== 1 || !controls || controls.buttons.every((bt) => bt.disabled)) return;
      chosen = [];
      controls.enable(() => true); controls.setPrompt('Pick two hands.');
      markChosen();
    }

    const flashHands = (list, ms) => { if (!ctx.mini) list.forEach(([side, slot]) => K.flash(st.tbl.fx, ...handMid(side, slot), radius(side, slot) * 1.2, ms + 80)); };

    // Phase 1 done: both pairs pump once and snap open (fits ctx.timing.phase).
    async function revealPairs(r) {
      const [pumpMs, snapMs] = K.fit([440, 220], (ctx.timing?.phase || 900) - 100);
      await D().pumps(ctx, SIDES.map((s) => [rigs[s], P2[s].up, P2[s].down]), 1, pumpMs);
      for (const idx of [0, 1]) rigs[sideOf(idx)].to(P2[sideOf(idx)].open(r.state.pairs[idx]), snapMs, 'snap');
      for (const s of SIDES) rigs[s].mood('M1-4');
      ctx.sound?.play('rps-paper-wrap', { volume: 0.5 }); ctx.sound?.haptic?.(20);
      await K.sleep(snapMs * 0.4);
      flashHands([['you', 0], ['you', 1], ['opp', 0], ['opp', 1]], snapMs);
      await K.sleep(snapMs * 0.6);
      ctx.hud?.set(r.state);
    }

    // Phase 1 missed: the round ends right away (fits ctx.timing.reveal).
    async function revealMissed(r) {
      const [openMs, hitMs] = K.fit([360, 1100], (ctx.timing?.reveal || 2300) - 100);
      const missed = [];
      for (const idx of [0, 1]) {
        const m = r.moves[idx], side = sideOf(idx);
        rigs[side].to(P2[side].open(m ? norm(m) : null), openMs, 'snap');
        if (!m) { missed.push(side); dim(side, true); }
      }
      await K.sleep(openMs);
      const w = r.roundWinner;
      ctx.sound?.play('rps-whoosh');
      if (w != null) { ctx.hud?.set(r.state, { scoreOnly: true }); ctx.hud?.pulse(sideOf(w)); if (!ctx.mini) K.floatText(b, '+1', ...st.S.plus[sideOf(w)], sideOf(w)); rigs[sideOf(w)].mood('M1-8'); }
      missed.forEach((s) => rigs[s].mood('M1-9'));
      await Promise.all([...missed.map((s) => rigs[s].to(P1[s].sad, hitMs * 0.6)), K.punch(b, w == null ? 'BOTH MISSED' : 'MISSED', { x: st.S.punch[0], y: st.S.punch[1], who: w == null ? '' : sideOf(w), hold: Math.max(200, hitMs - 380) })]);
      ctx.hud?.set(r.state);
    }

    // Phase 2: the dropped hand pulls back with a whoosh, the kept hands line up, pump twice and clash.
    async function clash(r) {
      const pairs = r.prev.pairs || [[], []];
      const [yankMs, pumpMs, snapMs, hitMs] = K.fit([380, 520, 140, 900], (ctx.timing?.reveal || 2300) - 100);
      hits.forEach((h) => hitStyle(h, ''));
      const slot = {}, move = {}, drop = {};
      for (const idx of [0, 1]) {
        const side = sideOf(idx), m = r.moves[idx];
        move[side] = m;
        // a double keeps the hand you tapped on your screen; the opponent's double keeps its first hand
        slot[side] = !m ? -1 : side === 'you' && myKeepSlot != null && pairs[idx][myKeepSlot] === m ? myKeepSlot : pairs[idx].indexOf(m);
        drop[side] = m ? pairs[idx][1 - slot[side]] : null;
        if (!m) dim(side, true);
      }
      const kept = SIDES.filter((s) => slot[s] >= 0);
      for (const s of kept) rigs[s].mood('M1-7');
      const keepPose = (s, extra) => P2[s].keep(slot[s], move[s], drop[s], extra);
      if (kept.length) {
        ctx.sound?.play('rps-hand-yank');
        await Promise.all(kept.map((s) => rigs[s].to(keepPose(s), yankMs, 'back', BOW)));
        // two pumps with the kept hand (both gestures are already public), then snap
        for (let i = 0; i < 2; i++) {
          await Promise.all(kept.map((s) => rigs[s].to(keepPose(s, P2[s].keepUp(slot[s])), pumpMs / 4, 'out')));
          ctx.sound?.play('rps-whoosh', { volume: 0.6 });
          await Promise.all(kept.map((s) => rigs[s].to(keepPose(s, P2[s].keepDown(slot[s])), pumpMs / 4, 'in')));
        }
        kept.forEach((s) => rigs[s].to(keepPose(s), snapMs, 'snap'));
        flashHands(kept.map((s) => [s, slot[s]]), snapMs);
        await K.sleep(snapMs);
      } else await K.sleep(yankMs + pumpMs + snapMs);

      const w = r.roundWinner;
      const hold = Math.max(200, hitMs - 380);
      if (w == null) {
        if (!kept.length) {
          for (const s of SIDES) { rigs[s].mood('M1-9'); rigs[s].to(P1[s].sad, hitMs * 0.5); }
          await K.punch(b, 'BOTH MISSED', { x: st.S.punch[0], y: st.S.punch[1], hold });
        } else {
          ctx.sound?.play('rps-draw-bounce');
          setTimeout(() => {
            const [a, c] = [handMid('you', slot.you), handMid('opp', slot.opp)];
            K.fx(st.tbl.fx, 'clash', (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, { size: radius('you', slot.you) * 3.4, color: C.paper, ms: hitMs * 0.6 });
            kept.forEach((s) => rigs[s].mood('M1-10'));
          }, hitMs * 0.22);
          await Promise.all([...kept.map((s) => rigs[s].seq([[keepPose(s, P2[s].meet(slot[s])), hitMs * 0.25, 'out'], [keepPose(s, P2[s].recoil(slot[s])), hitMs * 0.3, 'out'], [keepPose(s), hitMs * 0.35]])), K.punch(b, 'DRAW', { x: st.S.punch[0], y: st.S.punch[1], hold })]);
        }
      } else {
        const winSide = sideOf(w), loseSide = sideOf(1 - w);
        const winMove = r.moves[w], loseMove = r.moves[1 - w];
        const [text, sfx] = loseMove ? D().WIN[winMove] : ['MISSED', 'rps-whoosh'];
        const contact = hitMs * 0.3, color = winSide === 'you' ? C.you : C.opp;
        const strike = rigs[winSide].seq([[keepPose(winSide, P2[winSide].strike(slot[winSide])), contact, 'snap'], [keepPose(winSide), hitMs - contact]]);
        const hit = (async () => {
          await K.sleep(contact);
          rigs[loseSide].mood('M1-9');
          await rigs[loseSide].to(loseMove ? keepPose(loseSide, P2[loseSide].recoil(slot[loseSide])) : P1[loseSide].sad, hitMs * 0.6, 'out');
        })();
        setTimeout(() => {
          ctx.sound?.play(sfx); ctx.sound?.haptic?.(40);
          if (loseMove) {
            const rot = winMove === 'rock' ? 0 : winSide === 'you' ? 0 : 180;
            K.fx(st.tbl.fx, winMove, ...handMid(loseSide, slot[loseSide]), { size: radius(loseSide, slot[loseSide]) * 3.2, rot, color, ms: hitMs * 0.65 });
            if (winMove === 'rock') K.shake(b.camera, 6);
          }
          rigs[winSide].mood('M1-8');
          ctx.hud?.set(r.state, { scoreOnly: true }); ctx.hud?.pulse(winSide);
          if (!ctx.mini) K.floatText(b, '+1', ...st.S.plus[winSide], winSide);
        }, contact);
        await Promise.all([strike, hit, K.punch(b, text, { x: st.S.punch[0], y: st.S.punch[1], who: winSide, hold })]);
      }
      ctx.hud?.set(r.state);
    }

    const api = {
      mount(container, c) {
        ctx = c;
        b = K.base(container, ctx, { bg: 'rps-table' });
        P1 = { you: D().poses('you'), opp: D().poses('opp') };
        P2 = { you: D().poses2('you'), opp: D().poses2('opp') };
        // Minus One's own start: from the very first frame (the 3-2-1 countdown too) both players hold BOTH hands out
        // in the two-hand ready pose, so the first round starts without a hand popping in.
        st = D().stage(b, ctx, { arms: [1, 2], small: true, pose: (side) => P2[side].ready(null) }); rigs = st.rigs;
        H = D().hands(rigs);
        life = D().ambient(b, ctx);
        K.youStart(b, rigs.you, ctx);   // the YOU arrow over your character at the start (an overlay, never awaited)
        makeHits();
        if (ctx.controlsEl) {
          unbindKeys = K.keys({ 1: 'rock', 2: 'paper', 3: 'scissors', ArrowLeft: 0, ArrowUp: 0, ArrowRight: 1, ArrowDown: 1, Backspace: 'undo' }, (v) => {
            if (typeof v === 'number') { if (keepPhase()) controls?.press(v); }
            else if (v === 'undo') undoFirst();
            else if (!keepPhase()) controls?.press(v);
          });
        }
      },

      setRound(state) {
        cur = state; chosen = []; myKeep = null; myKeepSlot = null;
        const keep = keepPhase();
        for (const idx of [0, 1]) {
          const side = sideOf(idx);
          dim(side, false);
          // back to the two-hand ready pose along smooth arcs (the first round: already there, nothing moves)
          rigs[side].idle(true).mood(keep ? 'M1-5' : state.round ? 'M1-2' : 'M1-1');
          rigs[side].to(P2[side].ready(keep ? state.pairs[idx] : null), ARC_MS, 'inOut', BOW).then(() => { if (cur === state) placeHits(); });
        }
        placeHits();
        ctx.hud?.set(state);
        if (!keep && !ctx.mini) ctx.sound?.play('rps-start-ding', { volume: 0.75 });   // a new round (not the keep phase)
        buildControls(state);
        controls?.enable(() => true);
        setPickable(keep);
      },

      setLocked(who) {
        const r = rigs[who];
        if (who === 'opp') { /* silent: the scoreboard shows it (a mid-turn tock sounded like a clock) */ }
        else {
          controls?.disable(); setPickable(false);
          ctx.sound?.play('ui-lock');
        }
        // No pose change on a lock (the same in every game): the character stays as it is; the scoreboard check mark
        // (hud.js) and, for your own lock, ui-lock are the only signs. The face stays the round's normal mood.
        r.mood(keepPhase() ? 'M1-6' : 'M1-3');
        // Phase 2: your own kept hand is marked by its ring, on your screen only.
        if (keepPhase() && who === 'you' && myKeep) hits.forEach((h) => hitStyle(h, h.i === myKeepSlot ? 'kept' : ''));
      },

      async reveal(r) {
        controls?.disable(); setPickable(false);
        if (r.prev?.phase === 'pick') return r.state.phase === 'keep' ? revealPairs(r) : revealMissed(r);
        return clash(r);
      },

      async end(r) {
        controls?.disable(); setPickable(false);
        hits.forEach((h) => hitStyle(h, ''));
        for (const s of SIDES) dim(s, false);
        const win = r.winner == null ? null : r.winner === ctx.you ? 'you' : 'opp';
        if (!win) {
          for (const s of SIDES) rigs[s].mood('M1-10');
          await Promise.all(SIDES.map((s) => rigs[s].seq([[P1[s].shrug, 350], [P2[s].ready(null), 550]])));
          return;
        }
        const lose = win === 'you' ? 'opp' : 'you';
        rigs[win].mood('M1-11'); rigs[lose].mood('M1-12');
        K.burst(st.tbl.fx, ...rigs[win].headPoint(), C.gold, 12, 200);
        ctx.hud?.pulse(win);
        const Pw = P1[win];
        await Promise.all([
          rigs[win].seq([[Pw.cheer, 250, 'back'], [Pw.hop, 200, 'out'], [Pw.cheer, 200, 'in'], [Pw.hop, 200, 'out'], [Pw.cheer, 200, 'in']]),
          rigs[lose].to(P1[lose].sad, 700),
        ]);
      },

      setControlsEnabled(on) {
        if (!on) { controls?.disable(); setPickable(false); return; }
        controls?.enable(() => true);
        if (keepPhase()) setPickable(true); else markChosen();
      },
      target(name) {
        if (GESTURES.includes(name)) return (!keepPhase() && controls?.button(name)) || null;
        const k = /^keep-([01])$/.exec(name);
        if (k) return hits[Number(k[1])]?.ring || null;
        if (name === 'opp-hands') return rigs?.opp.root || null;
        return null;
      },
      destroy() {
        unbindKeys?.(); life?.stop(); H?.stop(); st?.tbl.stop();
        rigs && Object.values(rigs).forEach((r) => r.destroy()); K.clear(b?.svg);
      },
    };
    return api;
  }

  window.DuelScenes.register('rps_minus_one', {
    create,
    // every pose of both sides, for the pose lab
    poses: () => {
      const out = {};
      for (const side of SIDES) {
        const P = window.DuelRpsDuel.poses2(side);
        Object.assign(out, {
          [`${side} ready`]: P.ready(null), [`${side} readyPair`]: P.ready(['rock', 'paper']), [`${side} up`]: P.up, [`${side} down`]: P.down,
          [`${side} open`]: P.open(['paper', 'scissors']), [`${side} keep0`]: P.keep(0, 'rock', 'paper'), [`${side} keep1`]: P.keep(1, 'scissors', 'rock'),
          [`${side} keep0 strike`]: P.keep(0, 'rock', 'paper', P.strike(0)),
        });
      }
      return out;
    },
    // Phase 'pick': two pairs; phase 'keep': one hand from each player's revealed pair.
    preview: (s, step) => (s.phase === 'keep' && s.pairs ? s.pairs.map((p, i) => p[(step + i) % 2]) : [PAIRS[step % 3], PAIRS[(step + 2) % 3]]),
    // How much of the frame's bottom the match controls may cover (fraction of its height; kit.js contract): the floor
    // under the chairs.
    safeBottom: 0.18,
    shortcuts: [['1 2 3', 'Rock, Paper, Scissors (tap two, the same one twice is allowed)'], ['Backspace', 'Undo your first hand'], ['← →', 'Keep the first / second hand']],
    hud: (state) => window.DuelRpsDuel.hud(state),
    keyRule: 'Show two hands (the same one twice is allowed), see theirs, then keep one. Normal rock paper scissors decides. First to 3.',
  });
})();
