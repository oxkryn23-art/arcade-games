// Tiny sound manager: window.DuelSound.
// Plays public/sfx/<name>.mp3 (or .ogg) when the file exists (the server lists them in /sfx/manifest.json),
// otherwise synthesizes a placeholder with the Web Audio API, so the game works with no files at all.
// Audio starts only after the first user interaction (autoplay policy). Mute, volume and ambient loops
// are saved in localStorage. The ambient loops (ambient-*) play only from a real file: a missing one stays silent (a
// synthesized noise bed droned through a whole match), and every loop is stopped when the match ends or the switch goes off. Haptics (navigator.vibrate) follow the mute switch.
// Background music (public/sfx/music-loop.mp3, a seamless loop) has its own on/off switch and volume (also saved),
// plays as a quiet bed (MUSIC_GAIN), starts after the first interaction, pauses while the tab is hidden and is silenced by the global mute.
// Sources and licenses of every file in public/sfx/: CREDITS.md.
(function () {
  const LS = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const clamp01 = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);
  const prefs = {
    muted: LS.get('duel_muted') === '1',
    volume: clamp01(LS.get('duel_volume') ?? 1, 1),            // both sliders default to 100%; saved settings stay
    ambient: LS.get('duel_ambient') === '1',
    sfx: LS.get('duel_sfx') !== '0',                             // sound effects on / off (the music has its own switch)
    music: LS.get('duel_music') !== '0',
    musicVolume: clamp01(LS.get('duel_music_volume') ?? 1, 1), // the mix itself lives in GAIN / MUSIC_GAIN below
  };
  // The mix: a base gain per sound, picked by the longest matching name prefix, multiplied by the user's slider
  // (files and synthesized placeholders alike go through it, so both stay balanced the same way).
  //   ui-*               0.45  UI clicks, hover, lock, ticks, match found, stingers: about -6 dB under the game
  //   ui-hurry-tick      0.55  the "pick now" ticks of a turn's last 2 s (see hurry): a little over the other UI sounds
  //   rps- penalty- shootout-  0.9  in-game effects: the clearly audible layer
  //   ambient-*          0.9   the optional ambient loops (their own level is set in startAmbient / AMBIENT)
  //   anything else      0.9
  // MUSIC_GAIN 0.07: the background music is a barely noticeable bed (about -23 dB at a 100% music slider).
  const GAIN = { 'ui-': 0.45, 'ui-hurry-tick': 0.55, 'rps-': 0.9, 'penalty-': 0.9, 'shootout-': 0.9, 'ambient-': 0.9 };
  const GAIN_DEFAULT = 0.9, MUSIC_GAIN = 0.07;
  const gainFor = (name) => {
    let best = '', g = GAIN_DEFAULT;
    for (const k in GAIN) if (String(name).startsWith(k) && k.length > best.length) { best = k; g = GAIN[k]; }
    return g;
  };
  const sfxGain = () => (prefs.muted || !prefs.sfx ? 0 : prefs.volume);
  const musicLevel = () => prefs.musicVolume * MUSIC_GAIN;
  let ac = null, master = null, files = {}, manifest = null, manifestReady = null, ambientNode = null, ambientGen = 0, wantedAmbient = null;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn(state()));
  const state = () => ({ ...prefs, ready: !!ac });

  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = sfxGain();
    master.connect(ac.destination);
    // the music first (it starts with this click) and the tiny sound list; the hurry tick only after the music, in idle
    // time; the game sounds when a game starts (preload), any other one when it first plays
    musicSync();
    manifestReady = fetch('/sfx/manifest.json').then((r) => (r.ok ? r.json() : [])).then((list) => { manifest = new Set(list); }).catch(() => { manifest = new Set(); });
    // the hurry tick is scheduled ahead on the audio clock, so its buffer must be decoded before the first turn ends
    manifestReady.then(() => afterMusic(() => loadFile(HURRY.name).then((b) => { hurryBuf = b; })));
    if (wantedAmbient) startAmbient(wantedAmbient);
    notify();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  // ---------- files ----------
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
  // runs fn once the music has loaded (or failed, or is off), so nothing competes with it for the first seconds
  let musicLoaded = null;
  const afterMusic = (fn) => (musicLoaded || Promise.resolve()).then(() => idle(fn));
  // The sounds of one game (all <game>-* files and the ui-* ones), decoded in idle time when a game, its
  // tutorial or its rules preview starts, so its first sounds play at once (nothing of it on the home page).
  function preload(game) {
    if (!ac || !manifestReady) return;
    manifestReady.then(() => {
      const names = [...manifest].map((f) => f.replace(/\.(mp3|ogg|opus)$/, '')).filter((n) => n.startsWith(`${game}-`) || (game === 'rps_minus_one' && n.startsWith('rps-')) || n.startsWith('ui-'));   // Minus One plays the rps-* sounds
      const next = () => idle(() => { const n = names.shift(); if (n) loadFile(n).then(next); });
      next();
    });
  }
  // One promise per name (the decoded buffer, or null for no file / a failed load), so parallel calls share one load.
  function loadFile(name) {
    if (files[name] !== undefined) return files[name];
    const entry = manifest && [...manifest].find((f) => f.replace(/\.(mp3|ogg)$/, '') === name);
    if (!entry) return (files[name] = Promise.resolve(null));
    return (files[name] = fetch(`/sfx/${entry}`).then((r) => r.arrayBuffer()).then((buf) => ac.decodeAudioData(buf)).catch(() => null));
  }

  // ---------- synth placeholders ----------
  let noiseBuf = null;
  function noiseBuffer() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function env(gain, t, dur, vol, attack = 0.005) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(out, t, { f = 440, to = null, dur = 0.1, type = 'sine', vol = 0.3, attack = 0.005, vibrato = 0 }) {
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vibrato) {
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = vibrato; lg.gain.value = f * 0.03;
      lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + dur);
    }
    env(gn, t, dur, vol, attack);
    o.connect(gn).connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(out, t, { dur = 0.2, type = 'bandpass', f = 1000, to = null, q = 1, vol = 0.3, attack = 0.005 }) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), gn = ac.createGain();
    s.buffer = noiseBuffer(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(gn, t, dur, vol, attack);
    s.connect(fl).connect(gn).connect(out);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  const notes = (out, t, list, { step = 0.08, dur = 0.12, type = 'triangle', vol = 0.25 } = {}) =>
    list.forEach((f, i) => tone(out, t + i * step, { f, dur, type, vol }));

  const SYNTH = {
    'ui-click': (o, t) => tone(o, t, { f: 1300, to: 900, dur: 0.04, type: 'square', vol: 0.08 }),
    'ui-hover': (o, t) => tone(o, t, { f: 1700, dur: 0.03, vol: 0.03 }),
    'ui-lock': (o, t) => { tone(o, t, { f: 520, to: 780, dur: 0.08, type: 'triangle', vol: 0.25 }); tone(o, t + 0.06, { f: 1040, dur: 0.07, type: 'triangle', vol: 0.18 }); },
    // the 3-2-1 before a match: a soft, round wood-block tick
    'ui-countdown-tick': (o, t) => { tone(o, t, { f: 440, to: 420, dur: 0.1, vol: 0.12, attack: 0.003 }); tone(o, t, { f: 1320, dur: 0.03, vol: 0.02, attack: 0.002 }); },
    // the last 2 s of a turn, "pick now": a crisp, short, higher wood-block tick (rate = the rising pitch, see hurry)
    'ui-hurry-tick': (o, t, rate = 1) => { tone(o, t, { f: 980 * rate, to: 900 * rate, dur: 0.07, vol: 0.2, attack: 0.002 }); tone(o, t, { f: 2900 * rate, dur: 0.02, vol: 0.04, attack: 0.001 }); },
    // entering a match: a soft whoosh swelling into a light two-note chime
    'ui-match-found': (o, t) => { noise(o, t, { dur: 0.16, f: 400, to: 1600, q: 0.8, vol: 0.1, attack: 0.06 }); tone(o, t + 0.13, { f: 1568, dur: 0.12, vol: 0.06 }); tone(o, t + 0.2, { f: 2093, dur: 0.3, vol: 0.07 }); },
    // match won: a short rising arpeggio landing on a bright chord (under 1 s)
    'ui-win-match': (o, t) => { notes(o, t, [392, 494, 587], { step: 0.08, dur: 0.14, vol: 0.2 }); notes(o, t + 0.24, [784, 988], { step: 0, dur: 0.55, vol: 0.14 }); },
    // match lost: a neutral "round over", two soft descending triangle notes (D5, A4 with a quiet sine an octave under), 0.55 s
    'ui-lose-match': (o, t) => {
      tone(o, t, { f: 587, dur: 0.2, type: 'triangle', vol: 0.45, attack: 0.008 });
      tone(o, t + 0.15, { f: 440, dur: 0.4, type: 'triangle', vol: 0.45, attack: 0.01 });
      tone(o, t + 0.15, { f: 220, dur: 0.36, vol: 0.16, attack: 0.01 });
    },
    'ui-draw-match': (o, t) => notes(o, t, [523, 494, 523], { step: 0.15, dur: 0.2, vol: 0.2 }),
    'penalty-kick': (o, t) => { tone(o, t, { f: 160, to: 50, dur: 0.14, vol: 0.7 }); noise(o, t, { dur: 0.05, type: 'lowpass', f: 900, vol: 0.3 }); },
    'penalty-goal-net': (o, t) => noise(o, t, { dur: 0.4, f: 1100, to: 260, q: 0.8, vol: 0.45 }),
    'penalty-save': (o, t) => { tone(o, t, { f: 240, to: 110, dur: 0.1, vol: 0.5 }); noise(o, t, { dur: 0.08, type: 'highpass', f: 2200, vol: 0.4 }); },
    'penalty-crowd-cheer': (o, t) => noise(o, t, { dur: 1.7, f: 900, to: 1300, q: 0.6, vol: 0.28, attack: 0.25 }),
    'penalty-crowd-groan': (o, t) => { noise(o, t, { dur: 1.2, type: 'lowpass', f: 600, to: 200, vol: 0.25, attack: 0.15 }); tone(o, t, { f: 170, to: 110, dur: 1, type: 'sawtooth', vol: 0.05, attack: 0.15 }); },
    // the role banner sliding over the Penalty scene ("YOU KICK" / "YOU SAVE"): a short airy whoosh
    'penalty-role-whoosh': (o, t) => { noise(o, t, { dur: 0.22, f: 500, to: 3200, q: 1.1, vol: 0.26 }); tone(o, t + 0.12, { f: 660, to: 990, dur: 0.1, type: 'triangle', vol: 0.08 }); },
    'penalty-whistle': (o, t) => tone(o, t, { f: 2600, dur: 0.45, vol: 0.18, vibrato: 38 }),
    'shootout-reload': (o, t) => { noise(o, t, { dur: 0.025, type: 'highpass', f: 3000, vol: 0.4 }); noise(o, t + 0.09, { dur: 0.03, type: 'highpass', f: 2200, vol: 0.4 }); tone(o, t + 0.09, { f: 900, dur: 0.03, type: 'square', vol: 0.1 }); },
    'shootout-cylinder-spin': (o, t) => { for (let i = 0; i < 7; i++) noise(o, t + i * (0.07 - i * 0.006), { dur: 0.02, type: 'highpass', f: 2600, vol: 0.3 }); },
    'shootout-block': (o, t) => { tone(o, t, { f: 180, to: 120, dur: 0.12, type: 'square', vol: 0.18 }); noise(o, t, { dur: 0.1, f: 400, vol: 0.4 }); },
    'shootout-shot': (o, t) => { noise(o, t, { dur: 0.28, type: 'lowpass', f: 3500, to: 300, vol: 0.85, attack: 0.002 }); tone(o, t, { f: 130, to: 40, dur: 0.16, vol: 0.5 }); },
    'shootout-blast': (o, t) => { noise(o, t, { dur: 0.7, type: 'lowpass', f: 2400, to: 90, vol: 1, attack: 0.002 }); tone(o, t, { f: 90, to: 30, dur: 0.45, vol: 0.7 }); },
    'shootout-ricochet': (o, t) => { tone(o, t, { f: 2400, to: 800, dur: 0.38, vol: 0.2 }); noise(o, t, { dur: 0.04, type: 'highpass', f: 3000, vol: 0.3 }); },
    'shootout-bullet-clash': (o, t) => { tone(o, t, { f: 3100, dur: 0.08, type: 'square', vol: 0.1 }); tone(o, t + 0.02, { f: 4300, dur: 0.25, type: 'triangle', vol: 0.15 }); },
    'shootout-hit-fall': (o, t) => { tone(o, t, { f: 220, to: 60, dur: 0.3, vol: 0.4 }); noise(o, t + 0.18, { dur: 0.3, type: 'lowpass', f: 450, vol: 0.5 }); },
    'shootout-wind': (o, t) => noise(o, t, { dur: 1.6, f: 450, to: 950, q: 2, vol: 0.12, attack: 0.4 }),
    // the start of a duel (the file is church bells striking noon): three deep tolls 0.65 s apart, inharmonic
    // partials, each ringing on under the next until all fade out together at 2.3 s
    'shootout-start-bell': (o, t) => [0, 0.65, 1.3].forEach((at) => {
      const s = t + at, ring = 2.3 - at;
      tone(o, s, { f: 181, dur: ring, vol: 0.06, attack: 0.006 });
      tone(o, s, { f: 362, dur: ring, vol: 0.2, attack: 0.004 });
      tone(o, s, { f: 466, dur: ring * 0.9, vol: 0.125, attack: 0.004 });
      tone(o, s, { f: 793, dur: ring * 0.7, vol: 0.077, attack: 0.003 });
      tone(o, s, { f: 1612, dur: ring * 0.45, vol: 0.042, attack: 0.002 });
      tone(o, s, { f: 2083, dur: ring * 0.35, vol: 0.03, attack: 0.002 });
      noise(o, s, { dur: 0.035, type: 'highpass', f: 2200, vol: 0.09, attack: 0.001 });
    }),
    // the start of an RPS / Minus One round (the file is a reception desk bell): a bright "ding" ringing out
    'rps-start-ding': (o, t) => {
      tone(o, t, { f: 1111, dur: 0.85, vol: 0.16, attack: 0.002 });
      tone(o, t, { f: 2853, dur: 0.5, vol: 0.07, attack: 0.002 });
      tone(o, t, { f: 5236, dur: 0.2, vol: 0.03, attack: 0.001 });
    },
    'rps-whoosh': (o, t) => noise(o, t, { dur: 0.17, f: 600, to: 2600, q: 1.4, vol: 0.32 }),
    // rock, scissors and paper wins are balanced to the same loudness; the rock is a punchy crunch, not a sub boom
    'rps-rock-smash': (o, t) => { tone(o, t, { f: 240, to: 90, dur: 0.16, vol: 0.35 }); noise(o, t, { dur: 0.2, type: 'lowpass', f: 2600, to: 800, vol: 0.32 }); },
    'rps-scissors-cut': (o, t) => { noise(o, t, { dur: 0.07, type: 'highpass', f: 3600, vol: 0.45 }); noise(o, t + 0.13, { dur: 0.08, type: 'highpass', f: 3800, vol: 0.38 }); },
    'rps-paper-wrap': (o, t) => noise(o, t, { dur: 0.32, f: 2100, to: 1400, q: 3, vol: 0.2 }),
    'rps-draw-bounce': (o, t) => { tone(o, t, { f: 300, to: 620, dur: 0.1, vol: 0.25 }); tone(o, t + 0.1, { f: 620, to: 300, dur: 0.12, vol: 0.2 }); },
    'rps-hand-yank': (o, t) => noise(o, t, { dur: 0.2, f: 2600, to: 500, q: 1.2, vol: 0.3 }),
  };

  async function play(name, { volume = 1, rate = 1 } = {}) {
    if (!ac || prefs.muted || !prefs.sfx || ac.state !== 'running') return;
    const out = ac.createGain();
    out.gain.value = volume * gainFor(name);
    out.connect(master);
    const buf = manifest ? await loadFile(name) : null;
    if (buf) {
      const s = ac.createBufferSource();
      s.buffer = buf; s.playbackRate.value = rate;
      s.connect(out); s.start();
      return;
    }
    (SYNTH[name] || SYNTH['ui-click'])(out, ac.currentTime + 0.005);
  }

  function haptic(pattern) {
    if (prefs.muted || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch {}
  }

  // ---------- the hurry ticks: "pick now" in the last 2 s of a turn ----------
  // hurry(at, still): at = the turn's deadline as a Date.now() time (app.js: the server's deadline moved by the clock
  // offset), null stops. Eight ticks, 4 a second, at 2.0, 1.75 ... 0.25 s before the deadline, each a little higher and
  // louder (the last one about 4 semitones up). Each tick is put on the audio clock from the deadline itself by a short
  // look-ahead loop, so a throttled timer or a busy phone never drifts or bunches them; a tick that is already late is
  // skipped, never played late. still() (optional) is asked on every loop (app.js: the same turn, your move not locked,
  // the match on screen); false stops the ticks. All ticks go through one gain node that is cut at once on a stop.
  // Silent while muted, before the first interaction and in a hidden tab.
  const HURRY = { name: 'ui-hurry-tick', from: 2000, every: 250, ahead: 120, late: 40, loop: 40, rise: 4, soft: 0.7 };
  let hurryRun = null, hurryBuf;
  function hurry(at, still) {
    stopHurry();
    if (!at) return;
    const count = Math.round(HURRY.from / HURRY.every);
    const run = { at, still, next: count, bus: null, timer: 0 };
    hurryRun = run;
    const loop = () => {
      if (hurryRun !== run) return;
      if (run.still && !run.still()) { stopHurry(); return; }
      const left = run.at - Date.now();
      if (left < -300) { stopHurry(); return; }   // the turn is over (the reveal stops it anyway)
      const live = ac && ac.state === 'running' && !prefs.muted && prefs.sfx && !document.hidden;
      // tick k sounds when k * every ms are left; put on the clock the ones due within the look-ahead
      while (run.next > 0 && left - run.next * HURRY.every < HURRY.ahead) {
        const k = run.next--, due = left - k * HURRY.every;
        if (live && due >= -HURRY.late) hurryTick(run, (count - k) / (count - 1), ac.currentTime + Math.max(0, due) / 1000);
      }
      run.timer = setTimeout(loop, HURRY.loop);
    };
    loop();
  }
  function hurryTick(run, p, t) {
    if (!run.bus) { run.bus = ac.createGain(); run.bus.connect(master); }
    const rate = 2 ** ((p * HURRY.rise) / 12);
    const out = ac.createGain();
    out.gain.value = (HURRY.soft + (1 - HURRY.soft) * p) * gainFor(HURRY.name);
    out.connect(run.bus);
    if (hurryBuf) {
      const s = ac.createBufferSource();
      s.buffer = hurryBuf; s.playbackRate.value = rate;
      s.connect(out); s.start(t);
    } else SYNTH[HURRY.name](out, t, rate);
  }
  function stopHurry() {
    const run = hurryRun;
    hurryRun = null;
    if (!run) return;
    clearTimeout(run.timer);
    if (run.bus) {
      const t = ac.currentTime;
      run.bus.gain.cancelScheduledValues(t);
      run.bus.gain.setTargetAtTime(0, t, 0.004);   // cut within ~15 ms, without a click
      setTimeout(() => { try { run.bus.disconnect(); } catch {} }, 150);
    }
  }

  // ---------- ambient loops (quiet, own toggle, off by default) ----------
  // Only from a file (public/sfx/ambient-*.mp3): with no file there is no ambient, nothing synthesized (like the music).
  // ambientGen numbers every start / stop, so a start still loading when the match ends, the switch goes off or
  // another start comes in gives up instead of starting a loop nobody holds (that loop could never be stopped).
  async function startAmbient(name) {
    stopAmbient();
    if (!ac || !prefs.ambient || !name) return;
    const gen = ++ambientGen;
    if (!manifest) await manifestReady;
    const buf = await loadFile(name);
    if (gen !== ambientGen || !buf || !prefs.ambient) return;
    const gain = ac.createGain(), t = ac.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25 * gainFor(name), t + 1.5);
    gain.connect(master);
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true; src.connect(gain); src.start(t);
    ambientNode = { src, gain };
  }
  function stopAmbient() {
    ambientGen++; // cancels a start that is still loading
    if (!ambientNode) return;
    const { src, gain } = ambientNode, t = ac.currentTime;
    ambientNode = null;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.5);
      src.stop(t + 0.6);
      src.onended = () => gain.disconnect();
    } catch {}
  }
  function ambient(name) { wantedAmbient = name; if (ac) (name ? startAmbient(name) : stopAmbient()); }

  // ---------- background music (own gain straight to the output, so the SFX volume never changes it) ----------
  // Ogg Opus (64 kbps, tools/music-opus.js: sample exact, so it loops as seamlessly) where the browser decodes it, the
  // MP3 (128 kbps) everywhere else (older Safari)
  const OPUS_OK = (() => { try { return !!new Audio().canPlayType('audio/ogg; codecs="opus"'); } catch { return false; } })();
  const MUSIC_URL = OPUS_OK ? '/sfx/music-loop.opus' : '/sfx/music-loop.mp3';
  let musicBuf = null, musicLoading = false, musicSrc = null, musicGain = null, musicStartAt = 0, musicOffset = 0;
  const musicWanted = () => !!ac && prefs.music && !prefs.muted && prefs.musicVolume > 0 && !document.hidden;
  async function musicSync() {
    if (!ac) return;
    if (!musicWanted()) { stopMusic(); return; }
    if (!musicGain) { musicGain = ac.createGain(); musicGain.gain.value = 0; musicGain.connect(ac.destination); }
    if (musicSrc) { // already playing: just follow the volume
      musicGain.gain.cancelScheduledValues(ac.currentTime);
      musicGain.gain.setTargetAtTime(musicLevel(), ac.currentTime, 0.05);
      return;
    }
    if (musicBuf === false || musicLoading) return; // missing file: no music, nothing synthesized
    if (!musicBuf) {
      musicLoading = true;
      let done;
      musicLoaded = new Promise((res) => { done = res; });
      try {
        const r = await fetch(MUSIC_URL);
        if (!r.ok) throw new Error('no music');
        musicBuf = await ac.decodeAudioData(await r.arrayBuffer());
      } catch { musicBuf = false; }
      musicLoading = false;
      done();
      if (musicBuf) musicSync();
      return;
    }
    const src = ac.createBufferSource();
    src.buffer = musicBuf; src.loop = true; src.connect(musicGain);
    const t = ac.currentTime, at = musicOffset % musicBuf.duration;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(0, t);
    musicGain.gain.linearRampToValueAtTime(musicLevel(), t + 1.2);
    src.start(t, at);
    musicSrc = src; musicStartAt = t - at;
  }
  function stopMusic() {
    if (!musicSrc) return;
    const src = musicSrc, t = ac.currentTime;
    musicSrc = null;
    musicOffset = (t - musicStartAt) % musicBuf.duration; // resume from here later (tab shown again, unmuted…)
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setTargetAtTime(0, t, 0.06);
    try { src.stop(t + 0.3); } catch {}
  }
  document.addEventListener('visibilitychange', () => musicSync());
  const music = {
    enabled: () => prefs.music,
    setEnabled(on) { prefs.music = !!on; LS.set('duel_music', on ? '1' : '0'); musicSync(); notify(); },
    volume: () => prefs.musicVolume,
    setVolume(v) { prefs.musicVolume = clamp01(v, prefs.musicVolume); LS.set('duel_music_volume', String(prefs.musicVolume)); musicSync(); notify(); },
  };

  // The music rows of the sound settings (#sndMusic, #sndMusicVol in Settings); the rest is wired in app.js.
  function bindMusicUi() {
    const on = document.getElementById('sndMusic'), vol = document.getElementById('sndMusicVol');
    if (!on || !vol) return;
    const sync = () => { on.checked = prefs.music; vol.value = String(prefs.musicVolume); };
    sync(); listeners.add(sync);
    on.addEventListener('change', () => { if (on.checked && prefs.muted) window.DuelSound.setMuted(false); music.setEnabled(on.checked); });
    vol.addEventListener('input', () => {
      music.setVolume(vol.value);
      if (prefs.musicVolume > 0 && !prefs.music) music.setEnabled(true);
      if (prefs.muted) window.DuelSound.setMuted(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindMusicUi); else bindMusicUi();

  window.DuelSound = {
    names: Object.keys(SYNTH),
    play, haptic, ambient, unlock, hurry, preload,
    state,
    music,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setMuted(m) {
      prefs.muted = !!m; LS.set('duel_muted', m ? '1' : '0');
      if (master) master.gain.value = sfxGain();
      musicSync();
      notify();
    },
    setVolume(v) {
      prefs.volume = Math.max(0, Math.min(1, Number(v))); LS.set('duel_volume', String(prefs.volume));
      if (master) master.gain.value = sfxGain();
      notify();
    },
    setEffects(on) {
      prefs.sfx = !!on; LS.set('duel_sfx', on ? '1' : '0');
      if (master) master.gain.value = sfxGain();
      notify();
    },
    setAmbient(on) {
      prefs.ambient = !!on; LS.set('duel_ambient', on ? '1' : '0');
      if (on && wantedAmbient) startAmbient(wantedAmbient); else stopAmbient();
      notify();
    },
  };
})();
