import { getMpd } from '../mpd';
import { buildDirectoryIndex, EMPTY_DIRECTORY_INDEX, type DirectoryIndex } from './grouping';

/**
 * Zwischenspeicher für den Verzeichnisbaum aus MPD.
 *
 * Die Gruppierungsregel (`grouping.ts`) muss wissen, ob ein Ordner Unterordner
 * hat. Das ist eine Eigenschaft des gesamten Bestands — `control.ts` und
 * `persist.ts` kennen aber jeweils nur eine einzige Datei. Statt dort pro Aufruf
 * MPD zu fragen, wird der Baum einmal geholt und gehalten.
 *
 * Invalidiert wird über `invalidateDirectoryIndex()` aus der Idle-Schleife,
 * sobald MPD eine Datenbankänderung meldet — analog zum Kapitel-Cache.
 */
let cached: DirectoryIndex | null = null;
let inFlight: Promise<DirectoryIndex> | null = null;

/**
 * `listall` liefert Zeilen `directory: …` und `file: …` ohne Metadaten — deutlich
 * billiger als `listallinfo`, und mehr wird für den Baum nicht gebraucht.
 */
async function fetchDirectories(): Promise<string[]> {
  const mpd = await getMpd();
  const rows = await mpd.send('listall');
  const dirs: string[] = [];
  for (const row of rows) {
    const dir = row['directory'];
    if (dir) dirs.push(dir);
  }
  return dirs;
}

/**
 * Verzeichnis-Index holen; baut ihn beim ersten Aufruf nach einer Invalidierung
 * neu auf. Parallele Aufrufer teilen sich denselben Ladevorgang.
 *
 * Schlägt die MPD-Abfrage fehl, wird ein leerer Index geliefert **und nicht
 * gecacht**: Dann gilt jeder Ordner als Einheit — dieselbe Gruppierung wie bei
 * einem Bestand ganz ohne Unterordner. Das ist die harmloseste Annahme; beim
 * nächsten Aufruf wird es erneut versucht.
 */
export async function getDirectoryIndex(): Promise<DirectoryIndex> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const index = buildDirectoryIndex(await fetchDirectories());
      cached = index;
      return index;
    } catch (err) {
      console.error('[directory-index] Aufbau fehlgeschlagen:', err);
      return EMPTY_DIRECTORY_INDEX;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Cache verwerfen. Wird aus der Idle-Schleife gerufen, wenn MPD
 * `changed: database` oder `changed: update` meldet.
 */
export function invalidateDirectoryIndex(): void {
  cached = null;
}

/**
 * Index direkt aus einer bereits vorliegenden Dateiliste aufbauen und cachen.
 *
 * `listLibrary` hat den kompletten Bestand aus `listallinfo` ohnehin schon in der
 * Hand — dann wäre ein zusätzlicher `listall`-Roundtrip Verschwendung.
 *
 * @param files Dateipfade aus `listallinfo`
 */
export function primeDirectoryIndexFromFiles(files: string[]): DirectoryIndex {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const index = buildDirectoryIndex(dirs);
  cached = index;
  return index;
}
