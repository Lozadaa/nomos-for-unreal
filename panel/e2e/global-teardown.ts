import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stopService } from './own-service'
import { removeDir } from '../../tests/remove-dir.ts'

export default function teardown() {
  const file = join(tmpdir(), 'nomos-e2e.json')
  const { data, root } = JSON.parse(readFileSync(file, 'utf8')) as { data: string; root: string }
  stopService(data)
  rmSync(file, { force: true })
  removeDir(root)
}
