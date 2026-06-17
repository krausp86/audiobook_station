import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Logo from '../components/Logo';

/**
 * S0 Welcome Screen: shown only on first app start.
 * Displays logo + greeting, auto-dismisses after 2.5s with 240ms fade-out.
 * Tap before timeout skips to S1 immediately.
 */
interface S0Props {
  /** Called when S0 is done (auto-dismiss or tap). Root navigates to S1 + sets onboarding flag. */
  onDone: () => void;
}

const VISIBLE_MS = 2500; // 2,5 s sichtbar
const FADE_MS = 240; // Fade-Out 240 ms

export default function S0Welcome({ onDone }: S0Props): React.JSX.Element {
  const t = useT();
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(onDone, FADE_MS);
  };

  useEffect(() => {
    const timer = setTimeout(finish, VISIBLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`s0-welcome${fading ? ' is-fading' : ''}`}
      onPointerDown={finish}
      role="button"
      aria-label={t('onboarding.welcome.title')}
    >
      <Logo size={160} />
      <h1 className="t-heading-xl s0-title">{t('onboarding.welcome.title')}</h1>
      <p className="t-body s0-subtitle">{t('onboarding.welcome.subtitle')}</p>
    </div>
  );
}
