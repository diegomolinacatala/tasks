import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { PlaceEditorProvider } from './components/places/PlaceEditor'
import { PushProvider } from './components/push/PushProvider'
import { ToastProvider } from './components/ui/Toast'
import { isNative } from './lib/platform'
import { StoreProvider } from './state/StoreProvider'
import './styles/base.css'

// La app nativa lleva la web dentro del paquete: no hay nada que cachear ni push web que recibir.
if (!isNative) registerSW({ immediate: true })

/**
 * PWA: Web Push a través del Worker. App de iPhone: notificaciones locales. Lo nativo se carga
 * aparte para no engordar la PWA.
 */
const Notifications = isNative
  ? lazy(() => import('./components/push/NativePushProvider').then((module) => ({ default: module.NativePushProvider })))
  : PushProvider

const container = document.getElementById('root')
if (!container) throw new Error('Falta #root en index.html')

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <Notifications>
            <PlaceEditorProvider>
              <App />
            </PlaceEditorProvider>
          </Notifications>
        </Suspense>
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
)
