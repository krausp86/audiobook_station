import type Database from 'better-sqlite3';
import { getDb } from '../db';
import { getAllPositions, getSetting, setSetting } from '../db/dao';
import { getMpd } from '../mpd';
import { buildDirectoryIndex, unitPathFor, mediaTypeForPath, displayTitleFor } from './grouping';

/**
 * Einmaliger Abgleich der gespeicherten Hörfortschritte auf das Ordnermodell (MIG-01).
 *
 * Vor der Umstellung war `playback_position.media_path` für Musik ein **virtueller**
 * Pfad der Form `music/<AlbumArtist>/<Album>`, der so im Dateisystem nie existierte.
 * Seit der Ordnergruppierung (`grouping.ts`) gibt es solche Pfade nicht mehr — die
 * Zeilen zeigen ins Leere, und das Kind verlöre bei jedem Musiktitel die Stelle.
 *
 * **Ansatz:** die alte Regel wird hier noch einmal ausgeführt (`legacyUnitPathFor`).
 * Damit lässt sich für jede Datei bestimmen, zu welcher *alten* Kachel sie gehörte —
 * und zu welcher *neuen* sie jetzt gehört. Aus beidem entsteht eine exakte Zuordnung
 * alt → neu. Das ist zuverlässiger als aus dem alten Pfad zurückzurechnen: Ein
 * Präfix-Vergleich etwa würde bei der alten Sammelkachel `audiobooks/WasIstWas`
 * fälschlich auch die Dateien der Unterordner einsammeln, die damals schon eigene
 * Kacheln waren.
 *
 * Eine reine SQL-Migration reicht nicht, weil die alte Regel für Musik die Tags
 * braucht — die kennt nur MPD. Deshalb läuft der Abgleich beim Start und nicht als
 * Schema-Migration.
 *
 * Hörbücher sind meist gar nicht betroffen: Alte und neue Regel liefern für die
 * übliche Ablage `audiobooks/Autor/Titel/…` denselben Pfad.
 */

/** Merker in `settings`, damit der Abgleich genau einmal läuft. */
export const RECONCILE_SETTING_KEY = 'unit_paths_reconciled_v4';

/** Eine Zeile aus `playback_position`, wie `getAllPositions` sie liefert. */
interface PositionLike {
  media_path: string;
  track_index: number;
  position_seconds: number;
  last_played: string;
  last_status: string;
}

export interface ReconcileReport {
  /** Zeilen, die bereits auf eine gültige Einheit zeigten. */
  kept: number;
  /** Zeilen, die auf eine neue Einheit umgehängt wurden. */
  remapped: Array<{ from: string; to: string }>;
  /** Zeilen, für die keine Einheit gefunden wurde — bleiben unverändert liegen. */
  unresolved: string[];
  /** Zeilen, die beim Umhängen mit einer neueren Zeile kollidierten und verworfen wurden. */
  dropped: Array<{ from: string; to: string }>;
}

/**
 * Die **alte**, tag-abgeleitete Gruppierungsregel — ausschließlich für diesen
 * Abgleich. Bewusst hier und nicht in `grouping.ts`: Sie ist Altlast, kein Modell.
 *
 * Entspricht dem Stand vor dem Ordnermodell:
 * - Musik über `AlbumArtist` (ersatzweise `Artist`) + `Album` zu einem virtuellen
 *   Pfad; ohne diese Tags wurde jede Datei ihre eigene Einheit.
 * - Hörbücher über die Verzeichnisstruktur, gekappt auf drei Pfadsegmente.
 *
 * Die historischen Kopien der Regel wichen für einen *dritten* Wurzelordner
 * voneinander ab (GRP-02). Hier gilt die vereinheitlichte Fassung; für Bestände
 * unter `audiobooks/` und `music/` ist das identisch.
 */
function legacyUnitPathFor(file: string, tags: Record<string, string>): string {
  const parts = file.split('/');

  if (mediaTypeForPath(file) === 'music') {
    const albumArtist = tags['AlbumArtist'] ?? tags['Artist'];
    const album = tags['Album'];
    return albumArtist && album ? `music/${albumArtist}/${album}` : file;
  }

  const unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
  return unitPath.includes('/') ? unitPath : file;
}

interface Zuordnung {
  /** Alle aktuell gültigen Unit-Pfade. */
  units: Set<string>;
  /** Alter Unit-Pfad → neue Unit-Pfade mit Anzahl der Dateien. */
  altNachNeu: Map<string, Map<string, number>>;
  /** Anzahl Tracks je neuer Einheit — für das Kappen von `track_index`. */
  trackCount: Map<string, number>;
}

/**
 * Bestand aus MPD lesen und beide Regeln darauf anwenden.
 *
 * `listallinfo` statt `listall`, weil die alte Regel für Musik die Tags braucht.
 */
async function ladeZuordnung(): Promise<Zuordnung> {
  const mpd = await getMpd();
  const rows = await mpd.send('listallinfo');

  const dirs: string[] = [];
  const dateien: Array<{ file: string; tags: Record<string, string> }> = [];
  for (const row of rows) {
    if (row['file']) dateien.push({ file: row['file'], tags: row });
    else if (row['directory']) dirs.push(row['directory']);
  }

  // Zwischenebenen ableiten — MPD listet sie zwar, aber darauf verlassen wir uns nicht.
  const alleDirs = new Set(dirs);
  for (const { file } of dateien) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) alleDirs.add(parts.slice(0, i).join('/'));
  }

  const index = buildDirectoryIndex(alleDirs);
  const units = new Set<string>();
  const altNachNeu = new Map<string, Map<string, number>>();
  const trackCount = new Map<string, number>();

  for (const { file, tags } of dateien) {
    const neu = unitPathFor(file, index);
    const alt = legacyUnitPathFor(file, tags);

    units.add(neu);
    trackCount.set(neu, (trackCount.get(neu) ?? 0) + 1);

    let ziele = altNachNeu.get(alt);
    if (!ziele) {
      ziele = new Map();
      altNachNeu.set(alt, ziele);
    }
    ziele.set(neu, (ziele.get(neu) ?? 0) + 1);
  }

  return { units, altNachNeu, trackCount };
}

/** Letztes Pfadsegment. */
function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Aus den Zielen einer alten Einheit die neue bestimmen.
 *
 * Verteilen sich die Dateien einer alten Kachel auf mehrere neue Einheiten, wird in
 * dieser Reihenfolge entschieden:
 *
 * 1. **Meiste Dateien.** Ein virtuelles Album, das überwiegend in einem Ordner liegt,
 *    gehört dorthin.
 * 2. **Gleicher Name.** Bei Gleichstand gewinnt der Ordner, dessen Name dem letzten
 *    Segment des alten Pfades entspricht — bei `music/<Artist>/<Album>` also dem
 *    Album-Namen. Dieser Fall tritt real auf: Liegt eine Datei zusätzlich als Kopie
 *    in einer selbst zusammengestellten Playlist (Entscheidung E4), steht es 1:1,
 *    und der Album-Name ist der deutlich bessere Hinweis als die Alphabetik.
 * 3. **Alphabetisch**, damit das Ergebnis reproduzierbar bleibt.
 */
function neueEinheitFuer(ziele: Map<string, number> | undefined, altPfad: string): string | null {
  if (!ziele || ziele.size === 0) return null;

  const altName = basename(altPfad);
  const sortiert = [...ziele].sort(([aPath, aCount], [bPath, bCount]) => {
    if (aCount !== bCount) return bCount - aCount;
    const aMatch = basename(aPath) === altName ? 0 : 1;
    const bMatch = basename(bPath) === altName ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return aPath.localeCompare(bPath);
  });

  return sortiert[0]?.[0] ?? null;
}

/**
 * Eine Fortschrittszeile auf einen neuen Unit-Pfad umhängen.
 *
 * `playback_position.media_path` ist Primärschlüssel mit Fremdschlüssel auf
 * `media(path)` — die Zielzeile in `media` muss also zuerst existieren. Kollidiert
 * das Ziel mit einer bereits vorhandenen Zeile, gewinnt die zuletzt gehörte.
 *
 * @returns `true`, wenn umgehängt wurde; `false`, wenn die alte Zeile zugunsten
 *          einer neueren verworfen wurde
 */
function haengeUm(
  db: Database.Database,
  alt: PositionLike,
  neu: string,
  trackCount: number,
): boolean {
  const vorhanden = db
    .prepare(`SELECT last_played FROM playback_position WHERE media_path = @p`)
    .get({ p: neu }) as { last_played: string } | undefined;

  if (vorhanden && vorhanden.last_played >= alt.last_played) {
    db.prepare(`DELETE FROM playback_position WHERE media_path = @p`).run({ p: alt.media_path });
    return false;
  }

  db.prepare(
    `INSERT OR IGNORE INTO media (path, type, title, added_at) VALUES (@path, @type, @title, @ts)`,
  ).run({
    path: neu,
    type: mediaTypeForPath(neu),
    title: displayTitleFor(neu),
    ts: new Date().toISOString(),
  });

  // `track_index` zeigte in die alte Wiedergabeliste. Hat die neue Einheit weniger
  // Tracks, wäre der Index ungültig — dann lieber von vorn als an falscher Stelle.
  const index = trackCount > 0 && alt.track_index < trackCount ? alt.track_index : 0;
  const position = index === alt.track_index ? alt.position_seconds : 0;

  db.prepare(
    `INSERT INTO playback_position (media_path, track_index, position_seconds, last_played, last_status)
     VALUES (@p, @t, @s, @ts, @st)
     ON CONFLICT(media_path) DO UPDATE SET
       track_index = @t, position_seconds = @s, last_played = @ts, last_status = @st`,
  ).run({ p: neu, t: index, s: position, ts: alt.last_played, st: alt.last_status });

  db.prepare(`DELETE FROM playback_position WHERE media_path = @p`).run({ p: alt.media_path });
  return true;
}

/**
 * Abgleich ausführen, sofern er noch nicht gelaufen ist.
 *
 * Muss **vor** `resumeLast()` laufen — sonst greift Resume noch auf einen veralteten
 * Pfad zu und startet nichts oder das Falsche.
 *
 * Schlägt der MPD-Zugriff fehl, wird der Merker **nicht** gesetzt: Der Abgleich wird
 * beim nächsten Start erneut versucht, statt die Fortschritte stillschweigend zu
 * verlieren.
 *
 * @param force Merker ignorieren und erneut abgleichen (für Tests und Diagnose)
 * @returns Bericht, oder `null`, wenn bereits gelaufen bzw. nichts zu tun war
 */
export async function reconcileUnitPaths(force = false): Promise<ReconcileReport | null> {
  const db = getDb();

  if (!force && getSetting(db, RECONCILE_SETTING_KEY)) return null;

  const positionen = getAllPositions(db) as unknown as PositionLike[];
  if (positionen.length === 0) {
    setSetting(db, RECONCILE_SETTING_KEY, new Date().toISOString());
    return null;
  }

  const { units, altNachNeu, trackCount } = await ladeZuordnung();
  const bericht: ReconcileReport = { kept: 0, remapped: [], unresolved: [], dropped: [] };
  const umzuhaengen: Array<{ zeile: PositionLike; neu: string }> = [];

  for (const zeile of positionen) {
    if (units.has(zeile.media_path)) {
      bericht.kept++;
      continue;
    }

    const neu = neueEinheitFuer(altNachNeu.get(zeile.media_path), zeile.media_path);
    if (!neu || neu === zeile.media_path) {
      bericht.unresolved.push(zeile.media_path);
      continue;
    }
    umzuhaengen.push({ zeile, neu });
  }

  if (umzuhaengen.length > 0) {
    db.transaction(() => {
      for (const { zeile, neu } of umzuhaengen) {
        const ok = haengeUm(db, zeile, neu, trackCount.get(neu) ?? 0);
        if (ok) bericht.remapped.push({ from: zeile.media_path, to: neu });
        else bericht.dropped.push({ from: zeile.media_path, to: neu });
      }
    })();
  }

  setSetting(db, RECONCILE_SETTING_KEY, new Date().toISOString());
  return bericht;
}

/**
 * Abgleich anstoßen und das Ergebnis protokollieren. Wirft nicht — ein Fehler hier
 * darf den Start nicht verhindern.
 */
export async function runUnitPathReconciliation(): Promise<void> {
  try {
    const bericht = await reconcileUnitPaths();
    if (!bericht) return;

    const { kept, remapped, unresolved, dropped } = bericht;
    console.log(
      `[reconcile] Fortschritte abgeglichen: ${kept} unverändert, ${remapped.length} umgehängt, ` +
        `${dropped.length} zugunsten neuerer verworfen, ${unresolved.length} nicht auflösbar`,
    );
    for (const { from, to } of remapped) console.log(`[reconcile]   ${from}  ->  ${to}`);
    for (const { from, to } of dropped) {
      console.log(`[reconcile]   ${from}  x-> ${to} (neuere Zeile gewinnt)`);
    }
    for (const path of unresolved) console.warn(`[reconcile]   nicht auflösbar: ${path}`);
  } catch (err) {
    // Merker wurde nicht gesetzt — beim nächsten Start wird es erneut versucht.
    console.error('[reconcile] Abgleich fehlgeschlagen, wird beim nächsten Start wiederholt:', err);
  }
}
