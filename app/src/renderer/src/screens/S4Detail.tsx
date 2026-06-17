import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import Cover from '../components/Cover';
import Pressable from '../components/Pressable';
import type { MediaItem } from '@shared/ipc-contract';

/**
 * S4 Detail Overlay: shows media metadata + "restart from beginning" button.
 * Overlay (not a new nav level); closes by tapping scrim or close button.
 * Animations: enter 220ms fade+scale, exit 160ms fade.
 */
interface S4Props {
  item: MediaItem;
  onClose: () => void;
}

export default function S4Detail({ item, onClose }: S4Props): React.JSX.Element {
  const t = useT();
  const [closing, setClosing] = useState(false);

  // Entry animation: after mount set "entered" (Scale 0,96 -> 1,0)
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = (): void => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 160); // Exit: 160 ms fade
  };

  const restart = (): void => {
    void window.hoermond.invoke('library:restartFromBeginning', { path: item.path });
    close();
  };

  return (
    <div
      className={`s4-scrim${closing ? ' is-closing' : ''}${entered ? ' is-entered' : ''}`}
      onPointerDown={close}
    >
      <div
        className="s4-card"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Pressable className="s4-close" onTap={close}>
          <span className="visually-hidden">{t('detail.close')}</span>
          <span aria-hidden="true">✕</span>
        </Pressable>
        <Cover title={item.title} coverPath={item.coverPath} size={140} />
        <h2 className="t-heading s4-title">{item.title}</h2>
        {item.artist && (
          <p className="t-body s4-author">
            {t('detail.author')}: {item.artist}
          </p>
        )}
        <p className="t-tiny s4-progress">
          {t('detail.progress')}: {item.progressPercent}%
        </p>
        <Pressable className="s4-restart" onTap={restart}>
          <span className="t-label">{t('detail.restart')}</span>
        </Pressable>
      </div>
    </div>
  );
}
