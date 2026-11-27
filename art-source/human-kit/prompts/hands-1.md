# Hands 1: five-finger hands

Batch `hands-1`: the 12 hands of the game in ONE sheet, the same layout as the current sheet, but every open hand
has FIVE fingers (a thumb and four fingers) instead of four. Run it in its own ChatGPT chat.

## Attach (in the first message, before the prompt)

1. `references/current/hands-4-fingers.png` (the current sheet: its layout, sizes and style are kept exactly)
2. `references/people/bare-human.png`
3. `references/palette.png`

First message (with the attachments): "These are the official hands of my game character, the character and the palette. Keep everything on model. Confirm in one line."

## The sheet

Paste as one message. Save the result as `output/hands-1.png`.

```
Redraw the attached hand sheet (hands-4-fingers.png) EXACTLY: the same 3 rows x 4 columns grid, the same canvas size
and aspect ratio, every hand in the same place, at the same size, the same pose, and every forearm coming in flat from
the LEFT edge of its cell at the same height and the same thickness. Only one thing changes: every hand is a normal
HUMAN hand with FIVE digits, a thumb plus four fingers (index, middle, ring, little), never three or four.

Row 1, the BACK of the right hand (the knuckles toward the viewer):
  1. READY: a loose fist, the thumb resting over the curled fingers; four curled fingers visible as four stacked rounded bumps.
  2. ROCK: a tight fist, the same four stacked fingers, the thumb wrapped over them.
  3. PAPER: a flat open hand, the fingers together pointing RIGHT: the thumb up and four straight fingers (four separate fingers with three lines between them).
  4. SCISSORS: index and middle finger straight out to the RIGHT in a V; the ring and little finger curled under, held by the thumb.
Row 2, the same four gestures seen from the PALM side (the palm toward the viewer, a soft palm crease), again five digits.
Row 3:
  1. OPEN: an open relaxed hand, the thumb up and four slightly spread fingers pointing right.
  2. GRIP: a fist turned to hold a handle (the fingers wrapped around an empty space), four fingers visible.
  3. GLOVE, back: a goalkeeper glove in gold #F2C14E with a teal #2E8C99 wrist band, the thumb and four fingers.
  4. GLOVE, palm: the same glove from the palm side.

Original rubber-hose cartoon illustration in the style of the attached sheet: clean dark outlines of even weight
(#232A35), simple rounded shapes, the flat skin #D49A6E with no shading, no highlights, no gradients, bold readable
silhouettes. Opaque solid flat pure GREEN #00FF00 background, hard clean boundaries, no shadows on the background.
NO GREEN color in the artwork. Hands separated by generous green space, no grid lines, no captions, no labels, no
text, no logos.
```

## Check before saving

- Count the digits on every hand: a thumb + four fingers (in the fists: four curled fingers).
- Each forearm starts at the left edge of its cell at the same height and thickness as in the old sheet.
- No green inside the art, the background pure #00FF00.

## Import

Save as `art-source/characters/06-hands-gloves.png` (replacing the old sheet), then:

```
node tools/hand-sprites.js     (the RPS hand sprites)
node tools/trace-figures.js    (the vector hands of the other games)
npm test
```
