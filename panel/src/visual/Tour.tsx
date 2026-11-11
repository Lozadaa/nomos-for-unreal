import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Popover } from '@base-ui/react/popover'
import { Button } from '@/components/ui/button'
import { withViewTransition } from '@/feel/transitions'
import { useAction } from '@/feel/useAction'
import './help.css'
import { BRAND } from '@/lib/brand'

export const tourKey = 'nomos.tour.v1'
export function needsTour() {
  try { return !localStorage.getItem(tourKey) } catch { return true }
}

const steps = [
  { target: 'director', text: `See whether ${BRAND.short} is listening` },
  { target: 'composer', text: 'Ask for something here' },
  { target: 'map', text: 'Watch the work move along' },
] as const

/** La guía señala los controles reales y solo navega cuando se pide el segundo paso. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  const location = useLocation()
  const navigate = useNavigate()
  const current = steps[step]

  useEffect(() => {
    try { localStorage.setItem(tourKey, '1') } catch { /* El navegador puede impedir persistir preferencias. */ }
  }, [])

  useEffect(() => {
    const highlight = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour-anchor="${current.target}"]`)
      setAnchor(element)
      element?.setAttribute('data-tour-highlight', '')
      element?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
      return element
    }
    let element = highlight()
    // El mapa espera a GET /tasks; la guía sigue al nodo cuando termina la carga.
    const observer = new MutationObserver(() => {
      if (!element?.isConnected) element = highlight()
    })
    observer.observe(document.getElementById('contenido') ?? document.body, { subtree: true, childList: true })
    return () => { observer.disconnect(); element?.removeAttribute('data-tour-highlight') }
  }, [current.target, location.pathname])

  const next = useAction(async () => {
    if (step === steps.length - 1) { onClose(); return }
    if (step === 0 && location.pathname !== '/') await withViewTransition(() => navigate('/', { flushSync: true }))
    setStep((value) => value + 1)
  }, { minPendingMs: 0, restoreFocus: false })
  const close = useAction(async () => onClose(), { minPendingMs: 0, restoreFocus: false })

  if (!anchor) return null
  return <Popover.Root open modal="trap-focus" onOpenChange={(open) => { if (!open) onClose() }}>
    <Popover.Portal>
      <Popover.Positioner anchor={anchor} side="bottom" align="start" sideOffset={12} collisionPadding={24} className="z-50">
        <Popover.Popup role="dialog" data-tour-target={current.target}
          finalFocus={() => previousFocus.current?.isConnected && previousFocus.current !== document.body
            ? previousFocus.current : anchor.querySelector<HTMLElement>('input,button,[tabindex]') ?? document.getElementById('contenido')}
          className="flex w-80 max-w-[calc(100vw-3rem)] flex-col gap-3 rounded-lg border border-strong bg-popover p-4 text-popover-foreground outline-none">
          <div className="flex items-center justify-between gap-4">
            <Popover.Title className="text-sm font-medium">{BRAND.short} tour</Popover.Title>
            <span className="font-mono text-xs text-muted-foreground" aria-label={`Step ${step + 1} of 3`}>{step + 1} / 3</span>
          </div>
          <Popover.Description className="text-sm" aria-live="polite">{current.text}</Popover.Description>
          <div className="flex items-center justify-between gap-3">
            <Popover.Close render={<Button variant="ghost" size="sm" onClick={() => void close.fire()} />}>Close tour</Popover.Close>
            <Button size="sm" disabled={next.pending} aria-busy={next.pending} onClick={() => void next.fire()}>{step === 2 ? 'Finish' : 'Next'}</Button>
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
}
