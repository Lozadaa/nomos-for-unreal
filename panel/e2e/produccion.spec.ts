import { expect, test, type Page } from '@playwright/test'

const url = () => process.env.NOMOS_URL!

// Estos casos verifican Producción; la primera visita se cubre en visual.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1'))
})

/** Cuenta las llamadas a startViewTransition sin cambiar su comportamiento. */
async function spyViewTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number }
    w.__vt = 0
    const original = document.startViewTransition?.bind(document)
    if (original) {
      document.startViewTransition = ((cb: never) => { w.__vt++; return original(cb) }) as typeof document.startViewTransition
    }
  })
}
const vtCalls = (page: Page) => page.evaluate(() => (window as unknown as { __vt: number }).__vt)

async function load(page: Page) {
  await page.goto(url().replace('/#', '/produccion#'))
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
}

test('abrir y cerrar el Sheet devuelve el foco a la fila (Esc) y el orden de Tab es encabezado → pestañas → contenido', async ({ page }) => {
  await load(page)
  const row = page.getByRole('button', { name: /Definir salto/ })
  await row.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(page).toHaveURL(/tarea=seed-task-01/)
  await expect(page.getByRole('heading', { name: 'Definir salto' })).toBeVisible()

  // Tab: botón de cerrar (encabezado) → pestañas → contenido
  const order: string[] = []
  for (let i = 0; i < 4; i++) {
    order.push(await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el?.getAttribute('aria-label') ?? el?.getAttribute('role') ?? el?.tagName ?? ''
    }))
    await page.keyboard.press('Tab')
  }
  expect(order[0]).toBe('Cerrar detalle')
  expect(order[1]).toBe('tab')

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(row).toBeFocused()
  await expect(page).not.toHaveURL(/tarea=/)
})

test('abrir un detalle y volver pasan por startViewTransition (donde existe) y la lista sigue usable', async ({ page }) => {
  await spyViewTransitions(page)
  await load(page)
  await page.getByRole('button', { name: /Diseñar HUD/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  // Firefox reciente ya trae View Transitions; el respaldo sin la API se prueba aparte, forzándola a undefined
  const supported = await page.evaluate(() => typeof document.startViewTransition === 'function')
  if (supported) expect(await vtCalls(page)).toBeGreaterThanOrEqual(2)
  else expect(await vtCalls(page)).toBe(0)
  await expect(page.getByRole('button', { name: /Diseñar HUD/ })).toBeFocused()
})

test('con prefers-reduced-motion no hay desplazamiento al abrir el detalle', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'View Transitions solo existe en Chromium')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await load(page)
  await page.evaluate(() => {
    const w = window as unknown as { __anims: { pseudo: string; duration: number; props: string[] }[] }
    w.__anims = []
    const sample = () => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect | null
        if (!effect || !effect.pseudoElement?.startsWith('::view-transition')) continue
        const props = new Set<string>()
        for (const k of effect.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p)
        w.__anims.push({ pseudo: effect.pseudoElement, duration: Number(effect.getComputedTiming().duration), props: [...props] })
      }
    }
    new MutationObserver(sample).observe(document.documentElement, { attributes: true, childList: true, subtree: true })
    const loop = () => { sample(); requestAnimationFrame(loop) }
    loop()
  })
  await page.getByRole('button', { name: /Diseñar HUD/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(400)
  const anims = await page.evaluate(() => (window as unknown as { __anims: { pseudo: string; duration: number; props: string[] }[] }).__anims)
  expect(anims.length).toBeGreaterThan(0)
  // los grupos (que son los que desplazan) no duran más de un instante y nada se traslada
  for (const a of anims.filter((x) => x.pseudo.startsWith('::view-transition-group'))) expect(a.duration).toBeLessThanOrEqual(1)
  // el resto (fundidos) dura como mucho 80 ms y no traslada nada: las claves de transform solo viven en los grupos, que son instantáneos
  for (const a of anims) {
    expect(a.duration).toBeLessThanOrEqual(80)
    if (!a.pseudo.startsWith('::view-transition-group')) expect(a.props).not.toContain('transform')
  }
})

test('Firefox y demás navegadores sin View Transitions: la navegación entre vistas funciona con el fundido de respaldo', async ({ page }) => {
  await page.addInitScript(() => { (document as unknown as { startViewTransition?: unknown }).startViewTransition = undefined })
  await load(page)
  await page.getByRole('button', { name: /Definir salto/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('link', { name: /^Actividad/ }).click()
  await expect(page).toHaveURL(/actividad/)
})

for (const reduce of [false, true]) {
  test(`el fundido de respaldo dura ${reduce ? '80' : '180'} ms ${reduce ? 'con' : 'sin'} reducir movimiento`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await load(page)
    const duration = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.className = 'fallback-fade'
      document.body.append(probe)
      const value = getComputedStyle(probe).animationDuration
      probe.remove()
      return value
    })
    expect(duration).toBe(reduce ? '0.08s' : '0.18s')
  })
}
