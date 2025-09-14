import { useState, useEffect, useRef, useCallback } from 'react';

interface UseRaceAnimationProps {
  startTime: Date;
  endTime: Date;
  initialSpeed?: number;
}

/**
 * A custom hook to manage the state and logic for a time-based animation loop.
 * It uses `requestAnimationFrame` for smooth, performant animation and provides
 * controls for play/pause, speed, and scrubbing.
 */
export const useRaceAnimation = ({ startTime, endTime, initialSpeed = 1.0 }: UseRaceAnimationProps) => {
  // --- STATE ---
  // The `currentTime` state is the single source of truth for the animation's progress.
  const [currentTime, setCurrentTime] = useState(startTime.getTime()); // Use numeric timestamp
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);

  // --- REFS ---
  // Refs are used to store values that need to persist across renders
  // without triggering a re-render themselves.
  const animationFrameId = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  // A ref for speed ensures the memoized `animate` function always has the latest value.
  const speedRef = useRef(speed);

  // Keep the speed ref in sync with the speed state.
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // The core animation loop, wrapped in useCallback for stability.
  const animate = useCallback((timestamp: number) => {
    if (lastFrameTimeRef.current !== undefined) {
      const deltaTime = timestamp - lastFrameTimeRef.current;
      
      // We use the functional form of `setCurrentTime` to get the previous state.
      // This allows us to remove `currentTime` from this hook's dependency array,
      // preventing the `animate` function from being re-created on every frame.
      setCurrentTime(prevTime => {
        const newTimestamp = prevTime + (deltaTime * speedRef.current);
        const endTimestamp = endTime.getTime();
        
        // Stop the animation if it reaches the end.
        if (newTimestamp >= endTimestamp) {
          setIsPlaying(false);
          return endTimestamp;
        }
        return newTimestamp;
      });
    }

    lastFrameTimeRef.current = timestamp;
    // Continue the loop on the next available frame.
    animationFrameId.current = requestAnimationFrame(animate);
  }, [endTime]); // This function is very stable and only re-creates if the race's end time changes.

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
    const newTime = startTime.getTime() + timeOffset;
    setCurrentTime(newTime);
  };
  
  // --- DERIVED STATE ---
  // Calculate the progress percentage for the timeline slider.
  const totalDurationMs = endTime.getTime() - startTime.getTime();
  const elapsedMs = currentTime - startTime.getTime();
  const progress = totalDurationMs > 0 ? (elapsedMs / totalDurationMs) * 100 : 0;
  
  return {
    currentTime,
    isPlaying,
    speed,
    progress,
    togglePlayPause,
    setSpeed,
    scrubTo,
  };
};