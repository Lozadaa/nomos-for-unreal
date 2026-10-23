import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './route-fixture.ts';
import { upsertEntry } from '../../service/src/repo/catalog.ts';

test('GET /catalog/:id da thumbnailUrl y la miniatura se sirve solo dentro de las raíces del catálogo', async () => {
  const f = await fixture();
  try {
    const megascans = join(f.dir, 'Megascans'), outside = join(f.dir, 'otra');
    mkdirSync(join(megascans, 'abc'), {recursive: true}); mkdirSync(outside, {recursive: true});
    writeFileSync(join(f.dir, 'config.json'), JSON.stringify({megascansDir: megascans, projectsDir: join(f.dir, 'P'), vaultDir: join(f.dir, 'V'), fabCacheDirs: []}));
    writeFileSync(join(megascans, 'abc', 'abc.png'), 'png');
    writeFileSync(join(outside, 'robada.png'), 'png');
    writeFileSync(join(megascans, 'abc', 'notas.txt'), 'x');
    const base = {category: 'asset', description: '', source: 'megascans' as const};
    const ok = upsertEntry(f.db, {...base, name: 'Hudson', thumbnailPath: join(megascans, 'abc', 'abc.png')});
    const out = upsertEntry(f.db, {...base, name: 'Fuera', thumbnailPath: join(outside, 'robada.png')});
    const txt = upsertEntry(f.db, {...base, name: 'Texto', thumbnailPath: join(megascans, 'abc', 'notas.txt')});
    const none = upsertEntry(f.db, {...base, name: 'Sin', thumbnailPath: null});
    const detail = await (await f.request(`/catalog/${ok.id}`)).json();
    assert.equal(detail.thumbnailUrl, `/catalog/${ok.id}/thumbnail`);
    assert.equal(detail.verifiedEngine, null);
    const list = await (await f.request('/catalog')).json();
    assert.equal(list.find((e: any) => e.id === none.id).thumbnailUrl, null);
    const image = await f.request(`/catalog/${ok.id}/thumbnail`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('content-security-policy')!, /sandbox/);
    assert.equal((await f.request(`/catalog/${out.id}/thumbnail`)).status, 400);
    assert.equal((await f.request(`/catalog/${txt.id}/thumbnail`)).status, 400);
    assert.equal((await f.request(`/catalog/${none.id}/thumbnail`)).status, 404);
    assert.equal((await f.request('/catalog/nadie')).status, 404);
    assert.equal((await f.request(`/catalog/${ok.id}/thumbnail`, undefined, false)).status, 401);
  } finally { await f.close(); }
});
