// The human clothes kit for ChatGPT (art-source/human-kit/): the original game's cosmetics kit (marketing/cosmetics-kit
// there) for the human: the same batch format (five items a sheet, four views on a green screen, a sleeve swatch for
// outfits, a fit check on the character), the same style rules, the references rendered from the game's own rig
// (tools/kit-renders.js). Writes README.md, STYLE.md and prompts/ (INDEX.md + one file per batch):
//   node tools/human-kit.js
// The sheets come back as art-source/human-kit/output/<batch>.png (+ <batch>-fit.png) and are imported like the
// original game's v9 cosmetics.
const fs = require('fs');
const path = require('path');

const KIT = path.join(__dirname, '..', 'art-source', 'human-kit');

const STYLE = 'Original rubber-hose cartoon illustration in the style of the attached references (the game\'s own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.';
const GREEN = 'Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows or gradients on the background. NO GREEN color in the artwork (no green, lime, mint or olive anywhere, not even a dark outline tinted green): use cream, caramel, navy, slate blue, terracotta, coral, gold, charcoal, plum or brown instead. Items separated by generous green space, no visible grid lines, no captions, no labels.';
const ORIGINAL = 'Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.';
const ROLES = 'REFERENCE ROLES: the attached character images define the body shape, the scale and the drawing style ONLY. Draw only the requested items: no characters, no bodies, no heads, no faces, no hands in this sheet.';
const VIEWS = 'Columns 1 to 4 = the four views of that item: FRONT, THREE-QUARTER facing RIGHT, SIDE (profile) facing RIGHT, BACK. Never a left-facing view (the game mirrors the right-facing art).';

const OUTFIT_SHAPE = 'GARMENT SHAPE: each garment is ONE simple full-torso piece shaped exactly like the attached character\'s torso (people/torso-shapes.png: an egg, narrower at the neck, widest at the belly, a round bottom), covering it from the neckline to the hips like a onesie top, the bottom of it in the trousers color where the garment ends (a T-shirt over trousers: the last fifth of the egg is the trousers\' waistband). All its details (collar, buttons, zipper, pockets, stripes, prints) sit INSIDE that shape. In the 3/4 and side views the garment turns with the body: the front details slide toward the right (the facing side) and get narrower; the back view shows the back of the garment. No arms and no sleeves on the torso piece (cut flush at the shoulders), no head, no neck, no legs, no hands. Only a collar, a hood or a tie may stick out a little past the neckline. Leave a small round neck opening at the top (the neck shows there).';
const SWATCH = 'SLEEVE SWATCH (column 5), flat fill + outline, no folds: SHORT sleeve = one short sleeve band (a rounded rectangle about 1.5 times as wide as it is tall), the garment\'s sleeve color with its trim; LONG sleeve = one straight horizontal tube about 5 times as long as it is thick, in the sleeve color, ending on the RIGHT in its cuff (the cuff color and the cuff width must be easy to read); FULL-BODY = the sleeve (short band or long tube) on top and, under it, one straight vertical trouser-leg tube in the leg color ending at the BOTTOM in its ankle cuff.';
const SHOE_SHAPE = 'SHOE SHAPE: the oversized cartoon shoe of the attached feet-shapes.png (a little bigger than the natural foot, a round chunky toe, a thick simple sole flat on the ground), with a small ankle opening on top where the noodle leg goes in (the opening is visible in every view, a dark lining inside it). Every row shows the LEFT and the RIGHT shoe apart (never overlapping) in each view cell, the toes pointing RIGHT in the turned views.';
const HAIR_SHAPE = 'HAIR: draw the bald head of the attached people/head-shapes.png EXACTLY (the same round head, ears, neck stub and scale, the skin #D49A6E, the face as in the reference: only the hair is taken from this sheet) wearing each hairstyle. The hair is ONE flat color, the key brown #5A3A26 (the game recolors it per player: blond, red, gray...), with a few inner strand lines in the outline color, no highlights, no gradients. The hair follows the head in every view: it never covers the eyes area in the front and 3/4 views (keep the upper face clear below the fringe), the ears stay visible unless the style covers them (long hair), the back view covers the whole back of the head down to the nape. A ponytail tie or a bun tie may be cream #FBE4C6.';
const HAT_SHAPE = 'HAT: each hat alone (no head in the item sheet), sized for the attached head-shapes.png head WITH HAIR (it sits on the crown over the hair, never over the eyes); the bottom band is a clean readable line (it is the import anchor). Fully opaque solid colors.';

const BATCHES = [
  { id: 'outfits-1-tops', title: 'Outfits 1: tops, short sleeves', slot: 'outfit', items: [
    ['stripedtee', 'STRIPED T-SHIRT', 'Short sleeves', 'A cream (#FBE4C6) crew-neck tee with broad slate-blue (#4A7890) horizontal stripes all round, a slate-blue neckband. Back: the same stripes. Sleeve: short, slate blue with a cream band.'],
    ['polo', 'POLO SHIRT', 'Short sleeves', 'A terracotta (#D9573B) polo shirt with a small cream collar and a short two-button placket. Back: the collar band. Sleeve: short, terracotta with a cream trim.'],
    ['jersey', 'FOOTBALL JERSEY', 'Short sleeves', 'A gold (#E3A93A) sports jersey with a navy (#2F4A7A) V-neck and a navy panel down each side, no numbers, no crest. Back: plain gold with the navy side panels. Sleeve: short, gold with a navy cuff.'],
    ['aloha', 'ALOHA SHIRT', 'Short sleeves', 'An open camp collar and a button placket on a teal (#2E8C99) shirt with big simple five-petal cream flowers with gold centers. Back: the flowers continue under a collar band. Sleeve: short, teal with one small cream flower.'],
    ['ringer', 'RINGER TEE', 'Short sleeves', 'A cream tee with a pink (#D6698F) neckband and a plain pink star patch on the chest. Back: plain cream with the pink neckband. Sleeve: short, cream with a pink band.'],
  ] },
  { id: 'outfits-2-casual', title: 'Outfits 2: casual, long sleeves', slot: 'outfit', items: [
    ['hoodie', 'HOODIE', 'Long sleeves', 'A slate (#55606E) pullover hoodie: a kangaroo pocket, two cream drawstrings, a ribbed hem; the hood lies on the back. Back: the hood over the upper back. Sleeve: long, slate with a ribbed darker cuff.'],
    ['denim', 'DENIM JACKET', 'Long sleeves', 'A mid-blue denim (#4C6E9E) jacket worn open over a cream tee: cream stitching lines, two chest pockets with flaps, round metal buttons. Back: a yoke seam across the shoulders. Sleeve: long, denim with a cuff band.'],
    ['sweater', 'SWEATER', 'Long sleeves', 'A plum (#5B4A7A) crew-neck sweater with one cream zigzag band across the chest (flat, no knit texture), a ribbed hem. Back: the same band. Sleeve: long, plum with a cream ribbed cuff.'],
    ['flannel', 'FLANNEL SHIRT', 'Long sleeves', 'An open shirt in big simple terracotta and charcoal checks over a cream tee, a collar, a button placket edge. Back: the checks under a collar band. Sleeve: long, checked, a terracotta cuff.'],
    ['tracktop', 'TRACK JACKET', 'Long sleeves', 'A navy (#2F4A7A) zip-up track jacket with a high collar, a cream zipper line and a cream stripe down each side of the front. Back: plain navy with the collar. Sleeve: long, navy with a cream cuff.'],
  ] },
  { id: 'outfits-3-jackets', title: 'Outfits 3: jackets, long sleeves', slot: 'outfit', items: [
    ['bomber', 'BOMBER JACKET', 'Long sleeves', 'A soft orange (#E58A3A) bomber jacket with a ribbed charcoal collar and hem, a zipper, two slanted pockets. Back: plain with the ribbed hem. Sleeve: long, soft orange with a ribbed charcoal cuff.'],
    ['leather', 'BIKER JACKET', 'Long sleeves', 'A charcoal (#404046) biker jacket (flat, not shiny) with an off-center zipper, wide lapels, a belt at the hem, over a cream tee. Back: plain with the belt. Sleeve: long, charcoal with a zipped cuff.'],
    ['puffer', 'PUFFER JACKET', 'Long sleeves', 'A slate-blue (#4A7890) puffer jacket: horizontal quilting lines, a zipper, a high collar. Back: the quilting. Sleeve: long, slate blue with quilting lines and a charcoal cuff.'],
    ['raincoat', 'RAINCOAT', 'Long sleeves', 'A gold-yellow (#F2C14E) raincoat with three toggle buttons, two pocket flaps; the hood lies on the back. Back: the hood. Sleeve: long, yellow with a cuff band.'],
    ['blazer', 'BLAZER', 'Long sleeves', 'A navy (#2F4A7A) blazer worn open over a white shirt with a small terracotta tie, notched lapels, one button. Back: a center vent line. Sleeve: long, navy with a white shirt cuff.'],
  ] },
  { id: 'outfits-4-full-body', title: 'Outfits 4: full body (the legs too)', slot: 'outfit', items: [
    ['overalls', 'DUNGAREES', 'Full body, short sleeves', 'Mid-blue denim (#4C6E9E) dungarees (a bib with two straps and gold buttons, a bib pocket) over a cream tee. Back: the crossed straps. Sleeve: short, cream. Legs: denim with a rolled cuff.'],
    ['mechanic', 'MECHANIC COVERALL', 'Full body, long sleeves', 'A slate-blue (#4A7890) coverall with a center zip, a chest pocket, a darker belt. Back: plain with the belt. Sleeve: long, slate blue with a cuff. Legs: slate blue with an ankle cuff.'],
    ['pajamas', 'PAJAMAS', 'Full body, long sleeves', 'Cream pajamas with slate-blue stripes, a contrast piping collar and buttons. Back: the stripes. Sleeve: long, striped with a slate-blue cuff. Legs: striped with a slate-blue cuff.'],
    ['tracksuit', 'TRACKSUIT', 'Full body, long sleeves', 'A plum (#5B4A7A) tracksuit: a zip jacket with a high collar and a cream stripe down each side, matching trousers. Back: plain plum. Sleeve: long, plum with a cream cuff. Legs: plum with a cream stripe ring at the ankle.'],
    ['western', 'WESTERN OUTFIT', 'Full body, long sleeves', 'A cream shirt with a warm brown (#A0592C) vest and a gold star pin (a plain five-point star, no badge text), blue jeans. Back: the vest back. Sleeve: long, cream with a cuff. Legs: blue denim with a rolled cuff.'],
  ] },
  { id: 'shoes-1-everyday', title: 'Shoes 1: everyday', slot: 'shoe', items: [
    ['sneakers', 'SNEAKERS', '', 'Cream canvas sneakers with a slate-blue toe cap and heel, cream laces, a thick cream sole.'],
    ['hightops', 'HIGH-TOPS', '', 'Terracotta high-top sneakers reaching above the ankle, a cream toe cap and sole, a round ankle patch (plain, no logo).'],
    ['loafers', 'LOAFERS', '', 'Warm brown leather loafers (flat, not shiny) with a strap over the instep, a dark sole.'],
    ['chelsea', 'CHELSEA BOOTS', '', 'Caramel brown ankle boots with an elastic side panel in charcoal and a pull tab at the back, a dark sole.'],
    ['runners', 'RUNNERS', '', 'Slate-blue running shoes with a curved cream side panel (no brand stripes), a thick cream sole.'],
  ] },
  { id: 'shoes-2-sport', title: 'Shoes 2: sport and fun', slot: 'shoe', items: [
    ['cleats', 'FOOTBALL BOOTS', '', 'Charcoal football boots with gold studs under the sole and a gold heel tab.'],
    ['cowboyboots', 'COWBOY BOOTS', '', 'Tan cowboy boots with a simple stitched curve on the shaft, a pointed rounded toe, a stacked heel.'],
    ['rainboots', 'RAIN BOOTS', '', 'Gold-yellow rubber rain boots up to mid-calf, a cream rim at the top.'],
    ['slippers', 'SLIPPERS', '', 'Plum fluffy-looking (flat drawn, no fur texture) closed slippers with a cream cuff.'],
    ['skate', 'SKATE SHOES', '', 'Charcoal skate shoes with a cream sole and cream laces, a padded collar.'],
  ] },
  { id: 'hair-1', title: 'Hair 1: short styles', slot: 'hair', items: [
    ['short', 'SHORT', '', 'A short boyish cut: a tidy side-swept fringe of three rounded locks over the forehead, short at the sides above the ears.'],
    ['crop', 'CROP', '', 'A crop: short all over with a straight blunt fringe just above the brows, neat at the sides.'],
    ['buzz', 'BUZZ CUT', '', 'A very short buzz cut hugging the head (a thin even layer), a clean hairline at the forehead, no fringe.'],
    ['spiky', 'SPIKY', '', 'Short hair styled up in seven chunky soft spikes over the top, short at the sides.'],
  ] },
  { id: 'hair-2', title: 'Hair 2: long and tied styles', slot: 'hair', items: [
    ['curly', 'CURLY', '', 'A big round head of curls (scalloped outline of many round curls) framing the face, the forehead clear.'],
    ['long', 'LONG', '', 'Shoulder-length straight hair with a side part and a sweeping fringe, falling behind the shoulders, soft wavy ends.'],
    ['bun', 'BUN', '', 'Hair pulled back into a round bun on the top of the head, a few loose locks at the temples.'],
    ['ponytail', 'PONYTAIL', '', 'Hair pulled back into a ponytail at the back of the head (a cream tie), the tail hanging down to the shoulders.'],
  ] },
  { id: 'hats-1', title: 'Hats 1: everyday hats', slot: 'hat', items: [
    ['cap', 'BASEBALL CAP', '', 'A slate-blue baseball cap with a cream button on top and a curved brim pointing FORWARD (toward the face side, right in the turned views).'],
    ['beanie', 'BEANIE', '', 'A terracotta beanie with a folded cuff and a cream pompom.'],
    ['bucket', 'BUCKET HAT', '', 'A gold bucket hat with a soft round brim all round.'],
    ['cowboy', 'COWBOY HAT', '', 'A tan cowboy hat with a pinched crown, a curved brim and a brown band.'],
    ['headband', 'SWEATBAND', '', 'A teal terry sweatband around the forehead (flat drawn), worn over the hair.'],
  ] },
];

const ATTACH = {
  outfit: ['people/bare-human.png', 'people/torso-shapes.png', 'current/outfits.png', 'palette.png'],
  shoe: ['people/bare-human.png', 'people/feet-shapes.png', 'current/people.png', 'palette.png'],
  hair: ['people/head-shapes.png', 'current/hair.png', 'current/people.png', 'palette.png'],
  hat: ['people/head-shapes.png', 'current/hair.png', 'current/people.png', 'palette.png'],
};

function itemSheet(b) {
  const n = b.items.length;
  const parts = [STYLE, '', GREEN, '', ORIGINAL, ''];
  if (b.slot === 'hair') {
    parts.push(`OUTPUT: one image, 1536 x 1024 (landscape). A clean grid of ${n} rows x 4 columns with generous green space between the cells. One hairstyle per row, in the order listed. ${VIEWS} Every head the same size in every row and view, one shared neck-stub baseline per row.`, '', HAIR_SHAPE, '');
  } else if (b.slot === 'outfit') {
    parts.push(ROLES, '', `OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of ${n} rows x 5 columns with generous green space between the cells. One garment per row, in the order listed. ${VIEWS} Column 5, set a little apart from the views = that garment's SLEEVE SWATCH. Every garment has the same size in every row and every view (the size of the torso in the attached torso-shapes.png), one shared hem baseline per row and one horizontal center per cell.`, '', OUTFIT_SHAPE, '', SWATCH, '');
  } else if (b.slot === 'shoe') {
    parts.push(ROLES, '', `OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of ${n} rows x 4 columns with generous green space between the cells. One pair per row, in the order listed. ${VIEWS} Every shoe the same scale (the size of the foot in the attached feet-shapes.png, a little bigger), the soles on one ground line per row.`, '', SHOE_SHAPE, '');
  } else {
    parts.push(ROLES, '', `OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of ${n} rows x 4 columns with generous green space between the cells. One hat per row, in the order listed. ${VIEWS} Every hat the same scale (sized for the attached head), the bottom bands on one line per row.`, '', HAT_SHAPE, '');
  }
  const what = { outfit: 'OUTFITS', shoe: 'SHOES', hair: 'HAIRSTYLES', hat: 'HATS' }[b.slot];
  parts.push(`THE ${n} ${what}, one per row, top to bottom:`);
  b.items.forEach(([, name, kind, desc], i) => parts.push(`${i + 1}. ${name}${kind ? ` [${kind}]` : ''}: ${desc}`));
  return parts.join('\n');
}
function fitCheck(b) {
  const wear = {
    outfit: 'wearing the garments, one per column: the garment follows the body shape exactly (the head, the hair, the ears and the face stay untouched); short sleeves are short caps at the shoulders over the noodle arms; LONG sleeves cover the whole noodle arm down to the wrist and end in the cuff, bending with the arm (no elbows); FULL-BODY pieces also cover both noodle legs down to the ankle cuffs; the hands stay bare, the feet keep the natural shoes',
    shoe: 'wearing the shoe pairs, one per column: each noodle leg goes into its shoe\'s opening, the shoe a little bigger than the natural foot, the sole flat on the ground',
    hair: 'wearing the hairstyles, one per column (the same skin, the face as in the reference with its big round eyes)',
    hat: 'wearing the hats, one per column, over a short hairstyle (the hat sits on the crown over the hair, never over the eyes)',
  }[b.slot];
  return [STYLE, '', ORIGINAL, '', `Use the item sheet from this chat (${b.id}.png) and the attached people/bare-human.png. Draw the character EXACTLY on model (the same round head with big round eyes, ears, neck, egg-shaped body, noodle arms without elbows, legs and feet as in bare-human.png, a plain T-shirt and trousers unless the item replaces them) ${wear}.`, '', `OUTPUT: one image, 1536 x 1024 (landscape), a flat plain cream background #FFF9F0 (this is a check, not a sprite sheet: no green screen). ${b.items.length} columns = the items in the sheet's order, left to right. Two rows: top = FRONT view, bottom = THREE-QUARTER facing RIGHT. The same character size in every cell, standing on one ground line per row, a neutral idle pose, arms hanging relaxed a little away from the body. No text, no labels.`].join('\n');
}

function batchFile(b, i) {
  const at = ATTACH[b.slot];
  return [
    `# ${b.title}`, '',
    `Batch \`${b.id}\`: ${b.items.length} items. Chat ${i + 1} of ${BATCHES.length}. Run it in its own ChatGPT chat (see \`../README.md\` for the order and the rules).`, '',
    '## Attach (in the first message, before the prompt)', '',
    ...at.map((a, k) => `${k + 1}. \`references/${a}\``), '',
    'First message (with the attachments): "These are the official characters of my game, their shapes, the current items and the palette. Keep everything on model. Confirm in one line."', '',
    '## Items', '',
    '| # | id | Item |', '|---|---|---|',
    ...b.items.map(([id, name], k) => `| ${k + 1} | \`${id}\` | ${name[0]}${name.slice(1).toLowerCase()} |`), '',
    '## 1. The item sheet', '',
    `Paste as one message. Save the result as \`output/${b.id}.png\`.`, '',
    '```', itemSheet(b), '```', '',
    `If the grid comes out wrong (labels, missing views, overlapping items), reply: "Same sheet again: exactly ${b.items.length} rows, ${b.slot === 'outfit' ? 5 : 4} columns, every item alone on flat #00FF00, no text, nothing touching." If one item drifts, ask for that row again alone (1536 x 1024, one row of the same columns) and save it as \`output/${b.id}-row<n>.png\`.`, '',
    '## 2. Fit check', '',
    `Attach \`references/people/bare-human.png\` in the same chat and paste this. Save as \`output/${b.id}-fit.png\`.`, '',
    '```', fitCheck(b), '```', '',
  ].join('\n');
}

const README = `# Arcade Games: kit pro ChatGPT (oblečení, boty, účesy a klobouky pro postavy)

Stejný postup jako kosmetický kit ve Versu, jen pro člověka místo opice a kočky. Postavy ve hře jsou teď na původním
Verso rigu (stejné proporce, ramena, rukávy, ruce, animace) a tenhle kit jim dodá oblečení, boty, účesy a klobouky
přesně ve formátu, který Verso importoval: každá věc sama ve 4 pohledech na zelené, u oblečení navíc vzorek rukávu,
a ke každé dávce kontrola na postavě.

## Co je uvnitř

| Složka / soubor | Co to je |
|---|---|
| \`prompts/INDEX.md\` | přehled všech 9 dávek: co obsahují, co přiložit, kam uložit |
| \`prompts/<dávka>.md\` | jedna dávka = jeden chat: přílohy, první věta, prompt na list, prompt na kontrolu |
| \`references/people/\` | postava z naší hry ve 4 pohledech (bez oblečení), jen trup, jen hlava, jen nohy |
| \`references/current/\` | jak to vypadá teď: tričko, 8 účesů, čtyři hráči |
| \`references/palette.png\`, \`palette.md\` | barvy hry |
| \`references/STYLE.md\` | pravidla stylu (když ChatGPT ujíždí, vlož mu tenhle soubor) |
| \`output/\` | sem ukládej výsledky |

## Postup v každém chatu

1. **Nový chat na každou dávku** (styl pak neujíždí).
2. **První zpráva:** přilož 4 obrázky vypsané v dávce a napiš větu z dávky („These are the official characters…“).
3. **Druhá zpráva:** vlož prompt „1. The item sheet“ celý, nic neupravuj.
4. **Zkontroluj list:** správný počet řádků, 4 pohledy v pořadí (zepředu, 3/4 doprava, z boku doprava, zezadu), u
   oblečení 5. sloupec se vzorkem rukávu, všude čistá zelená \`#00FF00\` a žádná zelená v kresbě, žádný text, nic se
   nedotýká. Když něco nesedí, pošli „retry“ větu z dávky.
5. **Ulož** list jako PNG v plné velikosti (stáhnout, ne screenshot) do \`output/<dávka>.png\`.
6. **Kontrola na postavě:** přilož \`references/people/bare-human.png\`, vlož prompt „2. Fit check“ a ulož jako
   \`output/<dávka>-fit.png\`.

## Pořadí

1. \`outfits-1-tops\`: proužkované tričko, polo, dres, havajská košile, tričko s lemem
2. \`outfits-2-casual\`: mikina, džínová bunda, svetr, flanelová košile, sportovní bunda
3. \`outfits-3-jackets\`: bomber, křivák, péřovka, pláštěnka, sako
4. \`outfits-4-full-body\`: lacláče, montérky, pyžamo, tepláková souprava, westernový outfit
5. \`shoes-1-everyday\`: tenisky, kotníkové tenisky, mokasíny, chelsea boty, běžecké boty
6. \`shoes-2-sport\`: kopačky, kovbojky, holínky, bačkory, skate boty
7. \`hair-1\`: krátké, crop, ježek, bodliny
8. \`hair-2\`: kudrny, dlouhé, drdol, culík
9. \`hats-1\`: kšiltovka, kulich, bucket hat, kovbojský klobouk, čelenka

Dvě verze, mezi kterými nevíš? Ulož druhou jako \`<dávka>-b.png\`, vyberu já. Jedna řada se nepovedla? Nech si ji
přegenerovat samotnou a ulož jako \`<dávka>-row<n>.png\`.

## Až bude hotovo

Pošli mi složku \`output/\` (nebo celý kit zabalený). Naimportuju to stejnými nástroji jako ve Versu: vyřežu, převedu
oblečení na vektorové textury, boty a klobouky na obrázky s ukotvením, účesy na vektory v barvě vlasů hráče, napojím
to do rigu a výběru postavy, zkontroluju všechny hry a přegeneruju obaly, screenshoty i GIF.
`;

const STYLE_MD = `# Arcade Games characters: style rules (the human kit)

The rules every outfit, shoe, hairstyle and hat follows, for ChatGPT (paste this file into a chat when a batch drifts)
and for the import. The prompts already carry the short version.

## The look

- **Rubber-hose cartoon**, as the characters in \`people/\` and \`current/\`: clean dark outlines of even weight
  (\`#232A35\`), simple rounded shapes, bold readable silhouettes, flat colors with at most a restrained soft shade. No
  realistic fabric texture, knit texture, grain, glossy clay, 3D, gradients, glitter or sparkle noise.
- **Calm muted palette**: slate blue, terracotta, warm brown, cream, charcoal, soft orange, gold, plum, teal
  (\`palette.png\`, \`palette.md\`). Never neon, never green.
- **Readable small**: the characters are often 120 to 200 px tall on a phone. Big shapes, few details, no thin
  hairlines, no tiny print.
- **No text anywhere**, **original designs** (no brands, crests, real uniforms, characters from films or games).

## The character (what the items must fit)

- A friendly cartoon person: a big round head with big round eyes, small ears on the sides, a short neck, an
  egg-shaped torso, noodle limbs without elbows, chunky rounded feet. Skin tone, hair color and the T-shirt color are
  picked by the player.
- **Views**: front, three-quarter facing right, side (profile) facing right, back. Never left-facing views.
- **Arms**: in a turned view the near arm leaves the body at the top front corner of the torso; the far arm comes out
  from behind the body. In the front and back views both arms come out from behind the torso sides with a short sleeve
  band.

## Per slot

- **Outfits**: ONE full-torso piece, the exact egg of \`people/torso-shapes.png\`, from the neckline to the hips, a small
  round neck opening at the top, no sleeves on the torso (the game draws them along the arms from the sleeve swatch).
  Garments fully cover the torso down to the hips.
- **Shoes**: the oversized cartoon shoe, a round chunky toe, a thick simple sole flat on the ground, a small ankle
  opening with a dark lining. Left and right apart.
- **Hair**: on the bald head of \`people/head-shapes.png\`, ONE flat key brown \`#5A3A26\` with a few strand lines (the
  game recolors it), never over the eyes, the ears visible unless the style covers them.
- **Hats**: alone, sized for the head with hair, a clean bottom band (the anchor), solid colors.

## Sheets

- Flat pure \`#00FF00\` green screen behind everything, hard clean edges, no shadows on the background, no green in the
  artwork.
- A clean grid, one item per row, the four views as columns (outfits add the sleeve swatch), generous green space
  between the cells, nothing touching, the same scale in every cell and one baseline per row.
`;

fs.mkdirSync(path.join(KIT, 'prompts'), { recursive: true });
fs.mkdirSync(path.join(KIT, 'output'), { recursive: true });
fs.writeFileSync(path.join(KIT, 'README.md'), README);
fs.writeFileSync(path.join(KIT, 'references', 'STYLE.md'), STYLE_MD);
BATCHES.forEach((b, i) => fs.writeFileSync(path.join(KIT, 'prompts', `${b.id}.md`), batchFile(b, i)));
const index = ['# Prompt index', '', `${BATCHES.length} batches, each in its own ChatGPT chat, in this order. Every batch file holds the item sheet prompt (green screen, the four views) and a fit check on the character. Everything is saved to \`output/\`.`, '',
  '| # | File | Items | Attach | Saves |', '|---|---|---|---|---|',
  ...BATCHES.map((b, i) => `| ${i + 1} | [\`${b.id}.md\`](${b.id}.md) | ${b.items.map(([id]) => `\`${id}\``).join(', ')} | ${ATTACH[b.slot].join(', ')} | \`${b.id}.png\` + \`${b.id}-fit.png\` |`), ''].join('\n');
fs.writeFileSync(path.join(KIT, 'prompts', 'INDEX.md'), index);
fs.writeFileSync(path.join(KIT, 'output', 'README.txt'), 'Sem ukladej vysledky z ChatGPT: <davka>.png a <davka>-fit.png (nazvy jsou v prompts/INDEX.md).\n');
console.log(`wrote ${BATCHES.length} batches to ${path.relative(process.cwd(), KIT)}`);
