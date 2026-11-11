import { describe, expect, it } from 'vitest'
import { parseDiffStat } from './parseDiffStat'

describe('parseDiffStat · resúmenes reales de git --stat', () => {
  it('lee los números del resumen y no las barras por archivo, que Git escala', () => {
    expect(parseDiffStat(' Source/Hud.cpp | 656 ++++--\n 1 file changed, 640 insertions(+), 16 deletions(-)\n'))
      .toEqual({ files: 1, added: 640, removed: 16 })
  })

  it('suma todos los resúmenes concatenados de files tracked y untracked', () => {
    const stat = [
      ' Source/Hud.cpp | 100 +++--', ' Texture.uasset | Bin 0 -> 128 bytes',
      ' 2 files changed, 80 insertions(+), 20 deletions(-)',
      ' /dev/null => New.cpp | 9 +++++', ' 1 file changed, 9 insertions(+)',
      ' /dev/null => Notes.txt | 1 +', ' 1 file changed, 1 insertion(+)',
    ].join('\n')
    expect(parseDiffStat(stat)).toEqual({ files: 4, added: 90, removed: 20 })
  })

  it.each([
    ['1 file changed, 1 insertion(+)', { files: 1, added: 1, removed: 0 }],
    ['1 file changed, 1 deletion(-)', { files: 1, added: 0, removed: 1 }],
    ['2 files changed', { files: 2, added: 0, removed: 0 }],
    ['  1 file changed, 0 insertions(+), 0 deletions(-)\r\n', { files: 1, added: 0, removed: 0 }],
  ])('admite singular, campos omitidos y binarios: %s', (stat, expected) => {
    expect(parseDiffStat(stat)).toEqual(expected)
  })

  it.each([
    '', ' Source/Hud.cpp | 6 +++---\n', ' 1 file changed, unknown insertions(+)',
    ' 1 file changed, -3 insertions(+)', ' 1 file changed, 2.5 deletions(-)',
    ' 1 file changed, 2 insertions(+), 3 insertions(+)', ' 1 file changed, 2 insertions(+) extra',
    ' 9007199254740992 files changed, 1 insertion(+)',
  ])('no fabrica un resumen si no hay números verificables: %s', (stat) => {
    expect(parseDiffStat(stat)).toBeNull()
  })

  it('rechaza un agregado que exceda enteros seguros', () => {
    expect(parseDiffStat('9007199254740991 files changed\n1 file changed')).toBeNull()
  })
})
