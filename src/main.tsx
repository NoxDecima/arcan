import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

// Self-hosted fonts (woff2 from @fontsource)
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";

// Design tokens
import "@/styles/tokens.css";

import App from './App.tsx'
import { MessangerProvider } from './jazz/provider.tsx'
import { DiagRoute } from './routes/diag.tsx'

// /diag is intentionally mounted ABOVE MessangerProvider (JazzReactProvider).
// MessangerProvider has a blocking "Loading…" fallback that prevents rendering
// until Jazz initialises — which itself requires IndexedDB and WASM. On the
// broken platforms /diag exists to diagnose (no IndexedDB, broken WASM, etc.)
// Jazz never initialises, so /diag would never render if it were inside the
// provider. Theme/accent providers are also omitted here; dark-mode loss on
// this single diagnostics page is acceptable. Token variables are available
// because tokens.css and index.css are imported above.
if (window.location.pathname === "/diag") {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DiagRoute />
    </StrictMode>,
  );
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MessangerProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MessangerProvider>
    </StrictMode>,
  );
}
