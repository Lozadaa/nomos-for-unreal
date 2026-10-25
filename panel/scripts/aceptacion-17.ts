// Desde la raíz, tras `npm run build`:  node panel/scripts/aceptacion-17.ts "<carpeta del juego>" [puerto]
// Aceptación del hito 17 con datos nuevos `.nomos-hito17`: una build estampada con HEAD → al día; con un commit viejo → aviso.
// El paquete de prueba vive en `<datos>/artifacts/tests/aceptacion-17/` (lo ve solo este servicio, nunca el del 8780).
// El token nunca se imprime.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const game = resolve(process.argv[2] ?? '.'), port = Number(process.argv[3] ?? 18870)
const cli = resolve(import.meta.dirname, '../../service/src/cli.ts'), out = resolve(import.meta.dirname, '../../docs/capturas-17')
const data = join(game, '.nomos-hito17'), name = readdirSync(game).find((f) => f.endsWith('.uproject'))!.replace(/\.uproject$/, '')
const nomos = (...args: string[]) => execFileSync(process.execPath, [cli, ...args, '--data', data], { cwd: game, encoding: 'utf8' }).trim()
const git = (...args: string[]) => execFileSync('git', args, { cwd: game, encoding: 'utf8' }).trim()
const health = async (p: number) => { try { return (await fetch(`http://127.0.0.1:${p}/health`)).status } catch { return 'caído' } }
const log = (line: string) => console.log(line)

log(`8780 antes: ${await health(8780)}`)
log(nomos('start', '--port', String(port), '--no-open').split('\n').filter((l) => !l.startsWith('URL')).join(' '))
const token = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')).token as string
const auth = { Authorization: `Bearer ${token}` }, origin = `http://127.0.0.1:${port}`
const pkg = join(data, 'artifacts', 'tests', 'aceptacion-17', 'build', 'Windows')
mkdirSync(pkg, { recursive: true }); writeFileSync(join(pkg, `${name}.exe`), 'MZ')
const play = async () => (await (await fetch(`${origin}/play`, { headers: auth })).json()).build
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const head = git('rev-parse', 'HEAD'), main = git('branch', '--show-current')
  log(`rama principal ${main}, HEAD ${head.slice(0, 7)}`)
  log(nomos('build', 'stamp', pkg))
  let build = await play()
  log(`estampada con HEAD → commit ${build.commit.slice(0, 7)}, stale ${build.stale}; play --status: «${JSON.parse(nomos('play', '--status')).text}»`)
  assert.equal(build.commit, head); assert.equal(build.stale, false)
  const old = git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0]
  writeFileSync(join(pkg, 'build-info.json'), JSON.stringify({ commit: old, branch: 'rama-vieja', builtAt: new Date().toISOString(), task: null, run: null }))
  build = await play()
  log(`estampada con ${old.slice(0, 7)} (primer commit) → stale ${build.stale}; play --status: «${JSON.parse(nomos('play', '--status')).text}»`)
  assert.equal(build.stale, true)
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1'))
  await page.goto(`${origin}/#token=${token}`)
  const note = page.getByText('Esta build no incluye los últimos cambios de main')
  await note.waitFor()
  await page.locator('header').getByRole('button', { name: 'Jugar' }).hover()
  await page.locator('[data-slot="tooltip-content"]').getByText('Esta build no incluye los últimos cambios de main').waitFor()
  await page.waitForTimeout(400)
  mkdirSync(out, { recursive: true })
  await page.screenshot({ path: join(out, 'produccion-build-anterior-a-main-1920.png') })
  log(`panel: aviso visible, Jugar ${await page.locator('header').getByRole('button', { name: 'Jugar' }).isEnabled() ? 'activo' : 'desactivado'}; captura docs/capturas-17/produccion-build-anterior-a-main-1920.png`)
  assert.equal(await page.locator('body').textContent().then((t) => t!.includes(old.slice(0, 7)) || t!.includes(token)), false)
} finally {
  await browser.close()
  log(nomos('stop'))
  log(`8780 después: ${await health(8780)}`)
}
