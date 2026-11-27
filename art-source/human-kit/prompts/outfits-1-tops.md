# Outfits 1: tops, short sleeves

Batch `outfits-1-tops`: 5 items. Chat 1 of 9. Run it in its own ChatGPT chat (see `../README.md` for the order and the rules).

## Attach (in the first message, before the prompt)

1. `references/people/bare-human.png`
2. `references/people/torso-shapes.png`
3. `references/current/outfits.png`
4. `references/palette.png`

First message (with the attachments): "These are the official characters of my game, their shapes, the current items and the palette. Keep everything on model. Confirm in one line."

## Items

| # | id | Item |
|---|---|---|
| 1 | `stripedtee` | Striped t-shirt |
| 2 | `polo` | Polo shirt |
| 3 | `jersey` | Football jersey |
| 4 | `aloha` | Aloha shirt |
| 5 | `ringer` | Ringer tee |

## 1. The item sheet

Paste as one message. Save the result as `output/outfits-1-tops.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows or gradients on the background. NO GREEN color in the artwork (no green, lime, mint or olive anywhere, not even a dark outline tinted green): use cream, caramel, navy, slate blue, terracotta, coral, gold, charcoal, plum or brown instead. Items separated by generous green space, no visible grid lines, no captions, no labels.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

REFERENCE ROLES: the attached character images define the body shape, the scale and the drawing style ONLY. Draw only the requested items: no characters, no bodies, no heads, no faces, no hands in this sheet.

OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of 5 rows x 5 columns with generous green space between the cells. One garment per row, in the order listed. Columns 1 to 4 = the four views of that item: FRONT, THREE-QUARTER facing RIGHT, SIDE (profile) facing RIGHT, BACK. Never a left-facing view (the game mirrors the right-facing art). Column 5, set a little apart from the views = that garment's SLEEVE SWATCH. Every garment has the same size in every row and every view (the size of the torso in the attached torso-shapes.png), one shared hem baseline per row and one horizontal center per cell.

GARMENT SHAPE: each garment is ONE simple full-torso piece shaped exactly like the attached character's torso (people/torso-shapes.png: an egg, narrower at the neck, widest at the belly, a round bottom), covering it from the neckline to the hips like a onesie top, the bottom of it in the trousers color where the garment ends (a T-shirt over trousers: the last fifth of the egg is the trousers' waistband). All its details (collar, buttons, zipper, pockets, stripes, prints) sit INSIDE that shape. In the 3/4 and side views the garment turns with the body: the front details slide toward the right (the facing side) and get narrower; the back view shows the back of the garment. No arms and no sleeves on the torso piece (cut flush at the shoulders), no head, no neck, no legs, no hands. Only a collar, a hood or a tie may stick out a little past the neckline. Leave a small round neck opening at the top (the neck shows there).

SLEEVE SWATCH (column 5), flat fill + outline, no folds: SHORT sleeve = one short sleeve band (a rounded rectangle about 1.5 times as wide as it is tall), the garment's sleeve color with its trim; LONG sleeve = one straight horizontal tube about 5 times as long as it is thick, in the sleeve color, ending on the RIGHT in its cuff (the cuff color and the cuff width must be easy to read); FULL-BODY = the sleeve (short band or long tube) on top and, under it, one straight vertical trouser-leg tube in the leg color ending at the BOTTOM in its ankle cuff.

THE 5 OUTFITS, one per row, top to bottom:
1. STRIPED T-SHIRT [Short sleeves]: A cream (#FBE4C6) crew-neck tee with broad slate-blue (#4A7890) horizontal stripes all round, a slate-blue neckband. Back: the same stripes. Sleeve: short, slate blue with a cream band.
2. POLO SHIRT [Short sleeves]: A terracotta (#D9573B) polo shirt with a small cream collar and a short two-button placket. Back: the collar band. Sleeve: short, terracotta with a cream trim.
3. FOOTBALL JERSEY [Short sleeves]: A gold (#E3A93A) sports jersey with a navy (#2F4A7A) V-neck and a navy panel down each side, no numbers, no crest. Back: plain gold with the navy side panels. Sleeve: short, gold with a navy cuff.
4. ALOHA SHIRT [Short sleeves]: An open camp collar and a button placket on a teal (#2E8C99) shirt with big simple five-petal cream flowers with gold centers. Back: the flowers continue under a collar band. Sleeve: short, teal with one small cream flower.
5. RINGER TEE [Short sleeves]: A cream tee with a pink (#D6698F) neckband and a plain pink star patch on the chest. Back: plain cream with the pink neckband. Sleeve: short, cream with a pink band.
```

If the grid comes out wrong (labels, missing views, overlapping items), reply: "Same sheet again: exactly 5 rows, 5 columns, every item alone on flat #00FF00, no text, nothing touching." If one item drifts, ask for that row again alone (1536 x 1024, one row of the same columns) and save it as `output/outfits-1-tops-row<n>.png`.

## 2. Fit check

Attach `references/people/bare-human.png` in the same chat and paste this. Save as `output/outfits-1-tops-fit.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

Use the item sheet from this chat (outfits-1-tops.png) and the attached people/bare-human.png. Draw the character EXACTLY on model (the same round head with big round eyes, ears, neck, egg-shaped body, noodle arms without elbows, legs and feet as in bare-human.png, a plain T-shirt and trousers unless the item replaces them) wearing the garments, one per column: the garment follows the body shape exactly (the head, the hair, the ears and the face stay untouched); short sleeves are short caps at the shoulders over the noodle arms; LONG sleeves cover the whole noodle arm down to the wrist and end in the cuff, bending with the arm (no elbows); FULL-BODY pieces also cover both noodle legs down to the ankle cuffs; the hands stay bare, the feet keep the natural shoes.

OUTPUT: one image, 1536 x 1024 (landscape), a flat plain cream background #FFF9F0 (this is a check, not a sprite sheet: no green screen). 5 columns = the items in the sheet's order, left to right. Two rows: top = FRONT view, bottom = THREE-QUARTER facing RIGHT. The same character size in every cell, standing on one ground line per row, a neutral idle pose, arms hanging relaxed a little away from the body. No text, no labels.
```
