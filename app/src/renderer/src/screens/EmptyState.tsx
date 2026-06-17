import { useT } from '../i18n/I18nContext';
import Logo from '../components/Logo';

/**
 * EmptyState: shown when library is empty.
 * Friendly message + logo, centered (rendered inside grid-screen below titlebar).
 */
export default function EmptyState(): React.JSX.Element {
  const t = useT();

  return (
    <div className="empty-state">
      <Logo size={120} />
      <p className="t-heading-xl empty-text">{t('library.emptyTitle')}</p>
    </div>
  );
}
