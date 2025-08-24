import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Group, RaceEvent, UserProfile } from '../types/index.ts';
import { authenticatedFetch } from '../services/api.ts';
import { EventList } from '../components/events/EventList.tsx';
import { GroupDetails } from '../components/groups/GroupDetails.tsx';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.tsx';
import { ErrorMessage } from '../components/ui/ErrorMessage.tsx';
import './GroupPage.css';

// Define the expected shapes of our API responses for clarity
interface GroupApiResponse {
  group: Group;
}
interface EventsApiResponse {
  events: RaceEvent[] | null; // Acknowledge that the API can return null
}
interface MembersApiResponse {
  members: UserProfile[] | null;
}
interface UserApiResponse {
  user: UserProfile;
}


export const GroupPage: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();

  const [group, setGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<RaceEvent[]>([]); // Initialize as an empty array
  const [members, setMembers] = useState<UserProfile[]>([]); // Initialize as an empty array
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!groupId) {
      setError("No group ID provided in the URL.");
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);

      const [groupData, eventsData, membersData, userData] = await Promise.all([
        authenticatedFetch<GroupApiResponse>(`/groups/${groupId}`),
        authenticatedFetch<EventsApiResponse>(`/groups/${groupId}/events`),
        authenticatedFetch<MembersApiResponse>(`/groups/${groupId}/members`),
        authenticatedFetch<UserApiResponse>('/users/me'),
      ]);

      setGroup(groupData.group);
      
      // --- THE FIX IS HERE ---
      // We now explicitly check if the API response is null. If it is, we
      // set our state to an empty array. This guarantees that `events` and
      // `members` are always arrays.
      setEvents(eventsData.events || []);
      setMembers(membersData.members || []);

      setCurrentUser(userData.user);

    } catch (err: any) {
      setError(err.message || 'Failed to load group data.');
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!group || !currentUser) {
    return <ErrorMessage message="Group not found or you do not have permission to view it." />;
  }

  return (
    <div className="group-page-container">
      <Link to="/" className="back-link">&larr; Back to Dashboard</Link>

      <header className="group-page-header">
        <h1>{group.name}</h1>
      </header>

      <div className="group-page-content">
        <div className="content-column events-column">
          <EventList 
            initialEvents={events} 
            groupId={group.id} 
            currentUserId={currentUser.id} 
          />
        </div>
        <div className="content-column members-column">
          <GroupDetails 
            group={group}
            members={members}
            currentUser={currentUser}
            onMemberUpdate={fetchData}
          />
        </div>
      </div>
    </div>
  );
};