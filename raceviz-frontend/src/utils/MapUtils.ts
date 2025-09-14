import type { TrackPath, TrackPoint, RacerProgress } from '../types/index.ts';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculates the great-circle distance between two GPS coordinates using the Haversine formula.
 * This is accurate for a spherical Earth.
 * @param p1 The starting coordinate { lat, lon }.
 * @param p2 The ending coordinate { lat, lon }.
 * @returns The distance between the two points in meters.
 */
function haversineDistance(p1: { lat: number, lon: number }, p2: { lat: number, lon: number }): number {
  const R = 6371e3; // Earth's radius in meters
  const lat1Rad = p1.lat * Math.PI / 180;
  const lat2Rad = p2.lat * Math.PI / 180;
  const deltaLatRad = (p2.lat - p1.lat) * Math.PI / 180;
  const deltaLonRad = (p2.lon - p1.lon) * Math.PI / 180;

  const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * An internal helper to perform Spherical Linear Interpolation (Slerp) between two points.
 * @param p1 The starting TrackPoint.
 * @param p2 The ending TrackPoint.
 * @param factor The interpolation factor (0.0 to 1.0).
 * @returns The interpolated coordinates { lat, lon }.
 */
function _slerp(p1: TrackPoint, p2: TrackPoint, factor: number): { lat: number, lon: number } {
    const lat1 = p1.lat * Math.PI / 180, lon1 = p1.lon * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180, lon2 = p2.lon * Math.PI / 180;
    const dLon = lon2 - lon1;
    const cosLat1 = Math.cos(lat1), cosLat2 = Math.cos(lat2);
    const sinLat1 = Math.sin(lat1), sinLat2 = Math.sin(lat2);
    
    const omega = Math.acos(sinLat1 * sinLat2 + cosLat1 * cosLat2 * Math.cos(dLon));
    if (omega < 1e-6) return { lat: p1.lat, lon: p1.lon }; // If points are too close, return the start point

    const sinOmega = Math.sin(omega);
    const A = Math.sin((1 - factor) * omega) / sinOmega;
    const B = Math.sin(factor * omega) / sinOmega;

    const x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2);
    const y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2);
    const z = A * sinLat1 + B * sinLat2;

    const latOut = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    const lonOut = Math.atan2(y, x) * 180 / Math.PI;
    
    return { lat: latOut, lon: lonOut };
}


// =============================================================================
// PRIMARY EXPORTED UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculates the geographical position of a racer at a specific moment in time.
 * This optimized version uses Slerp for accuracy and indexed searching for performance.
 *
 * @param path The racer's complete track path.
 * @param targetTime The absolute time for which to calculate the position.
 * @param searchFromIndex The array index to start searching from (optimization).
 * @returns An object containing the interpolated position and the index of the segment found, or null.
 */
export function getPositionAtTime(
  path: TrackPath,
  targetTime: Date,
  searchFromIndex: number = 0
): { lat: number; lon: number; foundIndex: number } | null {
  const points = path.points;
  
  if (points.length < 2) {
    return points.length === 1 ? { lat: points[0].lat, lon: points[0].lon, foundIndex: 0 } : null;
  }

  const targetTimestamp = targetTime.getTime();
  const firstPointTime = new Date(points[0].timestamp).getTime();
  const lastPointTime = new Date(points[points.length - 1].timestamp).getTime();

  if (targetTimestamp <= firstPointTime) {
    return { lat: points[0].lat, lon: points[0].lon, foundIndex: 0 };
  }
  if (targetTimestamp >= lastPointTime) {
    const lastPoint = points[points.length - 1];
    return { lat: lastPoint.lat, lon: lastPoint.lon, foundIndex: points.length - 2 };
  }

  // Optimized forward search
  for (let i = searchFromIndex; i < points.length - 1; i++) {
    const p1 = points[i], p2 = points[i + 1];
    const t1 = new Date(p1.timestamp).getTime(), t2 = new Date(p2.timestamp).getTime();

    if (targetTimestamp >= t1 && targetTimestamp <= t2) {
      const segmentDuration = t2 - t1;
      if (segmentDuration === 0) return { lat: p1.lat, lon: p1.lon, foundIndex: i };
      
      const factor = (targetTimestamp - t1) / segmentDuration;
      const { lat, lon } = _slerp(p1, p2, factor);
      return { lat, lon, foundIndex: i };
    }
  }

  // Full search fallback (for scrubbing backwards)
  if (searchFromIndex > 0) {
    for (let i = 0; i < searchFromIndex; i++) {
      const p1 = points[i], p2 = points[i + 1];
      const t1 = new Date(p1.timestamp).getTime(), t2 = new Date(p2.timestamp).getTime();
      if (targetTimestamp >= t1 && targetTimestamp <= t2) {
        const factor = (targetTimestamp - t1) / (t2 - t1);
        const { lat, lon } = _slerp(p1, p2, factor);
        return { lat, lon, foundIndex: i };
      }
    }
  }

  const lastPoint = points[points.length - 1];
  return { lat: lastPoint.lat, lon: lastPoint.lon, foundIndex: points.length - 2 };
}

/**
 * Calculates the speed and heading between two track points.
 * @param p1 The starting point.
 * @param p2 The ending point.
 * @returns An object with speed in km/h and heading in degrees (0-360).
 */
export function calculateSpeedAndHeading(p1: TrackPoint, p2: TrackPoint): { speedKph: number; heading: number } {
  const distanceMeters = haversineDistance(p1, p2);
  const t1 = new Date(p1.timestamp).getTime();
  const t2 = new Date(p2.timestamp).getTime();
  const timeSeconds = (t2 - t1) / 1000;

  if (timeSeconds <= 0) {
    return { speedKph: 0, heading: 0 };
  }

  const speedMps = distanceMeters / timeSeconds;
  const speedKph = speedMps * 3.6;

  const lat1Rad = p1.lat * Math.PI / 180, lon1Rad = p1.lon * Math.PI / 180;
  const lat2Rad = p2.lat * Math.PI / 180, lon2Rad = p2.lon * Math.PI / 180;
  const y = Math.sin(lon2Rad - lon1Rad) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lon2Rad - lon1Rad);
  const theta = Math.atan2(y, x);
  const heading = (theta * 180 / Math.PI + 360) % 360;

  return { speedKph, heading };
}

/**
 * Calculates the distance traveled and rank for every racer at a specific moment in time.
 * @param allPaths An array of all track paths in the event.
 * @param targetTime The absolute time to calculate the placings for.
 * @returns A sorted array of RacerProgress objects, from 1st place to last.
 */
export function calculateRacePlacing(allPaths: TrackPath[], targetTime: Date): RacerProgress[] {
  const racerProgressData = allPaths
    .filter(p => p.totalDistance > 0) // Filter out paths with no distance to avoid division by zero
    .map(path => {
      const points = path.points;
      const targetTimestamp = targetTime.getTime();

      const lastPoint = points[points.length - 1];
      const finishTimestamp = lastPoint ? new Date(lastPoint.timestamp).getTime() : Infinity;
      const hasFinished = targetTimestamp >= finishTimestamp;

      if (hasFinished) {
        // Finished racers get a ranking score of their finish time.
        // This ensures they are sorted before unfinished racers (who will have large positive scores).
        return { racerId: path.racerId, distanceMeters: path.totalDistance, rankingScore: finishTimestamp, finishTime: finishTimestamp };
      }

      let totalDistanceMeters = 0;
      let lastFullPointIndex = -1;
      for (let i = 0; i < points.length; i++) {
          if (new Date(points[i].timestamp).getTime() <= targetTimestamp) {
              lastFullPointIndex = i;
          } else {
              break;
          }
      }

      // Sum distance between all full points
      for (let i = 0; i < lastFullPointIndex; i++) {
          totalDistanceMeters += haversineDistance(points[i], points[i+1]);
      }
      
      // Add distance for the final interpolated segment
      if (lastFullPointIndex >= 0 && lastFullPointIndex < points.length - 1) {
          const lastFullPoint = points[lastFullPointIndex];
          const interpolatedPosition = getPositionAtTime(path, targetTime, lastFullPointIndex);
          
          if (interpolatedPosition) {
              totalDistanceMeters += haversineDistance(lastFullPoint, interpolatedPosition);

              // PT = Percentage of track completed
              //const percentageCompleted = (totalDistanceMeters / path.totalDistance) * 100;
              // DRR = Distance remaining in the racer's track
              const distanceRemaining = path.totalDistance - totalDistanceMeters;
              // DRC = Distance completed in the racer's track
              //const distanceCompleted = totalDistanceMeters;

              // RR = ((PT * DRR) + ((100-PT) * DRC)) / 2
              //const rankingScore = (percentageCompleted * distanceRemaining) + ((100 - percentageCompleted) * distanceCompleted);
              //console.log(`Racer ${path.racerId}: PT=${percentageCompleted.toFixed(2)}%, DRR=${distanceRemaining.toFixed(2)}m, DRC=${distanceCompleted.toFixed(2)}m, RS=${rankingScore.toFixed(2)}`);
              const rankingScore = distanceRemaining;

              return { racerId: path.racerId, distanceMeters: totalDistanceMeters, rankingScore, finishTime: undefined };
          }
      }
      
      // Fallback for racers who haven't started or have no valid position yet.
      // Give them a very high ranking score to place them at the end.
      return { racerId: path.racerId, distanceMeters: 0, rankingScore: Infinity, finishTime: undefined };
    });

  // Sort racers. Finished racers come first, sorted by their finish time.
  // Unfinished racers come after, sorted by distance remaining.
  const sortedProgress = racerProgressData.sort((a, b) => {
    const aFinished = a.finishTime !== undefined;
    const bFinished = b.finishTime !== undefined;

    if (aFinished && bFinished) {
      return a.rankingScore - b.rankingScore; // Earlier finish time is better
    }
    if (aFinished) return -1; // a is finished, b is not
    if (bFinished) return 1;  // b is finished, a is not
    return a.rankingScore - b.rankingScore; // Neither is finished, sort by the new ranking score
  });

  return sortedProgress.map((progress, index) => ({
    ...progress,
    rank: index + 1,
  }));
}

/**
 * Converts a heading in degrees to a cardinal direction string.
 * @param heading The heading in degrees (0-360).
 * @returns A cardinal direction string (e.g., "N", "NE", "E", "SE", "S", "SW", "W", "NW").
 */
export function getCardinalDirection(heading: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}