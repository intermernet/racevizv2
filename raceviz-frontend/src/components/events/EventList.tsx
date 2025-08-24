import React, { useState } from 'react';
import type { RaceEvent } from '../../types';
import { EventListItem } from './EventListItem.tsx';
import { CreateEventModal } from './CreateEventModal.tsx';
import { authenticatedFetch } from '../../services/api';
import './EventList.css';

interface EventListProps {
  initialEvents: RaceEvent[];
  groupId: number;
  /** The current user's ID needs to be passed in from a higher-level component. */
  currentUserId: number;
}

export const EventList: React.FC<EventListProps> = ({ initialEvents, groupId, currentUserId }) => {
  const [events, setEvents] = useState<RaceEvent[]>(initialEvents);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const handleEventCreated = (newEvent: RaceEvent) => {
    setEvents([newEvent, ...events]);
    setIsModalOpen(false);
  };

  const handleEventDeleted = async (eventIdToDelete: number) => {
    setEvents(events.filter(event => event.id !== eventIdToDelete));
    try {
      await authenticatedFetch(`/groups/${groupId}/events/${eventIdToDelete}`, {
        method: 'DELETE',
      });
    } catch (error: any) {
      alert(`Failed to delete event: ${error.message}`);
      setEvents(initialEvents);
    }
  };

  return (
    <div className="event-list-container">
      <div className="event-list-header">
        <h2>Events</h2>
        <button className="create-event-btn" onClick={() => setIsModalOpen(true)}>
          + Create Event
        </button>
      </div>

      {events.length > 0 ? (
        <div className="events-grid">
          {events.map((event) => (
            <EventListItem 
              key={event.id} 
              event={event} 
              onDelete={handleEventDeleted}
              // --- PROP IS PASSED DOWN HERE ---
              currentUserId={currentUserId} 
            />
          ))}
        </div>
      ) : (
        <p className="no-events-message">This group has no events yet. Create the first one!</p>
      )}

      <CreateEventModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onEventCreated={handleEventCreated}
        groupId={groupId}
      />
    </div>
  );
};