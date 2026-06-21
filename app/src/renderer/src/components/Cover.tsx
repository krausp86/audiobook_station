import { useT } from '../i18n/I18nContext';

/**
 * Cover component: displays media cover art, shimmer loading state, or deterministic placeholder.
 * Falls back to a generated placeholder with initial + deterministic background color
 * when no cover path is provided (M3 normal case; M7 adds shimmer during online-fetch).
 *
 * @param title - Media title (used for deterministic placeholder color)
 * @param coverPath - Optional path to cover image (when present, displays image)
 * @param size - Pixel size (square); typically 180 for grid, 280 for player
 * @param loading - Optional true to show shimmer overlay during fetch; platzhalter remains visible underneath
 */

/** Feste Farbliste für deterministische Platzhalter (aus der Theme-Palette) */
const PLACEHOLDER_COLORS = [
  '#6E54B8', // flieder-deep
  '#2563B0', // info
  '#2E7D52', // success
  '#A85F0C', // warning
  '#374151', // parent-accent (dunkelgrau)
  '#9B7EDC', // flieder (heller -> dunkler Text)
];

/** Deterministischer Hash: gleicher Titel -> gleicher Index */
function colorIndex(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) >>> 0;
  }
  return h % PLACEHOLDER_COLORS.length;
}

interface CoverProps {
  title: string;
  coverPath?: string;
  /** Pixel-Kantenlänge (Grid: 180) */
  size: number;
  /** Optional: true to show shimmer overlay during cover fetch */
  loading?: boolean;
}

export default function Cover({ title, coverPath, size, loading }: CoverProps): React.JSX.Element {
  const t = useT();
  const radius = 12;

  // Render order:
  // 1. If coverPath exists, show the cover image
  // 2. Else if loading, show placeholder with shimmer overlay on top
  // 3. Else show plain placeholder

  if (coverPath) {
    const src = coverPath.startsWith('file://') ? coverPath : `file://${coverPath}`;
    return (
      <img
        className="cover"
        src={src}
        width={size}
        height={size}
        alt=""
        style={{ borderRadius: radius, objectFit: 'cover' }}
      />
    );
  }

  // Fallback: Platzhalter mit Initial
  const bg = PLACEHOLDER_COLORS[colorIndex(title)];
  const initial = (title.trim()[0] ?? '?').toUpperCase();
  // Heller Flieder (#9B7EDC) braucht dunklen Text; sonst weiß
  const fg = bg === '#9B7EDC' ? 'var(--text-on-flieder)' : '#FFFFFF';

  // Placeholder base element
  const placeholderContent = (
    <div
      className="cover cover--placeholder"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: Math.round(size * 0.4),
        position: 'relative',
      }}
      aria-hidden={!loading}
      aria-label={loading ? t('cover.loading') : undefined}
    >
      {initial}

      {/* Shimmer overlay during loading */}
      {loading && (
        <div
          className="cover-shimmer"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            background:
              'linear-gradient(30deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)',
            backgroundSize: '200% 200%',
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );

  return placeholderContent;
}
