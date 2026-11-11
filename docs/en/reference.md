# Reference

How to use the panel and the CLI, how to configure a game, and how the repository is laid out. To get started, see the [README](../../README.md).

The panel is in English. The CLI, the skills and what Nomos writes in the chat are in Spanish.

## Using the panel

Open Claude Code in the game folder (the one with the `.uproject`) and type `/nomos`. It starts the service on your machine, opens the panel and listens. Whatever you ask for, in the Claude chat or in the panel, becomes tasks with a scope, acceptance criteria and dependencies.

- **Production** shows tasks by stage (pending → ready → implementing → reviewing → testing → merging → closing → done), who is on each one and why a task is waiting.
- **Ctrl+K / ⌘K** searches tasks and views. With a task open, it can run its tests, merge it or close it.
- **Decisions** collects what only you can decide: budget, conflicts, a tool that has been down for a while.
- **Capabilities** tests each tool for real and tells you what is missing.

## CLI

| Command | Does |
|---|---|
| `nomos nuevo <Name>` | Create a new Unreal game with Nomos inside |
| `nomos embed <path>` | Add Nomos to an existing game (`--update` to refresh it) |
| `nomos start` / `stop` / `status` | Run, stop or inspect the service for this game |
| `nomos doctor` | List what is missing on this machine |
| `nomos pausar` / `reanudar` | Pause / resume the director |
| `nomos task create\|review\|check\|integrate\|finalize\|continue` | Move a task through its stages by hand |
| `nomos asset index\|search\|migrate` | Work with the asset catalogue |
| `nomos equipo` | Show what each teammate is doing ([team jam](team-jam.md)) |

Stopping the service stops any worker that is in the middle of a task. Stop it when nothing is running.

## Configuration

Each game has its own file at `<game>/.nomos/config.json`:

```json
{
  "concurrency": {"claude": 2, "codex": 0},
  "defaultProvider": "claude",
  "models": {"implementacion": "opus", "revisor": "sonnet", "qa": "sonnet", "integrador": "sonnet", "animacion": "sonnet"},
  "targetBranch": "master",
  "limits": {"corrections": 3},
  "visualTolerance": 0.02,
  "walkthrough": {"map": "/Game/Mapas/Prueba", "commands": ["stat fps", "stat unit", "r.VSync 0"], "trace": false}
}
```

| Key | Meaning |
|---|---|
| `concurrency` | How many workers of each kind may run at once. Codex is off unless you give it a number above 0 |
| `models` | Which Claude model each role uses (see below) |
| `targetBranch` | The branch finished work is merged into |
| `limits.corrections` | How many times a task may be sent back for fixes |
| `visualTolerance` | Share of pixels a screenshot may differ from its approved baseline in `<game>/docs/baseline/` |
| `walkthrough` | The map and console commands used when Nomos runs the packaged game. `trace: true` records an Unreal Insights trace, about 0.9 GB per 30 s |

| Role in `models` | Default | Who it is |
|---|---|---|
| `implementacion` | `opus` | The worker that builds a task |
| `revisor` | `sonnet` | The code reviewer |
| `qa` | `sonnet` | The visual check of UI screenshots |
| `integrador`, `animacion` | `sonnet` | Merging and animation |

## Repository layout

| Folder | Contents |
|---|---|
| `skills/nomos` | The director skill |
| `skills/ue-oficio` | Unreal know-how and the polish check the workers use |
| `service` | The local service (Node, no dependencies) and its Unreal scripts |
| `panel` | The web panel (Vite, React 19, Tailwind v4, shadcn/ui) |
| `tests` | Tests for the service and the CLI |
| `docs` | Plans, test records and research notes, mostly in Spanish |

## Tests

```bash
npm test                          # service and CLI
npm run test:panel                # panel unit tests
npm run build                     # production panel
cd panel && npx playwright test   # end-to-end, Chromium and Firefox
```

`node service/src/cli.ts seed --data .nomos` creates a sample production (12 tasks, events and a catalogue) that needs neither Unreal nor any optional tool. The end-to-end tests run on it.

## Security

The service listens only on `127.0.0.1`, and every route requires a token. The token lives in `<game>/.nomos/token`, readable only by you. Don't paste it into chats or tickets.

Restarting the service keeps the token, and an open panel reconnects on its own. To replace it, stop the service and run `nomos start --new-token`; old panel links then stop working and the panel says the session has expired.

## Old name

Nomos was called Kratos until 2026-10-24. Some paths under `docs/` and some content inside older games (`/Game/Kratos/...`) still carry that name.

## Credits

Panel fonts (Barlow Condensed, Instrument Sans, Geist Mono) and seed fonts (Caveat Brush, Patrick Hand) are under the SIL Open Font License. The logo was drawn with Codex for this project. Unreal Engine is a trademark of Epic Games.

Spanish original: [referencia.md](../referencia.md).
