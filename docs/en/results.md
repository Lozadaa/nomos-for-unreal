# Results

Two experiments, both on 2026-11-10, on one Windows PC with Unreal 5.9. Each gave the same written brief to two setups:

- **Agent alone:** one Claude Opus agent, no Nomos, no skills.
- **Nomos:** a director, one Opus worker and one Sonnet reviewer.

Blind judges (Claude Sonnet) then scored screenshots of each packaged `.exe` running in demo mode, without knowing which was which. The rubric has ten criteria worth 3 points each.

## Trompo: Nomos ahead

A spinning-top game: launch yours and knock the others out of the ring.

| | Agent alone | Nomos |
|---|---:|---:|
| Judges' score | 18 / 30 | **23.5 / 30** |
| Brief to packaged `.exe` | 39 min 49 s | **30 min 54 s** |
| Polish failures | 3 | **0** |
| Human interventions | 0 | 0 |
| Lines of game code added | 1,690 | 986 |

"Polish failures" counts engine defaults left in the game: here, a HUD drawn without proper widgets (twice) and no loading screen.

Nomos scored higher on 6 of the 9 criteria the judges scored. The lone agent did better on two: its launch mechanic was easier to understand, and its tops were bigger and looked more like tops.

**Nomos missed the target set before the run**, which was 24 points and an 8-point lead. It got 23.5 and a 5.5-point lead. The reasons:

- The worker kept the seed project's high camera, although the brief asked for a low side view.
- The demo won in 10–20 seconds instead of about 60, so the judges never saw the menu.
- The seed's loading screen was too dark to pass Nomos's own image check.

Given 30 more minutes, Nomos fixed the camera, enlarged the tops and stretched the match to three launches. That second version still started on a black frame and was not judged.

## Candela: Nomos behind

The first experiment, a game about throwing an ember to light lanterns.

| | Agent alone | Nomos |
|---|---:|---:|
| Judge's score | **22 / 30** | 14 / 30 |
| Brief to finish | 63 min (about 23 without a stall in the test setup) | 39 min |
| Polish failures | 4 | **0** |
| Human interventions | 1 | 2 |

The Nomos game was too dark to read. The seed project started with a very dim sun and nothing in the task asked for a readable image. An earlier Nomos attempt was stopped after 26 minutes because the director had read only the first 90 characters of the brief and planned a different game.

## What changed between the two

- A small game goes to a single worker instead of being split.
- The worker and the reviewer look at screenshots of the game.
- An automatic check measures the image: pure black, empty screens, a hero you can't see.
- The seed project starts with light, sky and camera already set.
- The director receives the whole brief.

## Other measurements

| | |
|---|---|
| Driving the Unreal editor over MCP | 4–26 ms per call, against 0.7–2.3 s through the older file queue ([notes, Spanish](../investigacion/mcp-59.md)) |
| Web build (WebAssembly + WebGPU) | 55.4 MB download, packaged in 15 min 20 s with the stock Launcher engine ([notes, Spanish](../investigacion/checkpoint.md)) |

## Limits of these numbers

- One run per setup. No repeats, so no idea of the spread.
- The judges saw five to seven screenshots per game, not the game itself.
- Nobody has played these games with a mouse; they were measured in demo mode.
- Sound was scored by reading the code, not by listening.
- Token counts were taken differently for each setup and are not comparable.

Full data, in Spanish: [Trompo](../demo/comparativa-trompo.md) · [Candela](../demo/comparativa.md).
