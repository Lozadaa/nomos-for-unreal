import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stopService } from './own-service'

export default function teardown() {
  const file = join(tmpdir(), 'nomos-e2e.json')
  const { data, root } = JSON.parse(readFileSync(file, 'utf8')) as { data: string; root: string }
  stopService(data)
  rmSync(file, { force: true })
  setTimeout(() => rmSync(root, { recursive: true, force: true }), 500)
}
