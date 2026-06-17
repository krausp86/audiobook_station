import { useT } from '../i18n/I18nContext';
import BackButton from '../components/BackButton';
import MediaTile from '../components/MediaTile';
import EmptyState from './EmptyState';
import type { LibraryListResponse, MediaItem } from '@shared/ipc-contract';

/**
 * LibraryGrid: displays media tiles in 4-column grid with section headers.
 * Shows "Recently Played" and "All" sections (E17 sorting).
 * Vertical kinetic scrolling with bounce.
 */
interface LibraryGridProps {
  type: 'audiobook' | 'music'; // S2 = audiobook, S3 = music
  data: LibraryListResponse; // already filtered by type
  onBack: () => void;
  onPlay: (item: MediaItem) => void; // Tap -> player:play (Resume)
  onOpenDetail: (item: MediaItem) => void; // Long-Tap -> S4
}

export default function LibraryGrid({
  type,
  data,
  onBack,
  onPlay,
  onOpenDetail,
}: LibraryGridProps): React.JSX.Element {
  const t = useT();
  const isEmpty = data.recentlyPlayed.length === 0 && data.all.length === 0;

  return (
    <div className="grid-screen">
      <header className="grid-titlebar">
        <BackButton onBack={onBack} ariaLabel={t('nav.back')} />
        <span className="grid-title t-heading">
          {t(type === 'audiobook' ? 'start.audiobooks' : 'start.music')}
        </span>
        <span className="grid-sync-slot" aria-hidden="true" /> {/* Sync-Icon erst M7 */}
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid-scroll">
          {data.recentlyPlayed.length > 0 && (
            <>
              <h2 className="grid-section-header t-heading">{t('section.recentlyPlayed')}</h2>
              <div className="grid-cells">
                {data.recentlyPlayed.map((it) => (
                  <MediaTile key={it.path} item={it} onTap={onPlay} onLongPress={onOpenDetail} />
                ))}
              </div>
            </>
          )}
          {data.all.length > 0 && (
            <>
              <h2 className="grid-section-header t-heading">{t('section.all')}</h2>
              <div className="grid-cells">
                {data.all.map((it) => (
                  <MediaTile key={it.path} item={it} onTap={onPlay} onLongPress={onOpenDetail} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
