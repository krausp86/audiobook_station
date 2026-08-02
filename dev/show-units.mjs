#!/usr/bin/env node
//
// Zeigt, welche Kacheln der Medienbestand ergibt — ohne die App zu starten.
//
// Stellt die HEUTIGE Regel (tag-abgeleitet, library/list.ts:106-124) der
// GEPLANTEN Ordnerregel (tasks/feature-playlists.md, E1/E2) gegenueber.
// Waehrend des Umbaus ist das der schnellste Vorher-Nachher-Vergleich.
//
//   node dev/show-units.mjs            # beide Regeln + Diff
//   node dev/show-units.mjs --current  # nur die heutige
//   node dev/show-units.mjs --new      # nur die geplante
//
// Voraussetzung: der MPD-Container laeuft.
//   docker compose -f dev/docker-compose.yml up -d

import net from 'node:net';

const PORT = Number(process.env.HOERMOND_MPD_PORT ?? 6601);
const HOST = process.env.HOERMOND_MPD_HOST ?? '127.0.0.1';

function listallinfo() {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(PORT, HOST);
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`Timeout — laeuft MPD auf ${HOST}:${PORT}?`));
    }, 10_000);
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.on('connect', () => setTimeout(() => sock.write('listallinfo\n'), 50));
    sock.on('data', (d) => {
      buf += d;
      if (/\nOK\n$/.test(buf) || /^OK\n$/.test(buf.split('\n').slice(1).join('\n'))) {
        clearTimeout(timer);
        sock.end();
        resolve(parse(buf));
      }
    });
  });
}

function parse(raw) {
  const files = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    const i = line.indexOf(': ');
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 2);
    if (k === 'file') { cur = { file: v }; files.push(cur); }
    else if (cur) cur[k] = v;
  }
  return files;
}

// ── Regel 1: heutiger Stand, gespiegelt aus library/list.ts:106-124 ──────────
function unitPathCurrent(f) {
  const file = f.file;
  const parts = file.split('/');
  const type = parts[0] === 'audiobooks' ? 'audiobook' : 'music';
  if (type === 'music') {
    const albumArtist = f['AlbumArtist'] ?? f['Artist'];
    const album = f['Album'];
    return albumArtist && album ? `music/${albumArtist}/${album}` : file;
  }
  let unitPath = parts.slice(0, Math.min(3, parts.length - 1)).join('/') || parts[0];
  if (!unitPath.includes('/')) unitPath = file;
  return unitPath;
}

// ── Regel 2: Ordnermodell ───────────────────────────────────────────────────
// Spiegel von app/src/main/library/grouping.ts — dort ist der Ort der Wahrheit.
// Ein eigenstaendiges Node-Skript kann kein TypeScript importieren, deshalb die
// Kopie. Wer die Regel dort aendert, muss hier nachziehen.
const DISC_DIR_PATTERN = /^(cd|disc|disk)[\s._-]*\d+$/i;
const isDiscDir = (name) => DISC_DIR_PATTERN.test(name);

function unitPathNew(f, dirsWithSubdirs) {
  const parts = f.file.split('/');
  if (parts.length < 2) return f.file;

  let dir = parts.slice(0, -1).join('/');
  for (;;) {
    const segments = dir.split('/');
    const name = segments[segments.length - 1];
    if (segments.length < 2 || !isDiscDir(name)) break;
    dir = segments.slice(0, -1).join('/');
  }

  return dirsWithSubdirs.has(dir) ? f.file : dir;
}

function dirsHavingSubdirs(files) {
  const dirs = new Set();
  for (const f of files) {
    const parts = f.file.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  const withSub = new Set();
  for (const d of dirs) {
    const segments = d.split('/');
    // Datentraeger-Ordner machen ihren Elternteil NICHT zum Navigationsordner.
    if (isDiscDir(segments[segments.length - 1])) continue;
    const parent = segments.slice(0, -1).join('/');
    if (parent) withSub.add(parent);
  }
  return withSub;
}

function group(files, fn) {
  const units = new Map();
  for (const f of files) {
    const u = fn(f);
    units.set(u, (units.get(u) ?? 0) + 1);
  }
  return units;
}

function print(title, units) {
  console.log(`\n${title} — ${units.size} Kacheln`);
  console.log('─'.repeat(64));
  for (const [u, n] of [...units].sort(([a], [b]) => a.localeCompare(b, 'de'))) {
    console.log(`  ${String(n).padStart(3)}x  ${u}`);
  }
}

const files = await listallinfo();
const mode = process.argv[2] ?? '--both';
const withSub = dirsHavingSubdirs(files);
const cur = group(files, unitPathCurrent);
const neu = group(files, (f) => unitPathNew(f, withSub));

console.log(`${files.length} Dateien aus MPD (${HOST}:${PORT})`);

if (mode !== '--new') print('HEUTE  (tag-abgeleitet, list.ts:106-124)', cur);
if (mode !== '--current') print('GEPLANT (Ordnermodell, E1/E2)', neu);

if (mode === '--both') {
  const only = (a, b) => [...a.keys()].filter((k) => !b.has(k));
  const gone = only(cur, neu);
  const added = only(neu, cur);
  console.log(`\nDIFF — ${cur.size} → ${neu.size} Kacheln`);
  console.log('─'.repeat(64));
  for (const u of gone.sort()) console.log(`  \x1b[31m−\x1b[0m ${u}`);
  for (const u of added.sort()) console.log(`  \x1b[32m+\x1b[0m ${u}`);
  if (!gone.length && !added.length) console.log('  (identisch)');
}
