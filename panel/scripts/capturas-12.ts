// Desde la raíz, con el servicio de aceptación vivo (lo llama scripts/aceptacion-hito12.ps1):
//   node panel/scripts/capturas-12.ts "<juego>/.nomos-hito12"
// Captura Producción a 1920 con el run de OpenCode visible.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [data] = process.argv.slice(2)
assert.ok(data, 'Uso: node panel/scripts/capturas-12.ts <dataDir>')
const out = resolve(import.meta.dirname, '../../docs/capturas-12')
mkdirSync(out, { recursive: true })
const { port, token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { port: number; token: string }

const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${port}/#token=${token}`, { waitUntil: 'domcontentloaded' })
  const guide = page.getByRole('button', { name: 'Cerrar guía' })
  await guide.waitFor({ timeout: 5000 }).then(() => guide.click(), () => {})
  const production = page.getByRole('region', { name: 'Producción' })
  await production.waitFor()
  await production.getByText('OpenCode').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(out, 'produccion-12-1920.png') })
  console.log('docs/capturas-12/produccion-12-1920.png')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
