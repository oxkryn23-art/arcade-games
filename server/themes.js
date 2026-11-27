// The color theme: the single source of every color on the site. /css/theme.css is generated from these tokens (CSS
// custom properties on :root); CSS, HTML and JS only ever use var(--token). Hover, pressed and glow variants are
// derived with color-mix(). One light look.
//
// Scenes keep their own palettes in server/theme-scenes/<game>.js (merged in below), so each game's art lives next to
// its own colors.
const fs = require('fs');
const path = require('path');

const TOKENS = {
  // base roles (the match strip, the scene overlay texts)
  bg: '#1D2430', 'surface-1': '#26303D', 'surface-2': '#313C4B', line: '#3E4A5A',
  text: '#F3F5F8', 'text-2': '#B7C0CC', muted: '#8893A2',
  player: '#3A6FE0', opponent: '#E0573F', money: '#E6B33E', danger: '#D9472F',
  'primary-bg': '#2F5BCF', 'on-primary': '#FFFFFF', 'on-accent': '#1D2430',
  // drawing: outlines, shadows, flashes
  outline: '#232A35', 'fig-dark': '#2C3440', 'fig-mid': '#4A5462', flash: '#FFFFFF', shadow: '#1B2230',
  // people (public/js/figures/rig.js): skin tones, hair colors, shirts, trousers, shoes, faces, keeper gloves
  'skin-1': '#F6D7BE', 'skin-2': '#EBBE98', 'skin-3': '#D49A6E', 'skin-4': '#A86F48', 'skin-5': '#6E4630',
  'hair-1': '#2B2420', 'hair-2': '#5A3A26', 'hair-3': '#9A6237', 'hair-4': '#D9A85B', 'hair-5': '#B04A2E', 'hair-6': '#8E96A3',
  'shirt-1': '#3F7CC4', 'shirt-2': '#D9573B', 'shirt-3': '#3C9A6A', 'shirt-4': '#E3A93A', 'shirt-5': '#7C5CC4', 'shirt-6': '#2E8C99', 'shirt-7': '#D6698F', 'shirt-8': '#55606E',
  pants: '#3B4656', shoe: '#2E3440', 'shoe-sole': '#E9ECF0', 'shoe-lining': '#1A1F27',
  eye: '#FFFFFF', mouth: '#7A3434', tongue: '#E2787A', cheek: '#E88A7A',
  glove: '#F2C14E', 'glove-band': '#2E8C99',
  // props (public/js/figures/props.js): wood, gunmetal, the football, muzzle flashes
  wood: '#B87A48', 'wood-dark': '#8E5A32', gunmetal: '#5E6470', 'gunmetal-light': '#8D939E',
  ball: '#F6F4EE', 'ball-dark': '#2B2D33', muzzle: '#F7D26E',
  // Site UI. The names are roles: --ui-cream = the PANEL surface, --ui-cream-2 = the inset surface, --ui-ink /
  // --ui-ink-2 = text on panels, --ui-line = frames, --ui-frame-hi = the frames' lit edge, --ui-sky = the page
  // background (-2 / -3 its soft lights), --ui-play = the one strong call to action, --ui-on-play = text on the play /
  // blue / gold / red fills, --ui-player = "selected" and you, --ui-opponent = them, --ui-money = gold (wins),
  // --ui-win = a win, --ui-accent-2 = the small labels, --ui-pattern = the faint page texture, --ui-glow = soft glows.
  'ui-cream': '#FFFFFF', 'ui-cream-2': '#F1F4F8',
  'ui-ink': '#1E2733', 'ui-ink-2': '#4A5566',
  'ui-line': '#C3CCD8', 'ui-frame-hi': '#FFFFFF',
  'ui-sky': '#E7ECF2', 'ui-sky-2': '#F4F7FA', 'ui-sky-3': '#D9E2EC', 'ui-sun': '#DCE6F0', 'ui-grass': '#DDEBE0',
  'ui-play': '#0F766E', 'ui-on-play': '#FFFFFF',
  'ui-player': '#2F5BCF', 'ui-opponent': '#BF3A2C',
  'ui-money': '#8A6100', 'ui-win': '#2B7A4C',
  'ui-accent-2': '#0F6A63', 'ui-pattern': '#DCE3EB', 'ui-glow': '#7FB8D8',
};

// scene palettes: server/theme-scenes/*.js, each exporting { token: '#RRGGBB' }
const SCENES = {};
const SCENE_DIR = path.join(__dirname, 'theme-scenes');
for (const f of (fs.existsSync(SCENE_DIR) ? fs.readdirSync(SCENE_DIR) : []).filter((n) => n.endsWith('.js')).sort()) {
  Object.assign(SCENES, require(path.join(SCENE_DIR, f)));
}
const ALL = { ...TOKENS, ...SCENES };

function css() {
  return ['/* Generated from server/themes.js and server/theme-scenes/. Do not edit: change the tokens there. */', ':root {', '  color-scheme: light;',
    ...Object.entries(ALL).map(([k, v]) => `  --${k}: ${v};`), '}'].join('\n') + '\n';
}

// WCAG contrast ratio of two #RRGGBB colors.
function contrast(a, b) {
  const L = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

module.exports = { TOKENS, SCENES, ALL, css, contrast, token: (name) => ALL[name] };
