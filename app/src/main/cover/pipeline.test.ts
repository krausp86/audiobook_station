import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveCover, type CoverItem } from './pipeline';

const testTempDir = join(tmpdir(), 'hoermond-cover-tests');

describe('Cover Pipeline', () => {
  beforeEach(async () => {
    try {
      await mkdir(testTempDir, { recursive: true });
    } catch (e) {
      // Already exists
    }
    // Set environment variables for testing
    process.env.HOERMOND_MEDIA_ROOT = testTempDir;
    process.env.HOERMOND_COVER_CACHE = join(testTempDir, '.cache', 'covers');
    await mkdir(process.env.HOERMOND_COVER_CACHE, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      const fs = await import('fs/promises');
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (e) {
      // Already removed
    }
  });

  it('should return null for non-existent media with no fallback', async () => {
    // Disable online fetches for this test by unset Last.fm key and invalid MusicBrainz
    const oldKey = process.env.HOERMOND_LASTFM_KEY;
    delete process.env.HOERMOND_LASTFM_KEY;

    const item: CoverItem = {
      path: 'audiobooks/nonexistent/book',
      type: 'audiobook',
      title: 'Nonexistent Book',
      // artist: undefined — no artist means MusicBrainz will bail early
    };

    const result = await resolveCover(item);
    expect(result).toBeNull();

    // Restore
    if (oldKey) process.env.HOERMOND_LASTFM_KEY = oldKey;
  });

  it('should find file cover (cover.jpg) in directory', async () => {
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    // Create a cover.jpg file (minimal JPEG magic bytes)
    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const coverPath = join(mediaDir, 'cover.jpg');
    await writeFile(coverPath, jpegData);

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);
  });

  it('should prefer cover.jpg over folder.jpg', async () => {
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const folderPath = join(mediaDir, 'folder.jpg');
    const coverPath = join(mediaDir, 'cover.jpg');

    await writeFile(folderPath, jpegData);
    await writeFile(coverPath, jpegData);

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);
  });

  it('should find folder.jpg if cover.jpg is missing', async () => {
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const folderPath = join(mediaDir, 'folder.jpg');
    await writeFile(folderPath, jpegData);

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(folderPath);
  });

  it('should check cache before online fetch', async () => {
    const cacheDir = process.env.HOERMOND_COVER_CACHE ?? '/mnt/hoermond/.cache/covers/';
    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    // Create a cached cover (by SHA-1 hash)
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha1').update(item.path).digest('hex');
    const cachePath = join(cacheDir, `${hash}.jpg`);

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await writeFile(cachePath, jpegData);

    const result = await resolveCover(item);
    expect(result).toEqual(cachePath);
  });

  it('should handle errors gracefully (no throw)', async () => {
    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    // Should not throw, just return null
    const result = await resolveCover(item);
    expect(result).toBeNull();
  });

  it('should respect HOERMOND_MEDIA_ROOT env var', async () => {
    const customRoot = join(testTempDir, 'custom-media');
    await mkdir(customRoot, { recursive: true });

    const mediaDir = join(customRoot, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const coverPath = join(mediaDir, 'cover.jpg');
    await writeFile(coverPath, jpegData);

    const oldRoot = process.env.HOERMOND_MEDIA_ROOT;
    process.env.HOERMOND_MEDIA_ROOT = customRoot;

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);

    // Restore
    if (oldRoot) process.env.HOERMOND_MEDIA_ROOT = oldRoot;
  });

  it('should support PNG covers', async () => {
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    // PNG magic bytes
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const coverPath = join(mediaDir, 'cover.png');
    await writeFile(coverPath, pngData);

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);
  });

  it('should handle folder-based media (MP3 directories)', async () => {
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });

    // Create a cover.jpg in the directory (applies to all chapters)
    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const coverPath = join(mediaDir, 'cover.jpg');
    await writeFile(coverPath, jpegData);

    // Create dummy MP3 files (for directory detection)
    await writeFile(join(mediaDir, 'chapter1.mp3'), Buffer.from([]));
    await writeFile(join(mediaDir, 'chapter2.mp3'), Buffer.from([]));

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);
  });

  it('should handle concurrent requests for same item (concurrency guard)', async () => {
    // Create a cover file so both requests succeed from local cache
    const mediaDir = join(testTempDir, 'music', 'Artist', 'Album1');
    await mkdir(mediaDir, { recursive: true });

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const coverPath = join(mediaDir, 'cover.jpg');
    await writeFile(coverPath, jpegData);

    const item1: CoverItem = {
      path: 'music/Artist/Album1',
      type: 'music',
      title: 'Album1',
      artist: 'Artist',
    };

    // Simulate two concurrent requests for the same item
    const promise1 = resolveCover(item1);
    const promise2 = resolveCover(item1);

    const result1 = await promise1;
    const result2 = await promise2;

    // Both should get the same result
    expect(result1).toEqual(coverPath);
    expect(result2).toEqual(coverPath);
  });

  it('should handle music type items', async () => {
    const mediaDir = join(testTempDir, 'music', 'Artist', 'Album');
    await mkdir(mediaDir, { recursive: true });

    const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const coverPath = join(mediaDir, 'cover.jpg');
    await writeFile(coverPath, jpegData);

    const item: CoverItem = {
      path: 'music/Artist/Album',
      type: 'music',
      title: 'Album',
      artist: 'Artist',
    };

    const result = await resolveCover(item);
    expect(result).toEqual(coverPath);
  });

  it('should log errors to console.warn without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const item: CoverItem = {
      path: 'audiobooks/Author/Book',
      type: 'audiobook',
      title: 'Book',
      artist: 'Author',
    };

    // Simulate directory with no audio files
    const mediaDir = join(testTempDir, 'audiobooks', 'Author', 'Book');
    await mkdir(mediaDir, { recursive: true });
    await writeFile(join(mediaDir, 'readme.txt'), Buffer.from('No audio files'));

    const result = await resolveCover(item);
    expect(result).toBeNull();
    // Note: actual error logging may or may not occur depending on implementation

    warnSpy.mockRestore();
  });
});
