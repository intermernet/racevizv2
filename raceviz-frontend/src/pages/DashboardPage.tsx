import React, { useState, useEffect, useCallback } from 'react';

// Import the child component that will display the list of groups
import { GroupList } from '../components/dashboard/groups/GroupList.tsx';

// Import the TypeScript type definition for a Group
import type { Group } from '../types/index.ts';

// Import the service for making authenticated API calls and the event bus for communication
import { authenticatedFetch } from '../services/api.ts';
import { appEventBus } from '../utils/eventBus.ts';

// Import the component's specific stylesheet
import './DashboardPage.css';

/**
 * DashboardPage is the main content area for a logged-in user.
 * Its primary responsibility is to fetch and display the list of groups
 * that the user is a member of.
 */
export const DashboardPage: React.FC = () => {
  // State for storing the list of groups fetched from the API
  const [groups, setGroups] = useState<Group[]>([]);
  // State to manage the loading UI while data is being fetched
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // State to store any errors that occur during data fetching
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches the user's groups from the backend.
   * This function is wrapped in `useCallback` to ensure it has a stable
   * reference, which is important for using it in `useEffect` and the event bus.
   */
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // The endpoint '/groups' is handled by `handleGetMyGroups` on the backend.
      const groupData: { groups: Group[] } = await authenticatedFetch('/groups');
      setGroups(groupData.groups || []); // Ensure groups is always an array, even if the API returns null
    } catch (err: any) {
      setError(err.message || 'Failed to fetch dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []); // An empty dependency array means this function is created only once.

  /**
   * This effect runs when the component mounts. It performs the initial data load
   * and sets up a listener on the application's event bus to handle live updates.
   */
  useEffect(() => {
    // Perform the initial data fetch.
    fetchData();

    // Subscribe to the 'refreshGroups' event. When another component (like the
    // InvitationDropdown) emits this event, the fetchData function will be called
    // again to get the latest list of groups.
    appEventBus.on('refreshGroups', fetchData);

    // Cleanup function: It's crucial to remove the listener when the
    // component unmounts to prevent memory leaks and unexpected behavior.
    return () => {
      appEventBus.off('refreshGroups', fetchData);
    };
  }, [fetchData]); // The effect depends on our memoized fetchData function.

  // --- Conditional Rendering ---

  if (isLoading) {
    return <div>Loading your dashboard...</div>;
  }

  if (error) {
    return <div className="error-message">Error: {error}</div>;
  }

  // --- Main Render ---

  return (
    <div className="dashboard-container">
      {/* The header has been moved to a higher-level component (`HomePage.tsx`)
          to be shared across all authenticated views. */}
      <section className="dashboard-content">
        <GroupList initialGroups={groups} />
      </section>
    </div>
  );
};