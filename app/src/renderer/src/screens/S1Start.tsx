import { useT } from '../i18n/I18nContext';
import Logo from '../components/Logo';
import Pressable from '../components/Pressable';

/**
 * S1 Start Screen: two large choice tiles (360×360 each) for "Audiobooks" and "Music".
 * Logo displayed above the choices.
 */
interface S1Props {
  onChoose: (type: 'audiobook' | 'music') => void;
}

export default function S1Start({ onChoose }: S1Props): React.JSX.Element {
  const t = useT();

  return (
    <div className="s1-start">
      <header className="s1-logo">
        <Logo size={40} />
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
