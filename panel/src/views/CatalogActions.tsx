import { useState, type ComponentType, type SVGProps } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAction } from '@/feel/useAction'
import { minuteKey, sendCommand } from '@/hooks/assetCommands'
import { useStore } from '@/store'
import { glyphFor } from '@/visual/glyphs'

export function StatusIcon({ value, label, tone }: { value: string; label: string; tone: 'warning' | 'error' | 'success' }) {
  const Icon = glyphFor('taskState', value).Icon as ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  const colors = { warning: 'text-warning', error: 'text-error', success: 'text-success' }
  return <Icon size={16} role="img" aria-label={label} aria-hidden={undefined} className={`shrink-0 ${colors[tone]}`} />
}

/** Mismo criterio que el servicio: el motor que verificó no está entre las versiones declaradas del pack. */
export function versionWarning(engineVersions: string[], verifiedEngine?: string | null): string | null {
  const short = verifiedEngine?.match(/^\d+\.\d+/)?.[0]
  if (!engineVersions.length || !verifiedEngine || !short || engineVersions.includes(short)) return null
  const declared = engineVersions.length > 1 ? `${engineVersions[0]}-${engineVersions.at(-1)}` : engineVersions[0]
  return `Publicado para ${declared}; verificado en ${verifiedEngine}`
}

/** Una palabra visible; el aviso completo va en la ayuda (presupuesto de cinco palabras por tarjeta). */
export function VersionWarning({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger render={<span tabIndex={0} aria-label={text} title={text} className="inline-flex items-center gap-1 text-xs text-warning outline-offset-2" />}>
    <StatusIcon value="decision" label="Aviso de versión" tone="warning" />Versión
  </TooltipTrigger><TooltipContent role="tooltip">{text}</TooltipContent></Tooltip>
}

/** Migrar por nivel 1: copia el pack al proyecto y lo verifica sin GUI; el resultado llega por eventos. */
export function MigrateButton({ entryId, name, project }: { entryId: string; name: string; project: string }) {
  const [requested, setRequested] = useState(false)
  const outcome = useStore((s) => s.events.findLast((e) => (e.type === 'asset.migrated' || e.type === 'asset.verify_failed') && e.payload.entryId === entryId))
  const migrate = useAction(() => sendCommand('asset.migrate', { entryId }, `migrate:${entryId}:${project}`), {
    success: () => { setRequested(true); return { title: `Migrando ${name}`, description: `Se copia a ${project} y se verifica sin abrir el editor.` } },
  })
  const failed = requested && outcome?.type === 'asset.verify_failed'
  const label = migrate.pending ? 'Migrando…' : failed ? 'Falló' : requested ? 'Verificando' : 'Migrar'
  const hint = failed ? 'La verificación sin GUI falló: revisa el informe en Entregas.' : requested ? 'En cola: copia y verificación sin GUI.' : `Copiar ${name} a ${project} y verificarlo sin GUI.`
  return <Tooltip><TooltipTrigger render={<Button variant="outline" size="sm" aria-label={`Migrar ${name} a ${project}`} aria-description={hint}
    disabled={migrate.pending} aria-busy={migrate.pending} aria-disabled={requested || undefined}
    onClick={() => { if (!requested) void migrate.fire() }} />}>
    {failed && <StatusIcon value="bloqueada" label="Verificación fallida" tone="error" />}{label}
  </TooltipTrigger><TooltipContent role="tooltip">{hint}</TooltipContent></Tooltip>
}

/** Nivel 2: el pack está en tu biblioteca de Fab pero no en disco; Nomos abre el Launcher y vigila su llegada. */
export function DownloadButton({ entryId, name }: { entryId: string; name: string }) {
  const [requested, setRequested] = useState(false)
  const download = useAction(() => sendCommand('asset.request_download', { entryId }, minuteKey(`download:${entryId}`)), {
    success: () => { setRequested(true); return { title: `Abriendo Fab para ${name}`, description: 'Sigue los pasos de Descargas pendientes.' } },
  })
  const hint = requested ? 'Pendiente: sigue los pasos arriba del catálogo.' : `Abrir el Launcher para añadir ${name} al proyecto cuarentena.`
  return <Tooltip><TooltipTrigger render={<Button variant="outline" size="sm" aria-label={`Descargar ${name} desde Fab`} aria-description={hint}
    disabled={download.pending} aria-busy={download.pending} aria-disabled={requested || undefined}
    onClick={() => { if (!requested) void download.fire() }} />}>
    {download.pending ? 'Abriendo…' : requested ? 'Pendiente' : 'Descargar'}
  </TooltipTrigger><TooltipContent role="tooltip">{hint}</TooltipContent></Tooltip>
}
