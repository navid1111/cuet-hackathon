import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// import { initializeOpenTelemetry } from './otel.ts'  // Disabled - see below
import { initializeSentry } from './sentry.ts'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Initialize observability before app renders
initializeSentry();
// OpenTelemetry: Disabled due to CORS (Jaeger doesn't accept browser requests)
// In production, traces should go through backend proxy
// initializeOpenTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
