import React, { useState } from 'react';
import { authenticatedFetch } from '../../services/api';

// Uses the same modal CSS as the CreateEventModal for consistency
import '../events/CreateEventModal.css';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteSent: () => void;
  groupId: number;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ isOpen, onClose, onInviteSent, groupId }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email) {
      setError('Email address is required.');
      return;
    }
    
    setIsLoading(true);

    try {
      await authenticatedFetch(`/groups/${groupId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      setSuccessMessage(`Invitation successfully sent to ${email}.`);
      setEmail(''); // Clear form on success
      onInviteSent();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  // A helper to close the modal and reset its state
  const handleClose = () => {
    setEmail('');
    setError(null);
    setSuccessMessage(null);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Invite New Member</h2>
        <p>Enter the email address of the person you'd like to invite.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
          
          {error && <p className="form-error">{error}</p>}
          {successMessage && <p className="form-success">{successMessage}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={handleClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

