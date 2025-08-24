import React, { useState } from 'react';

// Import shared types and services
import type { RaceEvent } from '../../types/index.ts';
import { authenticatedFetch } from '../../services/api.ts';

// We reuse the existing modal styles for a consistent look and feel.
import './CreateEventModal.css';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Callback to notify the parent component that a new event has been created
  onEventCreated: (newEvent: RaceEvent) => void;
  groupId: number;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ isOpen, onClose, onEventCreated, groupId }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  // Default to 'race' so the date field is visible initially
  const [eventType, setEventType] = useState<'race' | 'time_trial'>('race');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /**
   * Handles the form submission to create a new event.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // --- Conditional Validation ---
    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }
    if (eventType === 'race' && !startDate) {
        setError('Start date is required for a race event.');
        return;
    }
    
    setError(null);
    setIsLoading(true);

    try {
      // --- Conditional Payload Construction ---
      // The base payload for all event types.
      const payload: { name: string; eventType: string; startDate?: string } = {
        name: name.trim(),
        eventType,
      };

      // Only add the startDate to the payload if the event is a "Race".
      if (eventType === 'race') {
        payload.startDate = new Date(startDate).toISOString();
      }

      const response: { event: RaceEvent } = await authenticatedFetch(`/groups/${groupId}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Call the parent's callback function with the new event data.
      onEventCreated(response.event);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resets the form state and calls the parent's onClose handler.
   */
  const handleClose = () => {
    setName('');
    setStartDate('');
    setEventType('race');
    setError(null);
    onClose();
  };

  // If the modal is not open, render nothing to the DOM.
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
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
              placeholder="e.g., Annual Club Championship"
              required
              autoFocus
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
          
          {/* This entire form group for the date is now rendered conditionally,
              only appearing when the eventType is "race". */}
          {eventType === 'race' && (
            <div className="form-group date-input-group">
              <label htmlFor="startDate">Start Date & Time</label>
              <input
                id="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                // The `required` attribute is also conditional.
                required={eventType === 'race'}
              />
            </div>
          )}
          
          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};