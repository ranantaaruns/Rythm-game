# Neon Beats

A 4-lane vertical scrolling rhythm game (VSRG) in plain HTML5 + CSS + JavaScript.
No build step, no dependencies, no assets — the song and its chart are generated
deterministically and the music is synthesized live with the Web Audio API.

## Run

Open `index.html` in any modern browser (double-click works), or serve the folder:

    python -m http.server 8137
    # then open http://localhost:8137

Click START (the click also unlocks Web Audio).

## Controls

- Keys: `D F J K`  or  `← ↓ ↑ →`
- Touch/mouse: tap a lane
- `Esc`: pause / resume

## Scoring

| Judgment | Window    | Weight |
|----------|-----------|--------|
| PERFECT  | ≤ 50 ms   | 100 %  |
| GREAT    | ≤ 100 ms  | 70 %   |
| GOOD     | ≤ 150 ms  | 40 %   |
| MISS     | > 150 ms  | 0 %    |

Score is normalized to 1,000,000. Health starts at 100 (Perfect +1, Great 0,
Good −3, Miss −10); at 0 the track fails with rank **F**. Otherwise ranks are
S ≥ 95 %, A ≥ 90 %, B ≥ 80 %, C ≥ 70 %, else D.

## Difficulties

| Difficulty | Length  | Notes | Density |
|------------|---------|-------|---------|
| easy       | 29.1 s  | 33    | 1.1 /s  |
| normal     | 43.6 s  | 103   | 2.4 /s  |
| hard       | 58.2 s  | 224   | 3.9 /s  |

All three are generated from a seeded PRNG, so a given difficulty always yields
the identical chart and music.

## Files

- `js/song.js` — deterministic chart + music generator (unit-tested)
- `js/judge.js` — timing windows, score weights, ranks (unit-tested)
- `js/audio.js` — Web Audio synth and 25 ms lookahead scheduler
- `js/game.js` — state machine, canvas rendering, input, HUD
- `test/` — run with `node --test test/*.test.js`

Timing is driven by `AudioContext.currentTime` (not `performance.now()`), so
audio and notes cannot drift apart; pause simply suspends the context.
