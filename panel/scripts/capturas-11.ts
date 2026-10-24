// Desde la raíz, con el servicio de aceptación vivo (lo llama scripts/aceptacion-hito11.ps1):
//   node panel/scripts/capturas-11.ts "<juego>/.nomos-hito11"
// Portada y Producción a 1920 con la marca nueva; falla si la pestaña o el texto visible dicen «Kratos».
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [data] = process.argv.slice(2)
assert.ok(data, 'Uso: node panel/scripts/capturas-11.ts <dataDir>')
const out = resolve(import.meta.dirname, '../../docs/capturas-11')
mkdirSync(out, { recursive: true })
const { port, token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { port: number; token: string }

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // la primera visita de la sesión abre la portada; de ahí, Producción por su pestaña
  await page.goto(`http://127.0.0.1:${port}/#token=${token}`, { waitUntil: 'domcontentloaded' })
  const guide = page.getByRole('button', { name: 'Cerrar guía' })
  await guide.waitFor({ timeout: 3000 }).then(() => guide.click(), () => {})
  for (const [name, ready] of [['portada', 'Proyectos en este equipo'], ['produccion', null]] as const) {
    if (!ready) {
      await page.getByRole('link', { name: 'Producción', exact: true }).click()
      await page.getByText('Proyectos en este equipo').waitFor({ state: 'detached' })
      // el cambio de vista es una view transition: su instantánea de la portada sigue encima hasta que acaba
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
    }
    await (ready ? page.getByText(ready) : page.getByRole('region', { name: 'Producción' })).first().waitFor()
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); return document.fonts.ready })
    await page.mouse.move(1900, 1000)
    assert.equal(await page.title(), 'Nomos for Unreal')
    // el nombre del proyecto (KratosFabTest) es una carpeta real del usuario: no cuenta
    assert.doesNotMatch((await page.locator('body').innerText()).replaceAll('KratosFabTest', ''), /kratos/i, name)
    await page.screenshot({ path: join(out, `${name}-11-1920.png`) })
    console.log(`docs/capturas-11/${name}-11-1920.png`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
