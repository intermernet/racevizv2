import { useState, useEffect, useRef, useCallback } from 'react';

interface UseRaceAnimationProps {
  startTime: Date;
  endTime: Date;
  initialSpeed?: number;
  /**
   * A callback function that will be executed on every single animation frame.
   * This is the ideal place for high-frequency, imperative updates (like moving a map marker)
   * that should not be tied to React's render cycle.
   */
  onFrame?: (time: Date) => void;
}

/**
 * A custom hook to manage the state and logic for a time-based animation loop.
 * It uses `requestAnimationFrame` for smooth, performant animation and provides
 * controls for play/pause, speed, and scrubbing.
 */
export const useRaceAnimation = ({ startTime, endTime, initialSpeed = 1.0, onFrame }: UseRaceAnimationProps) => {
  // `currentTime` is now ONLY for the UI (e.g., the timeline). It does NOT drive the animation.
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);

  // --- REFS ---
  // Refs are used to store values that are needed within the animation loop
  // but should not cause the component to re-render when they change.
  const animationFrameId = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  const speedRef = useRef(speed);
  const onFrameRef = useRef(onFrame);
  
  // This ref is the new, true source of truth for the animation's timing.
  // It is updated on every frame, independent of React's render cycle.
  const currentTimeRef = useRef(startTime);

  // We store the `onFrame` callback and `speed` in a ref. This is a crucial optimization.
  // It prevents the `animate` function from needing to be re-created every time
  // the parent component re-renders, which could cause performance issues.
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // The animation loop is now STABLE. It has no state dependencies for its timing.
  const animate = useCallback(() => {
    const now = performance.now();
    // Calculate delta time, defaulting to 0 on the first frame.
    const deltaTime = lastFrameTimeRef.current ? now - lastFrameTimeRef.current : 0;
    
    const newTimestamp = currentTimeRef.current.getTime() + (deltaTime * speedRef.current);
    const endTimestamp = endTime.getTime();

    if (newTimestamp >= endTimestamp) {
      // Reached the end of the race.
      currentTimeRef.current = endTime;
      onFrameRef.current?.(endTime);
      setCurrentTime(endTime);
      setIsPlaying(false); // Stop the animation.
    } else {
      // In the middle of the animation.
      currentTimeRef.current = new Date(newTimestamp);
      // Execute the high-performance callback.
      onFrameRef.current?.(currentTimeRef.current);
      // Set React state to trigger UI re-renders for low-frequency elements like the timeline.
      setCurrentTime(currentTimeRef.current);
      // Continue the animation loop on the next available frame.
      animationFrameId.current = requestAnimationFrame(animate);
    }

    lastFrameTimeRef.current = now;
  }, [endTime]); // This function is now very stable.

  // Effect to start and stop the animation loop based on the `isPlaying` state.
  useEffect(() => {
    if (isPlaying) {
      // Set the start time for the next frame delta calculation.
      lastFrameTimeRef.current = performance.now();
      animationFrameId.current = requestAnimationFrame(animate);
    }
    // Cleanup function: ensures the animation is stopped when pausing or unmounting.
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, animate]);

  // --- PUBLIC CONTROL FUNCTIONS ---

  const togglePlayPause = () => {
    setIsPlaying(prev => !prev);
  };

  const scrubTo = (progressPercent: number) => {
    if (isPlaying) setIsPlaying(false); // Pause when scrubbing
    const totalDuration = endTime.getTime() - startTime.getTime();
    const timeOffset = totalDuration * (progressPercent / 100);
    const newTime = new Date(startTime.getTime() + timeOffset);
    
    // Update both the ref (for animation) and the state (for UI) when scrubbing.
    currentTimeRef.current = newTime;
    setCurrentTime(newTime);
    // Also call onFrame immediately to give instant visual feedback on the map.
    onFrameRef.current?.(newTime);
  };
  
  // --- DERIVED STATE ---
  // Calculate the progress percentage for the timeline slider.
  const totalDurationMs = endTime.getTime() - startTime.getTime();
  const elapsedMs = currentTime.getTime() - startTime.getTime();
  const progress = totalDurationMs > 0 ? (elapsedMs / totalDurationMs) * 100 : 0;
  
  return {
    // We no longer need to return `currentTime`. The consuming component's UI
    // should be driven by the `progress` value for the timeline.
    isPlaying,
    speed,
    progress,
    togglePlayPause,
    setSpeed,
    scrubTo,
  };
};