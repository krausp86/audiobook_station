import { useEffect, useState } from 'react';
import { useT } from './i18n/I18nContext';
import Root from './Root';
import { WakeGuard } from './components/WakeGuard';

/**
 * App component: top-level error handler and touch-wake guard.
 * Displays error screen if database initialization failed, otherwise shows Root navigation
 * wrapped in WakeGuard for display management.
 */
export default function App(): React.JSX.Element {
  const t = useT();
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    return window.hoermond.on('app:dbError', ({ message }) => {
      setDbError(message);
    });
  }, []);

  if (dbError) {
    return (
      <div className="boot-screen">
        <p className="boot-text error-text">
          {t('error.db')}: {dbError}
        </p>
      </div>
    );
  }

  return (
    <WakeGuard>
      <Root />
    </WakeGuard>
  );
}
