import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/theme.css'
import './styles/play.css'
import { supportsViewTransitions } from './feel/transitions'

// CSS que solo tiene sentido con View Transitions (el Sheet se anima desde la transición, no desde su montaje)
if (supportsViewTransitions()) document.documentElement.dataset.vt = ''

// el color de la barra del navegador sale del token, no de un valor escrito a mano
const theme = document.createElement('meta')
theme.name = 'theme-color'
theme.content = getComputedStyle(document.documentElement).getPropertyValue('--vbg-surface-primary').trim()
document.head.append(theme)

navigator.serviceWorker?.register('/sw.js').catch(() => undefined)

/** Hito 10: abierto desde la portada de otro proyecto (http://127.0.0.1:<puerto>/) llega sin #token; se lo pide a su
 *  propio servicio, que solo lo da a su mismo origen. api.ts lee el token al cargarse: App se importa después. */
async function session(): Promise<void> {
  try {
    if (new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('nomos.token')) return
    const response = await fetch('/session', { cache: 'no-store' })
    if (response.ok) sessionStorage.setItem('nomos.token', ((await response.json()) as { token: string }).token)
  } catch { /* sin sesión: el panel lo dice como siempre */ }
}

void session().then(() => import('./App.tsx')).then(({ default: App }) => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
))
