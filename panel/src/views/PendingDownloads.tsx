import { api } from '@/api'
import { Button } from '@/components/ui/button'
import { useAction } from '@/feel/useAction'
import { useResource } from '@/hooks/useResource'
import { BRAND } from '@/lib/brand'

export interface PendingDownload { id: string; entryId: string; name: string | null; state: string; instructions: string; requestedAt: string }

function Row({ download }: { download: PendingDownload }) {
  const check = useAction(() => api(`/downloads/${encodeURIComponent(download.id)}/check`, { method: 'POST', body: {} }), {
    success: () => ({ title: 'Checking the download', description: `${BRAND.short} is checking the Launcher now.` }),
  })
  return <li className="flex flex-wrap items-center gap-3 py-2">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">{download.name ?? 'Fab asset'}</p>
      <p className="text-xs text-muted-foreground">{download.instructions}</p>
    </div>
    <span className="text-xs text-warning">Waiting for the Launcher</span>
    <Button variant="outline" size="sm" disabled={check.pending} aria-busy={check.pending} onClick={() => void check.fire()}>I’ve added it</Button>
  </li>
}

/** Descargas del nivel 2 que esperan a que el pack llegue al proyecto cuarentena. */
export function PendingDownloads() {
  const { data } = useResource<PendingDownload[]>('/downloads?state=pending', /^download\./)
  if (!data?.length) return null
  return <section aria-label="Pending downloads" className="rounded-lg border border-subtle px-4 py-2">
    <h2 className="pt-1 text-sm font-medium">Pending downloads</h2>
    <ul className="divide-y divide-subtle">{data.map((d) => <Row key={d.id} download={d} />)}</ul>
  </section>
}
