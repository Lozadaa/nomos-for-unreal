<p align="center">
  <img src="docs/media/nomos-banner.svg" alt="Nomos for Unreal: your Unreal game studio, run by AI" width="720">
</p>

<p align="center"><b>Describe a small game. A team of Claude Code agents builds it in Unreal Engine and hands you a packaged <code>.exe</code>.</b><br>
For jam entries and prototypes that should still look finished.</p>

<p align="center"><img src="docs/capturas-panel-v2/inicio-escritorio-oscuro.png" alt="The Nomos panel: what is being built, by whom, and what is waiting on you" width="85%"></p>

## How it works

1. **You write a brief** in plain language, in the panel chat.
2. **A director agent turns it into tasks**, each with a clear definition of done.
3. **Worker agents build them** in your Unreal project. A separate agent reviews each one and sends it back if it falls short.
4. **Nomos packages the game** and checks that it doesn't ship with engine defaults (Unreal's stock font, no loading screen) or a screen you can't read.

You watch from a local web panel and step in only when a decision is yours, such as approving a result or choosing between two conflicting versions.

## Install

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.ps1 | iex
```

**macOS / Linux** (written but never run)

```bash
curl -fsSL https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.sh | bash
```

You need Git, Node.js 25+, Claude Code and Unreal Engine 5.8 or 5.9. The installer tells you how to get whatever is missing, never asks for admin rights, and adds a `nomos` command. If something fails, `nomos doctor` lists what is missing. Details, manual install and uninstall: [install guide](docs/en/install.md).

Nomos runs on your own Claude Code plan. In our runs a small game used about 9 to 10 million input tokens, most of them cached.

## Your first game

In PowerShell (or any shell on macOS / Linux):

```bash
nomos nuevo MyGame                              # creates an Unreal project with Nomos inside
cd "$HOME/Documents/Unreal Projects/MyGame"
claude                                          # then type /nomos
```

`/nomos` opens the panel. Send your brief in its chat, for example:

> A spinning-top game: launch yours and win by knocking the others out of the ring. Low side camera, readable at 1280×720.

Then watch the panel. A game this size took 30 to 40 minutes in our runs. When the task reaches "done", the game is in `Empaquetado/Windows/MyGame.exe` inside the project folder.

## Does it help?

Same brief, same PC: one Claude Opus agent working alone against Nomos. Two blind judges scored screenshots of each packaged game.

| | Agent alone | **Nomos** |
|---|---:|---:|
| Judges' score | 18 / 30 | **23.5 / 30** |
| Brief to packaged `.exe` | 39 min 49 s | **30 min 54 s** |
| Engine defaults left in the game | 3 | **0** |
| Human interventions | 0 | 0 |

This is one run, and Nomos lost the experiment before it, 14 to 22. Both are written up in [results](docs/en/results.md), along with what changed in between.

## What you get

| | |
|---|---|
| **Brief to build** | From a paragraph of text to a packaged game, with a review on every task. |
| **Finished, not default** | Custom HUD fonts, a loading screen, proper textures. A game that still shows engine defaults doesn't pass. |
| **Someone looks at the screen** | Workers and reviewers check real screenshots, and an automatic check catches black or empty frames. |
| **Right-sized teams** | A game that fits in an hour goes to one worker. Work is split only when it pays off. |
| **Team jams** | Everyone runs their own Nomos and syncs over Git. [Team guide](docs/en/team-jam.md). |
| **Extras** | Web builds, generated 3D props and a sound library, all optional. [Setup](docs/en/install.md#optional-tools). |

## Good to know

- **Windows 11 is the only tested platform.** The macOS and Linux installers exist but have never been run.
- **The panel is in English; the rest is in Spanish.** That covers the CLI commands (`nomos nuevo` means "new"), the agents' instructions and what Nomos writes in the chat. You can write your brief in English.
- **Not tested yet:** a team on two real machines, web builds outside desktop Chromium, and the sound library with a real account.

## Docs

[Install and setup](docs/en/install.md) · [Team jam](docs/en/team-jam.md) · [Results](docs/en/results.md) · [Reference](docs/en/reference.md) (panel, CLI, configuration)

Everything else under `docs/` and `skills/` is in Spanish.

## License and credits

[MIT](LICENSE). Panel fonts (Barlow Condensed, Instrument Sans, Geist Mono) and seed fonts (Caveat Brush, Patrick Hand) under the SIL Open Font License. Logo drawn with Codex for this project. Unreal Engine is a trademark of Epic Games; Nomos is not affiliated with Epic Games, Anthropic or OpenAI.
