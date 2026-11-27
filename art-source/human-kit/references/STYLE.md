# Arcade Games characters: style rules (the human kit)

The rules every outfit, shoe, hairstyle and hat follows, for ChatGPT (paste this file into a chat when a batch drifts)
and for the import. The prompts already carry the short version.

## The look

- **Rubber-hose cartoon**, as the characters in `people/` and `current/`: clean dark outlines of even weight
  (`#232A35`), simple rounded shapes, bold readable silhouettes, flat colors with at most a restrained soft shade. No
  realistic fabric texture, knit texture, grain, glossy clay, 3D, gradients, glitter or sparkle noise.
- **Calm muted palette**: slate blue, terracotta, warm brown, cream, charcoal, soft orange, gold, plum, teal
  (`palette.png`, `palette.md`). Never neon, never green.
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

- **Outfits**: ONE full-torso piece, the exact egg of `people/torso-shapes.png`, from the neckline to the hips, a small
  round neck opening at the top, no sleeves on the torso (the game draws them along the arms from the sleeve swatch).
  Garments fully cover the torso down to the hips.
- **Shoes**: the oversized cartoon shoe, a round chunky toe, a thick simple sole flat on the ground, a small ankle
  opening with a dark lining. Left and right apart.
- **Hair**: on the bald head of `people/head-shapes.png`, ONE flat key brown `#5A3A26` with a few strand lines (the
  game recolors it), never over the eyes, the ears visible unless the style covers them.
- **Hats**: alone, sized for the head with hair, a clean bottom band (the anchor), solid colors.

## Sheets

- Flat pure `#00FF00` green screen behind everything, hard clean edges, no shadows on the background, no green in the
  artwork.
- A clean grid, one item per row, the four views as columns (outfits add the sleeve swatch), generous green space
  between the cells, nothing touching, the same scale in every cell and one baseline per row.
