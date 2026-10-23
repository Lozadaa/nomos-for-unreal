// Desde panel/, después del build y con el servicio de aceptación vivo:
//   node scripts/capturas-6.ts "<juego>/.kratos-hito6" <tareaHecha> [vista…]
// Captura Producción, la ficha de una tarea hecha (Resumen y Archivo) y Entregas a 1366 y 1920 con datos reales.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [data, doneTask, ...only] = process.argv.slice(2)
assert.ok(data && doneTask, 'Uso: node scripts/capturas-6.ts <dataDir> <tareaHecha> [produccion|tarea|archivo|entregas]')
const out = resolve(import.meta.dirname, '../../docs/capturas-6')
mkdirSync(out, { recursive: true })
const { port, token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { port: number; token: string }
const base = `http://127.0.0.1:${port}`
const want = (name: string) => !only.length || only.includes(name)

const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/#token=${token}`, { waitUntil: 'domcontentloaded' })
    // la primera visita abre la guía; se cierra para ver la vista
    const guide = page.getByRole('button', { name: 'Cerrar guía' })
    await guide.waitFor({ timeout: 5000 }).then(() => guide.click(), () => {})
    await page.getByRole('region', { name: 'Producción' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    const shot = async (name: string) => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Desbordamiento horizontal en ${name}`)
      await page.screenshot({ path: join(out, `${name}-6-${width}.png`) })
      console.log(`${name}-6-${width}.png`)
    }
    if (want('produccion')) await shot('produccion')
    if (want('tarea') || want('archivo')) {
      await page.goto(`${base}/?tarea=${doneTask}`, { waitUntil: 'domcontentloaded' })
      const who = page.getByRole('region', { name: 'Quién hizo qué' })
      await who.waitFor()
      await who.scrollIntoViewIfNeeded()
      if (want('tarea')) await shot('tarea')
      if (want('archivo')) {
        await page.getByRole('tab', { name: 'Archivo' }).click()
        await page.getByRole('link', { name: 'manifest.json' }).or(page.getByRole('link', { name: 'resumen.md' })).first().waitFor()
        await shot('archivo')
      }
    }
    if (want('entregas')) {
      await page.goto(`${base}/entregas`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('group', { name: 'Filtrar por tipo' }).waitFor()
      await page.waitForTimeout(500)
      await shot('entregas')
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally { await browser.close() }
