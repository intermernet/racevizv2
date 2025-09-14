import React from 'react';
import { Link } from 'react-router-dom';
import type { RaceEvent } from '../../types';
import './EventListItem.css';

interface EventListItemProps {
  event: RaceEvent;
  currentUserId: number;
}

export const EventListItem: React.FC<EventListItemProps> = ({ event, currentUserId }) => {
  const canManage = event.creatorUserId === currentUserId;

  return (
    <li className="event-list-item">
      <div className="event-info">
        <span className={`event-type-badge event-type-${event.eventType}`}>
          {event.eventType === 'race' ? 'Race' : 'Time Trial'}
        </span>
        <h3 className="event-name">{event.name}</h3>
      </div>
      <div className="event-actions">
        <Link
          to={`/events/${event.groupId}/${event.id}/view`}
          className="button-view-map"
          aria-disabled={!event.hasGpxData}
          onClick={(e) => !event.hasGpxData && e.preventDefault()}
          title={!event.hasGpxData ? "No GPX data available to view map" : "View race map"}
        >
          View Map
        </Link>
        {canManage && (
          <Link to={`/groups/${event.groupId}/events/${event.id}/manage`} className="button-manage">
            Manage
          </Link>
        )}
      </div>
    </li>
  );
};