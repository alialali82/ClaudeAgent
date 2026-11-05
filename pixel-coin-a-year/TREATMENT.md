# One Coin a Day — 16-bit Pixel RPG

**Logline.** A boy sets himself one quest — drop one coin in the jar every day for a year — and the game around him turns the hardest day (a shop full of temptations) into a battle he wins by choosing SAVE.

## Three candidate structures
1. **Overworld tour**: a top-down map, one town per month, door transitions. Pretty, but a calendar tour makes "every day" feel like twelve different things.
2. **Shop and inventory**: the whole film is the jar's item count, bought/used/sold. Clear, but little room for a hero.
3. **A daily quest with one boss**: a repeating loop (walk home → drop coin) compressed by a counter, whose repetition is broken once — by a turn-based battle against *Temptation* — then paid off at the shop.

**Chosen: 3.** The first idea for "saves coins" is a piggy-bank gag; here the boring loop *is* the hero's power, and the genre's own grammar (status bar, battle menu, level-up, item-get, save screen) carries the emotion. Opening: a PRESS START title with the boy walking in attract mode. Ending: not a victory lap but the **save screen**.

**Arc.** Setup — vow, jar, first coin (0–12 s). Montage — four seasons by palette, the counter spins, the jar fills (12–31 s). Turn — encounter swirl, battle, the cursor *stops* on SPEND, moves to SAVE (31–41 s). Ending — silence on day 364, shop, "Obtained: Red Kite", hill, save (41–60 s).

## Benchmark
Learn: mid-90s console RPG systems as language (windows, cursor hesitation, battle messages, item fanfare), palette-by-table tricks, integer-pixel cameras. Don't take: any existing game's characters, UI frames, fonts or melodies.

## Palette plan
ENDESGA-32 master palette (free). **Protected colours**: the coin's two golds (and the kite's red) are exempt from every season table — they are the thread through the film. Seasons: spring (pastel greens, identity+lift), summer (identity), autumn (greens → ochres/rust), winter (blue-greys, warm hues kept for the gold). Finale floods back to full colour by dither wave.

## Shot list
| # | Time | Framing | Why |
|---|---|---|---|
| 1 | 0–4 | Title screen, attract-mode boy walking, PRESS START blinks, mosaic into the room | genre hook |
| 2 | 4–12 | Bedroom, locked frame, dialog on bottom quarter, jar on shelf, first coin | the vow, UI as narration |
| 3 | 12–31 | Side-scroll road with parallax, boy loops walk→house; HUD DAY/G spin; jar inset fills; four palette seasons | "every day" as rhythm |
| 4 | 31–41 | Encounter swirl → battle side view: Temptation (candy slime) vs boy; menu ATTACK/SPEND/SAVE; cursor stops; SAVE; level up | the turn |
| 5 | 41–47 | Locked room, winter palette, music out; day 364 → 365; last coin; jar full | silence before the payoff |
| 6 | 47–55 | Shop interior, shopkeeper dialog, YES/NO, jar empties by HUD tick-down, item-get fanfare | payoff |
| 7 | 55–60 | Hilltop, back view, red kite against full colour; save screen "FILE 1 · 366 DAYS" | ending that echoes the opening |

## Beat sheet / cue map
120 bpm (0.5 s/beat), 4/4, 2 s/bar, 30 bars. A title (0–4, 2 bars) · B room (4–12, 4 bars) · C seasons (12–31 ≈ 9.5 bars, key rises per season) · D battle (31–41, 5 bars, faster arpeggio) · E silence (41–45 total silence, then 45–47 one pulse note) · F shop (47–55) · G hill/save (55–60).
Voice lines at 5.0, 13.8, 32.0, 37.0, 42.2, 49.0, 56.0.

## Sound design table
| Section | Foley | Music |
|---|---|---|
| A | title blips | pulse-wave jingle, echo |
| B | text blips (pitch per speaker), coin drop clink + echo | soft triangle bass + pulse 25% lead |
| C | footsteps (echoed), coin clink per day, season bit-drop at palette change | motif in 4 keys; one layer lost in winter |
| D | swirl whoosh, menu blips, cursor stop (silence), noise-drum hits, level-up fanfare | battle arpeggio, LFSR drums |
| E | **true zero**, then one footstep and the last clink | none |
| F | shop bell, HP-style tick-down per coin, item-get jingle | gentle shop theme |
| G | wind, kite flutter, save ticks | the motif resolved on the tonic |

## Subtitle and title design
The dialog box is the subtitle: rounded ink/white/silver border, dithered dark-blue fill, 32×32 portrait left, Press Start 2P (OFL) as the pixel face typed at ~38 chars/s, ▼ blink. Title in the pixel font at 2× with an ink outline.

## Native moves used
Protected colour match cut (coin gold, kite red) · palette seasons / flood · game UI as narration · encounter swirl · level up · save screen ending.
