import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/theme.css'
import App from './App.tsx'
import { supportsViewTransitions } from './feel/transitions'

// CSS que solo tiene sentido con View Transitions (el Sheet se anima desde la transición, no desde su montaje)
if (supportsViewTransitions()) document.documentElement.dataset.vt = ''

// el color de la barra del navegador sale del token, no de un valor escrito a mano
const theme = document.createElement('meta')
theme.name = 'theme-color'
theme.content = getComputedStyle(document.documentElement).getPropertyValue('--vbg-surface-primary').trim()
document.head.append(theme)

navigator.serviceWorker?.register('/sw.js').catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
