import { expect, test, type Page } from '@playwright/test'

// Hito 23: «formatea bien en kratos los markdowns … muestra la información más visual y no des tantísimo detalle».
const url = () => process.env.NOMOS_URL!
const origin = () => new URL(url()).origin
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(origin() + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

const criteria = Array.from({ length: 12 }, (_, i) => `El rival reacciona al golpe ${i + 1} en menos de medio segundo`)
const spec = [
  '# Reacciones a los golpes',
  '## Qué', 'Cada golpe hace retroceder al rival y el tercero lo tira al suelo.',
  '## Por qué', 'Sin reacción el combate no se siente.', 'El usuario lo pidió al probar la build.',
  '## Criterios de aceptación', ...criteria.map((c, i) => `${i + 1}. ${c}`),
  '```cpp', 'void AHudson::OnHit(const FHitResult& Hit)', '{', '  Rival->LaunchCharacter(Back * 600.f, true, false);', '}', '```',
  '## Alcance', '- Source/BlockKings/Personajes/Combate/', '- Config/DefaultGame.ini',
  '## No tocar', '- Content/Mapas/',
].join('\n')

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`la ficha con una spec larga cabe en la primera pantalla a ${size.width}×${size.height} y pliega lo técnico`, async ({ page, browserName }) => {
    const task = await (await call(page, '/tasks', { title: `J1.6 Reacciones · ${size.width}`, area: 'gameplay', acceptance: criteria, spec })).json() as { id: string }
    await page.setViewportSize(size)
    await page.goto(url().replace('/#', `/?tarea=${task.id}#`))
    const sheet = page.getByRole('dialog')
    const part = (name: string) => sheet.locator('details', { has: page.locator('summary > span', { hasText: new RegExp(`^${name}$`) }) })
    await expect(part('Qué')).toHaveAttribute('open', '')
    await expect(part('Criterios de aceptación')).toHaveAttribute('open', '')
    for (const name of ['Por qué', 'Alcance', 'No tocar']) await expect(part(name)).not.toHaveAttribute('open', '')
    await expect(part('Alcance').locator('summary')).toContainText('2 líneas')
    // el código queda plegado; los 12 criterios se recortan a 6 líneas con «Mostrar todo»
    const code = part('Criterios de aceptación').locator('details')
    await expect(code.locator('summary')).toHaveText('Detalle técnico · 4 líneas')
    await expect(code).not.toHaveAttribute('open', '')
    await expect(part('Criterios de aceptación').getByRole('button', { name: 'Mostrar todo' })).toBeVisible()
    if (browserName === 'chromium') await page.screenshot({ path: `../docs/capturas-23/ficha-${size.width}.png` })
    // sin desplazamiento vertical en la primera pantalla de la ficha
    const scroller = sheet.locator('.overflow-y-auto').first()
    expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
  })
}
