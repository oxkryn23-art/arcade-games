# Hair 2: long and tied styles

Batch `hair-2`: 4 items. Chat 8 of 9. Run it in its own ChatGPT chat (see `../README.md` for the order and the rules).

## Attach (in the first message, before the prompt)

1. `references/people/head-shapes.png`
2. `references/current/hair.png`
3. `references/current/people.png`
4. `references/palette.png`

First message (with the attachments): "These are the official characters of my game, their shapes, the current items and the palette. Keep everything on model. Confirm in one line."

## Items

| # | id | Item |
|---|---|---|
| 1 | `curly` | Curly |
| 2 | `long` | Long |
| 3 | `bun` | Bun |
| 4 | `ponytail` | Ponytail |

## 1. The item sheet

Paste as one message. Save the result as `output/hair-2.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows or gradients on the background. NO GREEN color in the artwork (no green, lime, mint or olive anywhere, not even a dark outline tinted green): use cream, caramel, navy, slate blue, terracotta, coral, gold, charcoal, plum or brown instead. Items separated by generous green space, no visible grid lines, no captions, no labels.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

OUTPUT: one image, 1536 x 1024 (landscape). A clean grid of 4 rows x 4 columns with generous green space between the cells. One hairstyle per row, in the order listed. Columns 1 to 4 = the four views of that item: FRONT, THREE-QUARTER facing RIGHT, SIDE (profile) facing RIGHT, BACK. Never a left-facing view (the game mirrors the right-facing art). Every head the same size in every row and view, one shared neck-stub baseline per row.

HAIR: draw the bald head of the attached people/head-shapes.png EXACTLY (the same round head, ears, neck stub and scale, the skin #D49A6E, the face as in the reference: only the hair is taken from this sheet) wearing each hairstyle. The hair is ONE flat color, the key brown #5A3A26 (the game recolors it per player: blond, red, gray...), with a few inner strand lines in the outline color, no highlights, no gradients. The hair follows the head in every view: it never covers the eyes area in the front and 3/4 views (keep the upper face clear below the fringe), the ears stay visible unless the style covers them (long hair), the back view covers the whole back of the head down to the nape. A ponytail tie or a bun tie may be cream #FBE4C6.

THE 4 HAIRSTYLES, one per row, top to bottom:
1. CURLY: A big round head of curls (scalloped outline of many round curls) framing the face, the forehead clear.
2. LONG: Shoulder-length straight hair with a side part and a sweeping fringe, falling behind the shoulders, soft wavy ends.
3. BUN: Hair pulled back into a round bun on the top of the head, a few loose locks at the temples.
4. PONYTAIL: Hair pulled back into a ponytail at the back of the head (a cream tie), the tail hanging down to the shoulders.
```

If the grid comes out wrong (labels, missing views, overlapping items), reply: "Same sheet again: exactly 4 rows, 4 columns, every item alone on flat #00FF00, no text, nothing touching." If one item drifts, ask for that row again alone (1536 x 1024, one row of the same columns) and save it as `output/hair-2-row<n>.png`.

## 2. Fit check

Attach `references/people/bare-human.png` in the same chat and paste this. Save as `output/hair-2-fit.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

Use the item sheet from this chat (hair-2.png) and the attached people/bare-human.png. Draw the character EXACTLY on model (the same round head with big round eyes, ears, neck, egg-shaped body, noodle arms without elbows, legs and feet as in bare-human.png, a plain T-shirt and trousers unless the item replaces them) wearing the hairstyles, one per column (the same skin, the face as in the reference with its big round eyes).

OUTPUT: one image, 1536 x 1024 (landscape), a flat plain cream background #FFF9F0 (this is a check, not a sprite sheet: no green screen). 4 columns = the items in the sheet's order, left to right. Two rows: top = FRONT view, bottom = THREE-QUARTER facing RIGHT. The same character size in every cell, standing on one ground line per row, a neutral idle pose, arms hanging relaxed a little away from the body. No text, no labels.
```
