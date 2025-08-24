// src/pages/ManageRacersPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { RaceEvent, Racer } from '../types/index.ts';
import { authenticatedFetch } from '../services/api.ts';
import { useAuth } from '../hooks/useAuth.tsx';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.tsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.tsx';
import { RacerList } from '../components/racers/RacerList.tsx';
import './ManageRacersPage.css';

export const ManageRacersPage: React.FC = () => {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();
  const { user } = useAuth();

  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [racers, setRacers] = useState<Racer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!groupId || !eventId) return;
    try {
      setIsLoading(true);
      const [eventData, racersData] = await Promise.all([
        authenticatedFetch(`/groups/${groupId}/events/${eventId}`), // Assumes this endpoint exists
        authenticatedFetch(`/groups/${groupId}/events/${eventId}/racers`),
      ]);
      setEvent(eventData.event);
      setRacers(racersData.racers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading || !user) {
    return <LoadingSpinner />;
  }
  if (error) {
    return <ErrorMessage message={error} />;
  }
  if (!event) {
    return <ErrorMessage message="Event not found." />;
  }

  return (
    <div className="manage-racers-container">
      <Link to={`/groups/${groupId}`} className="back-link">&larr; Back to Group</Link>
      <header className="manage-racers-header">
        <h1>Manage Racers</h1>
        <h2>{event.name}</h2>
      </header>
      <RacerList
        initialRacers={racers}
        event={event}
        currentUser={user}
        onRacerChange={fetchData} // Pass fetchData to allow child components to trigger a refresh
      />
    </div>
  );
};