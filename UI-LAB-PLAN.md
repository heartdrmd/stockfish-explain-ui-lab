# Stockfish.explain UI Lab

This repository is an isolated interface experiment based on production commit
`bc8c075393627fbb0adfe224c44cca29a428b745`. It does not share a Render service,
database, or environment with Stockfish Dev.

## Design thesis

- **Subject:** a serious chess practice and post-game analysis board.
- **Audience:** a player who wants to choose an opening quickly, play, then
  understand mistakes through Stockfish lines and move notation.
- **Single job:** keep the current chess position visible while presenting the
  one control or explanation needed for the current stage.

## Visual system

- **Board ivory:** `#f0d9b5`
- **Board walnut:** `#946f51`
- **Analysis blue:** `#3692e7`
- **Sound-move green:** `#629924`
- **Mistake amber:** `#e69900`
- **Blunder red:** `#df5454`

The board remains the visual anchor. Body text uses the existing readable UI
face; evaluations, notation, depth, and timing use the existing mono face.

## Layout

Desktop:

```text
[Stockfish.explain] [New] [Practice] [Games] [More]
[ confidence ] [ board + eval ] [ engine / moves / learn ]
```

Phone portrait:

```text
[SF.x LAB] [New] [Practice] [Games] [Sign in] [More]
[eval][ full board ]
[game/navigation actions]
[analysis drawer]
```

Phone landscape:

```text
[ board + eval ] [ analysis drawer ]
[ game actions ] [ engine / moves   ]
```

## First checkpoint

1. Remove header collisions and duplicate primary actions.
2. Keep the landscape analysis drawer beside the board instead of over it.
3. Remove page-level horizontal movement caused by board coordinates.
4. Give phone controls dependable touch targets.
5. Reorganize Practice into Opening, Opponent, Time, and Advanced sections.
6. Keep Start practice in a real footer that never covers the opening list.

No chess logic, engine ownership, evaluation convention, saved-game format, or
Learn from Mistakes grading rule changes in this checkpoint.

The Render lab fetches the official Lichess Stockfish 18 build and its NNUE
networks. Optional full-size custom piece-value engines are excluded from this
UI checkpoint; their committed lite fallbacks remain available.
