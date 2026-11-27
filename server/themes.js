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
  // the human clothes kit's garments (tools/import-kit.js, art-source/human-kit/outfit-colors.json): the base fill, the
  // sleeve, its cuff / trim band, ring stripes, a full-body piece's legs and ankle cuffs
  'outfit-stripedtee': '#FCDBB5', 'outfit-stripedtee-sleeve': '#F9E0BA', 'outfit-stripedtee-cuff': '#3C7A90', 'outfit-polo': '#E2552C',
  'outfit-polo-sleeve': '#E2552C', 'outfit-polo-cuff': '#FADCB6', 'outfit-jersey': '#F5AA2A', 'outfit-jersey-sleeve': '#F5AB28',
  'outfit-jersey-cuff': '#26467B', 'outfit-aloha': '#2E8693', 'outfit-aloha-sleeve': '#308491', 'outfit-ringer': '#FDDCB5',
  'outfit-ringer-sleeve': '#FEDCB3', 'outfit-ringer-cuff': '#E1547A', 'outfit-hoodie': '#586273', 'outfit-hoodie-sleeve': '#586172',
  'outfit-hoodie-cuff': '#292F3B', 'outfit-denim': '#4A6894', 'outfit-denim-sleeve': '#4B6894', 'outfit-sweater': '#674D6E',
  'outfit-sweater-sleeve': '#694F70', 'outfit-sweater-cuff': '#5E4853', 'outfit-flannel': '#763A41', 'outfit-flannel-sleeve': '#CD4F3D',
  'outfit-flannel-stripe': '#723A40', 'outfit-tracktop': '#31486E', 'outfit-tracktop-sleeve': '#30486E', 'outfit-tracktop-cuff': '#FBE6C5',
  'outfit-bomber': '#EA8739', 'outfit-bomber-sleeve': '#EB8839', 'outfit-bomber-cuff': '#4C4A4E', 'outfit-leather': '#4B494E',
  'outfit-leather-sleeve': '#4D4B4F', 'outfit-puffer': '#4C7892', 'outfit-puffer-sleeve': '#4D7892', 'outfit-puffer-cuff': '#3B424D',
  'outfit-puffer-stripe': '#272C36', 'outfit-raincoat': '#F9BB3A', 'outfit-raincoat-sleeve': '#FABC3A', 'outfit-blazer': '#384D6D',
  'outfit-blazer-sleeve': '#3A4F70', 'outfit-blazer-cuff': '#F5F4F4', 'outfit-overalls': '#4E7297', 'outfit-overalls-sleeve': '#FDE4C1',
  'outfit-overalls-leg': '#4E7297', 'outfit-overalls-ankle': '#A3B6CA', 'outfit-mechanic': '#4A778C', 'outfit-mechanic-sleeve': '#4C788D',
  'outfit-mechanic-cuff': '#495761', 'outfit-mechanic-leg': '#4B788D', 'outfit-mechanic-ankle': '#46545D', 'outfit-pajamas': '#FBE6C5',
  'outfit-pajamas-sleeve': '#FDE4C0', 'outfit-pajamas-cuff': '#406C8B', 'outfit-pajamas-leg': '#FDE4C1', 'outfit-pajamas-ankle': '#43728F',
  'outfit-tracksuit': '#6D4A77', 'outfit-tracksuit-sleeve': '#6E4B78', 'outfit-tracksuit-cuff': '#FCE3C2', 'outfit-tracksuit-leg': '#6F4D78',
  'outfit-tracksuit-ankle': '#FAE4C5', 'outfit-western': '#B4612C', 'outfit-western-sleeve': '#FDE4C1', 'outfit-western-cuff': '#F3CBA4',
  'outfit-western-leg': '#446E8E', 'outfit-western-ankle': '#A0B5C9',
  pants: '#3B4656', shoe: '#2E3440', 'shoe-sole': '#E9ECF0', 'shoe-lining': '#1A1F27', 'hair-tie': '#FBE4C6',
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
