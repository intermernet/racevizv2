import React, { useState, useEffect } from 'react';

// Import services and hooks
import { authenticatedFetch } from '../../../services/api.ts';
import { useSSE } from '../../../hooks/useSSE.ts'; // Using the new SSE hook
import { useAuth } from '../../../hooks/useAuth.tsx';
import { useToast } from '../../../hooks/useToast.tsx';
import { appEventBus } from '../../../utils/eventBus.ts';

// Import shared types
import type { Invitation } from '../../../types/index.ts';

// Import CSS
import './InvitationDropdown.css';

// Get the API base URL from environment variables
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * A dropdown component that displays pending group invitations for the user.
 * It fetches an initial list via HTTP and then listens for live updates
 * using a Server-Sent Events (SSE) stream.
 */
export const InvitationDropdown: React.FC = () => {
  const { user } = useAuth(); // Get the current user to determine if we should connect
  const { addToast } = useToast();
  
  const [isOpen, setIsOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Constructs the full URL for the SSE connection, including the auth token.
   * Returns null if the user is not logged in.
   */
  const getSseUrl = (): string | null => {
      const token = localStorage.getItem('authToken');
      if (!token) return null;
      // The backend auth middleware is configured to read the token from this query parameter.
      return `${API_BASE_URL}/notifications/stream?token=${token}`;
  };

  // The useSSE hook will establish a connection if the URL is not null.
  const sseUrl = user ? getSseUrl() : null;
  const { lastMessage } = useSSE(sseUrl);

  /**
   * Effect to fetch the initial list of pending invitations via HTTP when the component mounts.
   */
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchInitialInvites = async () => {
      try {
        setIsLoading(true);
        const data: { invitations: Invitation[] } = await authenticatedFetch('/invitations');
        setInvitations(data.invitations || []);
      } catch (error) {
        console.error("Failed to fetch initial invitations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialInvites();
  }, [user]); // Re-runs if the user's authentication state changes.

  /**
   * Effect to handle incoming real-time messages from the SSE stream.
   */
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'new_invitation': {
          const newInvite = lastMessage.payload as Invitation;
          setInvitations(prev => {
            if (prev.some(inv => inv.id === newInvite.id)) return prev;
            return [newInvite, ...prev];
          });
          addToast(`You have a new invitation from ${newInvite.inviterName}!`, 'info');
          break;
        }
        case 'invitation_removed': {
          const { id } = lastMessage.payload as { id: number };
          setInvitations(prev => prev.filter(inv => inv.id !== id));
          break;
        }
      }
    }
  }, [lastMessage, addToast]); // Runs every time a new message arrives.

  /**
   * Handles both 'accept' and 'decline' actions for an invitation.
   */
  const handleAction = async (invitationId: number, action: 'accept' | 'decline') => {
    try {
      // Optimistic UI update for a snappy user experience.
      setInvitations(prev => prev.filter(inv => inv.id !== invitationId));

      await authenticatedFetch(`/invitations/${invitationId}/${action}`, {
        method: 'POST',
      });

      if (action === 'accept') {
        addToast('Invitation accepted! You have joined the group.', 'success');
        // Emit an event to tell the DashboardPage to refresh its group list.
        appEventBus.emit('refreshGroups');
      } else {
        addToast('Invitation declined.', 'info');
      }
    } catch (error: any) {
      addToast(`Failed to ${action} invitation: ${error.message}`, 'error');
      // In a real app, you might re-fetch the invitations here to revert the UI on failure.
    }
  };
  
  // If the user is not logged in, this component renders nothing.
  if (!user) {
    return null;
  }

  return (
    <div className="invitation-widget">
      <button onClick={() => setIsOpen(!isOpen)} className="notifications-btn">
        <span>💌</span>
        {invitations.length > 0 && (
          <span className="notification-badge">{invitations.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="invitation-dropdown">
          {isLoading ? (
            <p className="loading-invites">Loading...</p>
          ) : invitations.length > 0 ? (
            <ul>
              {invitations.map((invite) => (
                <li key={invite.id}>
                  <p>
                    <strong>{invite.inviterName}</strong> invited you to join{' '}
                    <strong>{invite.groupName}</strong>.
                  </p>
                  <div className="invitation-actions">
                    <button onClick={() => handleAction(invite.id, 'accept')} className="accept">Accept</button>
                    <button onClick={() => handleAction(invite.id, 'decline')} className="decline">Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-invites">No pending invitations.</p>
          )}
        </div>
      )}
    </div>
  );
};