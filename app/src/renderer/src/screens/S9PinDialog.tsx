import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Pressable from '../components/Pressable';

/**
 * S9 PIN Dialog: modal overlay for 4-digit PIN entry.
 * Numerischer Pad (keine Tastatur), Verifikation gegen server-seitig gespeicherten Hash.
 * Falsche PIN: Shake + Hinweis, kein Lockout, sofort erneut eingebbar.
 * Korrekte PIN: onSuccess → S10.
 */
interface S9Props {
  onSuccess: () => void;
  onClose: () => void;
}

export default function S9PinDialog({ onSuccess, onClose }: S9Props): React.JSX.Element {
  const t = useT();
  const [entry, setEntry] = useState('');
  const [wrong, setWrong] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);

  // Entry animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Auto-verify when 4 digits entered
  useEffect(() => {
    if (entry.length !== 4) return;

    let timer: NodeJS.Timeout | null = null;
    void window.hoermond.invoke('settings:verifyPin', { pin: entry }).then(({ ok }) => {
      if (ok) {
        onSuccess();
      } else {
        // Wrong PIN: shake, clear after 200ms, no lockout
        setWrong(true);
        timer = setTimeout(() => {
          setEntry('');
          setWrong(false);
        }, 200);
      }
    });

    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [entry, onSuccess]);

  const close = (): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 160); // Exit: 160ms fade
  };

  const appendDigit = (digit: string): void => {
    if (entry.length < 4) {
      setEntry(entry + digit);
    }
  };

  const deleteDigit = (): void => {
    setEntry(entry.slice(0, -1));
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div
      className={`s9-scrim${closing ? ' is-closing' : ''}${entered ? ' is-entered' : ''}`}
      onPointerDown={close}
    >
      <div className="s9-card" onPointerDown={(e) => e.stopPropagation()}>
        <Pressable className="s9-close" onTap={close}>
          <span className="visually-hidden">{t('pin.close')}</span>
          <span aria-hidden="true">✕</span>
        </Pressable>

        <h2 className="t-heading s9-title">{t('pin.title')}</h2>

        {/* PIN entry dots */}
        <div className={`s9-dots${wrong ? ' is-wrong' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`s9-dot${i < entry.length ? ' is-filled' : ''}`} />
          ))}
        </div>

        {/* Wrong PIN hint */}
        {wrong && <p className="t-body s9-wrong-hint">{t('pin.wrong')}</p>}

        {/* Numeric pad */}
        <div className="s9-pad">
          {digits.map((digit) => (
            <Pressable
              key={digit}
              className="s9-pad-button"
              onTap={() => appendDigit(digit)}
            >
              <span className="t-label">{digit}</span>
            </Pressable>
          ))}

          {/* Delete button */}
          <Pressable className="s9-pad-delete" onTap={deleteDigit}>
            <span className="t-label">{t('pin.delete')}</span>
          </Pressable>
        </div>
      </div>
    </div>
  );
}
