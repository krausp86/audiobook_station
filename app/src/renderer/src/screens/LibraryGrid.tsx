import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/I18nContext';
import BackButton from '../components/BackButton';
import HomeButton from '../components/HomeButton';
import MediaTile from '../components/MediaTile';
import FolderTile from '../components/FolderTile';
import SyncStatusIcon from '../components/SyncStatusIcon';
import EmptyState from './EmptyState';
import { entriesForLevel, isLevelEmpty, rootDirFor, dirName } from '../lib/folder-tree';
import type { LibraryListResponse, MediaItem, CoverPhase } from '@shared/ipc-contract';

/**
 * LibraryGrid: displays media tiles in 4-column grid with section headers.
 * Shows "Recently Played" and "All" sections (E17 sorting).
 * Vertical kinetic scrolling with bounce.
 * Subscribes to cover:status events to manage shimmer loading overlay (T7.C10).
 *
 * Seit dem Ordnermodell zeigt der Screen **eine Ebene** des Verzeichnisbaums:
 * Ordner-Kacheln führen tiefer, Einheiten-Kacheln spielen. `dir` bestimmt die Ebene;
 * abgeleitet wird sie im Renderer aus den Unit-Pfaden (`lib/folder-tree.ts`), ohne
 * zusätzlichen IPC-Aufruf.
 */
interface LibraryGridProps {
  type: 'audiobook' | 'music'; // S2 = audiobook, S3 = music
  data: LibraryListResponse; // already filtered by type
  /** Aktuelles Verzeichnis, z. B. `audiobooks` oder `audiobooks/WasIstWas` */
  dir: string;
  onBack: () => void;
  /** Zurück zum Startscreen aus beliebiger Tiefe — nur unterhalb der Wurzel sichtbar */
  onHome: () => void;
  onOpenFolder: (path: string) => void;
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
  dir,
  onBack,
  onHome,
  onOpenFolder,
  onPlay,
  onOpenDetail,
}: LibraryGridProps): React.JSX.Element {
  const t = useT();

  const isRoot = dir === rootDirFor(type);
  const level = useMemo(() => entriesForLevel(data.all, dir), [data.all, dir]);

  // „Zuletzt gehört" bleibt der Abkürzungsweg und steht nur auf der obersten Ebene.
  // In einem Unterordner wäre die Sektion irreführend: Sie zeigte Einheiten, die dort
  // gar nicht liegen.
  const recentlyPlayed = isRoot ? data.recentlyPlayed : [];
  const isEmpty = recentlyPlayed.length === 0 && isLevelEmpty(level);

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
        {/* Rettungsanker: sichtbares Haus statt versteckter Geste. Erscheint erst
            unterhalb der Wurzel, damit der Zurück-Knopf seine feste Position behält. */}
        {!isRoot && <HomeButton onHome={onHome} ariaLabel={t('nav.home')} />}
        <span className="grid-title t-heading">
          {isRoot ? t(type === 'audiobook' ? 'start.audiobooks' : 'start.music') : dirName(dir)}
        </span>
        <div className="grid-sync-slot">
          <SyncStatusIcon />
        </div>
      </header>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <div className="grid-scroll">
          {recentlyPlayed.length > 0 && (
            <>
              <h2 className="grid-section-header t-heading">{t('section.recentlyPlayed')}</h2>
              <div className="grid-cells">
                {recentlyPlayed.map((it) => {
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
          {!isLevelEmpty(level) && (
            <>
              <h2 className="grid-section-header t-heading">
                {isRoot ? t('section.all') : t('section.contents')}
              </h2>
              <div className="grid-cells">
                {/* Ordner zuerst — sie führen tiefer, die Einheiten sind das Ziel. */}
                {level.folders.map((f) => (
                  <FolderTile key={f.path} folder={f} onOpen={(folder) => onOpenFolder(folder.path)} />
                ))}
                {level.units.map((it) => {
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
