# Install and setup

This page covers what you need, the installers, installing by hand, optional tools and uninstalling.

## Installers

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.ps1 | iex
```

macOS / Linux (written but never run):

```bash
curl -fsSL https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.sh | bash
```

## After installing

`nomos nuevo MyGame` creates the project in `Documents/Unreal Projects/MyGame`. Open a terminal there, run `claude` and type `/nomos`. The finished game ends up in `Empaquetado/Windows/MyGame.exe` inside that folder. In our runs a small game used about 9 to 10 million input tokens, most of them cached.

## What you need

| Tool | Check with |
|---|---|
| Git with Git LFS | `git --version`, `git lfs version` |
| Node.js 25 or newer | `node --version` |
| Claude Code | `claude --version` |
| Unreal Engine 5.8 or 5.9 | Epic Games Launcher → Unreal Engine → Library |

Epic calls the 5.9 MegaJam Preview unstable. Nomos works on it, but expect engine bugs.

The installer checks for these and tells you how to get whatever is missing. It never installs system software and never asks for admin rights.

## What the installer does

1. Clones Nomos into `~/.nomos/app`.
2. Links its skills into `~/.claude/skills`. If a skill with the same name is already there and isn't from this install, it is left alone and you get a warning.
3. Puts a `nomos` command on your user PATH.
4. Runs `nomos doctor`, which lists anything still missing.

Run the installer again to update.

## Platform support

| Platform | Status |
|---|---|
| Windows 11 | Tested: installer, service, panel, workers, Unreal 5.8 / 5.9 builds and packaging |
| macOS | Written but never run. Looks for the engine in `/Users/Shared/Epic Games/UE_5.x` |
| Linux | Written but never run. Finds the engine through the project's `EngineAssociation` or `NOMOS_UNREAL_ROOT` |

## Install by hand

```bash
git clone https://github.com/Lozadaa/nomos-for-unreal nomos
cd nomos
npm --prefix panel ci && npm run build
node skills/nomos/scripts/nomos.ts nuevo MyGame
```

Only the panel has npm dependencies; the service has none.

## Add Nomos to a game you already have

`nomos nuevo` creates a new game with Nomos inside. For an existing Unreal project:

```bash
nomos embed "<path to game>"            # first time
nomos embed "<path to game>" --update   # later, to pick up a newer Nomos
```

This copies Nomos into `Tools/Nomos` in the game, so teammates get it by cloning the game. It does not commit; review and commit the change yourself.

Updating means restarting that game's Nomos service, and a restart stops any worker that is in the middle of a task. Update when nothing is running.

## Settings for the installer

Set these as environment variables before running it.

| Variable | What it changes | Default |
|---|---|---|
| `NOMOS_HOME` | Where Nomos lives | `~/.nomos` |
| `NOMOS_REPO` | Repository to clone from | the official one |
| `NOMOS_BRANCH` | Branch to install | `main` |
| `CLAUDE_SKILLS_DIR` | Where skills are linked | `~/.claude/skills` |
| `NOMOS_BIN_DIR` | Where the `nomos` command goes | `~/.nomos/bin` (Windows), `~/.local/bin` (macOS / Linux) |
| `NOMOS_NO_MODIFY_PATH=1` | Leave your PATH untouched | off |
| `NOMOS_UNREAL_ROOT` | The engine folder, the one that contains `Engine/` | found automatically |

## Optional tools

None of these are needed for a first game.

| Tool | What it adds |
|---|---|
| Orca | A visible terminal for each worker ([details, Spanish](../workers-proveedores.md)) |
| emsdk 6.0.10 | Web builds |
| Python with Pillow | The automatic screenshot check |
| ffmpeg | Recording videos of the game |
| A Meshy account | Generated 3D props |
| A WeLoveIndies account | Sound effects and music |

### Meshy keys

Nomos can rotate between several Meshy accounts. Keys are stored on your machine and never go into a repository.

- **Windows:** `powershell -ExecutionPolicy Bypass -File scripts\guardar-claves-meshy.ps1`. Keys are encrypted for your Windows user.
- **macOS / Linux (never run):** `bash scripts/guardar-claves-meshy.sh`, which writes `~/.nomos/meshy-claves.json` readable only by you. Or set `MESHY_API_KEY`.

### WeLoveIndies sound

`nomos sonido login` opens a separate Chrome window where you sign in yourself. After that:

| Command | Does |
|---|---|
| `nomos sonido buscar` | Search |
| `nomos sonido bajar` | Download |
| `nomos sonido importar` | Import into the Unreal project |

A real sign-in and download has not been tested yet ([notes, Spanish](../investigacion/weloveindies.md)).

## Uninstall

1. Delete `~/.nomos`.
2. In `~/.claude/skills`, remove the links that point into `~/.nomos/app`.
3. Windows: remove `~/.nomos/bin` from your user PATH. macOS / Linux: delete `~/.local/bin/nomos`.
