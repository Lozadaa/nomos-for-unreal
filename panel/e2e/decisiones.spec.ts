import { expect, test, type Page } from '@playwright/test'

// Prueba 20 (plan v2): resolver queda registrado una vez y no se vuelve a preguntar; una caducada se ve y se regenera.
const url = () => process.env.KRATOS_URL!
const origin = () => new URL(url()).origin
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(origin() + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1')) })

async function decisionFor(page: Page, title: string, reason: string) {
  const task = await (await call(page, '/tasks', { title, spec: '', area: 'qa', acceptance: [] })).json() as { id: string }
  const options = [{ id: 'a', label: 'Usar el primero', description: 'Seguir con el candidato del catálogo' },
    { id: 'b', label: 'Buscar otro', description: 'Volver a buscar en el catálogo' }]
  const decision = await (await call(page, '/decisions', { taskId: task.id, reason, options })).json() as { id: string }
  return { task, decision, options }
}

test('resolver una Decisión la registra una vez y Kratos sigue sin volver a preguntar', async ({ page, browserName }) => {
  const reason = `Elegir candidato (${browserName}) ${Date.now()}`
  const { task, decision } = await decisionFor(page, `Decidir ${browserName}`, reason)
  await page.goto(url().replace('/#', '/decisiones#'))
  await page.getByRole('list', { name: 'Bandeja de decisiones' }).getByRole('button', { name: reason }).click()
  await page.getByRole('group', { name: 'Opciones' }).getByRole('button', { name: 'Buscar otro' }).click()
  await expect(page.getByRole('status', { name: /Elegiste Buscar otro\./ })).toBeVisible()
  await page.waitForTimeout(800)
  const detail = await (await call(page, `/tasks/${task.id}`)).json() as { events: { type: string; payload: { decisionId?: string } }[]; task: { decisionId: string | null } }
  expect(detail.events.filter((e) => e.type === 'decision.resolved' && e.payload.decisionId === decision.id)).toHaveLength(1)
  expect(detail.task.decisionId).toBeNull()
  const open = await (await call(page, '/decisions?state=open')).json() as { taskId: string }[]
  expect(open.filter((d) => d.taskId === task.id)).toHaveLength(0)
})

test('una Decisión caducada se anuncia, no registra la elección y ofrece la regenerada', async ({ page, browserName }) => {
  const reason = `Elegir pack (${browserName}) ${Date.now()}`
  const { task, options } = await decisionFor(page, `Caducar ${browserName}`, reason)
  await page.goto(url().replace('/#', '/decisiones#'))
  await page.getByRole('list', { name: 'Bandeja de decisiones' }).getByRole('button', { name: reason }).first().click()
  await expect(page.getByRole('group', { name: 'Opciones' })).toBeVisible()
  // el contexto cambia mientras se mira (Kratos la vuelve a preparar): la que está en pantalla caduca
  await call(page, '/decisions', { taskId: task.id, reason: `${reason} (actualizada)`, options })
  await expect(page.getByText('Esta decisión caducó porque cambió el contexto. Kratos la prepara de nuevo.')).toBeVisible()
  await page.getByRole('button', { name: 'Ver la nueva' }).click()
  await expect(page.getByRole('heading', { name: `${reason} (actualizada)` })).toBeVisible()
  await page.getByRole('group', { name: 'Opciones' }).getByRole('button', { name: 'Usar el primero' }).click()
  await expect(page.getByRole('status', { name: /Elegiste Usar el primero\./ })).toBeVisible()
})
