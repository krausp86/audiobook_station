import './App.css';
import { useEffect, useState } from 'react';
import { useT } from './i18n/I18nContext';
import Library from './Library';

/**
 * Root application component.
 * Displays error screen if database initialization failed, otherwise shows Library.
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
        <div className="logo-placeholder" aria-hidden="true" />
        <p className="boot-text error-text">
          {t('error.db')}: {dbError}
        </p>
      </div>
    );
  }

  return <Library />;
}
