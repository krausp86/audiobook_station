import Pressable from './Pressable';
import { useT } from '../i18n/I18nContext';

interface MiniPlayerProps {
  title: string;
  status: 'playing' | 'paused' | 'stopped';
  onPlayPause: () => void;
  onStop: () => void;
  onOpen: () => void;
}

export default function MiniPlayer({
  title,
  status,
  onPlayPause,
  onStop,
  onOpen,
}: MiniPlayerProps): React.JSX.Element {
  const t = useT();
  const isPlaying = status === 'playing';

  return (
    <div className="mini-player">
      <Pressable className="mini-player-info" onTap={onOpen} ariaLabel={title}>
        <span className="mini-player-title t-label">{title}</span>
        <span className="mini-player-status t-tiny">
          {isPlaying ? t('player.playing') : t('player.paused')}
        </span>
      </Pressable>

      <div className="mini-player-actions">
        <Pressable
          className="mini-player-btn"
          onTap={onPlayPause}
          ariaLabel={isPlaying ? t('player.pauseAction') : t('player.play')}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </Pressable>

        <Pressable
          className="mini-player-btn"
          onTap={onStop}
          ariaLabel={t('player.stop')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <rect x="5" y="5" width="14" height="14" rx="2" />
          </svg>
        </Pressable>
      </div>
    </div>
  );
}
