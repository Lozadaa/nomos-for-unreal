import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute, sep } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Lector ZIP mínimo para la caché del plugin Fab: solo `store` (0) y `deflate` (8), sin ZIP64 ni cifrado.
 * Lee el directorio central (fiable aunque las cabeceras locales lleven descriptor de datos).
 */
export function extractZip(file: string, destination: string): string[] {
  const zip = readFileSync(file);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('zip_unsupported');
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new Error('zip_unsupported');
  const root = resolve(destination), written: string[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip_unsupported');
    const flags = zip.readUInt16LE(offset + 8), method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20), nameLength = zip.readUInt16LE(offset + 28);
    const extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    // bit 11: nombre en UTF-8 (packs con emoji); sin él, CP437, que para ASCII coincide
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? 'utf8' : 'latin1');
    offset += 46 + nameLength + extra + comment;
    if (flags & 1 || ![0, 8].includes(method)) throw new Error('zip_unsupported');
    const target = resolve(root, name);
    const inside = relative(root, target);
    if (!inside || inside.startsWith('..' + sep) || inside === '..' || isAbsolute(inside)) throw new Error('zip_unsafe_path');
    if (name.endsWith('/')) { mkdirSync(target, {recursive: true}); continue; }
    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('zip_unsupported');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    mkdirSync(dirname(target), {recursive: true});
    writeFileSync(target, method === 8 ? inflateRawSync(data) : data, {flag: 'wx'});
    written.push(join(inside));
  }
  return written;
}

/** ZIP sin comprimir (`store`) de archivos sueltos; para los fotogramas de una animación cuando no hay ffmpeg. */
export function writeZip(files: {name: string; path: string}[], out: string): void {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const {name, path} of files) {
    const data = readFileSync(path), nameBytes = Buffer.from(name, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, data); central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(out, Buffer.concat([...parts, directory, end]));
}
