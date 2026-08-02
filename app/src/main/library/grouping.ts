/**
 * Gruppierung von Dateien zu Bibliotheks-Einheiten („Kacheln").
 *
 * **Die Ordnerstruktur ist das Modell.** Tags werden nur noch für die Anzeige
 * verwendet, nie für die Gruppierung. Entscheidungen E1/E2 in
 * `tasks/feature-playlists.md`:
 *
 * | Ordner enthält … | ist … | lose Dateien darin |
 * |---|---|---|
 * | Unterordner | **Navigationsordner** | je eine **Einzelsong**-Kachel |
 * | nur Dateien | **Einheit / Playlist** | sind ihre Tracks |
 *
 * Gilt für Hörbücher und Musik gleichermaßen. Eine „Playlist" ist damit schlicht
 * ein Ordner mit Liedern darin.
 *
 * Einziger Ort der Wahrheit für:
 *   - `library/list.ts`   (Kacheln der Bibliothek)
 *   - `player/persist.ts` (unter welchem Pfad der Fortschritt gespeichert wird)
 *   - `mpd/control.ts`    (`currentUnitPath` im Player-State)
 *
 * ACHTUNG: `dev/show-units.mjs` spiegelt diese Regel bewusst noch einmal in
 * JavaScript, weil ein eigenständiges Node-Skript kein TypeScript importieren
 * kann. Wer hier etwas ändert, muss dort nachziehen.
 *
 * Dieses Modul ist absichtlich frei von Abhängigkeiten (kein MPD, keine DB), damit
 * die Regel ohne laufende Dienste testbar bleibt. Den Verzeichnisbaum liefert
 * `library/directory-index.ts`.
 */

/** Medientyp einer Einheit. Entspricht dem CHECK-Constraint auf `media.type`. */
export type MediaType = 'audiobook' | 'music';

/**
 * Ordner, die einen Datenträger eines mehrteiligen Werks bezeichnen und deshalb
 * **keine** eigene Kachel ergeben — die Teile gehören zusammen.
 *
 * Bewusst eng gehalten: `CD 1`, `Disc2`, `Disk_3`. Nicht enthalten sind „Teil"
 * und „Folge", weil die im Deutschen oft eigenständige Werke bezeichnen. Zu viel
 * zusammenzufassen ist schlimmer als zu wenig — ein falsch geteiltes Hörbuch
 * sieht man sofort, ein falsch verschmolzenes versteckt Inhalte.
 */
const DISC_DIR_PATTERN = /^(cd|disc|disk)[\s._-]*\d+$/i;

/** Ist dieser Ordnername ein Datenträger-Ordner (CD1, Disc 2, …)? */
export function isDiscDir(name: string): boolean {
  return DISC_DIR_PATTERN.test(name);
}

/**
 * Vorberechnete Sicht auf den Verzeichnisbaum.
 *
 * Die Gruppierung muss wissen, ob ein Ordner Unterordner hat — das ist eine
 * Eigenschaft des gesamten Bestands, nicht der einzelnen Datei. Deshalb wird sie
 * einmal aufgebaut und dann pro Datei nachgeschlagen.
 */
export interface DirectoryIndex {
  /**
   * Hat dieser Ordner mindestens einen Unterordner, der **kein**
   * Datenträger-Ordner ist?
   *
   * Datenträger zählen bewusst nicht mit: `Der Schatz/CD1` und `CD2` machen
   * `Der Schatz` nicht zum Navigationsordner, sondern bleiben Teile derselben
   * Einheit.
   */
  hasUnitSubdirs(dir: string): boolean;
}

/**
 * Verzeichnis-Index aus einer Liste von Verzeichnispfaden aufbauen.
 *
 * @param dirs Alle Verzeichnisse des Bestands, MPD-relativ und ohne führenden
 *             Schrägstrich (z. B. `audiobooks/WasIstWas/Dinosaurier`).
 *             Zwischenebenen müssen nicht enthalten sein, sie werden abgeleitet.
 */
export function buildDirectoryIndex(dirs: Iterable<string>): DirectoryIndex {
  const withUnitSubdirs = new Set<string>();

  for (const dir of dirs) {
    const parts = dir.split('/');
    // Jede Ebene betrachten, damit auch Zwischenverzeichnisse erfasst werden,
    // die selbst nie explizit gelistet wurden.
    for (let i = 1; i <= parts.length; i++) {
      const name = parts[i - 1];
      if (i < 2 || name === undefined) continue; // Wurzelordner haben keinen Elternteil
      if (isDiscDir(name)) continue; // Datenträger machen den Elternteil nicht zum Navigationsordner
      withUnitSubdirs.add(parts.slice(0, i - 1).join('/'));
    }
  }

  return {
    hasUnitSubdirs: (dir: string): boolean => withUnitSubdirs.has(dir),
  };
}

/** Leerer Index — jeder Ordner gilt als Einheit. Nur für Tests und Notfälle. */
export const EMPTY_DIRECTORY_INDEX: DirectoryIndex = {
  hasUnitSubdirs: () => false,
};

/**
 * Medientyp aus dem Pfad ableiten.
 *
 * Alles unterhalb von `audiobooks/` ist ein Hörbuch, alles andere Musik —
 * auch Dateien in einem dritten Wurzelordner.
 */
export function mediaTypeForPath(file: string): MediaType {
  return file.split('/')[0] === 'audiobooks' ? 'audiobook' : 'music';
}

/**
 * Unit-Pfad einer Datei bestimmen — also die Kachel, zu der sie gehört.
 *
 * 1. Vom Elternverzeichnis der Datei durch etwaige Datenträger-Ordner nach oben
 *    laufen (`…/Der Schatz/CD1` → `…/Der Schatz`).
 * 2. Hat der so erreichte Ordner Unterordner, ist er ein **Navigationsordner** —
 *    die Datei liegt lose darin und wird ihre **eigene** Einheit (Einzelsong).
 * 3. Sonst ist der Ordner selbst die Einheit.
 *
 * @param file  MPD-relativer Dateipfad
 * @param index Verzeichnis-Index desselben Bestands
 * @returns Unit-Pfad; identisch mit `MediaItem.path` und `playback_position.media_path`
 */
export function unitPathFor(file: string, index: DirectoryIndex): string {
  const parts = file.split('/');
  if (parts.length < 2) return file; // Datei direkt in der Medienwurzel

  let dir = parts.slice(0, -1).join('/');

  // Durch Datenträger-Ordner nach oben, solange darüber noch etwas liegt.
  for (;;) {
    const segments = dir.split('/');
    const name = segments[segments.length - 1];
    if (segments.length < 2 || name === undefined || !isDiscDir(name)) break;
    dir = segments.slice(0, -1).join('/');
  }

  return index.hasUnitSubdirs(dir) ? file : dir;
}

/**
 * Anzeigetitel einer Einheit bestimmen.
 *
 * Im Ordnermodell ist der **Ordnername** der Titel — was im Web-Portal getippt
 * wird, steht auf der Kachel. Nur bei Einzelsongs (Unit-Pfad = Dateipfad) gibt es
 * keinen eigenen Ordner; dort greift der `Title`-Tag, ersatzweise der Dateiname
 * ohne Endung.
 *
 * Vereinheitlicht die zuvor abweichenden Ableitungen aus `list.ts` und
 * `persist.ts` (GRP-01 in `tasks/known-issues.md`).
 *
 * @param unitPath Ergebnis von `unitPathFor`
 * @param titleTag `Title`-Tag der Datei, falls vorhanden
 */
export function displayTitleFor(unitPath: string, titleTag?: string | undefined): string {
  const name = unitPath.split('/').pop() ?? unitPath;
  const isFile = /\.[^./]+$/.test(name);
  if (!isFile) return name;
  return titleTag?.trim() || name.replace(/\.[^.]+$/, '');
}
