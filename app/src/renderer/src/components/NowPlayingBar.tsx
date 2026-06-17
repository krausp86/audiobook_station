import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import type { PlayerState } from '@shared/ipc-contract';

/**
 * NowPlayingBar: temporary placeholder (M4 will replace with S5 Player screen).
 * Shows minimal playback status + pause/stop buttons.
 * Renders null when stopped/no path.
 */
export default function NowPlayingBar(): React.JSX.Element | null {
  const t = useT();
  const [state, setState] = useState<PlayerState | null>(null);

  useEffect(() => {
    void window.hoermond.invoke('player:getState', undefined).then(setState);
    const off = window.hoermond.on('player:state', setState);
    return () => off(); // StrictMode cleanup
  }, []);

  if (!state || state.status === 'stopped' || !state.currentPath) return null;

  const label = state.status === 'playing' ? t('player.playing') : t('player.paused');

  return (
    <div className="now-playing-bar">
      <span className="t-tiny np-status">{label}</span>
      <span className="t-tiny np-path">{state.currentPath}</span>
      <button
        className="np-btn"
        onPointerUp={() => void window.hoermond.invoke('player:pause', undefined)}
      >
        {t('player.pause')}
      </button>
      <button
        className="np-btn"
        onPointerUp={() => void window.hoermond.invoke('player:stop', undefined)}
      >
        {t('player.stop')}
      </button>
    </div>
  );
}
