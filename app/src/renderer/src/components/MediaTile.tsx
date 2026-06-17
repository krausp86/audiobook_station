import { useT } from '../i18n/I18nContext';
import Cover from './Cover';
import Pressable from './Pressable';
import { useLongPress } from '../hooks/useLongPress';
import type { MediaItem } from '@shared/ipc-contract';

/**
 * MediaTile: 180×180 cover + label + progress ring/badge + long-press ring feedback.
 * - 0% < progress < 100%: progress ring (6px, bottom) + play-arrow badge (top-right)
 * - progress = 100%: check-mark badge (top-right), no ring
 * - progress = 0%: no indicators
 */
interface MediaTileProps {
  item: MediaItem;
  onTap: (item: MediaItem) => void;
  onLongPress: (item: MediaItem) => void;
}

export default function MediaTile({ item, onTap, onLongPress }: MediaTileProps): React.JSX.Element {
  const t = useT();
  const inProgress = item.progressPercent > 0 && item.progressPercent < 100;
  const done = item.progressPercent >= 100;

  // Long-Press-Hook liefert Pointer-Handler + Halte-Fortschritt (0..1 ab 300ms)
  const lp = useLongPress({
    onLongPress: () => onLongPress(item),
    onTap: () => onTap(item),
  });

  return (
    <Pressable
      className="tile"
      onPointerDown={lp.onPointerDown}
      onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerLeave}
    >
      <div className="tile-cover">
        <Cover title={item.title} coverPath={item.coverPath} size={180} />

        {/* Weiterhören-Badge: Pfeil-im-Kreis, oben rechts */}
        {inProgress && (
          <span className="tile-badge tile-badge--progress" aria-label={t('badge.inProgress')}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="11" fill="var(--flieder-deep)" />
              <path d="M8 6 L15 11 L8 16 Z" fill="#FFFFFF" />
            </svg>
          </span>
        )}

        {/* Fertig-Badge: Häkchen, oben rechts */}
        {done && (
          <span className="tile-badge tile-badge--done" aria-label={t('badge.done')}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="11" fill="var(--success)" />
              <path
                d="M6 11 L10 15 L16 7"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}

        {/* Fortschritts-Balken unten, 6px, nur bei inProgress */}
        {inProgress && (
          <span className="tile-progressbar" aria-hidden="true">
            <span className="tile-progressbar-fill" style={{ width: `${item.progressPercent}%` }} />
          </span>
        )}

        {/* Halte-Ring (Long-Press-Vorschau ab 300ms), vom Hook gesteuert */}
        {lp.holdRatio > 0 && (
          <span
            className="tile-holdring"
            style={{ ['--hold' as string]: lp.holdRatio }}
            aria-hidden="true"
          />
        )}
      </div>
      <span className="t-label tile-title">{item.title}</span>
    </Pressable>
  );
}
