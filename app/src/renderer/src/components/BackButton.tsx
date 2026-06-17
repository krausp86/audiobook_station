import Pressable from './Pressable';

/**
 * BackButton component: 64×64 px touch target, oben links.
 * Shows a back arrow icon; the parent (screen) positions it via CSS.
 */
interface BackButtonProps {
  onBack: () => void;
  ariaLabel: string; // aus de.json via useT(), z. B. t('nav.back')
}

export default function BackButton({ onBack, ariaLabel }: BackButtonProps): React.JSX.Element {
  return (
    <Pressable className="back-button" onTap={onBack}>
      <span className="visually-hidden">{ariaLabel}</span>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        {/* nach links zeigender, vollflächiger Pfeil (weiche Spitze) */}
        <path
          d="M20 5 L9 16 L20 27 L23 24 L15 16 L23 8 Z"
          fill="var(--flieder-deep)"
        />
      </svg>
    </Pressable>
  );
}
