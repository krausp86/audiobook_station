import { type PointerEventHandler } from 'react';

/**
 * Logo component: Halbmond + Notenkopf, skalierbar.
 *
 * M5-HOOK: onPointerDown/Up/Leave are threaded for the parent-gate long-tap gesture
 * (Ring + PIN dialog). M3 does not use them — they remain available for M5 to attach
 * ring-drawing and timer logic without changing the component signature.
 */
interface LogoProps {
  /** Kantenlänge in px. S1: ~40 (Symbol), S0/Empty: ~120–160. */
  size?: number;
  /** Einfarbige Variante (alles --flieder-deep) statt zweifarbig. */
  mono?: boolean;
  /** M5-Hooks: Eltern-Gate-Geste dockt hier an (in M3 ungenutzt). */
  onPointerDown?: PointerEventHandler<SVGSVGElement>;
  onPointerUp?: PointerEventHandler<SVGSVGElement>;
  onPointerLeave?: PointerEventHandler<SVGSVGElement>;
  className?: string;
}

export default function Logo({
  size = 40,
  mono = false,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  className,
}: LogoProps): React.JSX.Element {
  const crescent = 'var(--flieder-deep)';
  const note = mono ? 'var(--flieder-deep)' : 'var(--flieder)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Hörmond"
      className={className}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      {/* Halbmond: Vollkreis minus versetzter Kreis (Sichel), weiche Rundung */}
      <path
        d="M50 6
           a44 44 0 1 0 0 88
           a34 34 0 1 1 0 -88 Z"
        fill={crescent}
      />
      {/* Notenkopf (vollflächig) in der Sichel + kurzer Notenhals */}
      <circle cx="54" cy="64" r="11" fill={note} />
      <rect x="63" y="30" width="6" height="36" rx="3" fill={note} />
    </svg>
  );
}
