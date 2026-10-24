import { useState } from 'react'
import { Link } from 'react-router'
import { useAuthedSrc } from '@/hooks/artifact'
import { useResource } from '@/hooks/useResource'
import { BRAND } from '@/lib/brand'
import { humanError } from '@/lib/errors'
import { AreaPictogram } from '@/visual/art/AreaPictogram'

/** Lo que devuelve `GET /projects` (hito 10): sin tokens ni rutas de datos. */
export interface Project { name: string; dir: string; port: number; alive: boolean; current: boolean; liveTasks?: number; openDecisions?: number; hasCapture?: boolean }

/** Otro proyecto se abre en su propio servicio; su panel pide el token a su servicio local (GET /session). */
export const projectHref = (p: Project) => p.current ? '/' : `http://127.0.0.1:${p.port}/`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Card({ p }: { p: Project }) {
  const capture = useAuthedSrc(p.hasCapture ? `/projects/${p.port || 0}/capture` : null)
  const [broken, setBroken] = useState(false)
  const body = (
    <>
      <div className="aspect-video overflow-hidden border-b border-subtle bg-card">
        {capture && !broken ? <img src={capture} alt={`Última captura de ${p.name}`} width={480} height={270} className="size-full object-cover" loading="lazy" onError={() => setBroken(true)} />
          // sin captura o si no carga: el pictograma de escenario del taller art/, nunca una imagen rota
          : <span role="img" aria-label={`${p.name} sin captura`} className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <span aria-hidden className="contents"><AreaPictogram area="escenarios" size={48} /></span>
            <span aria-hidden className="text-sm">{p.name}</span>
          </span>}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className="flex items-center gap-2 font-medium">{p.name}{p.current && <span className="text-xs font-normal text-muted-foreground">· este panel</span>}</span>
        <span className="text-xs text-muted-foreground">{p.alive
          ? `${plural(p.liveTasks ?? 0, 'tarea viva', 'tareas vivas')} · ${plural(p.openDecisions ?? 0, 'Decisión', 'Decisiones')}`
          : `Parado · ${BRAND.short.toLowerCase()} start en su carpeta`}</span>
      </div>
    </>
  )
  const box = 'flex flex-col overflow-hidden rounded-lg border border-subtle bg-background transition-colors duration-(--k-dur-micro) hover:border-strong'
  return <li>{!p.alive ? <div className={box} aria-disabled>{body}</div>
    : p.current ? <Link to="/" className={box}>{body}</Link> : <a href={projectHref(p)} className={box}>{body}</a>}</li>
}

/** Portada: los juegos con servicio en esta máquina, para abrir el panel del correcto. */
export function Proyectos() {
  const { data, error } = useResource<Project[]>('/projects')
  if (error && !data) return <p role="alert" className="text-sm text-error">No se pudieron leer los proyectos. {humanError(new Error(error))}</p>
  return (
    <section aria-label={`Proyectos con ${BRAND.short}`} className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Proyectos en este equipo</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">{(data ?? []).map((p) => <Card key={`${p.port}-${p.name}`} p={p} />)}</ul>
    </section>
  )
}
