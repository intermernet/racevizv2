import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { publicFetch } from '../services/api.ts';
import { EventMap } from '../components/map/EventMap.tsx';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.tsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.tsx';
// Import the shared types, including our newly moved PublicEventData
import type { PublicEventData } from '../types/index.ts';
import './EventMapPage.css';

// The local interface definition is now REMOVED from this file.

export const EventMapPage: React.FC = () => {
  const { groupId, eventId } = useParams<{ groupId: string; eventId: string }>();

  const [eventData, setEventData] = useState<PublicEventData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !eventId) {
      setError("Group and Event IDs are missing from the URL.");
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        // The fetch call is now strongly typed with the imported interface
        const data: PublicEventData = await publicFetch(`/events/${groupId}/${eventId}/public`);
        
        if (!data || !data.event || !data.paths) {
            throw new Error("Received invalid data from the server.");
        }

        setEventData(data);
      } catch (err: any) {
        setError(err.message || 'Could not load event data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [groupId, eventId]);

  const renderContent = () => {
    if (isLoading) {
      return <LoadingSpinner />;
    }
    if (error) {
      return <ErrorMessage message={error} />;
    }
    if (eventData) {
      return <EventMap eventData={eventData} />;
    }
    return <ErrorMessage message="Event data could not be loaded." />;
  };

  return (
    <div className="map-page-container">
      <header className="map-page-header">
        <Link to={`/groups/${groupId}`}>&larr; Back to Group</Link>
        <h1>{eventData?.event.name || 'Race Replay'}</h1>
        <div className="header-placeholder"></div>
      </header>
      <main className="map-content">
        {renderContent()}
      </main>
    </div>
  );
};