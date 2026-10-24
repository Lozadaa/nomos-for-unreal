// Desde panel/, después de npm run build: node scripts/capturas-10.ts <etiqueta> [--datos <carpeta .kratos>]
// Las nueve vistas a 1366×768 y 1920×1080 con medidas (ancho útil, palabras, tarjetas por fila) en docs/capturas-10/.
// Sin --datos: semilla propia + entregas de una comprobación con varias vistas. Con --datos: una COPIA de un .kratos real.
import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium } from '@playwright/test'
import { visibleWords } from './palabras.ts'

const tag = process.argv[2]
if (!tag) throw new Error('Falta la etiqueta: antes, despues, revision…')
const copyFrom = process.argv.includes('--datos') ? process.argv[process.argv.indexOf('--datos') + 1] : null
const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const docs = resolve(import.meta.dirname, '../../docs')
const out = join(docs, 'capturas-10')
const root = mkdtempSync(join(tmpdir(), 'kratos-capturas-10-'))
const data = join(root, '.kratos')
const views = [
  ['produccion', '/'], ['actividad', '/actividad'], ['entregas', '/entregas'], ['catalogo', '/catalogo'], ['chat', '/chat'],
  ['decisiones', '/decisiones'], ['presupuesto', '/presupuesto'], ['capacidades', '/capacidades'], ['estilo', '/estilo'],
] as const

/** Lo que entrega una comprobación de mapa con varias vistas, un vídeo y los informes que hoy se leen enteros. */
function seedEntregas() {
  const dir = join(data, 'artifacts', 'captura-10')
  mkdirSync(dir, { recursive: true })
  const images = ['capturas-7/unreal/build-linea-base.png', 'capturas-5b/pie-heroe-1280x720.png', 'capturas-7/unreal/build-sin-atmosfera.png', 'capturas-7/unreal/build-diferencia.png']
  const angles = ['player', 'left', 'right', 'top']
  images.forEach((from, i) => copyFileSync(join(docs, from), join(dir, `map-${angles[i]}.png`)))
  copyFileSync(join(docs, 'capturas-5b/manny-ataque-1280x720.mp4'), join(dir, 'ataque.mp4'))
  copyFileSync(join(docs, 'capturas-5b/pie-heroe-1280x720.png'), join(dir, 'ataque-50.png'))
  writeFileSync(join(dir, 'log.txt'), 'LogInit: Display: Running engine\nMapa /Game/Mapas/L_Gym cargado\nResultado: correcto, 0 errores\n')
  writeFileSync(join(dir, 'review.json'), JSON.stringify({ kind: 'REVIEW', approved: false, findings: [
    { severity: 'media', title: 'El salto ignora el coyote time', file: 'Source/Salto.cpp' },
    { severity: 'baja', title: 'Falta la constante en DefaultGame.ini', file: 'Config/DefaultGame.ini' }] }, null, 2))
  writeFileSync(join(dir, 'qa.md'), '# QA visual\n\nVeredicto: aprobado\n\nEl HUD se lee a 1280×720 y 1920×1080.\n')
  const db = new DatabaseSync(join(data, 'kratos.db'))
  const now = Date.now()
  const put = db.prepare(`insert into artifacts(id,created_at,updated_at,task_id,run_id,kind,path,preview_path,provenance,license) values(?,?,?,?,null,?,?,?,?,null)`)
  const add = (id: string, kind: string, file: string, provenance: object, preview: string | null = null, ago = 0) => {
    const at = new Date(now - ago * 1000).toISOString()
    put.run(id, at, at, 'seed-task-08', kind, join(dir, file), preview ? join(dir, preview) : null, JSON.stringify({ synthetic: true, ...provenance }))
  }
  angles.forEach((view, i) => add(`c10-vista-${view}`, 'screenshot', `map-${view}.png`, { check: 'map', testRunId: 'c10-map', resolution: '1280x720', map: '/Game/Mapas/L_Gym', view }, null, 60 - i))
  add('c10-video', 'video', 'ataque.mp4', { check: 'animation', testRunId: 'c10-anim', resolution: '1280x720', label: 'Animación · ataque', durationSeconds: 3.2 }, 'ataque-50.png', 50)
  add('c10-log', 'report', 'log.txt', { check: 'map', testRunId: 'c10-map', result: 'passed', label: 'Mapa · registro' }, null, 40)
  add('c10-review', 'report', 'review.json', { kind: 'REVIEW', approved: false }, null, 30)
  add('c10-qa', 'report', 'qa.md', { label: 'QA visual · informe' }, null, 20)
  db.close()
}

const free = createServer()
await new Promise<void>((ok) => free.listen(0, '127.0.0.1', ok))
const port = String((free.address() as { port: number }).port)
await new Promise<void>((ok) => free.close(() => ok()))
mkdirSync(out, { recursive: true })
writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')
if (copyFrom) cpSync(copyFrom, data, { recursive: true, filter: (p) => !/service\.json$|\.lock\.db/.test(p) })
else {
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  seedEntregas()
}
execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', port, '--no-open'], { stdio: 'ignore' })
// el token se lee aquí y solo viaja en el fragmento de la URL; nunca se imprime ni se guarda
const { token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }
const measures: Record<string, Record<string, { contentWidth: number; words: number; cardsPerRow?: number }>> = {}
const browser = await chromium.launch()
try {
  for (const [width, height] of [[1366, 768], [1920, 1080]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: 'reduce' })
    await context.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
    const page = await context.newPage()
    for (const [name, path] of views) {
      await page.goto(`http://127.0.0.1:${port}${path}#token=${token}`)
      await page.locator('header').first().waitFor()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: join(out, `${name}-${tag}-${width}.png`) })
      const main = page.locator('main')
      const contentWidth = await main.evaluate((m) => Math.round((m.firstElementChild ?? m).getBoundingClientRect().width))
      const cardsPerRow = name === 'entregas' ? await page.evaluate(() => {
        const cards = [...document.querySelectorAll('main ul > li')]
        return cards.filter((c) => c.getBoundingClientRect().top === cards[0]?.getBoundingClientRect().top).length
      }) : undefined
      ;(measures[name] ??= {})[width] = { contentWidth, words: await visibleWords(main), ...(cardsPerRow === undefined ? {} : { cardsPerRow }) }
      console.log(`${name}-${tag}-${width}.png`, JSON.stringify(measures[name][width]))
    }
    await context.close()
  }
  const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  writeFileSync(join(out, `medidas-${tag}.json`), JSON.stringify({ revision, datos: copyFrom ? 'copia de un .kratos real' : 'semilla + entregas de capturas-10', medidas: measures }, null, 2) + '\n')
} finally {
  await browser.close()
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* ya parado */ }
  setTimeout(() => rmSync(root, { recursive: true, force: true }), 500)
}
