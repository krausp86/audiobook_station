import { useEffect, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import BackButton from '../components/BackButton';
import MediaTile from '../components/MediaTile';
import SyncStatusIcon from '../components/SyncStatusIcon';
import EmptyState from './EmptyState';
import type { LibraryListResponse, MediaItem, CoverPhase } from '@shared/ipc-contract';

/**
 * LibraryGrid: displays media tiles in 4-column grid with section headers.
 * Shows "Recently Played" and "All" sections (E17 sorting).
 * Vertical kinetic scrolling with bounce.
 * Subscribes to cover:status events to manage shimmer loading overlay (T7.C10).
 */
interface LibraryGridProps {
  type: 'audiobook' | 'music'; // S2 = audiobook, S3 = music
  data: LibraryListResponse; // already filtered by type
  onBack: () => void;
  onPlay: (item: MediaItem) => void; // Tap -> player:play (Resume)
  onOpenDetail: (item: MediaItem) => void; // Long-Tap -> S4
}

/** Per-item cover fetch status (path -> phase + optional coverPath on ready) */
interface CoverStatus {
  phase: CoverPhase;
  coverPath?: string;
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

  // Track cover loading status per media item path
  const [coverStatuses, setCoverStatuses] = useState<Map<string, CoverStatus>>(new Map());

  // Subscribe to cover:status events (M7 — during online-fetch)
  useEffect(() => {
    // Listen for cover fetch status updates
    const unsubscribe = window.hoermond.on('cover:status', (event) => {
      setCoverStatuses((prev) => {
        const next = new Map(prev);
        next.set(event.path, {
          phase: event.phase,
          coverPath: event.coverPath,
        });
        return next;
      });
    });

    return () => unsubscribe();
  }, []);

  /**
   * Merge item with cover status: apply coverPath from ready state, compute loading flag.
   * Render order per T7.C10:
   *  - If item has coverPath from library:list (initial), use it (image)
   *  - Else if cover fetch is pending, show loading=true (shimmer)
   *  - Else if cover fetch is ready, update coverPath and show image
   *  - Else if cover fetch failed, show loading=false (plain platzhalter)
   */
  const getItemWithLoading = (item: MediaItem): MediaItem & { loading?: boolean } => {
    const status = coverStatuses.get(item.path);
    if (!status) {
      // No fetch in progress; use item as-is
      return { ...item, loading: false };
    }

    if (status.phase === 'pending') {
      // Fetch in progress: show shimmer over placeholder
      return { ...item, loading: true };
    }

    if (status.phase === 'ready' && status.coverPath) {
      // Fetch succeeded: replace coverPath and hide shimmer
      return { ...item, coverPath: status.coverPath, loading: false };
    }

    // phase === 'failed': use original item (platzhalter, no shimmer, E2/E3)
    return { ...item, loading: false };
  };

  return (
    <div className="grid-screen">
      <header className="grid-titlebar">
        <BackButton onBack={onBack} ariaLabel={t('nav.back')} />
        <span className="grid-title t-heading">
          {t(type === 'audiobook' ? 'start.audiobooks' : 'start.music')}
        </span>
        <div className="grid-sync-slot">
          <SyncStatusIcon />
        </div>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid-scroll">
          {data.recentlyPlayed.length > 0 && (
            <>
              <h2 className="grid-section-header t-heading">{t('section.recentlyPlayed')}</h2>
              <div className="grid-cells">
                {data.recentlyPlayed.map((it) => {
                  const itemWithLoading = getItemWithLoading(it);
                  return (
                    <MediaTile
                      key={it.path}
                      item={itemWithLoading}
                      loading={itemWithLoading.loading}
                      onTap={onPlay}
                      onLongPress={onOpenDetail}
                    />
                  );
                })}
              </div>
            </>
          )}
          {data.all.length > 0 && (
            <>
              <h2 className="grid-section-header t-heading">{t('section.all')}</h2>
              <div className="grid-cells">
                {data.all.map((it) => {
                  const itemWithLoading = getItemWithLoading(it);
                  return (
                    <MediaTile
                      key={it.path}
                      item={itemWithLoading}
                      loading={itemWithLoading.loading}
                      onTap={onPlay}
                      onLongPress={onOpenDetail}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
