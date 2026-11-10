import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/api', () => ({ token: null, ApiError: class extends Error { status = 0 }, api: vi.fn() }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { EstadoCard, type Resumen } from './EstadoCard'

const base: Resumen = {
  claude: { tokensHoy: 1_284_000, tokensSemana: 8_400_000, workers: 2, director: true },
  ias: [],
  meshy: { cuentas: [{ nombre: 'env', creditos: 100 }, { nombre: 'Richard', creditos: 1100 }, { nombre: 'Richard2', creditos: 1100 }], total: 2300 },
  sonido: { guardada: '2026-11-10T20:00:00.000Z' },
  maquina: { unreal: '5.9.0', ramLibreGb: 12.4, ramTotalGb: 32, discoLibreGb: 300, discoTotalGb: 930, discoBajo: false, editores: 1 },
  equipo: null,
  falta: [],
  generado: '2026-11-10T21:00:00.000Z',
}
const show = async (r: Resumen) => {
  vi.mocked(api).mockImplementation(async (path: string) => { if (path === '/resumen') return r; throw new Error(path) })
  render(<EstadoCard />)
  return screen.findByRole('region', { name: 'Estado' })
}

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(cleanup)

describe('tarjeta de estado', () => {
  it('todo configurado: tokens, Meshy, sonido y máquina; nada por configurar', async () => {
    const card = await show(base)
    expect(card).toHaveTextContent('1,3 M')
    expect(card).toHaveTextContent('2300')
    expect(card).toHaveTextContent('3 cuentas')
    expect(within(card).getByLabelText('Sesión guardada')).toBeInTheDocument()
    expect(card).toHaveTextContent('Unreal 5.9.0')
    expect(card).toHaveTextContent('Todo configurado')
    expect(card).not.toHaveTextContent(/Codex|OpenCode/)
  })

  it('nada configurado: sin cifras inventadas; se expande con cada falta y su comando', async () => {
    const card = await show({ ...base, meshy: null, sonido: null, maquina: { ...base.maquina, unreal: null },
      falta: [{ que: 'Meshy sin cuentas', comando: 'powershell -File C:\\Users\\x\\.nomos\\guardar-claves-meshy.ps1' }, { que: 'WeLoveIndies', comando: 'nomos sonido login', detalle: 'sin sesión guardada' }, { que: 'graphify', detalle: 'no encontrado' }] })
    expect(card).not.toHaveTextContent('Meshy')
    expect(card).not.toHaveTextContent('WeLoveIndies')
    const toggle = within(card).getAllByRole('button')[0]
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(card).toHaveTextContent('Por configurar3')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByRole('heading', { name: 'Falta por configurar' })).toBeInTheDocument()
    expect(within(card).getByText('nomos sonido login')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Copiar nomos sonido login' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Copiar.*graphify/ })).toBeNull()
  })

  it('Meshy sin créditos: cifra a cero en aviso y la cuenta en rojo al abrir', async () => {
    const card = await show({ ...base, meshy: { cuentas: [{ nombre: 'env', creditos: 0 }], total: 0 }, falta: [{ que: 'Meshy sin créditos' }] })
    expect(card).toHaveTextContent('Meshy0créditos')
    await userEvent.click(within(card).getAllByRole('button')[0])
    expect(within(card).getByRole('meter', { name: 'Créditos de env' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('disco bajo: aviso con forma además de color', async () => {
    const card = await show({ ...base, maquina: { ...base.maquina, discoLibreGb: 12.4, discoBajo: true }, falta: [{ que: 'Poco disco', comando: 'nomos clean' }] })
    expect(card).toHaveTextContent('menos de 25 GB')
    expect(within(card).getByRole('meter', { name: 'Disco en uso' })).toBeInTheDocument()
  })

  it('nunca pinta claves ni tokens de API', async () => {
    const card = await show(base)
    expect(card.innerHTML).not.toMatch(/MESHY_API_KEY|Bearer|clave/i)
  })
})
