import { describe, it, expect } from 'vitest';
import { unitPathFor, mediaTypeForPath } from './grouping';

describe('mediaTypeForPath', () => {
  it('treats everything under audiobooks/ as audiobook', () => {
    expect(mediaTypeForPath('audiobooks/Autor/Titel/01.mp3')).toBe('audiobook');
    expect(mediaTypeForPath('audiobooks/lose.m4b')).toBe('audiobook');
  });

  it('treats everything else as music', () => {
    expect(mediaTypeForPath('music/Interpret/Album/01.mp3')).toBe('music');
    // Ein dritter Wurzelordner zaehlt als Musik — siehe Regressionstest unten.
    expect(mediaTypeForPath('hoerspiele/Titel/01.mp3')).toBe('music');
  });
});

describe('unitPathFor — Musik', () => {
  it('groups by AlbumArtist + Album', () => {
    expect(
      unitPathFor('music/beliebig/flach/01.mp3', {
        AlbumArtist: 'Die Aerzte',
        Album: 'Bester Sampler',
      }),
    ).toBe('music/Die Aerzte/Bester Sampler');
  });

  it('falls back to Artist when AlbumArtist is missing', () => {
    expect(unitPathFor('music/x/01.mp3', { Artist: 'Anna', Album: 'Kinderhits' })).toBe(
      'music/Anna/Kinderhits',
    );
  });

  it('prefers AlbumArtist over Artist', () => {
    expect(
      unitPathFor('music/x/01.mp3', {
        AlbumArtist: 'Diverse',
        Artist: 'Anna',
        Album: 'Kinderhits',
      }),
    ).toBe('music/Diverse/Kinderhits');
  });

  it('makes each file its own unit when Album is missing', () => {
    expect(unitPathFor('music/Ohne Tags/track-a.mp3', { Artist: 'Anna' })).toBe(
      'music/Ohne Tags/track-a.mp3',
    );
  });

  it('makes each file its own unit when there are no tags at all', () => {
    expect(unitPathFor('music/Ohne Tags/track-a.mp3')).toBe('music/Ohne Tags/track-a.mp3');
  });

  it('groups a compilation across differing Artist tags via AlbumArtist', () => {
    const a = unitPathFor('music/Sampler/Kinderhits/01.mp3', {
      AlbumArtist: 'Diverse',
      Artist: 'Anna',
      Album: 'Kinderhits',
    });
    const b = unitPathFor('music/Sampler/Kinderhits/02.mp3', {
      AlbumArtist: 'Diverse',
      Artist: 'Bernd',
      Album: 'Kinderhits',
    });
    expect(a).toBe(b);
  });

  it('splits a compilation without AlbumArtist — the known defect', () => {
    // Dokumentiert den Ist-Zustand, nicht den Wunsch: ohne AlbumArtist zerfaellt
    // ein Sampler in eine Einheit je Interpret. Das Ordnermodell behebt das.
    const a = unitPathFor('music/Sampler/Kinderhits/01.mp3', { Artist: 'Anna', Album: 'Kinderhits' });
    const b = unitPathFor('music/Sampler/Kinderhits/02.mp3', { Artist: 'Bernd', Album: 'Kinderhits' });
    expect(a).not.toBe(b);
  });
});

describe('unitPathFor — Hoerbuch', () => {
  it('groups by parent directory', () => {
    expect(unitPathFor('audiobooks/Titel/01.mp3')).toBe('audiobooks/Titel');
  });

  it('groups by author/title at two levels', () => {
    expect(unitPathFor('audiobooks/Autor/Titel/01.mp3')).toBe('audiobooks/Autor/Titel');
  });

  it('caps at three path segments, merging CD1/CD2', () => {
    expect(unitPathFor('audiobooks/Autor/Titel/CD1/01.mp3')).toBe('audiobooks/Autor/Titel');
    expect(unitPathFor('audiobooks/Autor/Titel/CD2/01.mp3')).toBe('audiobooks/Autor/Titel');
  });

  it('does NOT merge CD1/CD2 one level higher — the cap kicks in too late', () => {
    // Ist-Zustand, bewusst festgehalten: die Deckelung greift nur tief genug
    // im Baum. Siehe Tabelle in grouping.ts.
    expect(unitPathFor('audiobooks/Titel/CD1/01.mp3')).toBe('audiobooks/Titel/CD1');
    expect(unitPathFor('audiobooks/Titel/CD2/01.mp3')).toBe('audiobooks/Titel/CD2');
  });

  it('makes a loose file directly under audiobooks/ its own unit', () => {
    // Sonst entstuende die Sammelkachel "audiobooks".
    expect(unitPathFor('audiobooks/Einzelhoerbuch.m4b')).toBe('audiobooks/Einzelhoerbuch.m4b');
  });

  it('ignores tags entirely for audiobooks', () => {
    expect(
      unitPathFor('audiobooks/Autor/Titel/01.mp3', {
        AlbumArtist: 'Irgendwer',
        Album: 'Irgendwas',
      }),
    ).toBe('audiobooks/Autor/Titel');
  });
});

describe('unitPathFor — Regression: dritter Wurzelordner', () => {
  // Vor dem Zusammenziehen verzweigten die drei Kopien unterschiedlich:
  // list.ts auf `type === 'music'` (also alles ausser audiobooks/), persist.ts
  // und control.ts dagegen auf `top === 'music'`. Fuer einen Ordner wie
  // `hoerspiele/` liefen sie damit auseinander — die Bibliothek gruppierte nach
  // Tags, der Fortschritt wurde unter einem Pfad-Unit gespeichert. Resume war
  // fuer solche Ordner kaputt. Jetzt entscheidet ueberall mediaTypeForPath().
  it('applies the music rule to a third root folder', () => {
    expect(
      unitPathFor('hoerspiele/Serie/Folge/01.mp3', {
        AlbumArtist: 'Serie',
        Album: 'Folge',
      }),
    ).toBe('music/Serie/Folge');
  });

  it('makes an untagged file in a third root folder its own unit', () => {
    expect(unitPathFor('hoerspiele/Serie/Folge/01.mp3')).toBe('hoerspiele/Serie/Folge/01.mp3');
  });
});
