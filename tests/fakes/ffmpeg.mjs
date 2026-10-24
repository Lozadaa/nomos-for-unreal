// ffmpeg falso: `-version` y la codificación de una secuencia `-i <patrón> … <salida>` (escribe un MP4 de mentira)
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('-version')) console.log('ffmpeg version 8.1.2-fake Copyright (c) 2000-2026');
else {
  const input = args[args.indexOf('-i') + 1], out = args.at(-1);
  const frames = readdirSync(dirname(input)).filter(f => f.endsWith('.png')).length;
  writeFileSync(out, `mp4 falso: ${frames} fotogramas · ${args.join(' ')}`);
  console.log(`frame=${frames}`);
}
