// Rock Paper Scissors scene: you and the opponent sit on two chairs facing each other across a small table in a calm
// room (staging, gesture hands and ambient life in rps-duel.js). Reveal: three pumps with the READY fist and a whoosh,
// a snap into the gestures with a white flash, then the outcome (rock shards + a small shake, scissors slashes, a
// paper sweep: the code-drawn effects in art-rps.js). The loser recoils, the winner's side lights up in the top
// scoreboard and "+1" floats up; a draw sparks where the hands meet and both bounce back. Faces: moments RPS-1..9
// (public/js/figures/expressions.js). You sit on the left.
// Coach-mark targets: 'rock' | 'paper' | 'scissors' (buttons), 'opp' (the opponent); 'score' and 'scout' are in the
// top scoreboard (scenes/hud.js).
(function () {
  const K = window.DuelKit;
  const { C } = K;
  const D = () => window.DuelRpsDuel;
  const GESTURES = ['rock', 'paper', 'scissors'];
  const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
  const SIDES = ['you', 'opp'];

  function create() {
    let b, ctx, st, rigs, P, H, life, controls, unbindKeys, myPick = null, preview, arm = { you: 2, opp: 2 };
    const handMid = (side) => H.mid(side, arm[side]);
    const radius = (side) => H.radius(side, arm[side]);

    function resetPoses(moment) {
      for (const side of SIDES) { rigs[side].set(P[side].ready); rigs[side].idle(true).mood(moment); H.dim(side, false); }
      preview?.remove(); preview = null;
    }

    const api = {
      mount(container, c) {
        ctx = c;
        b = K.base(container, ctx, { bg: 'rps-table' });
        st = D().stage(b, ctx); rigs = st.rigs; arm = st.S.arm;
        P = { you: D().poses('you'), opp: D().poses('opp') };
        H = D().hands(rigs);
        life = D().ambient(b, ctx);
        K.youStart(b, rigs.you, ctx);   // the YOU arrow over your character at the start (an overlay, never awaited)
        controls = K.buttons(ctx, GESTURES.map((v, i) => ({ v, label: LABEL[v], icon: D().icon(v), key: String(i + 1) })), { cls: 'rps' });
        if (controls) {
          controls.onPick = (v) => { myPick = v; ctx.send(v); };
          controls.disable();
          unbindKeys = K.keys({ 1: 'rock', 2: 'paper', 3: 'scissors' }, (v) => controls.press(v));
        }
      },

      setRound(state) {
        resetPoses(state.round ? 'RPS-2' : 'RPS-1');
        myPick = null;
        ctx.hud?.set(state);
        if (!ctx.mini) ctx.sound?.play('rps-start-ding', { volume: 0.75 });   // the round starts (as Penalty's whistle)
        controls?.enable(() => true);
      },

      setLocked(who) {
        if (who === 'opp') { /* silent: the scoreboard shows it (a mid-turn tock sounded like a clock) */ }
        else {
          controls?.disable();
          ctx.sound?.play('ui-lock');
          // Only on your own screen: a small reminder of your pick next to your head.
          if (myPick && !ctx.mini) {
            preview = document.createElement('div');
            preview.className = 'scene-pick rps-pick';
            preview.innerHTML = D().icon(myPick);
            const [x, y] = rigs.you.headPoint();
            b.overlay.append(K.place(preview, b, x - 150, y - 60));
          }
        }
        // No pose change on a lock (the same in every game): the character stays as it is; the scoreboard check mark
        // (hud.js) and, for your own lock, ui-lock are the only signs. The face stays the round's normal mood.
        rigs[who].mood('RPS-3');
      },

      async reveal(r) {
        controls?.disable();
        preview?.remove(); preview = null;
        const [pumpMs, snapMs, holdMs, hitMs] = K.fit([760, 140, 180, 920], (ctx.timing?.reveal || 2200) - 100);
        const mine = r.moves[ctx.you], theirs = r.moves[1 - ctx.you];
        const move = { you: mine, opp: theirs };
        const fx = st.tbl.fx;
        for (const s of SIDES) rigs[s].mood('RPS-4');
        await D().pumps(ctx, SIDES.map((s) => [rigs[s], P[s].pumpUp, P[s].pumpDown]), 3, pumpMs);
        // Snap into the gestures with a short white flash (a missed move stays a dimmed READY fist).
        for (const s of SIDES) {
          rigs[s].to(P[s].throw(move[s]), snapMs, 'snap');
          if (!move[s]) H.dim(s, true);
        }
        await K.sleep(snapMs * 0.5);
        if (!ctx.mini) for (const s of SIDES) if (move[s]) K.flash(fx, ...handMid(s), radius(s) * 1.3, snapMs + 80);
        await K.sleep(snapMs * 0.5 + holdMs);

        const w = r.roundWinner;
        const hold = Math.max(200, hitMs - 380);
        if (w == null) {
          if (!mine && !theirs) {
            for (const s of SIDES) { rigs[s].mood('RPS-6'); rigs[s].to(P[s].shrug, hitMs * 0.5); }
            await K.punch(b, 'BOTH MISSED', { x: st.S.punch[0], y: st.S.punch[1], hold });
          } else {
            // Draw: the hands meet, sparks fly between them, both bounce back.
            ctx.sound?.play('rps-draw-bounce');
            const bounce = (s) => rigs[s].seq([[P[s].meet(move[s]), hitMs * 0.25, 'out'], [P[s].recoil(move[s]), hitMs * 0.3, 'out'], [P[s].throw(move[s]), hitMs * 0.35, 'inOut']]);
            setTimeout(() => {
              const [a, c] = [handMid('you'), handMid('opp')];
              K.fx(fx, 'clash', (a[0] + c[0]) / 2, (a[1] + c[1]) / 2, { size: radius('you') * 3.4, color: C.paper, ms: hitMs * 0.6 });
              for (const s of SIDES) rigs[s].mood('RPS-7');
            }, hitMs * 0.22);
            await Promise.all([bounce('you'), bounce('opp'), K.punch(b, 'DRAW', { x: st.S.punch[0], y: st.S.punch[1], hold })]);
          }
        } else {
          const winSide = w === ctx.you ? 'you' : 'opp', loseSide = winSide === 'you' ? 'opp' : 'you';
          const winMove = r.moves[w], loseMove = r.moves[1 - w];
          const [text, sfx] = loseMove ? D().WIN[winMove] : ['MISSED', 'rps-whoosh'];
          const contact = hitMs * 0.3, color = winSide === 'you' ? C.you : C.opp;
          // The winner strikes forward and settles; the loser recoils.
          const strike = rigs[winSide].seq([[P[winSide].strike(winMove), contact, 'snap'], [P[winSide].throw(winMove), hitMs - contact, 'inOut']]);
          const recoil = (async () => {
            await K.sleep(contact);
            rigs[loseSide].mood('RPS-6');
            await rigs[loseSide].to(P[loseSide].recoil(loseMove), hitMs * 0.6, 'out');
          })();
          setTimeout(() => {
            ctx.sound?.play(sfx); ctx.sound?.haptic?.(40);
            if (loseMove) {
              // the hands meet sideways: the effect turns toward the loser
              const rot = winMove === 'rock' ? 0 : winSide === 'you' ? 0 : 180;
              K.fx(fx, winMove, ...handMid(loseSide), { size: radius(loseSide) * 3.2, rot, color, ms: hitMs * 0.65 });
              if (winMove === 'rock') K.shake(b.camera, 6);
            }
            rigs[winSide].mood('RPS-5');
            ctx.hud?.set(r.state, { scoreOnly: true }); ctx.hud?.pulse(winSide);
            if (!ctx.mini) K.floatText(b, '+1', ...st.S.plus[winSide], winSide);
          }, contact);
          await Promise.all([strike, recoil, K.punch(b, text, { x: st.S.punch[0], y: st.S.punch[1], who: winSide, hold })]);
        }
        ctx.hud?.set(r.state);
      },

      async end(r) {
        for (const s of SIDES) H.dim(s, false);
        const win = r.winner == null ? null : r.winner === ctx.you ? 'you' : 'opp';
        if (!win) {
          for (const s of SIDES) rigs[s].mood('RPS-7');
          await Promise.all(SIDES.map((s) => rigs[s].seq([[P[s].shrug, 350], [P[s].ready, 550]])));
          return;
        }
        const lose = win === 'you' ? 'opp' : 'you';
        rigs[win].mood('RPS-8'); rigs[lose].mood('RPS-9');
        K.burst(st.tbl.fx, ...rigs[win].headPoint(), C.gold, 12, 200);
        ctx.hud?.pulse(win);
        const Pw = P[win];
        await Promise.all([
          rigs[win].seq([[Pw.cheer, 250, 'back'], [Pw.hop, 200, 'out'], [Pw.cheer, 200, 'in'], [Pw.hop, 200, 'out'], [Pw.cheer, 200, 'in']]),
          rigs[lose].to(P[lose].sad, 700),
        ]);
      },

      setControlsEnabled(on) { if (on) controls?.enable(() => true); else controls?.disable(); },
      target(name) {
        if (GESTURES.includes(name)) return controls?.button(name) || null;
        if (name === 'opp') return rigs?.opp.root || null;
        return null;
      },
      destroy() {
        unbindKeys?.(); life?.stop(); H?.stop(); st?.tbl.stop();
        rigs && Object.values(rigs).forEach((r) => r.destroy()); K.clear(b?.svg);
      },
    };
    return api;
  }

  // Every pose of both sides as plain pose objects, for the pose lab.
  function labPoses() {
    const out = {};
    for (const side of SIDES) {
      for (const [k, v] of Object.entries(window.DuelRpsDuel.poses(side))) {
        if (typeof v === 'function') for (const gst of GESTURES) out[`${side} ${k} ${gst}`] = v(gst);
        else out[`${side} ${k}`] = v;
      }
    }
    return out;
  }

  window.DuelScenes.register('rps', {
    create,
    poses: labPoses,
    preview: (s, step) => [['rock', 'scissors'], ['paper', 'paper'], ['scissors', 'paper'], ['paper', 'rock']][step % 4],
    // How much of the frame's bottom the match controls may cover (fraction of its height; kit.js contract): the floor
    // under the chairs.
    safeBottom: 0.18,
    shortcuts: [['1', 'Rock'], ['2', 'Paper'], ['3', 'Scissors']],
    hud: (state) => window.DuelRpsDuel.hud(state),
    keyRule: 'Rock beats scissors, scissors beats paper, paper beats rock. First to 3 round wins.',
  });
})();
