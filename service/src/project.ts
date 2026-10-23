import { readdirSync } from "node:fs";
import { dirname } from "node:path";

export type ProjectInfo = { name: string; uproject: string } | null;

/** Busca un .uproject en la carpeta de datos y, si no hay, en su padre. */
export function projectInfo(dataDir: string | undefined): ProjectInfo {
  if (!dataDir) return null;
  for (const dir of [dataDir, dirname(dataDir)]) {
    try {
      const file = readdirSync(dir).filter(name => name.endsWith(".uproject")).sort()[0];
      if (file) return { name: file.slice(0, -".uproject".length), uproject: file };
    } catch { /* carpeta ilegible: se prueba la siguiente */ }
  }
  return null;
}
