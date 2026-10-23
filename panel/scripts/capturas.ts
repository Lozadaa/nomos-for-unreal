// Capturas de las vistas contra el servicio real sembrado, a 1366×768 y 1920×1080.
// Uso (desde panel/, tras `npm run build`): node scripts/capturas.ts [tarea4|tarea5|todas]
import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import setup from '../e2e/global-setup.ts'
import teardown from '../e2e/global-teardown.ts'

const out = resolve(import.meta.dirname, '../../docs/capturas-8')
const sizes = [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }]
type Shot = { name: string; run: (page: Page) => Promise<void> }

const settle = (page: Page) => page.waitForTimeout(450)
const goto = async (page: Page, path: string) => {
  await page.goto(process.env.KRATOS_URL!.replace('/#', `${path}#`))
  await page.waitForSelector('main')
  await settle(page)
}

export const shots: Record<string, Shot[]> = {
  tarea4: [
    { name: 'produccion', run: async (p) => { await goto(p, '/'); await p.getByRole('button', { name: /Definir salto/ }).waitFor() } },
    { name: 'produccion-sheet', run: async (p) => { await goto(p, '/?tarea=seed-task-05') ; await p.getByRole('dialog').waitFor(); await settle(p) } },
    { name: 'composer', run: async (p) => { await goto(p, '/?nueva=1'); await p.getByLabel('Título de la petición').fill('Habilidad Meteorito'); await p.getByLabel('Descripción').fill('Una bola de fuego que cae del cielo y deja un cráter.'); await settle(p) } },
  ],
  tarea5: [
    { name: 'chat', run: (p) => goto(p, '/chat') },
    { name: 'actividad', run: (p) => goto(p, '/actividad') },
    { name: 'entregas', run: (p) => goto(p, '/entregas') },
    { name: 'catalogo', run: (p) => goto(p, '/catalogo') },
    { name: 'decisiones', run: (p) => goto(p, '/decisiones') },
    { name: 'presupuesto', run: (p) => goto(p, '/presupuesto') },
    { name: 'capacidades', run: (p) => goto(p, '/capacidades') },
    { name: 'estilo', run: (p) => goto(p, '/estilo') },
  ],
}

async function main() {
  const which = process.argv[2] ?? 'todas'
  const list = which === 'todas' ? Object.values(shots).flat() : shots[which]
  if (!list) throw new Error(`Conjunto desconocido: ${which}`)
  mkdirSync(out, { recursive: true })
  setup()
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const { w, h } of sizes) {
      const context = await browser.newContext({ viewport: { width: w, height: h } })
      const page = await context.newPage()
      for (const shot of list) {
        await shot.run(page)
        await page.screenshot({ path: resolve(out, `${shot.name}-${w}.png`) })
        console.log(`${shot.name}-${w}.png`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
    teardown()
  }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) await main()
