import { expect, test, type Page } from '@playwright/test'
import type { Task } from '../src/lib/tasks'

const url = () => process.env.NOMOS_URL!
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!

async function skipTour(page: Page) {
  await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1'))
}

async function load(page: Page) {
  await page.goto(url().replace('/#', '/produccion#'))
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
}

test('la primera visita muestra la guía, Esc la cierra y no vuelve tras recargar', async ({ page }) => {
  // Un contexto nuevo comienza sin la clave. No usar addInitScript para borrarla:
  // volvería a borrarse también en la recarga que comprueba la persistencia.
  await page.goto(url().replace('/#', '/catalogo#'))
  const tour = page.getByRole('dialog', { name: 'Guía de Nomos' })
  await expect(tour).toBeVisible()
  await expect(tour).toHaveAttribute('data-tour-target', 'director')
  await expect(tour.getByText('Aquí ves si Nomos escucha', { exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/catalogo')
  expect(await page.evaluate(() => localStorage.getItem('nomos.tour.v1'))).toBe('1')

  await page.keyboard.press('Escape')
  await expect(tour).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: /^Catálogo/ }).first()).toBeVisible()
  await expect(tour).toBeHidden()
})

test('Ver guía desde la paleta permite recorrer los tres pasos y terminar', async ({ page }) => {
  await skipTour(page)
  await page.goto(url().replace('/#', '/catalogo#'))
  await expect(page.getByRole('heading', { name: /^Catálogo/ }).first()).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByRole('option', { name: 'Ver guía', exact: true }).click()

  const tour = page.getByRole('dialog', { name: 'Guía de Nomos' })
  await expect(tour).toBeVisible()
  await expect(tour).toHaveAttribute('data-tour-target', 'director')
  await expect(tour.getByText('Aquí ves si Nomos escucha', { exact: true })).toBeVisible()
  await tour.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(tour).toHaveAttribute('data-tour-target', 'composer')
  await expect(tour.getByText('Pide algo aquí', { exact: true })).toBeVisible()
  await tour.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(tour).toHaveAttribute('data-tour-target', 'map')
  await expect(tour.getByText('Así avanza el trabajo', { exact: true })).toBeVisible()
  // La guía atrapa el foco: el mapa sigue visible, pero el fondo queda oculto al lector.
  await expect(page.locator('[data-tour-anchor="map"]')).toBeVisible()
  await tour.getByRole('button', { name: 'Terminar', exact: true }).click()
  await expect(tour).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Habla con Nomos' })).toBeVisible()
  await expect(tour).toBeHidden()
})

test('? abre la leyenda y Esc devuelve el foco; la paleta también abre Leyenda', async ({ page }) => {
  await skipTour(page)
  await load(page)
  const row = page.getByRole('button', { name: /Definir salto/ })
  await row.focus()
  await page.keyboard.press('?')
  const legend = page.getByRole('dialog', { name: 'Leyenda', exact: true })
  await expect(legend).toBeVisible()
  await expect(legend.getByRole('listitem')).toHaveCount(38)
  expect(await legend.getByRole('listitem').evaluateAll((items) => items.every((item) => {
    const range = document.createRange()
    range.selectNodeContents(item)
    return range.getBoundingClientRect().right <= item.closest('[data-testid]')!.getBoundingClientRect().right + 1
  }))).toBe(true)
  await expect(legend.getByRole('img', { name: 'OpenCode', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(legend).toBeHidden()
  await expect(row).toBeFocused()

  await page.keyboard.press('Control+k')
  await page.getByRole('option', { name: 'Leyenda', exact: true }).click()
  await expect(legend).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Menú de comandos' })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(legend).toBeHidden()
})

for (const field of ['título', 'búsqueda', 'descripción', 'área', 'editable'] as const) {
  test(`? no abre la leyenda con foco en ${field}`, async ({ page }) => {
    await skipTour(page)
    await load(page)
    if (field === 'descripción' || field === 'área') {
      await page.getByLabel('Título de la petición', { exact: true }).focus()
    }
    if (field === 'editable') {
      await page.evaluate(() => {
        const editor = document.createElement('div')
        editor.contentEditable = 'true'
        editor.setAttribute('role', 'textbox')
        editor.setAttribute('aria-label', 'Editor de prueba')
        editor.innerHTML = '<span>Texto editable</span>'
        document.querySelector('main')!.append(editor)
      })
    }
    const label = {
      título: 'Título de la petición', búsqueda: 'Buscar tarea', descripción: 'Descripción',
      área: 'Área', editable: 'Editor de prueba',
    }[field]
    const control = page.getByLabel(label, { exact: true })
    await control.focus()
    await expect(control).toBeFocused()
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Leyenda', exact: true })).toBeHidden()
    await expect(control).toBeFocused()
  })
}

test('? respeta un diálogo activo', async ({ page }) => {
  await skipTour(page)
  await load(page)
  await page.getByRole('button', { name: /Definir salto/ }).click()
  const detail = page.getByRole('dialog')
  await expect(detail).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar detalle' }).focus()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Leyenda', exact: true })).toBeHidden()
  await expect(detail).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
})

test('con movimiento reducido el mapa refleja una actualización real sin desplazar sus puntos', async ({ page }) => {
  await skipTour(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const task: Task = {
    id: 'visual-motion-task', title: 'Verificar movimiento reducido', spec: '', acceptance: [],
    createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z', state: 'pendiente',
    area: 'qa', blockedReason: null, decisionId: null, assigneeRole: null, assigneeProvider: null,
    parentTaskId: null, dependsOn: [], worktreeId: null, budgetId: null,
  }
  // Una sola tarea hace que siempre haya un punto, aunque otros E2E hayan creado
  // más de doce tareas en el servicio compartido. El refresco lo dispara SSE real.
  await page.route('**/tasks', (route) => route.request().method() === 'GET'
    ? route.fulfill({ json: [task] }) : route.continue())
  await page.goto(url().replace('/#', '/produccion#'))
  const map = page.getByRole('group', { name: 'Flujo de producción' })
  const point = map.locator('[data-point]')
  await expect(point).toHaveAttribute('cx', '50')
  await expect(map.getByRole('button', { name: 'Pendiente: 1', exact: true })).toBeVisible()

  await page.evaluate(() => {
    const metrics = { calls: 0, groups: [] as number[], mapAnimations: [] as number[], running: true }
    Object.assign(window, { __mapMotion: metrics })
    const original = document.startViewTransition?.bind(document)
    if (original) {
      document.startViewTransition = ((update: never) => {
        metrics.calls++
        return original(update)
      }) as typeof document.startViewTransition
    }
    const sample = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null
        if (effect?.pseudoElement?.startsWith('::view-transition-group')) {
          metrics.groups.push(Number(effect.getComputedTiming().duration))
        }
      }
      const svg = document.querySelector('.k-map')
      for (const animation of svg?.getAnimations({ subtree: true }) ?? []) {
        const effect = animation.effect as KeyframeEffect | null
        if (effect) metrics.mapAnimations.push(Number(effect.getComputedTiming().duration))
      }
      if (metrics.running) requestAnimationFrame(sample)
    }
    sample()
  })
  task.state = 'done'
  task.updatedAt = '2026-10-23T00:01:00Z'
  const created = await page.request.post(`${new URL(url()).origin}/tasks`, {
    headers: { Authorization: `Bearer ${token()}` },
    data: { title: 'Evento para refrescar el mapa', spec: '', area: 'qa', acceptance: [] },
  })
  expect(created.status()).toBe(201)
  await expect(map.getByRole('button', { name: 'Hecha: 1', exact: true })).toBeVisible()
  await expect(point).toHaveAttribute('cx', '750')
  await page.waitForTimeout(120)
  const result = await point.evaluate((element) => {
    const metrics = (window as unknown as {
      __mapMotion: { calls: number; groups: number[]; mapAnimations: number[]; running: boolean }
    }).__mapMotion
    metrics.running = false
    return {
      ...metrics,
      supportsTransitions: typeof document.startViewTransition === 'function',
      supportsNames: CSS.supports('view-transition-name', 'none'),
      name: getComputedStyle(element).getPropertyValue('view-transition-name'),
      transform: getComputedStyle(element).transform,
    }
  })
  if (result.supportsTransitions) expect(result.calls).toBeGreaterThan(0)
  if (result.supportsNames) expect(result.name).toBe('none')
  expect(result.transform).toBe('none')
  expect(result.mapAnimations.every((duration) => duration <= 1)).toBe(true)
  expect(result.groups.every((duration) => duration <= 1)).toBe(true)
})

test('al guardar un límite el anillo actualiza el porcentaje sin animaciones de repintado', async ({ page }) => {
  await skipTour(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  let limit = 400
  const summary = () => ({
    scope: 'workspace', scopeId: 'workspace',
    limits: { meshyCredits: limit, elevenlabsCredits: null, tokens: null, buildMinutes: null },
    spent: { meshyCredits: 120, elevenlabsCredits: 0, tokens: 0, buildMinutes: 0 },
    remaining: { meshyCredits: limit - 120, elevenlabsCredits: null, tokens: null, buildMinutes: null },
  })
  await page.route('**/budget', async (route) => {
    if (route.request().method() === 'PUT') {
      limit = Number(route.request().postDataJSON().limits.meshyCredits)
      await route.fulfill({ json: summary() })
    } else if (route.request().method() === 'GET') {
      await route.fulfill({ json: summary() })
    } else await route.continue()
  })
  await page.goto(url().replace('/#', '/presupuesto#'))
  const meter = page.getByRole('region', { name: 'Meshy', exact: true })
  const ring = meter.locator('.k-ring')
  await expect(ring).toHaveAttribute('aria-label', '30 %')
  await expect(ring.locator('[pathLength]')).toHaveAttribute('stroke-dashoffset', '70')
  await meter.getByRole('button', { name: 'Cambiar límite', exact: true }).click()
  await page.getByLabel('Límite de Meshy', { exact: true }).fill('200')

  // El observador captura en el primer frame del cambio: esperar a que acabe la
  // acción (mínimo 300ms) ocultaría precisamente la transición de 300ms anterior.
  await ring.evaluate((element) => {
    const point = element.querySelector('[pathLength]')!
    const result: { sampled: boolean; offset: string | null; animations: { state: AnimationPlayState; duration: number; properties: string[] }[] } = {
      sampled: false, offset: null, animations: [],
    }
    Object.assign(window, { __ringMotion: result })
    const observer = new MutationObserver(() => {
      if (point.getAttribute('stroke-dashoffset') !== '40') return
      requestAnimationFrame(() => {
        result.offset = point.getAttribute('stroke-dashoffset')
        result.animations = element.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === 'running' || animation.pending)
          .map((animation) => {
            const effect = animation.effect as KeyframeEffect | null
            const properties = new Set<string>()
            for (const keyframe of effect?.getKeyframes() ?? []) {
              for (const property of Object.keys(keyframe)) {
                if (!['offset', 'easing', 'composite', 'computedOffset'].includes(property)) properties.add(property)
              }
            }
            return { state: animation.playState, duration: Number(effect?.getComputedTiming().duration ?? 0), properties: [...properties] }
          })
        result.sampled = true
        observer.disconnect()
      })
    })
    observer.observe(point, { attributes: true, attributeFilter: ['stroke-dashoffset'] })
  })
  const saved = page.waitForResponse((response) => response.url().endsWith('/budget') && response.request().method() === 'PUT')
  await meter.getByRole('button', { name: 'Guardar', exact: true }).click()
  expect((await saved).status()).toBe(200)
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ringMotion: { sampled: boolean } }).__ringMotion.sampled)).toBe(true)
  const captured = await page.evaluate(() => (window as unknown as {
    __ringMotion: { offset: string | null; animations: { state: AnimationPlayState; duration: number; properties: string[] }[] }
  }).__ringMotion)
  expect(captured.offset).toBe('40')
  expect(captured.animations).toEqual([])
  await expect(ring).toHaveAttribute('aria-label', '60 %')
  expect(limit).toBe(200)
})
