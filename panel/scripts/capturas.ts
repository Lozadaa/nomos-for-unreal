// Capturas de las vistas contra el servicio real sembrado, a 1366×768 y 1920×1080.
// Uso (desde panel/, tras `npm run build`): node scripts/capturas.ts [tarea4|tarea5|todas]
import { chromium, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import setup from '../e2e/global-setup.ts'
import teardown from '../e2e/global-teardown.ts'

const out = resolve(import.meta.dirname, '../../docs/capturas-8')
const sizes = [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }]
type Shot = { name: string; run: (page: Page) => Promise<void> }

let chatSeeded = false
let workerSeeded = false

/** Un worker de verdad para la semilla: repo git con cambios (uno fuera del alcance), salida por sondeo y una pregunta pendiente. */
function seedWorker() {
  if (workerSeeded) return
  workerSeeded = true
  const repo = mkdtempSync(join(tmpdir(), 'nomos-captura-repo-'))
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=k', '-c', 'user.email=k@k', ...args], { stdio: 'pipe' }).toString().trim()
  git('init', '-q')
  for (const dir of ['Source/Locomocion', 'Config']) mkdirSync(join(repo, dir), { recursive: true })
  writeFileSync(join(repo, 'Source/Locomocion/Salto.cpp'), ['void USalto::Ejecutar()', '{', '  Velocidad = 600.f;', '}', ''].join('\n'))
  writeFileSync(join(repo, 'Config/DefaultGame.ini'), ['[Salto]', 'Altura=1', ''].join('\n'))
  git('add', '.'); git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  writeFileSync(join(repo, 'Source/Locomocion/Salto.cpp'), ['void USalto::Ejecutar()', '{', '  Velocidad = 720.f;', '  Coyote = 0.12f;', '}', ''].join('\n'))
  writeFileSync(join(repo, 'Config/DefaultGame.ini'), ['[Salto]', 'Altura=2', ''].join('\n'))
  const db = new DatabaseSync(join(process.env.NOMOS_DATA!, 'nomos.db'))
  db.prepare("update worktrees set path=?, base_commit=? where id='seed-worktree-01'").run(repo, base)
  db.prepare("update tasks set scope=? where id='seed-task-05'").run(JSON.stringify(['Source/Locomocion']))
  const at = (n: number) => new Date(Date.now() - (600 - n * 20) * 1000).toISOString()
  const put = (type: string, payload: object, n: number) =>
    db.prepare('insert into events(id,type,message_id,payload,created_at) values(?,?,null,?,?)').run(`captura-${type}-${n}`, type, JSON.stringify(payload), at(n))
  const ids = { runId: 'seed-run-01', taskId: 'seed-task-05' }
  put('worker.output', { ...ids, lines: ['Leí Salto.cpp y DefaultGame.ini.', 'Subo la velocidad de salto a 720 y añado coyote time.'] }, 1)
  put('worker.output', { ...ids, lines: ['Compilando Source/Locomocion…', 'Compilación correcta (38 s).'] }, 5)
  put('worker.waiting', { ...ids, question: '¿El coyote time debe valer 0,12 s o prefieres 0,2 s para el mando?' }, 9)
  db.close()
}

const settle = (page: Page) => page.waitForTimeout(450)
const goto = async (page: Page, path: string) => {
  await page.goto(process.env.NOMOS_URL!.replace('/#', `${path}#`))
  await page.waitForSelector('main')
  await settle(page)
}

export const shots: Record<string, Shot[]> = {
  tarea4: [
    { name: 'produccion', run: async (p) => { await goto(p, '/'); await p.getByRole('button', { name: /Definir salto/ }).waitFor() } },
    { name: 'produccion-sheet', run: async (p) => { await goto(p, '/?tarea=seed-task-05') ; await p.getByRole('dialog').waitFor(); await settle(p) } },
    { name: 'composer', run: async (p) => { await goto(p, '/?nueva=1'); await p.getByLabel('Título de la petición').fill('Habilidad Meteorito'); await p.getByLabel('Descripción').fill('Una bola de fuego que cae del cielo y deja un cráter.'); await settle(p) } },
  ],
  hito8b: [
    { name: 'drawer-cambios', run: async (p) => { seedWorker(); await goto(p, '/?tarea=seed-task-05'); await p.getByRole('tab', { name: 'Cambios' }).click(); await p.getByRole('alert', { name: 'Archivos fuera del alcance declarado' }).waitFor(); await settle(p) } },
    { name: 'drawer-chat', run: async (p) => { seedWorker(); await goto(p, '/?tarea=seed-task-05'); await p.getByRole('tab', { name: 'Chat' }).click(); await p.getByRole('region', { name: 'Pregunta del worker' }).waitFor(); await p.getByLabel('Pedir cambios al responsable').fill('Déjalo en 0,12 s y añade una prueba.'); await settle(p) } },
    { name: 'presupuesto-limites', run: async (p) => { await goto(p, '/presupuesto'); await p.getByRole('region', { name: 'Meshy' }).getByRole('button', { name: 'Cambiar límite' }).click(); await p.getByLabel('Límite de Meshy').fill('400'); await settle(p) } },
  ],
  tarea5: [
    { name: 'chat', run: async (p) => {
      // una conversación real: un mensaje confirmado con respuesta y otro todavía sin confirmar
      const token = new URLSearchParams(new URL(process.env.NOMOS_URL!).hash.slice(1)).get('token')!
      const origin = new URL(process.env.NOMOS_URL!).origin
      const call = async (path: string, data: unknown) => (await p.request.post(origin + path, { headers: { Authorization: `Bearer ${token}` }, data })).json()
      if (!chatSeeded) {
        const first = await call('/messages', { text: 'Quiero una habilidad Meteorito para el mago' })
        await call(`/messages/${first.messageId}/reply`, { text: 'Entendido: la divido en diseño, efecto y prueba y se la doy a Codex.' })
        await call('/messages', { text: 'Y que el cráter quede en el suelo unos segundos' })
        chatSeeded = true
      }
      await goto(p, '/chat')
    } },
    { name: 'actividad', run: (p) => goto(p, '/actividad') },
    { name: 'entregas', run: (p) => goto(p, '/entregas') },
    { name: 'catalogo', run: (p) => goto(p, '/catalogo') },
    { name: 'decisiones', run: (p) => goto(p, '/decisiones') },
    { name: 'presupuesto', run: (p) => goto(p, '/presupuesto') },
    { name: 'capacidades', run: (p) => goto(p, '/capacidades') },
    { name: 'estilo', run: (p) => goto(p, '/estilo') },
    { name: 'estilo-peor-caso', run: async (p) => { await goto(p, '/estilo#filas'); await p.getByRole('button', { name: 'Peor caso' }).click(); await p.locator('#filas').scrollIntoViewIfNeeded(); await p.evaluate(() => document.getElementById('filas')?.scrollIntoView()); await settle(p) } },
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
