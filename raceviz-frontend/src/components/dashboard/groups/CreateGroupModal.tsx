import React, { useState } from 'react';
import type { Group } from '../../../types/index.ts';
import { authenticatedFetch } from '../../../services/api.ts';
import { useToast } from '../../../hooks/useToast.tsx';
// We can reuse the existing modal styles for a consistent look and feel.
import '../../events/CreateEventModal.css';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Callback to notify the parent component that a new group has been created
  onGroupCreated: (newGroup: Group) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onGroupCreated }) => {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name cannot be empty.');
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const response: { group: Group } = await authenticatedFetch('/groups', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      addToast(`Group "${response.group.name}" created successfully!`, 'success');
      onGroupCreated(response.group); // Pass the new group data back to the parent
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset state when the modal is closed
  const handleClose = () => {
    setName('');
    setError(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Group</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="group-name">Group Name</label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sunday Cycling Club"
              required
              autoFocus
            />
          </div>
          
          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};