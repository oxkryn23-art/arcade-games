// The tutorial wording lives in ONE place: docs/TUTORIAL-TEXT.md (the file to edit) -> public/js/tutorial-text.js
// (what the site loads, window.DuelTutorialText) -> read by public/js/tutorial.js through T(id, vars).
//   npm run tutorial-text                 the .md -> the .js (after editing the .md)
//   npm run tutorial-text -- --export     the .js -> the .md (rewrites the .md from the current texts)
//   npm run tutorial-text -- --check      validates both files and that they say the same thing, writes nothing
// Fails loudly (exit 1) on a missing or unknown ID, a duplicate, an empty text, a changed {placeholder}, a middle dot or
// bullet, or an ID tutorial.js uses that has no text. The ID list, the order and the "Where" lines live in SECTIONS
// below: a new tutorial string = a new entry here + its T('<id>') in tutorial.js, then --export.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, 'docs', 'TUTORIAL-TEXT.md');
const JS = path.join(ROOT, 'public', 'js', 'tutorial-text.js');
const TUTORIAL = path.join(ROOT, 'public', 'js', 'tutorial.js');
const APP = [path.join(ROOT, 'public', 'js', 'app.js'), path.join(ROOT, 'public', 'index.html')];

// [id, placeholders, where it shows]
const SECTIONS = [
  { title: 'Shared', about: 'The coach bubble and the first card, the same in every game.', entries: [
    ['ui.intro', ['keyRule'], 'The first card of every tutorial, over the game\'s cover (only when the cover is published). {keyRule} is the game\'s one-sentence rule from its scene file (shared with the "How to play" splash in a match, so it is not edited here); the text is trimmed, so it may start with it.'],
    ['ui.intro-step', [], 'The small label in the corner of that first card (later bubbles show the step counter there).'],
    ['ui.counter', ['n', 'total'], 'The step counter in the corner of every coach bubble: {n} = this step, {total} = the steps of this tutorial.'],
    ['ui.skip', [], 'The button on every coach bubble that ends the tutorial.'],
    ['ui.next', [], 'The button on a note bubble (not on a turn, where you tap a game control instead).'],
    ['ui.coach-name', [], 'The tutorial opponent\'s name in the scoreboard when the scene lab runs a tutorial (the site passes its own "Coach Bot" from app.js today).'],
    ['ui.guest-name', [], 'Your name in the scoreboard when the scene lab runs a tutorial without a player.'],
  ] },
  { title: 'Penalty', id: 'penalty', about: '3 turns, then a note.', entries: [
    ['penalty.1', [], 'Step 1, a turn where you kick: the arrow on your character, waiting for your corner. The keeper dives the other way.'],
    ['penalty.1.after', [], 'Step 1, after the reveal (a note with Next): you scored.'],
    ['penalty.2', [], 'Step 2, a turn where you save: the arrow over the goal, waiting for your dive. The kicker shoots where you dive.'],
    ['penalty.2.after', [], 'Step 2, after the reveal: you saved it.'],
    ['penalty.3', [], 'Step 3, a turn where you kick again: the arrow over the goal. The keeper dives where you shoot.'],
    ['penalty.3.after', [], 'Step 3, after the reveal: the keeper saved it.'],
    ['penalty.4', [], 'Step 4, the last note, pointing at the scoreboard.'],
  ] },
  { title: 'Shootout', id: 'shootout', about: '8 turns (only the button the arrow points at works), then a note.', entries: [
    ['shootout.1', [], 'Step 1, a turn: the arrow on Reload. The opponent reloads too.'],
    ['shootout.2', [], 'Step 2, a turn: the arrow on Shoot. The opponent reloads.'],
    ['shootout.2.after', [], 'Step 2, after the reveal (a note with Next): your shot hit them, the duel is yours.'],
    ['shootout.3', [], 'Step 3, a turn in a new duel: the arrow on Reload.'],
    ['shootout.4', [], 'Step 4, a turn: the arrow on Shoot. The opponent blocks.'],
    ['shootout.4.after', [], 'Step 4, after the reveal: the fence stopped your bullet.'],
    ['shootout.5', [], 'Step 5, a turn: the arrow on your ammo in the scoreboard, Reload (1 of 3). The opponent blocks.'],
    ['shootout.6', [], 'Step 6, a turn: the same, Reload (2 of 3).'],
    ['shootout.7', [], 'Step 7, a turn: the same, Reload (3 of 3).'],
    ['shootout.8', [], 'Step 8, a turn: the arrow on Blast. The opponent blocks.'],
    ['shootout.8.after', [], 'Step 8, after the reveal: the blast broke their fence, the duel is yours.'],
    ['shootout.9', [], 'Step 9, the last note, pointing at the opponent\'s ammo in the scoreboard.'],
  ] },
  { title: 'Rock Paper Scissors', id: 'rps', about: '4 turns, then 2 notes.', entries: [
    ['rps.1', [], 'Step 1, a turn: the arrow on Rock (the only hand that works). They show scissors.'],
    ['rps.1.after', [], 'Step 1, after the reveal (a note with Next): you won the round.'],
    ['rps.2', [], 'Step 2, a turn: the arrow on Scissors (the only hand that works). They show paper.'],
    ['rps.2.after', [], 'Step 2, after the reveal: you won the round.'],
    ['rps.3', [], 'Step 3, a turn: the arrow on Paper (the only hand that works). They show rock.'],
    ['rps.3.after', [], 'Step 3, after the reveal: you won the round.'],
    ['rps.4', [], 'Step 4, a turn: any hand works (the arrow on Paper). They show the same hand.'],
    ['rps.4.after', [], 'Step 4, after the reveal: a draw.'],
    ['rps.5', [], 'Step 5, a note pointing at the Scout button in the scoreboard; Scout opens with sample habits right after Next.'],
    ['rps.6', [], 'Step 6, the last note, no arrow (Scout is open).'],
  ] },
  { title: 'Minus One', id: 'rps_minus_one', about: '4 turns, then a note.', entries: [
    ['rps_minus_one.1', [], 'Step 1, a turn in the "show two" phase: the arrow on Rock, waiting for two hands.'],
    ['rps_minus_one.2', [], 'Step 2, a turn in the "keep one" phase (both pairs shown): the arrow on your first hand. They keep the hand your pick beats.'],
    ['rps_minus_one.2.after', [], 'Step 2, after the reveal (a note with Next): you won the round.'],
    ['rps_minus_one.3', [], 'Step 3, a turn in the next round\'s "show two" phase: the arrow on Rock.'],
    ['rps_minus_one.4', [], 'Step 4, a turn in the "keep one" phase: the arrow on your first hand. They keep the hand that beats yours.'],
    ['rps_minus_one.4.after', [], 'Step 4, after the reveal: they won the round.'],
    ['rps_minus_one.5', [], 'Step 5, the last note, pointing at the phase in the scoreboard.'],
  ] },
  { title: 'Around the tutorial', app: true, about: 'Shown by the site around a tutorial (public/js/app.js, public/index.html). {game} = the game\'s name. Until app.js reads these IDs, a change here does nothing on the site (the tool says which ones are not wired yet).', entries: [
    ['app.tile-button', [], 'The button on every game card of the Play page that starts the tutorial.'],
    ['app.offer', ['game'], 'The offer sheet the first time you open a game ({game} in bold).'],
    ['app.offer-skip', [], 'The offer sheet\'s button that declines.'],
    ['app.offer-play', [], 'The offer sheet\'s button that starts the tutorial.'],
    ['app.rules-button', [], 'The button in the rules dialog that starts the tutorial.'],
    ['app.badge', ['game'], 'The small line under the scoreboard during a tutorial.'],
    ['app.exit', [], 'The label of the top-right button during a tutorial (Forfeit in a match).'],
    ['app.title', ['game'], 'The browser tab title during a tutorial, after "Arcade Games — ".'],
    ['app.done', ['game'], 'The toast when you finish a tutorial.'],
    ['app.busy', [], 'The toast when you open another page during a tutorial.'],
  ] },
];
const META = new Map(SECTIONS.flatMap((s) => s.entries.map(([id, vars, where]) => [id, { id, vars, where, section: s }])));

const INTRO = `# Tutorial text

Every string the tutorials show, in the order they show it. This file is the source: the site reads
\`public/js/tutorial-text.js\`, which \`npm run tutorial-text\` writes from this file (and \`npm run tutorial-text -- --export\`
writes this file back from the .js).

How to edit: change only the text under each \`### id\` heading. Keep every heading (the ID) and the order, keep the
"Where:" lines as they are (they only say where the text shows and are rewritten by the tool), and keep every
{placeholder} in curly braces exactly as written (it is filled in by the game, for example {game} becomes "Shootout").
A text is one paragraph: line breaks inside it become spaces. Plain words, commas and colons; no middle dots or bullets.
Then run \`npm run tutorial-text\`; it stops with a message when an ID is missing, unknown or doubled, a text is empty or
a placeholder was changed.

A "turn" waits for you to tap a real game control (the arrow points at it); a "note" waits for Next. Notes marked
"after the reveal" show right after that turn's animation. The number in an ID is the step of the script (\`rps.4\` and
its \`rps.4.after\` are step 4); the counter in the bubble ({n} / {total}) counts every bubble, the "after" notes too.
`;

// ---------------- parse / render ----------------
function parseMd(src) {
  const out = [], errors = [];
  let cur = null;
  src.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    const h = line.match(/^###\s+`?([^`\s]+)`?\s*$/);
    if (h) { cur = { id: h[1], lines: [], line: i + 1 }; out.push(cur); return; }
    if (/^#{1,2}\s/.test(line) || /^#{4,}\s/.test(line)) { cur = null; return; }
    if (!cur) return;
    if (/^Where:/.test(line)) return;
    if (line.trim()) cur.lines.push(line.trim());
  });
  const entries = out.map((e) => [e.id, e.lines.join(' ')]);
  return { entries, errors };
}

function loadJs(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { filename: 'tutorial-text.js' });
  const t = sandbox.window.DuelTutorialText;
  if (!t || typeof t !== 'object') throw new Error('public/js/tutorial-text.js does not set window.DuelTutorialText');
  return Object.entries(t);
}

function ordered(entries) {
  const map = new Map(entries);
  return [...META.keys()].filter((id) => map.has(id)).map((id) => [id, map.get(id)]);
}

function renderJs(entries) {
  const map = new Map(entries);
  const lines = [
    '// Generated by `npm run tutorial-text` from docs/TUTORIAL-TEXT.md: edit the .md, then run the tool (never edit this file by hand).',
    '// Every string the tutorials show, by a stable ID; public/js/tutorial.js reads them with T(id, vars), {placeholders} are filled there.',
    'window.DuelTutorialText = {',
  ];
  for (const s of SECTIONS) {
    lines.push(`  // ${s.title}`);
    for (const [id] of s.entries) lines.push(`  '${id}': ${JSON.stringify(map.get(id))},`);
  }
  lines.push('};', '');
  return lines.join('\n');
}

function renderMd(entries) {
  const map = new Map(entries);
  const parts = [INTRO];
  for (const s of SECTIONS) {
    parts.push(`## ${s.title}${s.id ? ` (\`${s.id}\`)` : ''}\n\n${s.about}\n`);
    for (const [id, , where] of s.entries) parts.push(`### \`${id}\`\nWhere: ${where}\n\n${map.get(id)}\n`);
  }
  return parts.join('\n');
}

// ---------------- validation ----------------
const PREFIXES = [...new Set([...META.keys()].map((id) => id.split('.')[0]))];
// The IDs a source file references: every quoted string that starts with a known prefix and a dot.
function idsIn(src) {
  const re = new RegExp(`'((?:${PREFIXES.join('|')})\\.[\\w.-]+)'`, 'g');
  return new Set([...src.matchAll(re)].map((m) => m[1]));
}
const DOTS = new RegExp(`[${[0xB7, 0x2022, 0x2219, 0x22C5, 0x2027].map((c) => String.fromCharCode(c)).join('')}]`); // middle dots and bullets
const placeholders = (text) => [...new Set([...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

function validate(entries, label) {
  const errors = [], seen = new Set();
  for (const [id, text] of entries) {
    if (seen.has(id)) errors.push(`${label}: "${id}" appears twice`);
    seen.add(id);
    const m = META.get(id);
    if (!m) { errors.push(`${label}: unknown ID "${id}" (not a tutorial string; check the spelling, or add it to SECTIONS in tools/tutorial-text.js)`); continue; }
    if (typeof text !== 'string' || !text.trim()) { errors.push(`${label}: "${id}" has no text`); continue; }
    const want = [...m.vars].sort(), got = placeholders(text);
    if (want.join() !== got.join()) errors.push(`${label}: "${id}" must keep the placeholders ${want.map((v) => `{${v}}`).join(' ') || '(none)'}, found ${got.map((v) => `{${v}}`).join(' ') || '(none)'}`);
    if (DOTS.test(text)) errors.push(`${label}: "${id}" has a middle dot or bullet`);
    if (/[{}]/.test(text.replace(/\{\w+\}/g, ''))) errors.push(`${label}: "${id}" has a stray curly brace`);
  }
  for (const id of META.keys()) if (!seen.has(id)) errors.push(`${label}: "${id}" is missing`);
  return errors;
}

// tutorial.js must use every non-app ID, and nothing the text file lacks.
function checkUsage(entries) {
  const errors = [], notes = [];
  const used = idsIn(fs.readFileSync(TUTORIAL, 'utf8'));
  const have = new Set(entries.map(([id]) => id));
  for (const id of used) if (!have.has(id)) errors.push(`public/js/tutorial.js uses "${id}", which has no text`);
  for (const [id, m] of META) if (!m.section.app && !used.has(id)) errors.push(`"${id}" is never used by public/js/tutorial.js`);
  const appUsed = new Set(APP.flatMap((f) => [...idsIn(fs.readFileSync(f, 'utf8'))]));
  const unwired = [...META.values()].filter((m) => m.section.app && !appUsed.has(m.id)).map((m) => m.id);
  if (unwired.length) notes.push(`not wired yet (app.js / index.html still have their own copy): ${unwired.join(', ')}`);
  return { errors, notes };
}

const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b)) && a.length === b.length;

// Everything at once (used by --check and test/client.js): both files valid, in sync, and tutorial.js covered.
function check() {
  const md = parseMd(fs.readFileSync(MD, 'utf8')).entries;
  const js = loadJs(fs.readFileSync(JS, 'utf8'));
  const errors = [...validate(md, 'docs/TUTORIAL-TEXT.md'), ...validate(js, 'public/js/tutorial-text.js')];
  const usage = checkUsage(js);
  errors.push(...usage.errors);
  if (!same(md, js)) {
    const a = new Map(md), b = new Map(js);
    const diff = [...new Set([...a.keys(), ...b.keys()])].filter((id) => a.get(id) !== b.get(id));
    errors.push(`docs/TUTORIAL-TEXT.md and public/js/tutorial-text.js differ${diff.length ? ` (${diff.join(', ')})` : ''}: run npm run tutorial-text (the .md wins) or -- --export (the .js wins)`);
  }
  return { errors, notes: usage.notes, md, js };
}

function fail(errors) {
  console.error(`tutorial-text: ${errors.length} problem(s), nothing written:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

function main(argv) {
  if (argv.includes('--check')) {
    const r = check();
    r.notes.forEach((n) => console.log(`tutorial-text: ${n}`));
    if (r.errors.length) fail(r.errors);
    console.log(`tutorial-text: OK, ${r.js.length} strings, the .md and the .js agree`);
    return;
  }
  const exporting = argv.includes('--export');
  const entries = exporting ? loadJs(fs.readFileSync(JS, 'utf8')) : parseMd(fs.readFileSync(MD, 'utf8')).entries;
  const errors = validate(entries, exporting ? 'public/js/tutorial-text.js' : 'docs/TUTORIAL-TEXT.md');
  const usage = checkUsage(entries);
  errors.push(...usage.errors);
  if (errors.length) fail(errors);
  usage.notes.forEach((n) => console.log(`tutorial-text: ${n}`));
  if (exporting) fs.writeFileSync(MD, renderMd(entries));
  else fs.writeFileSync(JS, renderJs(entries));
  console.log(`tutorial-text: wrote ${path.relative(ROOT, exporting ? MD : JS)} (${entries.length} strings)`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { SECTIONS, META, parseMd, loadJs, renderJs, renderMd, validate, idsIn, check, MD, JS, TUTORIAL };
