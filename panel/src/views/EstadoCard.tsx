import { useEffect, useId, useState, type ReactNode } from 'react'
import { AudioLines, Bot, Box, Check, ChevronDown, Copy, Cpu, HardDrive, Terminal, TriangleAlert, Users, Wrench } from 'lucide-react'
import { useResource } from '@/hooks/useResource'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Lo que da `GET /resumen` (service/src/resumen.ts). Sin claves: de Meshy solo el nombre de la cuenta y su saldo. */
export type Resumen = {
  claude: { tokensHoy: number; tokensSemana: number; workers: number; director: boolean }
  ias: { id: 'codex' | 'opencode'; nombre: string; cupo: number; enUso: number }[]
  meshy: { cuentas: { nombre: string; creditos: number | null }[]; total: number } | null
  sonido: { guardada: string } | null
  maquina: { unreal: string | null; ramLibreGb: number; ramTotalGb: number; discoLibreGb: number | null; discoTotalGb: number | null; discoBajo: boolean; editores: number }
  equipo: { personas: number; conectadas: number; atrasados: { nombre: string; commits: number }[] } | null
  falta: { que: string; comando?: string; detalle?: string }[]
  generado: string
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en')
const gb = (n: number) => `${whole.format(Math.floor(n))} GB`
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Barra fina: `value` sobre `max`; el tono cambia solo cuando hay algo que mirar. */
function Meter({ value, max, tone = 'ink', label }: { value: number; max: number; tone?: 'ink' | 'warning' | 'error'; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return <span role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="block h-0.5 w-full overflow-hidden bg-foreground/12">
    <span className={cn('block h-full origin-left transition-transform duration-300 ease-(--k-ease) motion-reduce:transition-none',
      tone === 'ink' ? 'bg-foreground' : tone === 'warning' ? 'bg-warning' : 'bg-error')} style={{ transform: `scaleX(${pct / 100})` }} />
  </span>
}

/** Una celda de la franja: icono y nombre, cifra grande, medidor opcional y una línea pequeña. */
function Cell({ icon, label, value, unit, meter, sub, alert }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; meter?: ReactNode; sub?: ReactNode; alert?: boolean }) {
  return <span className="flex min-w-0 flex-col gap-2 px-4 py-3.5">
    <span className={cn('k-label flex items-center gap-1.5 text-muted-foreground', alert && 'text-warning')}>{icon}<span className="truncate">{label}</span></span>
    <span className="flex flex-wrap items-baseline gap-x-1.5"><span className="k-display text-[2.5rem] leading-[0.85] tabular-nums">{value}</span>{unit && <span className="k-label whitespace-nowrap text-muted-foreground">{unit}</span>}</span>
    {meter}
    {sub && <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">{sub}</span>}
  </span>
}

function CopyCommand({ command }: { command: string }) {
  const [done, setDone] = useState(false)
  return <span className="flex min-w-0 items-center gap-1 rounded-sm border border-subtle bg-background pl-2.5">
    <code className="min-w-0 flex-1 truncate py-1 font-mono text-xs" title={command}>{command}</code>
    <button type="button" aria-label={`Copy ${command}`} title="Copy"
      onClick={() => void navigator.clipboard?.writeText(command).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => undefined)}
      className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  </span>
}

const icon = 'size-3.5 shrink-0'

/** La tarjeta de estado de Inicio: qué tengo, cuánto me queda y qué falta. Una franja; al pulsarla, el detalle en el sitio. */
export function EstadoCard() {
  const resumen = useResource<Resumen>('/resumen', /^(run|worker|spend|team)\./)
  const [open, setOpen] = useState(false)
  const panel = useId()
  const { reload } = resumen
  // RAM, disco y saldos cambian sin eventos: se vuelve a pedir cada 30 s (el servicio cachea lo caro)
  useEffect(() => { const t = setInterval(reload, 30_000); return () => clearInterval(t) }, [reload])
  const r = resumen.data
  if (!r) return resumen.error
    ? null
    : <div aria-hidden className="h-[132px] animate-pulse rounded-md border border-subtle bg-card motion-reduce:animate-none" />

  const m = r.maquina, ramUsed = m.ramTotalGb - m.ramLibreGb
  const meshyMax = Math.max(1, ...(r.meshy?.cuentas.map((c) => c.creditos ?? 0) ?? []))
  return <section aria-label="Status" className="overflow-hidden rounded-md border border-subtle bg-card">
    <div className="flex items-center gap-2 border-b border-subtle px-4 py-2">
      <span aria-hidden className="k-slash" /><span className="k-label">Status</span>
      <span className="k-label ml-auto text-muted-foreground tabular-nums">Updated {time(r.generado)}</span>
    </div>
    <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}
      className="group grid w-full grid-cols-2 text-left outline-offset-[-2px] transition-colors duration-(--k-dur-micro) hover:bg-foreground/[0.02] sm:flex sm:items-stretch sm:divide-x sm:divide-subtle [&>*]:sm:flex-1">
      <Cell icon={<Terminal className={icon} aria-hidden />} label="Claude today" value={compact.format(r.claude.tokensHoy)} unit="tokens"
        sub={`${compact.format(r.claude.tokensSemana)} in 7 days · ${r.claude.workers} ${r.claude.workers === 1 ? 'worker' : 'workers'}`} />
      {r.meshy && <Cell icon={<Box className={icon} aria-hidden />} label="Meshy" value={whole.format(r.meshy.total)} unit="credits" alert={r.meshy.total === 0}
        meter={<span className="flex gap-0.5" aria-hidden>{r.meshy.cuentas.map((c) => <span key={c.nombre} className="block h-0.5 flex-1 bg-foreground/12">
          <span className={cn('block h-full', c.creditos ? 'bg-foreground' : 'bg-transparent')} style={{ width: `${((c.creditos ?? 0) / meshyMax) * 100}%` }} /></span>)}</span>}
        sub={`${r.meshy.cuentas.length} ${r.meshy.cuentas.length === 1 ? 'account' : 'accounts'}`} />}
      {r.ias.map((ia) => <Cell key={ia.id} icon={<Bot className={icon} aria-hidden />} label={ia.nombre} value={`${ia.enUso}/${ia.cupo}`} unit="in use"
        meter={<Meter value={ia.enUso} max={ia.cupo} label={`${ia.nombre} in use`} />} />)}
      {r.sonido && <Cell icon={<AudioLines className={icon} aria-hidden />} label="WeLoveIndies" value={<Check className="size-6" aria-label="Session saved" />} sub={`session from ${day(r.sonido.guardada)}`} />}
      <Cell icon={<Cpu className={icon} aria-hidden />} label={m.unreal ? `Unreal ${m.unreal}` : 'Machine'} value={whole.format(Math.floor(m.ramLibreGb))} unit="GB RAM free"
        meter={<Meter value={ramUsed} max={m.ramTotalGb} label="RAM in use" />} sub={`of ${Math.round(m.ramTotalGb)} GB · ${m.editores} ${m.editores === 1 ? 'editor' : 'editors'} open`} />
      {m.discoLibreGb !== null && <Cell icon={<HardDrive className={icon} aria-hidden />} label="Free disk" value={whole.format(Math.floor(m.discoLibreGb))} unit="GB" alert={m.discoBajo}
        meter={<Meter value={(m.discoTotalGb ?? 0) - m.discoLibreGb} max={m.discoTotalGb ?? 0} tone={m.discoBajo ? 'warning' : 'ink'} label="Disk in use" />}
        sub={m.discoBajo ? <span className="inline-flex items-center gap-1 text-warning"><TriangleAlert className="size-3" aria-hidden />under 25 GB</span> : `of ${gb(m.discoTotalGb ?? 0)}`} />}
      {r.equipo && <Cell icon={<Users className={icon} aria-hidden />} label="Team" value={`${r.equipo.conectadas}/${r.equipo.personas}`} unit="online"
        sub={r.equipo.atrasados.length ? `${r.equipo.atrasados.length} behind main` : 'everyone up to date with main'} />}
      <span className="col-span-2 flex items-center justify-between gap-3 border-t border-subtle px-4 py-3 sm:col-span-1 sm:flex-[0_0_auto] sm:border-t-0">
        {r.falta.length
          ? <span className="flex flex-col gap-2">
            <span className="k-label flex items-center gap-1.5 text-warning"><Wrench className={icon} aria-hidden />To set up</span>
            <span className="k-display text-[2.5rem] leading-[0.85] tabular-nums">{r.falta.length}</span>
          </span>
          : <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="size-4 text-success" aria-hidden />All set</span>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-(--k-dur-standard) group-aria-expanded:rotate-180 motion-reduce:transition-none" aria-hidden />
      </span>
    </button>

    {open && <div id={panel} className="grid gap-6 border-t border-subtle px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="k-label text-muted-foreground">Still to set up</h3>
        {r.falta.length ? <ul className="flex flex-col gap-3">
          {r.falta.map((f) => <li key={f.que} className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-start gap-2 text-sm"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0"><span className="font-medium">{f.que}</span>{f.detalle && <span className="text-muted-foreground"> · {f.detalle}</span>}</span></span>
            {f.comando && <span className="pl-5.5"><CopyCommand command={f.comando} /></span>}
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">Nothing. Everything {BRAND.short} uses is ready.</p>}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Claude Code</dt>
        <dd className="tabular-nums">{whole.format(r.claude.tokensHoy)} tokens today · {whole.format(r.claude.tokensSemana)} in 7 days · {r.claude.director ? 'director running' : 'director stopped'}</dd>
        {r.meshy?.cuentas.map((c) => <div key={c.nombre} className="contents">
          <dt className="text-muted-foreground">Meshy · {c.nombre}</dt>
          <dd className="flex items-center gap-3 tabular-nums"><span className="w-16 shrink-0">{c.creditos === null ? 'no response' : whole.format(c.creditos)}</span>
            <Meter value={c.creditos ?? 0} max={meshyMax} tone={c.creditos === 0 ? 'error' : 'ink'} label={`${c.nombre} credits`} /></dd>
        </div>)}
        <dt className="text-muted-foreground">RAM</dt><dd className="tabular-nums">{gb(m.ramLibreGb)} free of {gb(m.ramTotalGb)}</dd>
        {m.discoLibreGb !== null && <><dt className="text-muted-foreground">Disk</dt><dd className="tabular-nums">{gb(m.discoLibreGb)} free of {gb(m.discoTotalGb ?? 0)}</dd></>}
        {r.equipo?.atrasados.map((a) => <div key={a.nombre} className="contents">
          <dt className="text-muted-foreground">{a.nombre}</dt><dd className="tabular-nums">{a.commits} {a.commits === 1 ? 'commit' : 'commits'} behind main</dd>
        </div>)}
      </dl>
    </div>}
  </section>
}
