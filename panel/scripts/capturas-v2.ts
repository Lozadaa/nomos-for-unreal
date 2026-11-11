// Capturas de la marca v2: Inicio a 1440x900 y 390x844, oscuro y claro, con la tarjeta de estado cerrada y abierta.
// node scripts/capturas-v2.ts <url-con-token> <carpeta>
import { chromium } from '@playwright/test'
const [url, out] = process.argv.slice(2)
const browser = await chromium.launch()
for (const [name, viewport] of [['escritorio', { width: 1440, height: 900 }], ['movil', { width: 390, height: 844 }]] as const) {
  for (const mode of ['oscuro', 'claro'] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
    await page.addInitScript((m) => { try { localStorage.setItem('nomos.tour.v1', '1'); localStorage.setItem('nomos.tema', m) } catch {} }, mode)
    await page.goto(url)
    await page.waitForTimeout(500)
    await page.goto(new URL(url).origin + '/')
    await page.getByRole('region', { name: 'Status' }).waitFor({ timeout: 60_000 })
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await page.screenshot({ path: `${out}/inicio-${name}-${mode}.png` })
    await page.getByRole('region', { name: 'Status' }).getByRole('button').first().click()
    await page.waitForTimeout(400)
    await page.getByRole('region', { name: 'Status' }).screenshot({ path: `${out}/tarjeta-abierta-${name}-${mode}.png` })
    await page.close()
  }
}
await browser.close()
