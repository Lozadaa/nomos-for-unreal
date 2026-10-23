import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/theme.css'
import App from './App.tsx'
import { supportsViewTransitions } from './feel/transitions'

// CSS que solo tiene sentido con View Transitions (el Sheet se anima desde la transición, no desde su montaje)
if (supportsViewTransitions()) document.documentElement.dataset.vt = ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
