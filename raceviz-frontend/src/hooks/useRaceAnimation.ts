import { useState, useEffect, useRef, useCallback } from 'react';

interface UseRaceAnimationProps {
  startTime: Date;
  endTime: Date;
  initialSpeed?: number;
}

export const useRaceAnimation = ({ startTime, endTime, initialSpeed = 1.0 }: UseRaceAnimationProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const [currentTime, setCurrentTime] = useState(startTime);

  const animationFrameId = useRef<number | null>(null);

  // --- THE FIX IS HERE ---
  // We must explicitly pass `undefined` as the initial value.
  const lastFrameTimeRef = useRef<number | undefined>(undefined);
  
  const speedRef = useRef(speed);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const animate = useCallback((timestamp: number) => {
    if (lastFrameTimeRef.current !== undefined) {
      // Also fixed a typo here: lastFrameTime_ref -> lastFrameTimeRef
      const deltaTime = timestamp - lastFrameTimeRef.current;
      
      setCurrentTime(prevTime => {
        const newTimestamp = prevTime.getTime() + (deltaTime * speedRef.current);
        const endTimestamp = endTime.getTime();
        
        if (newTimestamp >= endTimestamp) {
          setIsPlaying(false);
          return endTime;
        }
        return new Date(newTimestamp);
      });
    }
    lastFrameTimeRef.current = timestamp;
    animationFrameId.current = requestAnimationFrame(animate);
  }, [endTime]);

  useEffect(() => {
    if (isPlaying) {
      // We also need to reset lastFrameTimeRef here when play is pressed
      // to avoid a large jump from the last time it was paused.
      lastFrameTimeRef.current = performance.now();
      animationFrameId.current = requestAnimationFrame(animate);
    } else {
      // When pausing, clear the last frame time.
      lastFrameTimeRef.current = undefined;
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, animate]);

  const togglePlayPause = () => {
    setIsPlaying(prev => !prev);
  };

  const scrubTo = (progressPercent: number) => {
    if (isPlaying) {
      setIsPlaying(false);
    }
    const totalDuration = endTime.getTime() - startTime.getTime();
    const timeOffset = totalDuration * (progressPercent / 100);
    setCurrentTime(new Date(startTime.getTime() + timeOffset));
  };
  
  const totalDurationMs = endTime.getTime() - startTime.getTime();
  const elapsedMs = currentTime.getTime() - startTime.getTime();
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