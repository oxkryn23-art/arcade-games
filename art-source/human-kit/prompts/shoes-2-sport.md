# Shoes 2: sport and fun

Batch `shoes-2-sport`: 5 items. Chat 6 of 9. Run it in its own ChatGPT chat (see `../README.md` for the order and the rules).

## Attach (in the first message, before the prompt)

1. `references/people/bare-human.png`
2. `references/people/feet-shapes.png`
3. `references/current/people.png`
4. `references/palette.png`

First message (with the attachments): "These are the official characters of my game, their shapes, the current items and the palette. Keep everything on model. Confirm in one line."

## Items

| # | id | Item |
|---|---|---|
| 1 | `cleats` | Football boots |
| 2 | `cowboyboots` | Cowboy boots |
| 3 | `rainboots` | Rain boots |
| 4 | `slippers` | Slippers |
| 5 | `skate` | Skate shoes |

## 1. The item sheet

Paste as one message. Save the result as `output/shoes-2-sport.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows or gradients on the background. NO GREEN color in the artwork (no green, lime, mint or olive anywhere, not even a dark outline tinted green): use cream, caramel, navy, slate blue, terracotta, coral, gold, charcoal, plum or brown instead. Items separated by generous green space, no visible grid lines, no captions, no labels.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

REFERENCE ROLES: the attached character images define the body shape, the scale and the drawing style ONLY. Draw only the requested items: no characters, no bodies, no heads, no faces, no hands in this sheet.

OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of 5 rows x 4 columns with generous green space between the cells. One pair per row, in the order listed. Columns 1 to 4 = the four views of that item: FRONT, THREE-QUARTER facing RIGHT, SIDE (profile) facing RIGHT, BACK. Never a left-facing view (the game mirrors the right-facing art). Every shoe the same scale (the size of the foot in the attached feet-shapes.png, a little bigger), the soles on one ground line per row.

SHOE SHAPE: the oversized cartoon shoe of the attached feet-shapes.png (a little bigger than the natural foot, a round chunky toe, a thick simple sole flat on the ground), with a small ankle opening on top where the noodle leg goes in (the opening is visible in every view, a dark lining inside it). Every row shows the LEFT and the RIGHT shoe apart (never overlapping) in each view cell, the toes pointing RIGHT in the turned views.

THE 5 SHOES, one per row, top to bottom:
1. FOOTBALL BOOTS: Charcoal football boots with gold studs under the sole and a gold heel tab.
2. COWBOY BOOTS: Tan cowboy boots with a simple stitched curve on the shaft, a pointed rounded toe, a stacked heel.
3. RAIN BOOTS: Gold-yellow rubber rain boots up to mid-calf, a cream rim at the top.
4. SLIPPERS: Plum fluffy-looking (flat drawn, no fur texture) closed slippers with a cream cuff.
5. SKATE SHOES: Charcoal skate shoes with a cream sole and cream laces, a padded collar.
```

If the grid comes out wrong (labels, missing views, overlapping items), reply: "Same sheet again: exactly 5 rows, 4 columns, every item alone on flat #00FF00, no text, nothing touching." If one item drifts, ask for that row again alone (1536 x 1024, one row of the same columns) and save it as `output/shoes-2-sport-row<n>.png`.

## 2. Fit check

Attach `references/people/bare-human.png` in the same chat and paste this. Save as `output/shoes-2-sport-fit.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

Use the item sheet from this chat (shoes-2-sport.png) and the attached people/bare-human.png. Draw the character EXACTLY on model (the same round head with big round eyes, ears, neck, egg-shaped body, noodle arms without elbows, legs and feet as in bare-human.png, a plain T-shirt and trousers unless the item replaces them) wearing the shoe pairs, one per column: each noodle leg goes into its shoe's opening, the shoe a little bigger than the natural foot, the sole flat on the ground.

OUTPUT: one image, 1536 x 1024 (landscape), a flat plain cream background #FFF9F0 (this is a check, not a sprite sheet: no green screen). 5 columns = the items in the sheet's order, left to right. Two rows: top = FRONT view, bottom = THREE-QUARTER facing RIGHT. The same character size in every cell, standing on one ground line per row, a neutral idle pose, arms hanging relaxed a little away from the body. No text, no labels.
```
