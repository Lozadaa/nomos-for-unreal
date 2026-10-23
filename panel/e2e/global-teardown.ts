import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')

export default function teardown() {
  const file = join(tmpdir(), 'kratos-e2e.json')
  const { data, root } = JSON.parse(readFileSync(file, 'utf8')) as { data: string; root: string }
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* ya parado */ }
  rmSync(file, { force: true })
  setTimeout(() => rmSync(root, { recursive: true, force: true }), 500)
}
