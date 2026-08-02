import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/I18nContext';
import { ToastProvider } from './components/ToastProvider';
import App from './App';
import './theme.css';
import './screens.css';

// Am Pi wird per Touch bedient, das Kiosk-CSS blendet den Cursor aus
// (theme.css: `cursor: none`). Auf dem Entwicklungsrechner gibt es keinen
// Touchscreen — ohne sichtbaren Mauszeiger ist die App dort nicht bedienbar.
// Wird im Produktions-Build weggeworfen (import.meta.env.DEV ist dann false).
if (import.meta.env.DEV) {
  document.documentElement.dataset['dev'] = 'true';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
