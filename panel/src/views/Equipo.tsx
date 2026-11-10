import { useEffect, useState } from 'react'
import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { StatusDot } from '@/components/StatusDot'
import { useAction } from '@/feel/useAction'
import { useResource } from '@/hooks/useResource'
import { humanError } from '@/lib/errors'
import { assetName } from '@/lib/approvals'
import { stageLabel, type Stage } from '@/lib/tasks'

/** Hito 29: lo que cada Nomos del equipo publica de sí mismo en la rama `nomos/equipo`. */
export interface PeerTask { id: string; title: string; state: string; area: string }
export interface Peer { id: string; name: string; frente: string; present: boolean; tasks: PeerTask[]
  leases: { path: string; until: string }[]; build: { commit: string; at: string } | null
  /** Jam: lo último hecho, su `main` y cuántos commits va por detrás de origin (opcionales: un Nomos viejo no los manda). */
  done?: { id: string; title: string; summary: string; at: string }[]; main?: { commit: string; at: string } | null; behind?: number | null }
export interface Team { me: { id: string; name: string; frente: string } | null; peers: Peer[] }

const working = (t: PeerTask) => t.state !== 'pendiente' && t.state !== 'preparada'
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** Ficha de una tarea de otra persona: solo lectura; la única acción es pedirle algo. */
function ForeignTask({ peer, task, onClose }: { peer: Peer; task: PeerTask; onClose: () => void }) {
  const [text, setText] = useState('')
  const ask = useAction(() => api('/team/ask', { method: 'POST', body: { to: peer.name, title: task.title, text: text.trim() } }),
    { success: () => { setText(''); onClose(); return { title: `Petición enviada a ${peer.name}` } } })
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent aria-label={task.title}>
      <DialogTitle>{task.title}</DialogTitle>
      <DialogDescription>De {peer.name} · {peer.frente} · {stageLabel[task.state as Stage] ?? task.state}. Solo la mueve {peer.name}.</DialogDescription>
      <Textarea aria-label={`Qué pedir a ${peer.name}`} placeholder={`Qué necesitas de ${peer.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!text.trim() || ask.pending} onClick={() => void ask.fire()}>Pedir</Button>
        {ask.error && <span role="alert" className="text-xs text-error">No se envió. {humanError(ask.error)}</span>}
      </div>
    </DialogContent>
  </Dialog>
}

/** Franja «Equipo» de Producción: una línea por persona (nombre · frente · presente · en curso · reservas · build · main · hecho). */
export function EquipoStrip() {
  const { data, reload } = useResource<Team>('/team', /^team\./)
  const [open, setOpen] = useState<{ peer: Peer; task: PeerTask } | null>(null)
  // las tarjetas de los demás cambian sin evento propio (latido, tareas): se vuelve a pedir cada minuto
  useEffect(() => { const timer = setInterval(reload, 60_000); return () => clearInterval(timer) }, [reload])
  if (!data?.me) return null
  return <section aria-label="Equipo" className="flex flex-col gap-2 rounded-lg border border-subtle px-4 py-3 text-sm">
    <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Equipo · tú: {data.me.name} ({data.me.frente})</h2>
    {!data.peers.length && <p className="text-muted-foreground">Aún no se ha unido nadie más.</p>}
    <ul className="flex flex-col gap-2">
      {data.peers.map((peer) => {
        const busy = peer.tasks.filter(working)
        return <li key={peer.id} aria-label={peer.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 font-medium"><StatusDot tone={peer.present ? 'success' : 'neutral'} />{peer.name}</span>
          <span>{peer.frente}</span>
          <span className="text-muted-foreground">{peer.present ? 'presente' : 'ausente'}</span>
          <span>{busy.length ? '' : 'sin tareas en curso'}{busy.map((t) =>
            <Button key={t.id} variant="link" size="sm" className="h-auto p-0 pr-2" onClick={() => setOpen({ peer, task: t })}>{t.title}</Button>)}</span>
          {peer.leases.length > 0 && <span className="text-muted-foreground">reserva {peer.leases.map((l) => `${assetName(l.path)} hasta ${hhmm(l.until)}`).join(', ')}</span>}
          <span className="font-mono text-xs text-muted-foreground">{peer.build ? `build ${peer.build.commit.slice(0, 7)}` : 'sin build aprobada'}</span>
          {peer.main && <span className="font-mono text-xs text-muted-foreground">main {peer.main.commit.slice(0, 7)}{peer.behind ? ` · ${peer.behind} atrás` : ''}</span>}
          {peer.done?.[0] && <span className="text-muted-foreground">hecho: {peer.done[0].title}</span>}
        </li>
      })}
    </ul>
    {open && <ForeignTask {...open} onClose={() => setOpen(null)} />}
  </section>
}
