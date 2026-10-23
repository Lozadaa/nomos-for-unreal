import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Composer } from './Composer'

vi.mock('@/api', () => ({ token: null, api: vi.fn(), ApiError: class extends Error { status = 0 } }))

afterEach(cleanup)

describe('Compositor visual', () => {
  it('mantiene el selector nativo enfocable y el pictograma refleja el área elegida', async () => {
    const user = userEvent.setup()
    render(<Composer autoFocus isVisible={() => true} onHidden={() => {}} />)
    expect(screen.getByRole('img', { name: 'Gameplay' })).toBeInTheDocument()
    await user.tab()
    await user.tab()
    const area = screen.getByRole('combobox', { name: 'Área' })
    expect(area).toHaveFocus()
    await user.selectOptions(area, 'ui')
    expect(area).toHaveValue('ui')
    expect(screen.getByRole('img', { name: 'Interfaz' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Gameplay' })).not.toBeInTheDocument()
  })
})
