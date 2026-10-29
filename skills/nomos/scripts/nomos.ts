import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// hito 30: embebida en el juego (`.claude/skills/nomos`), el servicio está en `<juego>/Tools/Nomos`
const own = join(import.meta.dirname, "../../../service/src/cli.ts");
await import(pathToFileURL(existsSync(own) ? own : join(import.meta.dirname, "../../../../Tools/Nomos/service/src/cli.ts")).href);
