import React, { useState } from 'react';
import type { RaceEvent } from '../../types';
import { authenticatedFetch } from '../../services/api';
import './CreateEventModal.css';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (newEvent: RaceEvent) => void;
  groupId: number;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ isOpen, onClose, onEventCreated, groupId }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [eventType, setEventType] = useState<'race' | 'time_trial'>('race');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate) {
      setError('Event name and start date are required.');
      return;
    }
    
    setError(null);
    setIsLoading(true);

    try {
      const payload = {
        name,
        startDate: new Date(startDate).toISOString(),
        eventType,
      };

      const newEvent = await authenticatedFetch(`/groups/${groupId}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onEventCreated(newEvent.event);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Event Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="startDate">Start Date & Time</label>
            <input
              id="startDate"
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="eventType">Event Type</label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as 'race' | 'time_trial')}
            >
              <option value="race">Race</option>
              <option value="time_trial">Time Trial</option>
            </select>
          </div>
          
          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};