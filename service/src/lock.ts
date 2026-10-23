import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export function acquireLock(dataDir: string, name: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, `${name}.lock`);
  const content = JSON.stringify({ pid: process.pid, id: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, content, { flag: "wx", mode: 0o600 });
      return () => {
        try { if (readFileSync(file, "utf8") === content) rmSync(file, { force: true }); } catch { /* ya retirado */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let dead = false;
      try { const lock = JSON.parse(readFileSync(file, "utf8")); process.kill(lock.pid, 0); }
      catch (cause) { dead = (cause as NodeJS.ErrnoException).code === "ESRCH"; }
      if (!dead) throw new Error(name === "watcher" ? "Ya hay un vigilante activo en esta carpeta" : "Arranque en curso");
      rmSync(file, { force: true });
    }
  }
  throw new Error("No se pudo reservar la carpeta");
}
