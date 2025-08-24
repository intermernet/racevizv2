import React from 'react';
import { Link } from 'react-router-dom';
import type { RaceEvent } from '../../types';
import './EventListItem.css';

interface EventListItemProps {
  event: RaceEvent;
  onDelete: (eventId: number) => void;
  /** The ID of the currently logged-in user. */
  currentUserId: number; 
}

export const EventListItem: React.FC<EventListItemProps> = ({ event, onDelete, currentUserId }) => {
  // A simple date formatter
  const formattedDate = new Date(event.startDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleDelete = () => {
    // The confirmation dialog provides a layer of safety for the user.
    if (window.confirm(`Are you sure you want to delete the event "${event.name}"? This action cannot be undone.`)) {
      onDelete(event.id);
    }
  };

  // --- IMPLEMENTED OWNERSHIP CHECK ---
  // The "Delete" button will only be rendered if the logged-in user's ID
  // matches the ID of the user who created the event.
  const canDelete = currentUserId === event.creatorUserId;

  return (
    <div className="event-card">
      <div className="event-card-header">
        <h3>{event.name}</h3>
        <span className={`event-type-badge ${event.eventType}`}>{event.eventType.replace('_', ' ')}</span>
      </div>
      <p className="event-date">{formattedDate}</p>
      <div className="event-card-actions">
        <Link to={`/events/${event.groupId}/${event.id}/view`} className="action-btn view-map">View Map</Link>
        
        <Link to={`/groups/${event.groupId}/events/${event.id}/manage`} className="action-btn manage">
          Manage
        </Link>
        {/* The button is now conditionally rendered based on the canDelete check */}
        {canDelete && (
          <button className="action-btn delete" onClick={handleDelete}>Delete</button>
        )}
      </div>
    </div>
  );
};