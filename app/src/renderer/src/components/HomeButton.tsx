import Pressable from './Pressable';

/**
 * HomeButton: 64×64 px Tap-Target, direkt rechts neben dem Zurück-Knopf.
 *
 * Rettungsanker aus beliebiger Tiefe des Ordnerbaums. Bewusst ein **sichtbares**
 * Element und keine versteckte Geste: Für ein Kind, das gerade erst lesen lernt, ist
 * ein Haus-Symbol ungleich auffindbarer als ein langer Druck, den ihm niemand erklärt
 * hat.
 *
 * Steht rechts vom Zurück-Knopf, damit dessen feste Position oben links erhalten
 * bleibt (Design-Brief Kap. 3.2 — konstante Platzierung baut Muskelgedächtnis auf).
 */
interface HomeButtonProps {
  onHome: () => void;
  ariaLabel: string;
}

export default function HomeButton({ onHome, ariaLabel }: HomeButtonProps): React.JSX.Element {
  return (
    <Pressable className="home-button" onTap={onHome} ariaLabel={ariaLabel}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        {/* Haus: Dach als Dreieck, darunter der Baukörper */}
        <path
          d="M16 4 L30 17 L26 17 L26 28 L19 28 L19 20 L13 20 L13 28 L6 28 L6 17 L2 17 Z"
          fill="var(--flieder-deep)"
        />
      </svg>
    </Pressable>
  );
}
