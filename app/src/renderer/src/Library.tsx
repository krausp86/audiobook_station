import { useEffect, useState } from 'react';
import { useT } from './i18n/I18nContext';
import type { LibraryListResponse, MediaItem, PlayerState } from '@shared/ipc-contract';

/**
 * Provisional library display UI.
 * Shows recently-played items and all items, allows basic playback control.
 * This is a temporary implementation until the final design UI is ready.
 */
export default function Library(): React.JSX.Element {
  const t = useT();
  const [lib, setLib] = useState<LibraryListResponse | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);

  /**
   * Refresh library by querying library:list from main.
   */
  const load = async (): Promise<void> => {
    setLib(await window.hoermond.invoke('library:list', undefined));
  };

  useEffect(() => {
    void load();
    void window.hoermond.invoke('player:getState', undefined).then(setState);
    const offState = window.hoermond.on('player:state', setState);
    const offLib = window.hoermond.on('library:updated', () => void load());
    return () => {
      offState();
      offLib();
    };
  }, []);

  /**
   * Play a media item.
   */
  const playItem = (item: MediaItem): void => {
    void window.hoermond.invoke('player:play', { path: item.path });
  };

  /**
   * Render a section (recently-played or all items).
   */
  const renderSection = (titleKey: string, items: MediaItem[]): React.JSX.Element => (
    <section className="lib-section">
      <h2>{t(titleKey)}</h2>
      {items.length === 0 ? (
        <p className="lib-empty">{t('library.empty')}</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.path}>
              <button className="lib-item" onClick={() => playItem(it)}>
                <span className="lib-title">{it.title}</span>
                {it.artist && <span className="lib-artist">{it.artist}</span>}
                <span className="lib-type">
                  {t(it.type === 'audiobook' ? 'library.audiobooks' : 'library.music')}
                </span>
                {it.progressPercent > 0 && it.progressPercent < 100 && (
                  <span className="lib-progress">{it.progressPercent}%</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const statusLabel =
    state?.status === 'playing'
      ? 'player.playing'
      : state?.status === 'paused'
        ? 'player.paused'
        : 'player.stopped';

  return (
    <div className="library-screen">
      <div className="now-playing">
        <span>{t(statusLabel)}</span>
        {state?.currentPath && <span className="np-path">{state.currentPath}</span>}
        <button onClick={() => void window.hoermond.invoke('player:pause', undefined)}>
          {t('player.pause')}
        </button>
        <button onClick={() => void window.hoermond.invoke('player:stop', undefined)}>
          {t('player.stop')}
        </button>
      </div>
      {lib && renderSection('library.recentlyPlayed', lib.recentlyPlayed)}
      {lib && renderSection('library.all', lib.all)}
    </div>
  );
}
