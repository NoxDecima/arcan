import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MessangerProvider } from './jazz/provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MessangerProvider>
      <App />
    </MessangerProvider>
  </StrictMode>,
)
