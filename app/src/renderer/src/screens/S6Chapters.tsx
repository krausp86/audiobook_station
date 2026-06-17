import { useEffect, useState, useRef } from 'react';
import { useT } from '../i18n/I18nContext';
import Pressable from '../components/Pressable';
import type { Chapter } from '@shared/chapter';

/**
 * S6 Chapters Sheet: swipe-up sheet displaying chapter list.
 *
 * Design:
 * - Slide-in/out: 260ms ease-out (enter), 200ms ease-in (exit)
 * - Transform: translateY(100%) → 0
 * - Scrim: rgba(42, 35, 66, 0.55), taps to close
 * - Current chapter highlighted (left accent bar + tint background)
 * - E12: kapitellos → icon disabled, sheet not rendered
 *
 * Swipe-up gesture in S5:
 * - Pointer-down on background → track movement
 * - If deltaY < -60px and |dy| > |dx|, open sheet
 * - Sheet-only swipe, not on progress bar
 */
interface S6ChaptersProps {
  /** Array of chapters to display */
  chapters: Chapter[];

  /** Current chapter index (0-based), or null if none */
  currentChapterIndex: number | null;

  /** Called when user taps a chapter */
  onGoto: (index: number) => void;

  /** Called when user closes the sheet (scrim tap or back gesture) */
  onClose: () => void;
}

export default function S6Chapters({
  chapters,
  currentChapterIndex,
  onGoto,
  onClose,
}: S6ChaptersProps): React.JSX.Element {
  const t = useT();
  const [isEntered, setIsEntered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Mount animation
  useEffect(() => {
    // Small delay to allow CSS transition to trigger
    const timer = setTimeout(() => setIsEntered(true), 16);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to current chapter
  useEffect(() => {
    if (currentChapterIndex !== null && listRef.current) {
      const itemHeight = 48; // approximate height of each chapter item
      const scrollTop = currentChapterIndex * itemHeight - itemHeight;
      listRef.current.scrollTop = Math.max(0, scrollTop);
    }
  }, [currentChapterIndex]);

  const handleClose = (): void => {
    setIsClosing(true);
    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleChapterTap = (index: number): void => {
    onGoto(index);
    handleClose();
  };

  const scrimClass = `s6-scrim${isEntered ? ' is-entered' : ''}${isClosing ? ' is-closing' : ''}`;

  return (
    <div className={scrimClass} onPointerUp={handleClose} role="dialog" aria-modal="true">
      {/* Prevent clicks on sheet from closing */}
      <div
        ref={sheetRef}
        className="s6-sheet"
        onPointerUp={(e) => e.stopPropagation()}
        role="region"
        aria-label={t('chapters.title')}
      >
        {/* Header */}
        <div className="s6-header">
          <h2 className="s6-title">{t('chapters.title')}</h2>
          <button
            className="s6-close-btn"
            onClick={handleClose}
            aria-label={t('chapters.close')}
          >
            ✕
          </button>
        </div>

        {/* Chapter list */}
        <div ref={listRef} className="s6-list">
          {chapters.map((chapter) => {
            const isActive = chapter.index === currentChapterIndex;
            return (
              <Pressable
                key={chapter.index}
                className={`s6-chapter-item${isActive ? ' is-active' : ''}`}
                onTap={() => handleChapterTap(chapter.index)}
              >
                <span className="s6-chapter-number">{chapter.index + 1}</span>
                <span className="s6-chapter-title">{chapter.title}</span>
              </Pressable>
            );
          })}
        </div>
      </div>
    </div>
  );
}
