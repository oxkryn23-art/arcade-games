# Tutorial text

Every string the tutorials show, in the order they show it. This file is the source: the site reads
`public/js/tutorial-text.js`, which `npm run tutorial-text` writes from this file (and `npm run tutorial-text -- --export`
writes this file back from the .js).

How to edit: change only the text under each `### id` heading. Keep every heading (the ID) and the order, keep the
"Where:" lines as they are (they only say where the text shows and are rewritten by the tool), and keep every
{placeholder} in curly braces exactly as written (it is filled in by the game, for example {game} becomes "Shootout").
A text is one paragraph: line breaks inside it become spaces. Plain words, commas and colons; no middle dots or bullets.
Then run `npm run tutorial-text`; it stops with a message when an ID is missing, unknown or doubled, a text is empty or
a placeholder was changed.

A "turn" waits for you to tap a real game control (the arrow points at it); a "note" waits for Next. Notes marked
"after the reveal" show right after that turn's animation. The number in an ID is the step of the script (`rps.4` and
its `rps.4.after` are step 4); the counter in the bubble ({n} / {total}) counts every bubble, the "after" notes too.

## Shared

The coach bubble and the first card, the same in every game.

### `ui.intro`
Where: The first card of every tutorial, over the game's cover (only when the cover is published). {keyRule} is the game's one-sentence rule from its scene file (shared with the "How to play" splash in a match, so it is not edited here); the text is trimmed, so it may start with it.

{keyRule} Let's play a practice round.

### `ui.intro-step`
Where: The small label in the corner of that first card (later bubbles show the step counter there).

Tutorial

### `ui.counter`
Where: The step counter in the corner of every coach bubble: {n} = this step, {total} = the steps of this tutorial.

{n} / {total}

### `ui.skip`
Where: The button on every coach bubble that ends the tutorial.

Skip tutorial

### `ui.next`
Where: The button on a note bubble (not on a turn, where you tap a game control instead).

Next

### `ui.coach-name`
Where: The tutorial opponent's name in the scoreboard when the scene lab runs a tutorial (the site passes its own "Coach Bot" from app.js today).

Coach Bot

### `ui.guest-name`
Where: Your name in the scoreboard when the scene lab runs a tutorial without a player.

Guest

## Penalty (`penalty`)

3 turns, then a note.

### `penalty.1`
Where: Step 1, a turn where you kick: the arrow on your character, waiting for your corner. The keeper dives the other way.

YOU KICK: the arrow marks you. Point at a corner to see your shot (on a phone: tap once to aim, again to shoot).

### `penalty.1.after`
Where: Step 1, after the reveal (a note with Next): you scored.

The keeper dived the other way. GOAL!

### `penalty.2`
Where: Step 2, a turn where you save: the arrow over the goal, waiting for your dive. The kicker shoots where you dive.

Now YOU SAVE: the arrow is over the goal. Point at a side to see your dive, then pick it.

### `penalty.2.after`
Where: Step 2, after the reveal: you saved it.

Same side = saved. You read the kicker!

### `penalty.3`
Where: Step 3, a turn where you kick again: the arrow over the goal. The keeper dives where you shoot.

Kick again. This keeper is sharp…

### `penalty.3.after`
Where: Step 3, after the reveal: the keeper saved it.

Same side = saved. Mix up your corners.

### `penalty.4`
Where: Step 4, the last note, pointing at the scoreboard.

5 kicks each, alternating. Tied after 5? Sudden death: one kick each until one scores and the other doesn’t.

## Shootout (`shootout`)

8 turns (only the button the arrow points at works), then a note.

### `shootout.1`
Where: Step 1, a turn: the arrow on Reload. The opponent reloads too.

Reload first — you can’t shoot with 0 ammo.

### `shootout.2`
Where: Step 2, a turn: the arrow on Shoot. The opponent reloads.

They are reloading. Shoot now!

### `shootout.2.after`
Where: Step 2, after the reveal (a note with Next): your shot hit them, the duel is yours.

Shooting someone who reloads wins the duel.

### `shootout.3`
Where: Step 3, a turn in a new duel: the arrow on Reload.

New duel, ammo is back to 0. Reload.

### `shootout.4`
Where: Step 4, a turn: the arrow on Shoot. The opponent blocks.

Shoot again!

### `shootout.4.after`
Where: Step 4, after the reveal: the fence stopped your bullet.

They ducked behind the fence: Block stops bullets.

### `shootout.5`
Where: Step 5, a turn: the arrow on your ammo in the scoreboard, Reload (1 of 3). The opponent blocks.

Reload until you have 3 ammo.

### `shootout.6`
Where: Step 6, a turn: the same, Reload (2 of 3).

Keep reloading…

### `shootout.7`
Where: Step 7, a turn: the same, Reload (3 of 3).

Keep reloading…

### `shootout.8`
Where: Step 8, a turn: the arrow on Blast. The opponent blocks.

3 bullets loaded. Blast!

### `shootout.8.after`
Where: Step 8, after the reveal: the blast broke their fence, the duel is yours.

Blast blows the fence apart: it beats Block.

### `shootout.9`
Where: Step 9, the last note, pointing at the opponent's ammo in the scoreboard.

Ammo is public: watch theirs in the scoreboard. First to 3 duels wins.

## Rock Paper Scissors (`rps`)

4 turns, then 2 notes.

### `rps.1`
Where: Step 1, a turn: the arrow on Rock (the only hand that works). They show scissors.

Tap Rock.

### `rps.1.after`
Where: Step 1, after the reveal (a note with Next): you won the round.

Rock crushes scissors.

### `rps.2`
Where: Step 2, a turn: the arrow on Scissors (the only hand that works). They show paper.

Now tap Scissors.

### `rps.2.after`
Where: Step 2, after the reveal: you won the round.

Scissors cut paper.

### `rps.3`
Where: Step 3, a turn: the arrow on Paper (the only hand that works). They show rock.

Now tap Paper.

### `rps.3.after`
Where: Step 3, after the reveal: you won the round.

Paper wraps rock.

### `rps.4`
Where: Step 4, a turn: any hand works (the arrow on Paper). They show the same hand.

Pick any hand.

### `rps.4.after`
Where: Step 4, after the reveal: a draw.

Same hand is a draw.

### `rps.5`
Where: Step 5, a note pointing at the Scout button in the scoreboard; Scout opens with sample habits right after Next.

In real matches, Scout shows how your opponent usually plays.

### `rps.6`
Where: Step 6, the last note, no arrow (Scout is open).

Read their habits, then pick. First to 3 wins.

## Minus One (`rps_minus_one`)

4 turns, then a note.

### `rps_minus_one.1`
Where: Step 1, a turn in the "show two" phase: the arrow on Rock, waiting for two hands.

Pick two hands: tap one, then another.

### `rps_minus_one.2`
Where: Step 2, a turn in the "keep one" phase (both pairs shown): the arrow on your first hand. They keep the hand your pick beats.

Their two hands are out. Now keep one — think about what they’ll keep.

### `rps_minus_one.2.after`
Where: Step 2, after the reveal (a note with Next): you won the round.

You read it right!

### `rps_minus_one.3`
Where: Step 3, a turn in the next round's "show two" phase: the arrow on Rock.

Another round: pick two hands. The same one twice is allowed too (rock + rock), but then they know what you will keep.

### `rps_minus_one.4`
Where: Step 4, a turn in the "keep one" phase: the arrow on your first hand. They keep the hand that beats yours.

Keep one.

### `rps_minus_one.4.after`
Where: Step 4, after the reveal: they won the round.

They read you this time. The read goes both ways.

### `rps_minus_one.5`
Where: Step 5, the last note, pointing at the phase in the scoreboard.

First to 3 points. Each phase has its own short timer.

## Around the tutorial

Shown by the site around a tutorial (public/js/app.js, public/index.html). {game} = the game's name. Until app.js reads these IDs, a change here does nothing on the site (the tool says which ones are not wired yet).

### `app.tile-button`
Where: The button on every game card of the Play page that starts the tutorial.

How to play

### `app.offer`
Where: The offer sheet the first time you open a game ({game} in bold).

New to {game}? 30-second tutorial.

### `app.offer-skip`
Where: The offer sheet's button that declines.

Skip

### `app.offer-play`
Where: The offer sheet's button that starts the tutorial.

Play it

### `app.rules-button`
Where: The button in the rules dialog that starts the tutorial.

Play the tutorial

### `app.badge`
Where: The small line under the scoreboard during a tutorial.

Tutorial: {game}, no timer

### `app.exit`
Where: The label of the top-right button during a tutorial (Forfeit in a match).

Exit

### `app.title`
Where: The browser tab title during a tutorial, after "Arcade Games — ".

{game} tutorial

### `app.done`
Where: The toast when you finish a tutorial.

Tutorial done: {game}

### `app.busy`
Where: The toast when you open another page during a tutorial.

Exit the tutorial first (top right of the game).
