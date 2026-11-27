# Hats 1: everyday hats

Batch `hats-1`: 5 items. Chat 9 of 9. Run it in its own ChatGPT chat (see `../README.md` for the order and the rules).

## Attach (in the first message, before the prompt)

1. `references/people/head-shapes.png`
2. `references/current/hair.png`
3. `references/current/people.png`
4. `references/palette.png`

First message (with the attachments): "These are the official characters of my game, their shapes, the current items and the palette. Keep everything on model. Confirm in one line."

## Items

| # | id | Item |
|---|---|---|
| 1 | `cap` | Baseball cap |
| 2 | `beanie` | Beanie |
| 3 | `bucket` | Bucket hat |
| 4 | `cowboy` | Cowboy hat |
| 5 | `headband` | Sweatband |

## 1. The item sheet

Paste as one message. Save the result as `output/hats-1.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows or gradients on the background. NO GREEN color in the artwork (no green, lime, mint or olive anywhere, not even a dark outline tinted green): use cream, caramel, navy, slate blue, terracotta, coral, gold, charcoal, plum or brown instead. Items separated by generous green space, no visible grid lines, no captions, no labels.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

REFERENCE ROLES: the attached character images define the body shape, the scale and the drawing style ONLY. Draw only the requested items: no characters, no bodies, no heads, no faces, no hands in this sheet.

OUTPUT: one image, 1024 x 1536 (portrait). A clean grid of 5 rows x 4 columns with generous green space between the cells. One hat per row, in the order listed. Columns 1 to 4 = the four views of that item: FRONT, THREE-QUARTER facing RIGHT, SIDE (profile) facing RIGHT, BACK. Never a left-facing view (the game mirrors the right-facing art). Every hat the same scale (sized for the attached head), the bottom bands on one line per row.

HAT: each hat alone (no head in the item sheet), sized for the attached head-shapes.png head WITH HAIR (it sits on the crown over the hair, never over the eyes); the bottom band is a clean readable line (it is the import anchor). Fully opaque solid colors.

THE 5 HATS, one per row, top to bottom:
1. BASEBALL CAP: A slate-blue baseball cap with a cream button on top and a curved brim pointing FORWARD (toward the face side, right in the turned views).
2. BEANIE: A terracotta beanie with a folded cuff and a cream pompom.
3. BUCKET HAT: A gold bucket hat with a soft round brim all round.
4. COWBOY HAT: A tan cowboy hat with a pinched crown, a curved brim and a brown band.
5. SWEATBAND: A teal terry sweatband around the forehead (flat drawn), worn over the hair.
```

If the grid comes out wrong (labels, missing views, overlapping items), reply: "Same sheet again: exactly 5 rows, 4 columns, every item alone on flat #00FF00, no text, nothing touching." If one item drifts, ask for that row again alone (1536 x 1024, one row of the same columns) and save it as `output/hats-1-row<n>.png`.

## 2. Fit check

Attach `references/people/bare-human.png` in the same chat and paste this. Save as `output/hats-1-fit.png`.

```
Original rubber-hose cartoon illustration in the style of the attached references (the game's own characters): clean dark outlines of even weight (#232A35), simple rounded shapes, flat colors plus at most a restrained soft shading, bold readable silhouettes, a calm muted palette (use the colors of the attached palette.png first), colorful playful cohesive game look; no realistic fabric texture, grain, glossy clay or 3D. No text, labels, letters, numbers, logos or watermarks.

Original designs only: no brand logos or brand stripes, no team, club, school or agency crests, no real uniforms, no costumes or emblems of characters from films, games, comics or anime, no look-alike of any trademarked product.

Use the item sheet from this chat (hats-1.png) and the attached people/bare-human.png. Draw the character EXACTLY on model (the same round head with big round eyes, ears, neck, egg-shaped body, noodle arms without elbows, legs and feet as in bare-human.png, a plain T-shirt and trousers unless the item replaces them) wearing the hats, one per column, over a short hairstyle (the hat sits on the crown over the hair, never over the eyes).

OUTPUT: one image, 1536 x 1024 (landscape), a flat plain cream background #FFF9F0 (this is a check, not a sprite sheet: no green screen). 5 columns = the items in the sheet's order, left to right. Two rows: top = FRONT view, bottom = THREE-QUARTER facing RIGHT. The same character size in every cell, standing on one ground line per row, a neutral idle pose, arms hanging relaxed a little away from the body. No text, no labels.
```
