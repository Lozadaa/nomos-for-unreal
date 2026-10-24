// Desde panel/, después de npm run build:
// node scripts/capturas-9.ts [antes|tarea3|tarea4|tarea5|tarea6|todas]
// Puerto libre, servicio/datos/repositorio Git temporales propios; no utiliza el servicio del usuario.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser } from '@playwright/test'
import { visibleWords } from './palabras.ts'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const out = resolve(import.meta.dirname, '../../docs/capturas-9')
const mode = process.argv[2] ?? 'todas'
assert.ok(['antes', 'agentes', 'tarea3', 'tarea4', 'tarea5', 'tarea6', 'todas'].includes(mode), `Conjunto desconocido: ${mode}`)
const before = mode === 'antes'
const countFile = join(out, `palabras-${before ? 'antes' : 'despues'}.json`)
if (before) assert.ok(!existsSync(countFile), 'El baseline ya existe; no se sobrescribe una medición anterior.')
const root = mkdtempSync(join(tmpdir(), 'kratos-hito9-vistas-'))
const data = join(root, '.kratos')
const stamp = '2026-10-23T16:00:00.000Z'
const sizes = [[1366, 768], [1920, 1080]] as const
const views = [
  ['produccion', '/'], ['chat', '/chat'], ['actividad', '/actividad'], ['entregas', '/entregas'],
  ['catalogo', '/catalogo'], ['decisiones', '/decisiones'], ['presupuesto', '/presupuesto'], ['capacidades', '/capacidades'],
] as const

/** Git real: el stat del drawer incluye una edición dentro y otra fuera del alcance declarado. */
function seedWorker() {
  const repo = join(root, 'worker')
  mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=Kratos capturas', '-c', 'user.email=capturas@localhost', ...args], { stdio: 'pipe' }).toString().trim()
  git('init', '-q')
  for (const dir of ['Source/Locomocion', 'Config']) mkdirSync(join(repo, dir), { recursive: true })
  writeFileSync(join(repo, 'Source/Locomocion/Salto.cpp'), 'void USalto::Ejecutar()\n{\n  Velocidad = 600.f;\n}\n')
  writeFileSync(join(repo, 'Config/DefaultGame.ini'), '[Salto]\nAltura=1\n')
  git('add', '.')
  git('commit', '-q', '-m', 'base de captura')
  const base = git('rev-parse', 'HEAD')
  writeFileSync(join(repo, 'Source/Locomocion/Salto.cpp'), 'void USalto::Ejecutar()\n{\n  Velocidad = 720.f;\n  Coyote = 0.12f;\n}\n')
  writeFileSync(join(repo, 'Config/DefaultGame.ini'), '[Salto]\nAltura=2\n')
  const db = new DatabaseSync(join(data, 'kratos.db'))
  try {
    db.prepare("update worktrees set path=?, base_commit=? where id='seed-worktree-01'").run(repo, base)
    db.prepare("update tasks set scope=? where id='seed-task-05'").run(JSON.stringify(['Source/Locomocion']))
    const put = (type: string, payload: object, n: number) => db.prepare('insert into events(id,type,message_id,payload,created_at) values(?,?,null,?,?)')
      .run(`captura9-${n}`, type, JSON.stringify(payload), new Date(Date.parse(stamp) - (600 - n * 20) * 1000).toISOString())
    const ids = { runId: 'seed-run-01', taskId: 'seed-task-05' }
    put('worker.output', { ...ids, lines: ['Leí Salto.cpp y DefaultGame.ini.', 'Subo la velocidad de salto a 720 y añado coyote time.'] }, 1)
    put('worker.output', { ...ids, lines: ['Compilando Source/Locomocion…', 'Compilación correcta (38 s).'] }, 5)
    put('worker.waiting', { ...ids, question: '¿El coyote time debe valer 0,12 s o prefieres 0,2 s para el mando?' }, 9)
    db.prepare("update runs set metadata=json_set(metadata,'$.waiting',json('true'),'$.question',?) where id=?")
      .run('¿El coyote time debe valer 0,12 s o prefieres 0,2 s para el mando?', ids.runId)
  } finally { db.close() }
}

async function launchBrowser(): Promise<Browser> {
  try { return await chromium.launch({ channel: 'chrome' }) }
  catch { return chromium.launch() }
}

type Counts = { method: string; seed: string; measuredAt: string; revision: string; workingTree?: string[]; views: Record<string, Record<string, { full?: number; empty?: number; firstRow?: number }>> }
const counts: Counts = !before && existsSync(countFile) ? JSON.parse(readFileSync(countFile, 'utf8')) : {
  method: 'Tokens Unicode por nodo visible de main; DOM completo incluso fuera del viewport. Excluye hidden/inert/aria-hidden/sr-only/display:none/visibility:hidden/opacity:0, script/style/SVG title, atributos y valores de input. Select cerrado: solo opción seleccionada. Tooltips: solo texto abierto. Misma función para antes y después.',
  seed: 'Servicio real seed, conversación POST /messages + reply y Git temporal con diff real. Vacíos: respuestas API interceptadas solo en el navegador; no borran datos. Sin fixtures de miniaturas.',
  measuredAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), views: {},
}
counts.measuredAt = new Date().toISOString()
counts.method = 'Tokens Unicode por nodo visible de main; DOM completo incluso fuera del viewport. Excluye hidden/inert/aria-hidden/sr-only/display:none/visibility:hidden/opacity:0, script/style/SVG title, atributos y valores de input. Select cerrado: solo opción seleccionada. Tooltips: solo texto abierto. Misma función para antes y después.'
counts.revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
counts.workingTree = execFileSync('git', ['-C', resolve(import.meta.dirname, '../..'), 'status', '--porcelain', '--', 'panel/src', 'panel/scripts/capturas-9.ts'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

const server = createServer()
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
const port = String((server.address() as { port: number }).port)
await new Promise<void>((ok, fail) => server.close((error) => error ? fail(error) : ok()))
const origin = `http://127.0.0.1:${port}`
mkdirSync(out, { recursive: true })
writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')

try {
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  seedWorker()
  execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', port, '--no-open'], { stdio: 'ignore' })
  const { token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }
  const browser = await launchBrowser()
  try {
    // Conversación por la API real; el token nunca se imprime ni se guarda en las capturas o el JSON.
    const request = await browser.newContext()
    const post = async (path: string, body: unknown) => {
      const response = await request.request.post(origin + path, { headers: { Authorization: `Bearer ${token}` }, data: body })
      assert.equal(response.ok(), true, `POST ${path}: ${response.status()}`)
      return response.json() as Promise<{ messageId: string }>
    }
    const message = await post('/messages', { text: 'Quiero una habilidad Meteorito para el mago' })
    await post(`/messages/${message.messageId}/reply`, { text: 'Entendido: la divido en diseño, efecto y prueba y se la doy a Codex.' })
    const second = await post('/messages', { text: 'Y que el cráter quede en el suelo unos segundos' })
    // El reloj de captura no cambia el servicio: fijamos las fechas de esta conversación aislada.
    const chatDb = new DatabaseSync(join(data, 'kratos.db'))
    try {
      for (const [id, ago] of [[message.messageId, 120_000], [second.messageId, 60_000]] as const) {
        const at = new Date(Date.parse(stamp) - ago).toISOString()
        chatDb.prepare('update messages set created_at=? where id=?').run(at, id)
        chatDb.prepare('update events set created_at=? where message_id=?').run(at, id)
      }
    } finally { chatDb.close() }
    await request.close()

    for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
      // Las capturas de vistas no incluyen el tour inicial, que tiene sus E2E propios.
      await context.addInitScript(() => { localStorage.setItem('kratos.tour.v1', '1') })
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.clock.setFixedTime(new Date(stamp))
      const goto = async (path: string) => {
        await page.goto(`${origin}${path}#token=${token}`)
        await page.locator('main').waitFor()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        const tour = page.getByRole('dialog', { name: /guía|bienvenida|conoce/i })
        if (await tour.isVisible()) await page.keyboard.press('Escape')
        await page.mouse.move(0, 0)
      }
      const shot = async (name: string) => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: desbordamiento horizontal`)
        assert.deepEqual(errors, [], `${name}: pageerror`)
        await page.screenshot({ path: join(out, `${name}-9-${width}.png`) })
        console.log(`${name}-9-${width}.png`)
      }
      const measure = async (name: string, variant: 'full' | 'empty') => {
        const entry = (counts.views[name] ??= {})[String(width)] ??= {}
        entry[variant] = await visibleWords(page.locator('main'))
        if (name === 'produccion' && variant === 'full') entry.firstRow = await visibleWords(page.locator('[data-task-id]').first())
      }
      if (mode === 'agentes') {
        await goto('/estilo')
        await page.locator('#arte').evaluate((el) => el.scrollIntoView({ block: 'start' }))
        assert.equal(await page.locator('#glifos li').count(), 38)
        assert.equal(await page.getByLabel('Agentes de las ejecuciones de ejemplo').getByRole('img').count(), 3)
        await shot('agentes')
      }
      if (before || mode === 'tarea5' || mode === 'todas') {
        for (const [name, path] of views) {
          await goto(path)
          await measure(name, 'full')
          await shot(`${name}-${before ? 'antes' : 'llena'}`)
        }
        // Todas las respuestas vacías son locales al navegador; SSE vacío nunca llega al store.
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url())
          if (url.origin !== origin) return route.continue()
          if (url.pathname === '/events') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': captura vacía\n\n' })
          if (['/tasks', '/artifacts', '/catalog', '/decisions', '/capabilities'].includes(url.pathname)) return route.fulfill({ json: [] })
          if (url.pathname === '/budget') return route.fulfill({ status: 404, json: { error: 'unknown_budget' } })
          return route.continue()
        })
        for (const [name, path] of views) {
          await goto(path)
          await measure(name, 'empty')
          await shot(`${name}-${before ? 'antes-vacia' : 'vacia'}`)
        }
        await page.unroute('**/*')
      }
      if (mode === 'tarea3' || mode === 'todas') {
        await goto('/')
        await measure('produccion', 'full')
        await shot('produccion')
        await goto('/?tarea=seed-task-05')
        await page.getByRole('dialog').waitFor()
        await shot('produccion-sheet')
        await goto('/chat')
        await measure('chat', 'full')
        await shot('chat')
      }
      if (mode === 'tarea4' || mode === 'todas') {
        for (const name of ['produccion', 'actividad', 'presupuesto', 'capacidades']) {
          await goto(views.find(([view]) => view === name)![1])
          if (name === 'actividad') {
            const boxes = await page.getByRole('region', { name: 'Actividad por carriles' }).getByRole('button', { name: /^(Mensaje recibido|Kratos respondió)$/ }).evaluateAll((nodes) => nodes.map((node) => {
              const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom }
            }))
            assert.equal(boxes.length, 3)
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i], b = boxes[j]
              assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, 'Eventos de Chat superpuestos')
            }
          }
          await measure(name, 'full')
          await shot(name === 'produccion' ? 'produccion-mapa' : name)
        }
        await goto('/?tarea=seed-task-05')
        await page.getByRole('tab', { name: 'Cambios', exact: true }).click()
        await page.getByRole('alert', { name: 'Archivos fuera del alcance declarado' }).waitFor()
        await shot('cambios')
      }
      if (mode === 'tarea6' || mode === 'todas') {
        await goto('/')
        await page.keyboard.press('Control+k')
        await page.getByRole('option', { name: 'Ver guía', exact: true }).click()
        const guide = page.getByRole('dialog', { name: 'Guía de Kratos' })
        await guide.waitFor()
        for (const target of ['director', 'compositor', 'mapa']) {
          await page.waitForTimeout(200)
          await shot(`tour-${target}`)
          await guide.getByRole('button', { name: target === 'mapa' ? 'Terminar' : 'Siguiente', exact: true }).click()
          if (target !== 'mapa') await page.waitForTimeout(80)
        }
        await page.getByRole('button', { name: /Definir salto/ }).focus()
        await page.keyboard.press('?')
        await page.getByRole('dialog', { name: 'Leyenda', exact: true }).waitFor()
        await page.waitForTimeout(300)
        await shot('leyenda')
      }
      await context.close()
    }
    if (mode !== 'agentes') writeFileSync(countFile, JSON.stringify(counts, null, 2) + '\n')
    console.log(`${before ? 'Baseline' : 'Recuento'}: ${countFile}`)
  } finally { await browser.close() }
} finally {
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* arranque incompleto */ }
  const target = resolve(root)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('kratos-hito9-vistas-'))
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
