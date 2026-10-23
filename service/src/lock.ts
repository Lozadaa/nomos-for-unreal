import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function acquireLock(dataDir: string, name: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  // La reserva SQLite pertenece al SO y se libera incluso si el dueño muere.
  const db = new DatabaseSync(join(dataDir, `${name}.lock.db`));
  // IMMEDIATE reserva al único escritor sin bloquear las lecturas de apertura
  // de los candidatos; EXCLUSIVE puede hacer que dos aperturas se rechacen.
  try { db.exec("pragma busy_timeout=0; begin immediate"); }
  catch (error) {
    db.close();
    if ((error as Error).message.includes("locked")) {
      throw new Error(name === "watcher" ? "Ya hay un vigilante activo en esta carpeta" : "Arranque en curso");
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true; db.exec("rollback"); db.close();
  };
}
