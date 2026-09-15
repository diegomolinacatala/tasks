import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { PushProvider } from './components/push/PushProvider'
import { ToastProvider } from './components/ui/Toast'
import { isNative } from './lib/platform'
import { StoreProvider } from './state/StoreProvider'
import './styles/base.css'

// La app nativa lleva la web dentro del paquete: no hay nada que cachear ni push web que recibir.
if (!isNative) registerSW({ immediate: true })

const container = document.getElementById('root')
if (!container) throw new Error('Falta #root en index.html')

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <PushProvider>
          <App />
        </PushProvider>
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
)
