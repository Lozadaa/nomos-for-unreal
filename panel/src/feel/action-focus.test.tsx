import { useRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useAction } from './useAction'

it('una acción que abre un campo puede preservar su nuevo foco', async () => {
  function FocusAction() {
    const field = useRef<HTMLInputElement>(null)
    const action = useAction(async () => { field.current?.focus() }, { minPendingMs: 0, restoreFocus: false })
    return <><button aria-busy={action.pending} onClick={() => void action.fire()}>Escribir</button><input ref={field} aria-label="Petición" /></>
  }
  render(<FocusAction />)
  const button = screen.getByRole('button')
  button.focus()
  fireEvent.click(button)
  await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'))
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
})
