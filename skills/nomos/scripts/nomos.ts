import { join } from "node:path";
import { pathToFileURL } from "node:url";
await import(pathToFileURL(join(import.meta.dirname, "../../../service/src/cli.ts")).href);
