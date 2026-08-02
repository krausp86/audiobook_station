import type { MediaItem } from '@shared/ipc-contract';

/**
 * Ableitung der Navigationsebene aus den Unit-Pfaden.
 *
 * Seit dem Ordnermodell (`main/library/grouping.ts`) ist jeder `MediaItem.path` ein
 * **echter** Pfad. Damit lässt sich der Baum vollständig aus der flachen Liste
 * ableiten — es braucht keine zusätzliche IPC-Antwort und keine Änderung am
 * Architektur-Grundvertrag.
 *
 * Eine Ebene besteht aus:
 * - **Ordnern**: alles, was unterhalb des aktuellen Verzeichnisses noch eine weitere
 *   Ebene hat. Tap führt hinein.
 * - **Einheiten**: alles, was direkt im aktuellen Verzeichnis liegt. Tap spielt.
 */

/** Ein Ordner auf der aktuellen Ebene. */
export interface FolderEntry {
  /** Voller Pfad, z. B. `audiobooks/WasIstWas` */
  path: string;
  /** Anzuzeigender Name, also das letzte Pfadsegment */
  name: string;
  /** Anzahl der Einheiten darunter, rekursiv */
  unitCount: number;
}

export interface LevelEntries {
  folders: FolderEntry[];
  units: MediaItem[];
}

/** Wurzelverzeichnis für einen Medientyp. */
export function rootDirFor(type: 'audiobook' | 'music'): string {
  return type === 'audiobook' ? 'audiobooks' : 'music';
}

/** Elternverzeichnis, oder `null` wenn `dir` bereits die Wurzel des Typs ist. */
export function parentDirOf(dir: string, type: 'audiobook' | 'music'): string | null {
  const root = rootDirFor(type);
  if (dir === root || !dir.startsWith(`${root}/`)) return null;
  const parent = dir.split('/').slice(0, -1).join('/');
  return parent || root;
}

/** Anzeigename eines Verzeichnisses — das letzte Segment. */
export function dirName(dir: string): string {
  return dir.split('/').pop() ?? dir;
}

/**
 * Ordner und Einheiten der angegebenen Ebene bestimmen.
 *
 * Einheiten behalten die Reihenfolge, in der sie hereinkommen (`sortLibrary` hat sie
 * bereits sortiert). Ordner werden alphabetisch nach deutscher Sortierung geordnet und
 * stehen **vor** den Einheiten — sie führen tiefer, die Einheiten sind das Ziel.
 *
 * @param items Einheiten eines Medientyps (bereits gefiltert)
 * @param dir   Aktuelles Verzeichnis, z. B. `audiobooks` oder `audiobooks/WasIstWas`
 */
export function entriesForLevel(items: MediaItem[], dir: string): LevelEntries {
  const prefix = `${dir}/`;
  const folders = new Map<string, number>();
  const units: MediaItem[] = [];

  for (const item of items) {
    if (!item.path.startsWith(prefix)) continue;

    const rest = item.path.slice(prefix.length);
    const slash = rest.indexOf('/');

    if (slash === -1) {
      // Liegt direkt in diesem Verzeichnis — eine Einheit.
      units.push(item);
    } else {
      // Liegt tiefer — der erste Abschnitt ist ein Ordner dieser Ebene.
      const name = rest.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }

  return {
    folders: [...folders]
      .map(([name, unitCount]) => ({ path: `${dir}/${name}`, name, unitCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    units,
  };
}

/**
 * Enthält diese Ebene überhaupt etwas?
 *
 * Wird gebraucht, um den Empty-State nur dann zu zeigen, wenn wirklich nichts da ist.
 */
export function isLevelEmpty(level: LevelEntries): boolean {
  return level.folders.length === 0 && level.units.length === 0;
}
