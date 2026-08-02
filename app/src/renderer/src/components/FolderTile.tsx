import { useT } from '../i18n/I18nContext';
import Pressable from './Pressable';
import type { FolderEntry } from '../lib/folder-tree';

/**
 * FolderTile: Kachel für einen Navigationsordner.
 *
 * Bewusst **deutlich anders** als `MediaTile`: Ordnerform mit Reiter statt quadratischem
 * Cover, gedämpfte Fläche, Anzahl der Titel darunter. „Hier geht es weiter" und „hier
 * spielt etwas" sollen auf einen Blick unterscheidbar sein — die Zielgruppe kann zwar
 * lesen, aber noch nicht flüssig, also darf das Lesen die Bestätigung sein und nicht
 * der einzige Weg.
 *
 * Kein Fortschritts-Badge, kein Langdruck: ein Ordner hat keinen Hörfortschritt und
 * kein Detail-Overlay.
 */
interface FolderTileProps {
  folder: FolderEntry;
  onOpen: (folder: FolderEntry) => void;
}

/** Dieselbe Palette wie die Cover-Platzhalter, damit die Kacheln zusammen wirken. */
const FOLDER_COLORS = ['#6E54B8', '#2563B0', '#2E7D52', '#A85F0C', '#374151', '#9B7EDC'];

/** Deterministischer Hash: gleicher Name -> gleiche Farbe. */
function colorIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % FOLDER_COLORS.length;
}

export default function FolderTile({ folder, onOpen }: FolderTileProps): React.JSX.Element {
  const t = useT();
  const color = FOLDER_COLORS[colorIndex(folder.name)] ?? FOLDER_COLORS[0];
  const label = folder.unitCount === 1 ? t('folder.oneItem') : t('folder.itemCount');

  return (
    <Pressable
      className="tile tile--folder"
      onTap={() => onOpen(folder)}
      ariaLabel={`${t('folder.open')}: ${folder.name}, ${folder.unitCount} ${label}`}
    >
      <div className="tile-cover folder-cover">
        <svg width="180" height="180" viewBox="0 0 180 180" aria-hidden="true">
          {/* Reiter oben links — die Form macht den Ordner erkennbar, nicht die Farbe */}
          <path
            d="M14 44 h50 l14 18 h88 a10 10 0 0 1 10 10 v82 a10 10 0 0 1 -10 10 h-152
               a10 10 0 0 1 -10 -10 v-100 a10 10 0 0 1 10 -10 z"
            fill={color}
          />
          {/* Angedeutete Blätter im Ordner — Stapel-Metapher */}
          <rect x="38" y="30" width="104" height="14" rx="7" fill={color} opacity="0.45" />
          <rect x="52" y="18" width="76" height="14" rx="7" fill={color} opacity="0.25" />
        </svg>
        <span className="folder-count" aria-hidden="true">
          {folder.unitCount}
        </span>
      </div>
      <span className="t-label tile-title">{folder.name}</span>
    </Pressable>
  );
}
