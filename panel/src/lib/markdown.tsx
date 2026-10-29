import { Fragment, useState, type ReactNode } from 'react'
import { Link, useInRouterContext } from 'react-router'
import { Square, SquareCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Markdown seguro del director y los workers (hito 10): negrita, cursiva, código en línea, listas, tablas simples, saltos
 * de línea y enlaces a rutas del panel. Todo sale como nodos de React (el HTML crudo se ve escapado); sin imágenes ni
 * enlaces externos. `/tareas/<id>` abre la ficha y muestra el título, nunca el uuid.
 * Hito 23: `## título`, `- [x]`/`- [ ]` con icono, código plegado bajo «Detalle técnico», rutas largas como nombre de
 * archivo (la ruta en el tooltip) y, con `clamp`, recorte a 6 líneas con «Mostrar todo».
 */
type TaskTitle = (id: string) => string | undefined
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
// `_x_` y `__x__` solo fuera de palabras: Columna_0_ancha o SM_Raqueta_01 no son cursiva
const longPath = /((?:[A-Za-z]:)?[\\/]?(?:[\w.-]+[\\/]){2,}[\w.-]+)/
const token = /(\*\*[^*]+\*\*|(?<![\p{L}\p{N}])__[^_]+__(?![\p{L}\p{N}])|`[^`]+`|!?\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|(?<![\p{L}\p{N}])_[^_\s][^_]*_(?![\p{L}\p{N}]))/gu

/** Fuera de un router (pruebas aisladas, popups) el enlace es un <a> normal a la misma ruta. */
let routed = true
const anchor = (key: number, to: string, label: string) => routed
  ? <Link key={key} to={to} className="underline underline-offset-2">{label}</Link>
  : <a key={key} href={to} className="underline underline-offset-2">{label}</a>

function link(label: string, href: string, title: TaskTitle | undefined, key: number): ReactNode {
  const task = /^\/tareas\/([\w-]+)$/.exec(href)?.[1]
  if (task) {
    const shown = title?.(task) ?? (uuid.test(label) || label === task ? 'tarea' : label)
    return anchor(key, `/?tarea=${encodeURIComponent(task)}`, uuid.test(label) || label === task ? shown : label)
  }
  return /^\/(?!\/)/.test(href) ? anchor(key, href, label) : <Fragment key={key}>{label}</Fragment>
}

function inline(text: string, title?: TaskTitle): ReactNode[] {
  return text.split(token).filter(Boolean).map((part, i) => {
    if (/^(\*\*|__)/.test(part)) return <strong key={i}>{inline(part.slice(2, -2), title)}</strong>
    if (part.startsWith('`')) return <code key={i} className="rounded-sm bg-muted px-1 font-mono text-[0.9em]">{part.slice(1, -1)}</code>
    const md = /^(!?)\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (md) return md[1] ? <Fragment key={i}>{md[2]}</Fragment> : link(md[2], md[3], title, i)
    if (/^[*_].+[*_]$/.test(part)) return <em key={i}>{inline(part.slice(1, -1), title)}</em>
    return <Fragment key={i}>{part.replace(uuid, (id) => title?.(id) ?? id.slice(0, 8)).split(longPath).map((p, j) => j % 2 && p.length > 40
      ? <span key={j} title={p}>{p.split(/[\\/]/).pop()}</span> : p)}</Fragment>
  })
}

/** «Tareas: 1) a. 2) b. 3) c.» en una sola línea: la introducción y los elementos, si van 1, 2, 3… seguidos. */
function enumeration(line: string): { intro: string; items: string[] } | null {
  const parts = line.split(/(?:^|\s)(\d{1,2})[).]\s+/)
  if (parts.length < 5) return null
  const numbers = parts.filter((_, i) => i % 2 === 1).map(Number)
  if (!numbers.every((n, i) => n === i + 1)) return null
  return { intro: parts[0].trim(), items: parts.filter((_, i) => i > 0 && i % 2 === 0).map((s) => s.trim()) }
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

const heading = /^\s{0,3}#{1,6}\s+/
const kind = (l: string) => heading.test(l) ? 'h' : /^\s*[-*•]\s+/.test(l) ? 'ul' : /^\s*\d+[.)]\s+/.test(l) ? 'ol' : l.trim().startsWith('|') ? 'table' : 'p'

/** Un bloque se parte en tramos del mismo tipo: «Tareas:» seguido de una lista son un párrafo y una lista. */
function runs(lines: string[]): string[][] {
  const out: string[][] = []
  for (const l of lines) {
    const last = out.at(-1)
    if (last && kind(last[0]) === kind(l)) last.push(l); else out.push([l])
  }
  return out
}

function block(lines: string[], title: TaskTitle | undefined, key: number): ReactNode {
  if (runs(lines).length > 1) return <Fragment key={key}>{runs(lines).map((run, i) => block(run, title, i))}</Fragment>
  if (lines.every((l) => heading.test(l))) return <Fragment key={key}>{lines.map((l, i) => <h4 key={i} className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{inline(l.replace(heading, ''), title)}</h4>)}</Fragment>
  if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={key} className="list-disc pl-5">{lines.map((l, i) => {
    const item = l.replace(/^\s*[-*•]\s+/, ''), check = /^\[([ xX])\]\s+/.exec(item)
    if (!check) return <li key={i}>{inline(item, title)}</li>
    const Icon = check[1] === ' ' ? Square : SquareCheck
    return <li key={i} className="-ml-5 flex list-none items-start gap-1.5"><Icon role="img" aria-label={check[1] === ' ' ? 'pendiente' : 'hecho'} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>{inline(item.slice(check[0].length), title)}</span></li>
  })}</ul>
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={key} className="list-decimal pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), title)}</li>)}</ol>
  if (lines.length >= 2 && lines.every((l) => l.trim().startsWith('|')) && /^[\s|:-]+$/.test(lines[1])) {
    // la tabla ancha se desplaza dentro de la burbuja, nunca la página
    return <div key={key} className="max-w-full overflow-x-auto [overflow-wrap:normal]"><table className="text-left text-sm"><thead><tr>{cells(lines[0]).map((c, i) => <th key={i} className="border-b border-subtle px-2 py-1 font-medium">{inline(c, title)}</th>)}</tr></thead>
      <tbody>{lines.slice(2).map((row, r) => <tr key={r}>{cells(row).map((c, i) => <td key={i} className="px-2 py-1">{inline(c, title)}</td>)}</tr>)}</tbody></table></div>
  }
  const single = lines.length === 1 ? enumeration(lines[0]) : null
  if (single) return <Fragment key={key}>{single.intro && <p>{inline(single.intro, title)}</p>}
    <ol className="list-decimal pl-5">{single.items.map((item, i) => <li key={i}>{inline(item, title)}</li>)}</ol></Fragment>
  return <p key={key}>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, title)}</Fragment>)}</p>
}

export function Markdown({ text, taskTitle, className, clamp }: { text: string; taskTitle?: TaskTitle; className?: string; clamp?: boolean }) {
  routed = useInRouterContext()
  const [all, setAll] = useState(false)
  // ```bloques de código``` aparte: su texto va tal cual, con scroll propio dentro de la burbuja
  const parts = text.replace(/\r\n?/g, '\n').split(/^```[^\n]*\n([\s\S]*?)^```\s*$/m)
  let key = 0
  const nodes = parts.flatMap((part, i): ReactNode[] => i % 2
    ? [<details key={key++} className="text-xs"><summary className="cursor-pointer text-muted-foreground">Detalle técnico · {part.replace(/\n$/, '').split('\n').length} líneas</summary>
      <pre className="mt-1 max-w-full overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs [overflow-wrap:normal]">{part.replace(/\n$/, '')}</pre></details>]
    : part.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim())).filter((b) => b.length).map((b) => block(b, taskTitle, key++)))
  // recorte por texto (6 líneas o ~6 líneas de ancho): jsdom no mide alturas y el corte es el mismo en todas partes
  const long = clamp && (text.split('\n').filter((l) => l.trim()).length > 6 || text.length > 480)
  return <div className={cn('flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]', className)}>
    {long ? <>
      <div className={cn('flex min-w-0 flex-col gap-2', !all && 'max-h-[6lh] overflow-hidden')}>{nodes}</div>
      <button type="button" className="self-start text-xs text-muted-foreground underline underline-offset-2" onClick={() => setAll(!all)}>{all ? 'Mostrar menos' : 'Mostrar todo'}</button>
    </> : nodes}
  </div>
}
