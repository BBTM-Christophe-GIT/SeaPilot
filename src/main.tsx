import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import './styles/index.css';

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'seapilot:last-preload-recovery';
  const lastReload = Number(window.sessionStorage.getItem(reloadKey) || 0);
  if (Date.now() - lastReload > 10_000) {
    window.sessionStorage.setItem(reloadKey, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
