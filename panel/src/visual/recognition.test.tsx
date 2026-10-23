import { expect, it } from 'vitest'
import { Bot, Box, Image, ListChecks, Lock, Package, PackageCheck, PersonStanding, Shapes } from 'lucide-react'
import { glyphFor } from './glyphs'

it('elige símbolos reconocibles para cada concepto corregido', () => {
  for (const [kind, value, Icon] of [
    ['area', 'animacion', PersonStanding], ['area', 'builds', Package], ['area', 'assets', Box],
    ['artifact', 'model', Shapes], ['artifact', 'texture', Image],
    ['event', 'lease', Lock], ['event', 'worker', Bot], ['event', 'command', ListChecks], ['event', 'artifact', PackageCheck],
  ] as const) expect(glyphFor(kind, value).Icon, `${kind}/${value}`).toBe(Icon)
})
