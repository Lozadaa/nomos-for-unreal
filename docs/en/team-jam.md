# A team jam with Nomos

Each person works on their own PC with their own Nomos. You sync through Git, so you don't need to be on the same network or online at the same time. Every minute, Nomos pulls what the others have published.

The CLI commands are in Spanish. The ones used here: `nuevo` (new), `equipo` (team), `frente` (the part of the game you own).

## 1. Install

| Tool | Check with |
|---|---|
| Git | `git --version` |
| Git LFS | `git lfs version` (and once: `git lfs install`) |
| Node 25 or newer | `node --version` |
| Claude Code | `claude --version` |
| Unreal 5.9 MegaJam Preview | Epic Games Launcher → Unreal Engine → Library |

## 2. Clone the game

```powershell
git clone <game-repo-url>
cd <game>
.\nomos.cmd doctor --data .nomos
```

`doctor` tells you what is missing. The game already carries Nomos inside it (`Tools/Nomos`). If there is no game yet, one person creates it with `nomos nuevo <Name>` and pushes it.

## 3. Open Nomos and pick your part

In the game folder, open Claude Code and type `/nomos`. It asks for your name and your part of the game ("combat", "UI", "levels"…). That is the same as:

```powershell
.\nomos.cmd team init --name Ana --frente UI --data .nomos
```

If someone already has that part, Nomos tells you and you share it. To change it: `.\nomos.cmd team frente audio --data .nomos`.

## 4. See what the others are doing

```powershell
.\nomos.cmd equipo --data .nomos
```

The output is in Spanish. It shows, for each person: their part, whether they are present, how up to date their `main` is, what they are doing now and what they finished last.

```text
Richard (combate) · presente · main 4e3fa41, al día
  haciendo: Lanzamiento de la brasa [implementando] · reserva L_Patio hasta 16:40
  hecho:    Sombras que nacen en los bordes (hace 12 min)
Ana (UI) · ausente 40 min · main 9ab948d, 2 commits atrás
```

The **Team** strip in the panel's Production view shows the same thing. Click someone else's task to ask them for something.

When someone merges, your `main` updates on its own. If you have uncommitted changes, Nomos leaves them alone and tells you; run `git pull` when you're done.

## 5. When someone has a map reserved

Your task waits, and the panel says who holds the map and until when. You don't need to do anything: the task starts by itself when they finish. If you're in a hurry, ask from the panel or with:

```powershell
.\nomos.cmd team ask --to Richard "I need L_Patio for the lights" --data .nomos
```

Two people never edit the same `.umap` at once. If they collide without a reservation, the merge stops and you choose which version to keep under "To approve" in the panel.

## 6. Ten-minute test, before the jam

Do it together, each on your own PC, with the game repo already on GitHub.

1. Everyone: clone, `/nomos`, pick a part. `nomos equipo` shows the others as present.
2. Each person asks their Nomos for a tiny task in a folder of their own, for example "Add docs/hello-ana.md with one line".
3. Wait for it to merge (it appears under `hecho` in your `nomos equipo`).
4. Within two minutes, each of you sees the other's task as done and your `main` says `al día` (up to date).
5. One person reserves a map (a task on that `.umap`); the other creates a task on the same map. It should wait.

If a step fails, write down what `nomos equipo` and the panel showed before touching anything.

## 7. Asking for work and checking it

- A game or a change that fits in an hour is **one task** for one worker. Ask for all of it in a single message.
- To see how the game reads: `pwsh -File Scripts/capturar.ps1 -Demo` saves three screenshots in `docs/capturas/` (start, middle, end) and runs the image check on them. Open them yourself too.

## Not tested yet

- **Two real machines with GitHub and Git LFS.** The test was done with two clones on one PC and a local remote. GitHub credentials, LFS with large maps and slow networks are untested, which is why the ten-minute test exists.
- `nomos nuevo` was tested on one PC with Unreal 5.9, not on other machines.

Spanish original: [jam-equipo.md](../jam-equipo.md).
