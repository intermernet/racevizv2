import React from 'react';
import './TimelineSlider.css';

interface TimelineSliderProps {
  /** The current progress of the animation, from 0 to 100 */
  progress: number;
  // --- The 'currentTime' prop is now removed ---
  /** The total duration of the race in milliseconds */
  totalDurationMs: number;
  /** Callback function when the user drags the slider */
  onScrub: (newProgress: number) => void;
}

/**
 * Formats milliseconds into a HH:MM:SS string.
 */
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => num.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};


export const TimelineSlider: React.FC<TimelineSliderProps> = ({
  progress,
  totalDurationMs,
  onScrub,
}) => {
  // This calculation correctly derives the elapsed time from the progress percentage.
  const elapsedMs = (totalDurationMs * progress) / 100;

  return (
    <div className="timeline-container">
      <div className="time-display current-time">{formatTime(elapsedMs)}</div>
      <input
        type="range"
        className="timeline-slider"
        min="0"
        max="100"
        step="0.1"
        value={progress}
        onChange={(e) => onScrub(parseFloat(e.target.value))}
      />
      <div className="time-display total-time">{formatTime(totalDurationMs)}</div>
    </div>
  );
};