import './App.css';
import { useEffect, useState } from 'react';
import { useT } from './i18n/I18nContext';

export default function App(): React.JSX.Element {
  const t = useT();
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    return window.hoermond.on('app:dbError', ({ message }) => {
      setDbError(message);
    });
  }, []);

  return (
    <div className="boot-screen">
      <div className="logo-placeholder" aria-hidden="true" />
      {dbError ? (
        <p className="boot-text error-text">
          {t('error.db')}: {dbError}
        </p>
      ) : (
        <p className="boot-text">{t('boot.starting')}</p>
      )}
    </div>
  );
}
