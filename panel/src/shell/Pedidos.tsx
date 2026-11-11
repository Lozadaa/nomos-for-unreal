import { useState } from 'react'
import type { Pedido } from '@/api'

/** Copia el prompt; el rótulo confirma dos segundos. Sin portapapeles (http sin permiso) el texto sigue seleccionable. */
function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = () => void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) }, () => {})
  return <button type="button" onClick={copy}
    className="k-display shrink-0 cursor-pointer rounded-sm bg-primary-foreground px-4 py-2 text-lg leading-none text-primary outline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-primary-foreground">
    {done ? 'Copied' : 'Copy prompt'}
  </button>
}

/**
 * Pedidos manuales: lo que el juego necesita y solo puede hacer una persona (PBRGen en el navegador, por ejemplo).
 * Alerta grande arriba de todas las vistas mientras quede alguno; se va sola cuando hay una imagen en la carpeta de destino.
 */
export function Pedidos({ items }: { items: Pedido[] }) {
  if (!items.length) return null
  return (
    <section role="alert" aria-labelledby="pedidos-titulo" className="mb-5 rounded-lg bg-primary p-5 text-primary-foreground sm:p-6">
      <p className="k-label opacity-80">Waiting on you</p>
      <h2 id="pedidos-titulo" className="k-display mt-1 text-4xl leading-[0.9] sm:text-5xl">
        {items.length === 1 ? 'The game needs one thing only you can make' : `The game needs ${items.length} things only you can make`}
      </h2>
      <p className="mt-2 max-w-(--k-prose) text-sm">The work goes on with a stand-in. Make each one, put the files in its folder, and this alert clears itself.</p>
      <ol className="mt-4 flex flex-col gap-3">
        {items.map((p) => (
          <li key={p.id} className="rounded-md bg-black/15 p-4">
            <h3 className="k-display text-2xl leading-none">{p.id} <span className="opacity-80">· in {p.para}</span></h3>
            {p.encargo && <p className="mt-2 text-sm"><span className="opacity-80">You asked for:</span> “{p.encargo}”</p>}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              <p className="min-w-0 flex-1 rounded-sm bg-black/20 p-3 font-mono text-sm break-words select-all">{p.prompt}</p>
              <Copy text={p.prompt} />
            </div>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="opacity-80">Put the result in</dt>
              <dd className="font-mono break-all">{p.destino}/</dd>
              {p.sustituto && <><dt className="opacity-80">Used meanwhile</dt><dd>{p.sustituto}</dd></>}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  )
}
