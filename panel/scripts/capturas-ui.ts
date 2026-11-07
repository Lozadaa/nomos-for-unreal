// Capturas de la UI a 1366x768 y móvil: node scripts/capturas-ui.ts <url-con-token> <carpeta> <prefijo> [vistas sin barra: inicio aprobar chat...]
import { chromium } from '@playwright/test'
const [url, out, prefix, ...paths] = process.argv.slice(2)
const origin = new URL(url).origin, hash = new URL(url).hash
const browser = await chromium.launch()
for (const [name, viewport] of [['escritorio', { width: 1366, height: 768 }], ['movil', { width: 390, height: 844 }]] as const) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  await page.addInitScript(() => { try { localStorage.setItem('nomos.tour.v1', '1') } catch {} })
  for (const path of (paths.length ? paths : ['inicio']).map((p) => p === 'inicio' ? '/' : '/' + p)) {
    await page.goto(`${origin}${path}${hash}`)
    await page.waitForTimeout(1500)
    await page.keyboard.press('Escape')
    const slug = path === '/' ? 'inicio' : path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    await page.screenshot({ path: `${out}/${prefix}-${slug}-${name}.png`, fullPage: true })
  }
  await page.close()
}
await browser.close()
