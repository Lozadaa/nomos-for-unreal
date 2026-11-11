<p align="center">
  <img src="docs/media/nomos-banner.svg" alt="Nomos for Unreal: your Unreal game studio, run by AI" width="720">
</p>

<p align="center"><b>Make Unreal Engine games with a team of Claude Code agents. You write the brief; Nomos plans the work, hands it out, reviews it and ships a packaged game.</b><br>
For anyone who wants to ship a small game (a jam entry, a prototype) without giving up on polish.</p>

## Install

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.ps1 | iex
```

**macOS / Linux** (untested, see [platform support](#platform-support))

```bash
curl -fsSL https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.sh | bash
```

The installer checks for Git, Node.js 25+ and Claude Code and tells you exactly how to get whatever is missing (it never installs system software and never asks for admin rights). Then it clones Nomos into `~/.nomos/app`, links its skills into `~/.claude/skills`, puts a `nomos` command on your user PATH and runs `nomos doctor`. Run it again to update.

## Quick start

```bash
nomos nuevo MyGame                              # a C++ Unreal project with Nomos inside
cd "$HOME/Documents/Unreal Projects/MyGame"
claude                                          # then type /nomos: it starts the service and opens the panel
```

Send your first brief in the panel chat, for example: *"A spinning-top game: launch yours and win by knocking the others out of the ring. Low side camera, readable at 1280×720."*

## The numbers

Same brief, same PC, Unreal 5.9: one Opus agent on its own against Nomos. Two blind judges scored screenshots of the packaged `.exe`.

| | Agent alone | **Nomos** |
|---|---:|---:|
| Judges' score | 18 / 30 | **23.5 / 30** |
| Brief to packaged `.exe` | 39 min 49 s | **30 min 54 s** |
| Polish failures (`revisar_acabado.py`) | 3 | **0** |
| Human interventions | 0 | **0** |

Source: [docs/demo/comparativa-trompo.md](docs/demo/comparativa-trompo.md).

| Also measured | |
|---|---|
| Unreal MCP call, editor running offscreen | **4–26 ms** per call, against 0.7–2.3 s for the file queue ([mcp-59.md](docs/investigacion/mcp-59.md)) |
| Web build (WebAssembly + WebGPU), Shipping | **55.4 MB** download, packaged in **15 min 20 s** with the stock Launcher engine ([checkpoint.md](docs/investigacion/checkpoint.md)) |

**Nomos lost the first match.** On *Candela* the lone agent scored 22/30 and Nomos 14/30: the game was too dark to read. Since then a small game goes to a single worker, the worker and the reviewer look at screenshots, a check measures the image, and the seed project starts with light, sky and camera already set. Caveats: one run per branch, and nobody has played these games with a mouse (they were measured in demo mode). Full data in [comparativa-trompo.md](docs/demo/comparativa-trompo.md) and [comparativa.md](docs/demo/comparativa.md).

## Features

| | |
|---|---|
| **Brief to build** | Write what you want; the director turns it into tasks with acceptance criteria, hands them out, asks for an independent review and closes with a packaged game. |
| **Right-sized teams** | Anything that fits in an hour goes to one worker; work is split only when it pays off. |
| **Polish is mandatory** | No engine defaults: custom HUD fonts, a loading screen, cooked textures. `revisar_acabado.py` blocks the finish if anything is missing. |
| **Eyes on the image** | `revisar_imagen.py` flags pure black, empty screens and a hero you can't read. |
| **Team sync over Git** | Everyone runs their own Nomos; every minute each one pulls what the others publish. |
| **Web builds** | WebAssembly + WebGPU from the Launcher engine, no source build of Unreal. |
| **Tooling** | Unreal 5.9 MCP, Meshy with several accounts for hard-surface props, WeLoveIndies sound with your own session. |
| **Local panel** | What is being done, who is doing it and what is waiting on you, at a glance. |

The panel is in English. The skills, the worker briefs, the CLI messages and what Nomos writes in the chat are in Spanish, which is how this project is run.

## Platform support

| Platform | Status |
|---|---|
| Windows 11 | Tested: installer, service, panel, workers, Unreal 5.8 / 5.9 builds and packaging |
| macOS | Untested. The installer, engine lookup (`/Users/Shared/Epic Games/UE_5.x`), `.sh` build scripts and Meshy key script are written but have never been run |
| Linux | Untested. Same as macOS; the engine comes from `EngineAssociation` or `NOMOS_UNREAL_ROOT` |

<details>
<summary><b>Requirements</b></summary>

- Node.js 25+, Git with Git LFS, Claude Code (`claude` on the PATH).
- Unreal Engine 5.8 or 5.9 (Epic calls the 5.9 MegaJam Preview unstable: [ue59-preview.md](skills/ue-oficio/references/ue59-preview.md)).
- Optional: [Orca](docs/workers-proveedores.md) (visible terminals for the workers), emsdk 6.0.10 (web build), Python with Pillow (image check), ffmpeg (videos), a Meshy account, a WeLoveIndies account.

</details>

<details>
<summary><b>Manual install, environment variables and uninstall</b></summary>

Manual install from a clone:

```bash
git clone https://github.com/Lozadaa/nomos-for-unreal nomos
cd nomos
npm --prefix panel ci && npm run build      # the panel; the service has no npm dependencies
node skills/nomos/scripts/nomos.ts nuevo MyGame
```

Installer overrides: `NOMOS_HOME` (default `~/.nomos`), `NOMOS_REPO`, `NOMOS_BRANCH`, `CLAUDE_SKILLS_DIR`, `NOMOS_BIN_DIR`, `NOMOS_NO_MODIFY_PATH=1`. Engine location: `NOMOS_UNREAL_ROOT` (the folder that contains `Engine/`).

If a skill with the same name already exists in `~/.claude/skills` and it isn't from this install, the installer leaves it alone and warns you.

Uninstall: delete `~/.nomos`, remove the skill links in `~/.claude/skills` that point into `~/.nomos/app`, and remove `~/.nomos/bin` from your user PATH (Windows) or delete `~/.local/bin/nomos` (macOS / Linux).

To use `/nomos` in a game that didn't come from `nomos nuevo`, embed Nomos in the game repo with `nomos embed "<path to game>"` ([reference](docs/referencia.md)).

</details>

<details>
<summary><b>Team jams, Meshy and sound</b></summary>

- **Team jam:** [docs/jam-equipo.md](docs/jam-equipo.md) (install, clone, pick a front, 10-minute test).
- **Meshy with several accounts:** on Windows `powershell -ExecutionPolicy Bypass -File scripts\guardar-claves-meshy.ps1` (keys encrypted with DPAPI for your Windows user); on macOS / Linux `bash scripts/guardar-claves-meshy.sh` (stored in `~/.nomos/meshy-claves.json` with mode 600, untested) or set `MESHY_API_KEY`. Keys never go into a repository.
- **WeLoveIndies sound:** `nomos sonido login` opens a separate Chrome so you sign in yourself; then `nomos sonido buscar`, `bajar` and `importar` ([how](docs/investigacion/weloveindies.md)).

</details>

## Docs

[Technical reference](docs/referencia.md) (panel, CLI, configuration, tests, security; in Spanish) ·
[director skill](skills/nomos/SKILL.md) · [Unreal craft](skills/ue-oficio/SKILL.md) ·
[web build](skills/ue-oficio/references/web.md) · [Unreal 5.9 MCP](docs/investigacion/mcp-59.md) ·
[delivery status](docs/estado-entregas.md)

## Status and limits

Works end to end on one Windows PC: brief, workers, review, polish and `.exe`. Not tested yet:

- Two real machines with GitHub and Git LFS (the team guide includes the test to run).
- The web game on phones, Firefox, Safari or uploaded to itch.io; it was tested on desktop Chromium with WebGPU.
- A real WeLoveIndies sign-in and download.
- macOS and Linux (see the table above).

## License and credits

[MIT](LICENSE). Panel fonts (Barlow Condensed, Instrument Sans, Geist Mono) and seed fonts (Caveat Brush, Patrick Hand) under the SIL Open Font License. Logo drawn with Codex for this project. Unreal Engine is a trademark of Epic Games; Nomos is not affiliated with Epic Games, Anthropic or OpenAI.
