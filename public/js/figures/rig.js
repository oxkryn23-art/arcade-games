// The scenes' character API (window.DuelFigures) on top of the original game's mascot rig (public/js/mascots/rig.js,
// window.VersoMascots: the same rig, poses, arms, sleeves, hands, shoes, outfits and animation, with the human species
// of mascots/human.js). Load after mascots/*.js.
//
// A character's look (figures/avatar.js: skin tone, hairstyle, hair color, shirt) is its loadout in the rig
// (mascots/cosmetics.js valid(look)): side 'you' / 'opp' follow the store, create({ look }) pins one.
//   create({ side, pose, idle, flip, look, mood, x, y, scale }) -> a rig (to, seq, set, mood, face, hold, prop, place,
//     setFlip, world, handPoint, handMid, handRadius, headPoint, destroy; bigHands / handSprites for the RPS hands,
//     setLook / syncLook)
//   avatarSvg(look | 'you' | 'opp', side, { face, body, pose, flip, mood }) -> SVG markup (a head disc, or the figure)
//   stage(host, who, { pose, mood, idle, flip }) -> { svg, rig, set(who), destroy() }: a live idle figure
//   paintAvatars(root) fills [data-figure="you|opp"] elements (data-look pins a look, data-body="1" = the figure)
//   handIcon(gesture) / handSvg(gesture): a hand for the controls, in my skin tone
(function () {
  const M = window.VersoMascots;
  const COS = () => window.VersoCosmetics;
  const SP = 'human';
  const loadoutOf = (look) => (COS()?.valid ? COS().valid(look) : { ...look });

  function create({ look = null, side = 'you', ...opts } = {}) {
    return M.create({ species: SP, side, ...opts, loadout: look ? loadoutOf(look) : null });
  }
  // the scenes' extras on every rig
  const probe = create({ idle: false });
  const proto = Object.getPrototypeOf(probe);
  probe.destroy();
  // Big RPS hands: fn(k, shape, rig) truthy for an arm that plays its gesture -> the hand sprites of the gesture
  // (hand-human-<gesture>-<back|palm>), drawn at scale (character units per sprite px). face(k) -> [side, mirror]:
  // which side of the hand shows (the RPS scene's FACE); without it the near arm shows the back, the far arm the palm.
  proto.bigHands = function (fn, { scale = 0.36, face = null } = {}) {
    return this.handSprites(fn ? (k, shape, rig) => {
      const got = fn(k, shape, rig);
      if (!got) return null;
      if (typeof got === 'object') return got;
      const [side, mirror = false] = face ? face(k) : [k === 2 ? 'palm' : 'back'];
      return { name: `hand-${SP}-${typeof got === 'string' ? got : shape}-${side}`, mirror };
    } : null, { scale });
  };
  proto.setLook = function (l) { return this.setLoadout(l ? loadoutOf(l) : null); };
  proto.syncLook = function () { this.syncLoadout(); };

  // the drawn hand point of arm k for a pose (the rig draws the hand at a1 / a2; seated poses measure from the seat)
  const handOf = (pose, k) => { const p = M.resolve(pose); const s = p.sit ? M.skin(SP).skel.bottom * p.sit : 0; return [p[`a${k}`][0], p[`a${k}`][1] - s]; };
  const who = (w, side) => (w && typeof w === 'object' ? { species: SP, ...loadoutOf(w) } : w === 'opp' || side === 'opp' ? 'opp' : 'you');

  function avatarSvg(w, side = 'you', { face = null, body = false, pose = null, flip = false, mood = null } = {}) {
    const f = mood ? window.DuelExpressions?.pick?.(mood, null) || face : face;
    return M.avatarSvg(who(w, side), side, { face: f || 'smile', body, pose, flip })
      .replace('mascot-avatar-svg', 'figure-avatar-svg mascot-avatar-svg').replace('mascot-figure-svg', 'figure-figure-svg mascot-figure-svg');
  }
  function stage(host, w = 'you', { pose = 'idle', mood = 'idle', idle = true, flip = false } = {}) {
    const st = M.stage(host, w === 'you' || w === 'opp' ? w : who(w), { pose, mood, idle, flip });
    st.svg.classList.add('figure-stage');
    const set = st.set.bind(st);
    st.set = (x) => set(x === 'you' || x === 'opp' ? x : who(x));
    return st;
  }
  const lookFor = (side) => (window.DuelAvatar?.forSide ? window.DuelAvatar.forSide(side) : {});
  const handSvg = (gesture) => M.handSvg(gesture, SP).replace('mascot-hand', 'figure-hand mascot-hand');
  const handIcon = (gesture) => `<span class="figure-hand-wrap" data-figure-hand="${gesture}">${handSvg(gesture)}</span>`;
  function paintAvatars(rootEl = document) {
    rootEl.querySelectorAll('[data-figure-hand]').forEach((node) => {
      const key = lookFor('you').skin;
      if (node.dataset.painted === key) return;
      node.dataset.painted = key;
      node.innerHTML = handSvg(node.dataset.figureHand);
    });
    rootEl.querySelectorAll('[data-figure]').forEach((node) => {
      let look = null;
      if (node.dataset.look) { try { look = JSON.parse(node.dataset.look); } catch { look = null; } }
      const side = node.dataset.figure === 'opp' ? 'opp' : 'you';
      const l = look || lookFor(side), body = node.dataset.body === '1';
      const key = JSON.stringify([l, body]);
      if (node.dataset.painted === key) return;
      node.dataset.painted = key;
      node.innerHTML = avatarSvg(l, side, { body });
    });
  }
  window.DuelAvatar?.onChange?.(() => paintAvatars());

  window.DuelFigures = {
    skin: () => M.skin(SP), ids: () => [SP], create, POSES: M.POSES, REST: M.REST, resolve: M.resolve, EASE: M.EASE,
    avatarSvg, stage, paintAvatars, handIcon, handSvg,
    noodle: M.noodle, noodleTo: M.noodleTo, HANDS: M.skin(SP).hands, OUT: M.OUT,
    FACES: M.skin(SP).faces, HAIR: window.DuelHuman?.HAIR || {},
    blend: M.blend, arcOf: M.arcOf, bowedAt: M.bowedAt, bez: M.bez,
    shoulderOf: (_sp, pose, k) => M.shoulderOf(SP, pose, k), handOf,
    liveRigs: M.liveRigs,
  };
})();
