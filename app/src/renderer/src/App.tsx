import './App.css';
import { useT } from './i18n/I18nContext';

export default function App(): React.JSX.Element {
  const t = useT();
  return (
    <div className="boot-screen">
      <div className="logo-placeholder" aria-hidden="true" />
      <p className="boot-text">{t('boot.starting')}</p>
    </div>
  );
}
