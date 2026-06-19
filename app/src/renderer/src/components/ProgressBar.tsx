import { useState, useRef, type PointerEvent } from 'react';

/**
 * ProgressBar component: displays playback position with chapter markers.
 *
 * Features:
 * - Visual track (12px height, flieder-deep fill)
 * - Drag handle (40×40px tap target) that allows seeking on pointer release
 * - Chapter tick markers at cumulative start positions
 * - Time labels (m:ss or h:mm:ss)
 * - Touch-action: none to prevent scrolling during drag
 *
 * Design note: seek is committed only on pointer release (onPointerUp),
 * not during drag, to allow user to change their mind.
 */
interface ProgressBarProps {
  /** Current playback position in seconds (live from MPD) */
  position: number;

  /** Total duration in seconds, or null if unknown */
  duration: number | null;

  /** Array of chapters (each with startSeconds) */
  chapters: { startSeconds: number }[];

  /** Called when user releases the drag handle with a new seek position */
  onSeekCommit: (seconds: number) => void;
}

/**
 * Format seconds to human-readable time string.
 * Returns m:ss for durations < 1 hour, h:mm:ss otherwise.
 */
function formatTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export default function ProgressBar({
  position,
  duration,
  chapters,
  onSeekCommit,
}: ProgressBarProps): React.JSX.Element {
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Determine display position and time (either live or drag preview)
  const displayPosition = dragSeconds !== null ? dragSeconds : position;
  const rawPercent = duration && duration > 0 ? (displayPosition / duration) * 100 : 0;
  const displayPercent = Math.max(0, Math.min(100, rawPercent));

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (relX / rect.width) * 100));
    const sec = duration ? (pct / 100) * duration : 0;
    setDragSeconds(Math.max(0, sec));
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragSeconds === null || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (relX / rect.width) * 100));
    const sec = duration ? (pct / 100) * duration : 0;
    setDragSeconds(Math.max(0, sec));
  };

  const handlePointerUp = (): void => {
    if (dragSeconds !== null) {
      onSeekCommit(dragSeconds);
      setDragSeconds(null);
    }
  };

  const handlePointerLeave = (): void => {
    // If user drags outside, cancel (don't seek)
    setDragSeconds(null);
  };

  return (
    <div className="progress-bar">
      {/* Top row: current / total time */}
      <div className="progress-time-labels">
        <span className="t-tiny progress-time-current">{formatTime(displayPosition)}</span>
        <span className="t-tiny progress-time-duration">{formatTime(duration ?? 0)}</span>
      </div>

      {/* Track container with chapter markers and drag handle */}
      <div
        ref={trackRef}
        className="progress-track"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration ?? 0}
        aria-valuenow={Math.floor(displayPosition)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerUp}
      >
        {/* Fill bar (background track) */}
        <div
          className="progress-fill"
          style={{
            width: `${displayPercent}%`,
          }}
        />

        {/* Chapter markers */}
        {chapters.map((ch, idx) => {
          const chPct = duration && duration > 0 ? (ch.startSeconds / duration) * 100 : 0;
          return <div key={idx} className="progress-chapter-marker" style={{ left: `${chPct}%` }} />;
        })}

        {/* Draggable handle (40×40px tap target, centered on track) */}
        <div
          className="progress-handle"
          style={{
            left: `calc(${displayPercent}% - 20px)`, // Offset by half width to center
          }}
        />
      </div>
    </div>
  );
}
