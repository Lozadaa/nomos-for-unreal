import { Popover } from '@base-ui/react/popover'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Decision } from '@/lib/tasks'
import { cn } from '@/lib/utils'
import { useAuthedSrc } from '@/hooks/artifact'
import { budgets, countWords, truncateWords } from '@/visual/text-budget'

/** Reserva espacio para el id, el detalle y el estado de envío antes de repartir pregunta y opciones. */
export function decisionText(decision: Decision) {
  const optionLimit = Math.max(1, Math.min(4, Math.floor((budgets.decisionCard - 10) / Math.max(1, decision.options.length))))
  const optionWords = decision.options.reduce((sum, option) => sum + Math.min(optionLimit, countWords(option.label)), 0)
  return { reason: truncateWords(decision.reason, Math.max(1, budgets.decisionCard - optionWords - 6)), optionLimit }
}

/** Miniatura propia de la opción (con token vía service worker); la etiqueta ya la nombra. */
function Thumbnail({ path }: { path: string }) {
  const src = useAuthedSrc(path)
  return src ? <img src={src} alt="" width={160} height={160} loading="lazy" className="aspect-square w-full rounded-md object-cover" /> : null
}

/**
 * Hito 7: cada opción es una tarjeta de texto (etiqueta de 4 palabras como mucho); solo lleva imagen si tiene miniatura
 * propia (catálogo, Meshy) y el único acento es el borde de la recomendada. La descripción va en el tooltip y en la
 * descripción accesible: visible no cabe en las 20 palabras de la tarjeta (presupuesto del hito 9).
 */
export function DecisionOptions({ decision, selected, disabled, onChoose }: {
  decision: Decision; area?: string; selected?: string | null; disabled: boolean; onChoose: (id: string) => void
}) {
  const { optionLimit } = decisionText(decision)
  return <div role="group" aria-label="Opciones" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {decision.options.map((option) => <Tooltip key={option.id}>
      <TooltipTrigger render={<button type="button" aria-label={option.label} aria-description={option.description || undefined}
        aria-pressed={selected === option.id} disabled={disabled} data-recommended={option.recommended ? '' : undefined}
        onClick={() => onChoose(option.id)}
        className={cn('flex min-h-16 min-w-0 flex-col items-start justify-center gap-2 rounded-lg border border-subtle bg-card px-4 py-3 text-left text-sm transition-colors duration-(--k-dur-micro) hover:border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-50',
          option.recommended && 'border-primary', selected === option.id && 'border-primary ring-1 ring-primary')} />}>
        {option.thumbnail && <Thumbnail path={option.thumbnail} />}
        <span className="font-medium">{truncateWords(option.label, optionLimit)}</span>
      </TooltipTrigger>
      <TooltipContent role="tooltip" className="flex-col items-start"><span>{option.label}{option.recommended ? ' · recomendada' : ''}</span>{option.description && <span>{option.description}</span>}</TooltipContent>
    </Tooltip>)}
  </div>
}

/** La evidencia conserva su texto completo en un popup que funciona con ratón y teclado. */
export function DecisionDetails({ decision, taskTitle }: { decision: Decision; taskTitle?: string }) {
  return <Popover.Root>
    <Popover.Trigger render={<Button type="button" variant="ghost" size="sm" />}>Detalle</Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner sideOffset={8} className="z-50">
        <Popover.Popup role="dialog" className="flex max-h-96 w-80 flex-col gap-3 overflow-auto rounded-lg border border-strong bg-popover p-4 text-popover-foreground outline-none">
          <Popover.Title className="text-sm font-medium">Detalle de la decisión</Popover.Title>
          <Popover.Description className="text-sm">{decision.reason}</Popover.Description>
          {taskTitle && <p className="text-xs text-muted-foreground">{taskTitle}</p>}
          {decision.evidence.length > 0 && <ul aria-label="Evidencia" className="flex flex-col gap-2 text-xs text-muted-foreground">
            {decision.evidence.map((evidence, index) => <li key={index} className="break-words"><span className="font-mono">{evidence.kind}</span> · {evidence.ref}</li>)}
          </ul>}
          <Popover.Close render={<Button type="button" variant="outline" size="sm" className="self-start" />}>Cerrar</Popover.Close>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
}
