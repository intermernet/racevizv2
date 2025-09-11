import React, { useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { authenticatedFetch } from '../services/api';
import { UserAvatar } from '../components/ui/UserAvatar';
import './SettingsForm.css';

export const SettingsForm: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [username, setUsername] = useState(user?.username || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      await authenticatedFetch('/users/me/avatar', {
        method: 'PUT',
        body: formData,
      });
      addToast('Avatar updated successfully!', 'success');
      refreshUser();
    } catch (error: any) {
      addToast(`Avatar upload failed: ${error.message}`, 'error');
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const changes: any = {};
    if (username && username !== user.username) {
      changes.username = username;
    }
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        addToast('New passwords do not match.', 'error');
        setIsSubmitting(false);
        return;
      }
      changes.oldPassword = oldPassword;
      changes.newPassword = newPassword;
    }

    if (Object.keys(changes).length === 0) {
      addToast('No changes to save.', 'info');
      setIsSubmitting(false);
      return;
    }

    try {
      await authenticatedFetch('/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      addToast('Profile updated successfully!', 'success');
      refreshUser();
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      addToast(`Update failed: ${error.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!window.confirm('Are you sure you want to delete your profile? This action cannot be undone.')) {
      return;
    }

    try {
      await authenticatedFetch('/users/me', {
        method: 'DELETE',
      });
      addToast('Your profile has been deleted.', 'success');
      logout(); // This will redirect to the homepage
    } catch (error: any) {
      addToast(`Deletion failed: ${error.message}`, 'error');
    }
  };

  const hasPassword = user.email.includes('@'); // Simple check if it's not an OAuth user

  return (
    <div className="settings-form-container">
      <section className="settings-section">
        <h3>Profile Picture</h3>
        <div className="avatar-section">
          <UserAvatar avatarUrl={user.avatarUrl} name={user.username} className="settings-avatar" />
          <input
            type="file"
            ref={avatarInputRef}
            onChange={handleAvatarUpload}
            style={{ display: 'none' }}
            accept="image/png, image/jpeg"
          />
          <button onClick={() => avatarInputRef.current?.click()} className="button">
            Change Avatar
          </button>
        </div>
      </section>

      <form onSubmit={handleProfileUpdate}>
        <section className="settings-section">
          <h3>Public Profile</h3>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your public display name"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={user.email} disabled />
            <small>Your email address cannot be changed.</small>
          </div>
        </section>

        {hasPassword && (
          <section className="settings-section">
            <h3>Change Password</h3>
            <div className="form-group">
              <label htmlFor="old-password">Old Password</label>
              <input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Confirm New Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </section>
        )}

        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      <section className="settings-section danger-zone">
        <h3>Danger Zone</h3>
        <div className="danger-action">
          <div>
            <h4>Delete this account</h4>
            <p>Once you delete your account, there is no going back. Please be certain.</p>
          </div>
          <button onClick={handleDeleteProfile} className="button-danger">
            Delete Your Account
          </button>
        </div>
      </section>
    </div>
  );
};
