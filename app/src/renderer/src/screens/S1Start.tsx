import { useT } from '../i18n/I18nContext';
import Logo from '../components/Logo';
import Pressable from '../components/Pressable';
import { useParentGate } from '../hooks/useParentGate';

/**
 * S1 Start Screen: two large choice tiles (360×360 each) for "Audiobooks" and "Music".
 * Logo displayed above the choices. Logo has hidden parent-gate gesture (2s hold → PIN dialog).
 */
interface S1Props {
  onChoose: (type: 'audiobook' | 'music') => void;
  onOpenParentGate: () => void;
}

export default function S1Start({ onChoose, onOpenParentGate }: S1Props): React.JSX.Element {
  const t = useT();
  const gate = useParentGate({ onTrigger: onOpenParentGate });

  return (
    <div className="s1-start">
      <header className="s1-logo">
        <div
          className="s1-logo-wrap"
          onPointerMove={gate.onPointerMove}
          style={{ position: 'relative', display: 'inline-flex', padding: '12px', margin: '-12px' }}
        >
          <Logo
            size={40}
            onPointerDown={gate.onPointerDown}
            onPointerUp={gate.onPointerUp}
            onPointerLeave={gate.onPointerLeave}
          />
          {gate.ringRatio > 0 && (
            <svg className="s1-gate-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="var(--flieder-deep)"
                strokeWidth="4"
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={(1 - gate.ringRatio) * 2 * Math.PI * 46}
                transform="rotate(-90 50 50)"
              />
            </svg>
          )}
        </div>
        <span className="t-label s1-wordmark">{t('app.name')}</span>
      </header>
      <div className="s1-choices">
        <Pressable className="s1-tile s1-tile--audiobooks" onTap={() => onChoose('audiobook')}>
          <span className="t-label s1-tile-label">{t('start.audiobooks')}</span>
        </Pressable>
        <Pressable className="s1-tile s1-tile--music" onTap={() => onChoose('music')}>
          <span className="t-label s1-tile-label">{t('start.music')}</span>
        </Pressable>
      </div>
    </div>
  );
}
