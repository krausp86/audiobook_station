/**
 * Cover component: displays media cover art or deterministic placeholder.
 * Falls back to a generated placeholder with initial + deterministic background color
 * when no cover path is provided (M3 normal case; M7 will add real covers).
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
}

export default function Cover({ title, coverPath, size }: CoverProps): React.JSX.Element {
  const radius = 12;

  if (coverPath) {
    return (
      <img
        className="cover"
        src={coverPath}
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

  return (
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
      }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
