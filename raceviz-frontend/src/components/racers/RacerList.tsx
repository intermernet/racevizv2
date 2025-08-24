import React, { useState } from 'react';
import type { RaceEvent, Racer, UserProfile } from '../../types/index.ts';
import { authenticatedFetch } from '../../services/api.ts';
import { useToast } from '../../hooks/useToast.tsx';
import { RacerListItem } from './RacerListItem.tsx';
import './RacerList.css';

interface RacerListProps {
  initialRacers: Racer[];
  event: RaceEvent;
  currentUser: UserProfile;
  onRacerChange: () => void;
}

export const RacerList: React.FC<RacerListProps> = ({ initialRacers, event, currentUser, onRacerChange }) => {
  
  const [newRacerName, setNewRacerName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { addToast } = useToast();

  const handleAddRacer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRacerName.trim()) return;
    setIsAdding(true);
    try {
      await authenticatedFetch(`/groups/${event.groupId}/events/${event.id}/racers`, {
        method: 'POST',
        body: JSON.stringify({ racerName: newRacerName }),
      });
      addToast('Racer added successfully!', 'success');
      setNewRacerName('');
      // Tell the parent component to refresh its data
      onRacerChange();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="racer-list-wrapper">
      <form onSubmit={handleAddRacer} className="add-racer-form">
        <input
          type="text"
          value={newRacerName}
          onChange={(e) => setNewRacerName(e.target.value)}
          placeholder="Add a new racer name..."
          disabled={isAdding}
        />
        <button type="submit" disabled={isAdding}>
          {isAdding ? 'Adding...' : '+ Add Racer'}
        </button>
      </form>

      <div className="racer-list">
        {/* We now map over the `initialRacers` prop directly. */}
        {initialRacers.length > 0 ? (
          initialRacers.map(racer => (
            <RacerListItem 
              key={racer.id}
              racer={racer}
              event={event}
              currentUser={currentUser}
              onRacerChange={onRacerChange}
            />
          ))
        ) : (
          <p className="no-racers-message">No racers have been added to this event yet.</p>
        )}
      </div>
    </div>
  );
};