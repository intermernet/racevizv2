import React from 'react';
import { Link } from 'react-router-dom';

// Import shared types
import type { RaceEvent } from '../../types/index.ts';

// Import component-specific styles
import './EventListItem.css';

interface EventListItemProps {
  event: RaceEvent;
  onDelete: (eventId: number) => void;
  currentUserId: number;
}

/**
 * Renders a single "card" for an event in the list.
 * It displays the event's details and provides action buttons to view the map,
 * manage racers, or delete the event (with proper permissions).
 */
export const EventListItem: React.FC<EventListItemProps> = ({ event, onDelete, currentUserId }) => {
  // We calculate the formattedDate, which will be a string for "Race" events
  // or null for "Time Trial" events.
  const formattedDate = event.startDate
    ? new Date(event.startDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  /**
   * Shows a confirmation dialog and calls the parent's onDelete handler.
   */
  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete the event "${event.name}"? This action cannot be undone.`)) {
      onDelete(event.id);
    }
  };

  // Determine if the current user has permission to delete this event.
  const canDelete = currentUserId === event.creatorUserId;

  return (
    <div className="event-card">
      <div className="event-card-header">
        <h3>{event.name}</h3>
        <span className={`event-type-badge ${event.eventType}`}>{event.eventType.replace('_', ' ')}</span>
      </div>

      {/*
        Conditionally render the date paragraph.
        If the event type is 'race', display the formatted date.
        If it's 'time_trial', render a placeholder paragraph. This placeholder is
        styled with `color: transparent` to be invisible but still occupy vertical
        space, ensuring all cards in the grid have a consistent height.
      */}
      {event.eventType === 'race' ? (
        <p className="event-date">{formattedDate}</p>
      ) : (
        <p className="event-date placeholder">&nbsp;</p>
      )}

      <div className="event-card-actions">
        {/* Use Link components for proper client-side navigation */}
        <Link to={`/events/${event.groupId}/${event.id}/view`} className="action-btn view-map">
          View Map
        </Link>
        <Link to={`/groups/${event.groupId}/events/${event.id}/manage`} className="action-btn manage">
          Manage
        </Link>
        {/* The Delete button is only rendered if the user has permission */}
        {canDelete && (
          <button className="action-btn delete" onClick={handleDelete}>Delete</button>
        )}
      </div>
    </div>
  );
};