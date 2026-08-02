/**
 * Gruppierung von Dateien zu Bibliotheks-Einheiten („Kacheln").
 *
 * Diese Regel war bis zum Refactor an drei Stellen dupliziert — mit Kommentaren
 * wie „mirrors the grouping logic in listLibrary" bzw. „same grouping logic as
 * listLibrary". Genau solche Kopien driften auseinander (siehe `mediaTypeForPath`
 * unten), und weil der Unit-Pfad zugleich der `playback_position.media_path` ist,
 * äußert sich jede Abweichung als kaputtes Resume.
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
 * Das geplante Ordnermodell (`tasks/feature-playlists.md`) ersetzt die Regel
 * später vollständig — dann genügt eine Änderung an dieser Datei.
 */

/** Medientyp einer Einheit. Entspricht dem CHECK-Constraint auf `media.type`. */
export type MediaType = 'audiobook' | 'music';

/**
 * Die für die Gruppierung relevanten MPD-Tags.
 *
 * Entspricht dem, was `listallinfo` bzw. `currentsong` pro Datei liefert —
 * absichtlich als lose Map typisiert, weil MPD beliebige Tags zurückgeben kann
 * und fehlende Tags der Normalfall sind.
 */
export interface GroupingTags {
  AlbumArtist?: string | undefined;
  Artist?: string | undefined;
  Album?: string | undefined;
}

/**
 * Medientyp aus dem Pfad ableiten.
 *
 * Alles unterhalb von `audiobooks/` ist ein Hörbuch, alles andere Musik —
 * auch Dateien in einem dritten Wurzelordner.
 *
 * @param file MPD-relativer Dateipfad, z. B. `audiobooks/WasIstWas/Dinosaurier/01.mp3`
 * @returns `'audiobook'` für alles unter `audiobooks/`, sonst `'music'`
 */
export function mediaTypeForPath(file: string): MediaType {
  return file.split('/')[0] === 'audiobooks' ? 'audiobook' : 'music';
}

/**
 * Unit-Pfad einer Datei bestimmen — also die Kachel, zu der sie gehört.
 *
 * Zwei Regeln, je nach Medientyp:
 *
 * - **Musik:** Gruppierung über die Tags `AlbumArtist` (ersatzweise `Artist`)
 *   und `Album`. Ergebnis ist ein *virtueller* Pfad `music/<AlbumArtist>/<Album>`,
 *   der so im Dateisystem nicht existieren muss — flache Ablagen werden dadurch
 *   trotzdem korrekt zu Alben zusammengefasst. Fehlt eines der beiden Tags,
 *   wird die Datei ihre eigene Einheit.
 * - **Hörbuch:** Gruppierung über die Verzeichnisstruktur — das Elternverzeichnis
 *   der Datei, aber **höchstens drei Pfadsegmente tief**:
 *
 *   | Datei | Einheit |
 *   |---|---|
 *   | `audiobooks/Titel/01.mp3` | `audiobooks/Titel` |
 *   | `audiobooks/Autor/Titel/01.mp3` | `audiobooks/Autor/Titel` |
 *   | `audiobooks/Autor/Titel/CD1/01.mp3` | `audiobooks/Autor/Titel` — CD1 und CD2 fallen zusammen |
 *   | `audiobooks/Titel/CD1/01.mp3` | `audiobooks/Titel/CD1` — hier eben **nicht** |
 *   | `audiobooks/01.mp3` | die Datei selbst |
 *
 *   Die Deckelung fasst mehrteilige Hörbücher also nur dann korrekt zusammen,
 *   wenn sie tief genug liegen — bei `Titel/CD1` greift sie zu spät. Das ist
 *   Zufall, keine Absicht, und einer der Gründe für das Ordnermodell.
 *   Läge die Datei direkt in `audiobooks/`, ergäbe die Regel die Sammelkachel
 *   `audiobooks` — deshalb wird sie in diesem Fall ihre eigene Einheit.
 *
 * @param file MPD-relativer Dateipfad
 * @param tags Tags derselben Datei (nur für Musik relevant)
 * @returns Unit-Pfad; identisch mit `MediaItem.path` und `playback_position.media_path`
 */
export function unitPathFor(file: string, tags: GroupingTags = {}): string {
  const parts = file.split('/');

  if (mediaTypeForPath(file) === 'music') {
    const albumArtist = tags.AlbumArtist ?? tags.Artist;
    const album = tags.Album;
    return albumArtist && album ? `music/${albumArtist}/${album}` : file;
  }

  const unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
  // Eine Datei direkt in `audiobooks/` würde sonst die Sammelkachel „audiobooks"
  // erzeugen — verwirrend, weil dort alle losen Dateien zusammenfielen.
  return unitPath.includes('/') ? unitPath : file;
}
