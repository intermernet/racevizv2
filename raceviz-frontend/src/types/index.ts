/**
 * src/types/index.ts
 *
 * This file serves as the single source of truth for all shared TypeScript
 * types and interfaces used across the RaceViz frontend application.
 */

// =============================================================================
// USER & AUTHENTICATION TYPES
// =============================================================================

/**
 * Represents a User's complete profile data, typically received after
 * authenticating or fetching the '/users/me' endpoint.
 */
export interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatarUrl: string;
  createdAt: string; // ISO 8601 format date string
}

// =============================================================================
// GROUP & MEMBERSHIP TYPES
// =============================================================================

/**
 * Represents a Group, which acts as a container for members and events.
 */
export interface Group {
  id: number;
  name: string;
  creatorUserId: number;
  createdAt: string; // ISO 8601 format date string
}

/**
 * Represents a pending invitation for a user to join a group.
 * This is used for the real-time notifications dropdown.
 */
export interface Invitation {
  id: number;
  groupId: number;
  groupName: string; // This would be joined on the backend for the API response
  inviterName: string; // This would also be joined on the backend
  inviteeEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string; // ISO 8601 format date string
}

// =============================================================================
// EVENT & RACE DATA TYPES
// =============================================================================

/**
 * Represents a RaceViz Event within a group.
 */
export interface RaceEvent {
  id: number;
  groupId: number;
  name: string;
  startDate: string | null; // ISO 8601 format date string
  endDate: string | null;  // ISO 8601 format date string
  eventType: 'race' | 'time_trial';
  creatorUserId: number;
}

export interface Racer {
  id: number;
  eventId: number;
  uploaderUserId: number;
  racerName: string;
  trackColor: string;
  trackAvatarUrl: string | null;
  gpxFilePath: string | null;
}

/**
 * Represents a single, time-stamped point from a GPX track.
 * This is the fundamental unit of data for map animation.
 */
export interface TrackPoint {
  lat: number;
  lon: number;
  timestamp: string; // ISO 8601 format date string
}

/**
 * Represents the complete, processed track for a single racer in an event,
 * ready to be consumed by the map components.
 */
export interface TrackPath {
  racerId: number;
  points: TrackPoint[];
  trackColor: string;
  totalDistance: number; // Total distance of the track in meters
}

/**
 * Represents the calculated progress and rank of a single racer
 * at a specific moment in time.
 */
export interface RacerProgress {
  racerId: number;
  distanceMeters: number;
  rank: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Defines the shape of the data received from the public-facing
 * map data endpoint (`/events/{groupId}/{eventId}/public`).
 */
export interface PublicEventData {
  event: RaceEvent;
  users: UserProfile[]; // Contains profiles of racers for avatar mapping
  racers: Racer[];
  paths: TrackPath[];
}

/**
 * Represents the live, calculated data for a single racer in the leaderboard.
 */
export interface LeaderboardItem {
  id: number;
  rank: number;
  name: string;
  avatarUrl: string | null;
  trackColor: string;
  speedKph: number;
}