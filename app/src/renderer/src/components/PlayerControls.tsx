import { useT } from '../i18n/I18nContext';
import Pressable from './Pressable';

interface PlayerControlsProps {
  status: 'playing' | 'paused' | 'stopped';
  volume: number | null;
  hasChapters: boolean;
  onPlayPause: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onBack15: () => void;
  onForward30: () => void;
  onVolumeDown: () => void;
  onVolumeUp: () => void;
  onOpenChapters: () => void;
}

export default function PlayerControls({
  status,
  volume,
  hasChapters,
  onPlayPause,
  onPrevChapter,
  onNextChapter,
  onBack15,
  onForward30,
  onVolumeDown,
  onVolumeUp,
  onOpenChapters,
}: PlayerControlsProps): React.JSX.Element {
  const t = useT();
  const isPlaying = status === 'playing';

  return (
    <div className="player-controls">
      {/* Main row: ⏮ ⏪ ▶/⏸ ⏩ ⏭ */}
      <div className="player-controls-main">
        <Pressable
          className="player-btn player-btn-64"
          onTap={onPrevChapter}
          ariaLabel={t('player.prevChapter')}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <rect x="4" y="5" width="3" height="14" />
            <polygon points="20,5 10,12 20,19" />
          </svg>
        </Pressable>

        <Pressable
          className="player-btn player-btn-64"
          onTap={onBack15}
          ariaLabel={t('player.back15')}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12,5V1L7,6l5,5V7c3.31,0,6,2.69,6,6s-2.69,6-6,6-6-2.69-6-6H4c0,4.42,3.58,8,8,8s8-3.58,8-8-3.58-8-8-8z" />
            <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="bold">15</text>
          </svg>
        </Pressable>

        <Pressable
          className="player-btn player-btn-play-pause"
          onTap={onPlayPause}
          ariaLabel={isPlaying ? t('player.pauseAction') : t('player.play')}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
              <rect x="6" y="4" width="3" height="16" />
              <rect x="15" y="4" width="3" height="16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
              <polygon points="5,4 5,20 19,12" />
            </svg>
          )}
        </Pressable>

        <Pressable
          className="player-btn player-btn-64"
          onTap={onForward30}
          ariaLabel={t('player.forward30')}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M12,5V1l5,5-5,5V7c-3.31,0-6,2.69-6,6s2.69,6,6,6,6-2.69,6-6h2c0,4.42-3.58,8-8,8s-8-3.58-8-8,3.58-8,8-8z" />
            <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="bold">30</text>
          </svg>
        </Pressable>

        <Pressable
          className="player-btn player-btn-64"
          onTap={onNextChapter}
          ariaLabel={t('player.nextChapter')}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <polygon points="4,5 14,12 4,19" />
            <rect x="17" y="5" width="3" height="14" />
          </svg>
        </Pressable>
      </div>

      {/* Bottom row: Vol- [level] Vol+ | Chapters button */}
      <div className="player-controls-secondary">
        <Pressable
          className="player-btn player-btn-60"
          onTap={onVolumeDown}
          disabled={volume === null}
          ariaLabel={t('player.volumeDown')}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M3,9v6h4l5,5V4l-5,5H3z" />
            <line x1="20" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </Pressable>

        {volume !== null && (
          <span className="player-volume-label t-tiny">{volume}%</span>
        )}

        <Pressable
          className="player-btn player-btn-60"
          onTap={onVolumeUp}
          disabled={volume === null}
          ariaLabel={t('player.volumeUp')}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M3,9v6h4l5,5V4l-5,5H3z" />
            <line x1="20" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2.5" />
            <line x1="17.5" y1="9" x2="17.5" y2="15" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </Pressable>

        {hasChapters && (
          <Pressable
            className="player-btn player-btn-60 player-btn-chapters"
            onTap={onOpenChapters}
            ariaLabel={t('player.openChapters')}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <rect x="3" y="4" width="14" height="2.5" rx="1" />
              <rect x="3" y="10.5" width="14" height="2.5" rx="1" />
              <rect x="3" y="17" width="14" height="2.5" rx="1" />
              <circle cx="20" cy="5.25" r="2" fill="var(--flieder-deep)" />
            </svg>
          </Pressable>
        )}
      </div>
    </div>
  );
}
