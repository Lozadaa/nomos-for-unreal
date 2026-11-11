import { memo, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { stages, stageLabel, type Stage, type Task } from '@/lib/tasks'
import { reducedMotion } from '@/feel/motion'
import { isApplyingViewTransition, queueWhileTransitioning, supportsViewTransitions, withViewTransition } from '@/feel/transitions'
import { memoSeed, rng } from './seed'
import './art.css'

export type MapTask = Pick<Task, 'id' | 'state' | 'blockedReason' | 'decisionId'>
const signature = (tasks: readonly MapTask[]) => JSON.stringify(tasks.map((t) => [t.id, t.state, !!t.blockedReason, !!t.decisionId]))

export const ProductionMap = memo(function ProductionMap({ tasks, onSelect, onKeyboardSelect, id, selected }: {
  tasks: readonly MapTask[]; onSelect?: (stage: Stage) => void; onKeyboardSelect?: (stage: Stage) => void; id?: string; selected?: Stage
}) {
  const key = signature(tasks)
  const [shown, setShown] = useState(tasks)
  const [hint, setHint] = useState<string>()
  const previous = useRef(key)
  useLayoutEffect(() => {
    if (previous.current === key) return
    previous.current = key
    if (isApplyingViewTransition()) { setShown(tasks); return }
    if (reducedMotion() || !supportsViewTransitions()) { setShown(tasks); return }
    let cancelled = false
    void queueWhileTransitioning(async () => {
      // La captura y flushSync se hacen fuera del ciclo de efectos de React.
      await Promise.resolve()
      if (cancelled) return
      if (reducedMotion() || !supportsViewTransitions()) { setShown(tasks); return }
      await withViewTransition(() => {
        if (cancelled) return
        if (reducedMotion()) { setShown(tasks); return }
        flushSync(() => setShown(tasks))
      })
    })
    return () => { cancelled = true }
  }, [key])
  const geometry = memoSeed('map', signature(shown), () => {
    const counts = stages.map((stage) => shown.filter((t) => t.state === stage).length)
    const offsets = stages.map(() => 0)
    const points = shown.length > 12 ? [] : shown.map((task) => {
      const stage = stages.indexOf(task.state)
      return { ...task, x: 50 + stage * 100 - (counts[stage] - 1) * 3.5 + offsets[stage]++ * 7 }
    })
    return { counts, points }
  })
  const namespace = id ?? signature(shown)
  const question = memoSeed('map-id', namespace, () => `q${Math.floor(rng(namespace)() * 4294967296).toString(36)}`)
  return <div title={hint}><svg viewBox="0 0 800 80" role="group" aria-label="Production flow" className="k-map">
    <path d="M50 28H750" />
    <path d="M50 28H751" />
    <path d="M50 28H751" />
    <g>
      {stages.map((stage, i) => <text key={stage} role="button" tabIndex={0} aria-label={`${stageLabel[stage]}: ${geometry.counts[i]}`} aria-pressed={stage === selected ? true : undefined} x={50 + i * 100}
        onPointerEnter={() => setHint(`${stageLabel[stage]}: ${geometry.counts[i]}`)} onPointerLeave={() => setHint(undefined)}
        onFocus={() => setHint(`${stageLabel[stage]}: ${geometry.counts[i]}`)} onBlur={() => setHint(undefined)}
        onClick={() => onSelect?.(stage)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (onKeyboardSelect ?? onSelect)?.(stage) } }}>{geometry.counts[i]}</text>)}
    </g>
    {geometry.points.some((p) => p.decisionId) && <defs><path id={question} d="M-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0m3-1q0-2 2-1t-1 3m0 1v1" /></defs>}
    <g>{geometry.points.map((p) => p.decisionId
      ? <use key={p.id} data-point="" role="img" aria-label="Needs decision" href={`#${question}`} x={p.x} />
      : p.blockedReason
        ? <path key={p.id} data-point="" role="img" aria-label="Blocked" d={`M${p.x} -4l4 4-4 4-4-4Z`} />
        : <circle key={p.id} data-point="" cx={p.x} r="2" />)}</g>
  </svg></div>
})
