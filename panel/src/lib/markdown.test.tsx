import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Markdown } from './markdown'

const md = (text: string, taskTitle?: (id: string) => string | undefined) =>
  render(<MemoryRouter><Markdown text={text} taskTitle={taskTitle} /></MemoryRouter>).container

describe('Markdown seguro (hito 10, corrección del usuario)', () => {
  it('el ejemplo real de hoy: una enumeración en línea sale como lista numerada legible', () => {
    const box = md('Entendido y ya creado. Tareas: 1) J1.6 Reacción al golpe · preparada. 2) J1.7 Dash sin vuelo · preparada. 3) J1.8 Estamina y peso · pendiente.')
    expect(box.querySelector('p')!.textContent).toBe('Entendido y ya creado. Tareas:')
    const items = [...box.querySelectorAll('ol > li')].map((li) => li.textContent)
    expect(items).toEqual(['J1.6 Reacción al golpe · preparada.', 'J1.7 Dash sin vuelo · preparada.', 'J1.8 Estamina y peso · pendiente.'])
  })

  it('negrita, cursiva, código en línea, viñetas, listas numeradas y saltos de línea', () => {
    const box = md('**Listo** y _probado_ con `npm test`\nsegunda línea\n\n- uno\n- dos\n\n1. a\n2. b')
    expect(box.querySelector('strong')!.textContent).toBe('Listo')
    expect(box.querySelector('em')!.textContent).toBe('probado')
    expect(box.querySelector('code')!.textContent).toBe('npm test')
    expect(box.querySelector('br')).not.toBeNull()
    expect([...box.querySelectorAll('ul > li')].map((li) => li.textContent)).toEqual(['uno', 'dos'])
    expect([...box.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['a', 'b'])
  })

  it('tablas simples', () => {
    const box = md('| Tarea | Estado |\n|---|---|\n| J1.6 | preparada |')
    expect([...box.querySelectorAll('th')].map((c) => c.textContent)).toEqual(['Tarea', 'Estado'])
    expect([...box.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['J1.6', 'preparada'])
  })

  it('sin HTML crudo, sin imágenes remotas y enlaces solo a rutas internas', () => {
    const box = md('<script>alert(1)</script> <b>x</b> ![foto](https://mal.example/x.png) [fuera](https://mal.example) [javascript](javascript:alert(1))')
    expect(box.querySelector('script, b, img')).toBeNull()
    expect(box.textContent).toContain('<script>alert(1)</script>')
    expect(box.querySelectorAll('a')).toHaveLength(0)
    expect(box.textContent).toContain('fuera')
  })

  it('/tareas/<id> enlaza a la ficha con el título; nunca el uuid', () => {
    const id = '6cb4cfe7-f945-496e-9ba3-ecc50cc54107'
    md(`Mira [${id}](/tareas/${id}) y [la otra](/tareas/x1)`, (t) => t === id ? 'J1.6 Reacción al golpe' : undefined)
    const link = screen.getByRole('link', { name: 'J1.6 Reacción al golpe' })
    expect(link).toHaveAttribute('href', `/?tarea=${id}`)
    expect(document.body.textContent).not.toContain(id)
    expect(within(document.body).getByRole('link', { name: 'la otra' })).toHaveAttribute('href', '/?tarea=x1')
  })
})

describe('Markdown sin desbordar (adenda 4)', () => {
  it('bloque de código y tabla con scroll propio; el texto largo sin espacios se parte', () => {
    const box = md('```\n' + 'x'.repeat(300) + '\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n' + 'y'.repeat(600))
    const pre = box.querySelector('pre')!
    expect(pre.textContent).toBe('x'.repeat(300))
    expect(pre).toHaveClass('overflow-x-auto')
    expect(box.querySelector('table')!.parentElement).toHaveClass('overflow-x-auto')
    expect(box.firstElementChild).toHaveClass('[overflow-wrap:anywhere]')
  })
})

it('el guion bajo dentro de una palabra no es cursiva (Columna_0_ancha, nombres de asset)', () => {
  const box = md('Columna_0_ancha y SM_Raqueta_01 pero _esto sí_')
  expect([...box.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['esto sí'])
  expect(box.textContent).toBe('Columna_0_ancha y SM_Raqueta_01 pero esto sí')
})
