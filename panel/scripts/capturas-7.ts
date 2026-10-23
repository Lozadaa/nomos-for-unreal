// Desde panel/, después de npm run build: node scripts/capturas-7.ts
// Las diez vistas a 1366×768 y 1920×1080 contra un servicio sembrado propio (puerto y datos temporales).
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium } from '@playwright/test'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const out = resolve(import.meta.dirname, '../../docs/capturas-7')
const root = mkdtempSync(join(tmpdir(), 'kratos-capturas-7-'))
const data = join(root, '.kratos'), port = '18797'
const views = [
  ['produccion', '/'], ['detalle', '/?tarea=seed-task-04'], ['chat', '/chat'], ['actividad', '/actividad'], ['entregas', '/entregas'],
  ['catalogo', '/catalogo'], ['decisiones', '/decisiones'], ['presupuesto', '/presupuesto'], ['capacidades', '/capacidades'], ['estilo', '/estilo'],
] as const

writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')
execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
// estados del hito 7 visibles en la semilla: una espera de reserva y un arranque diferido porque Orca está cerrado
const db = new DatabaseSync(join(data, 'kratos.db'))
db.prepare("update tasks set wait_reason='Esperando reserva: WBP_Vida.uasset (tarea seed-task-02)' where id='seed-task-03'").run()
const now = new Date().toISOString()
db.prepare(`insert into commands(id,created_at,updated_at,type,payload,idempotency_key,state,attempts,error,lane,not_before)
  values('captura-orca',?,?,'worker.start',?,'captura-orca','pending',0,'Orca no está abierto','normal',?)`)
  .run(now, now, JSON.stringify({ taskId: 'seed-task-01' }), new Date(Date.now() + 3600_000).toISOString())
db.close()
execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', port, '--no-open'], { stdio: 'ignore' })
const token = (JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }).token
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
try {
  for (const [width, height] of [[1366, 768], [1920, 1080]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
    const page = await context.newPage()
    for (const [name, path] of views) {
      const [pathname, search = ''] = path.split('?')
      await page.goto(`http://127.0.0.1:${port}${pathname}${search ? `?${search}` : ''}#token=${token}`)
      // el SSE nunca deja la red en reposo: se espera a que la vista pinte su navegación
      await page.locator('header').first().waitFor()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(out, `${name}-7-${width}.png`) })
      console.log(`${name}-7-${width}.png`)
    }
    await context.close()
  }
} finally {
  await browser.close()
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* ya parado */ }
  setTimeout(() => rmSync(root, { recursive: true, force: true }), 500)
}
