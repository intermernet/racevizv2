import React, { useRef, useState } from 'react';

// Import shared types
import type { RaceEvent, Racer, UserProfile } from '../../types/index.ts';

// Import services and hooks
import { authenticatedFetch, updateRacerColor } from '../../services/api.ts';
import { useToast } from '../../hooks/useToast.tsx';
import { UserAvatar } from '../ui/UserAvatar.tsx';

// Import component-specific styles
import './RacerListItem.css';

interface RacerListItemProps {
  racer: Racer;
  event: RaceEvent;
  currentUser: UserProfile;
  onRacerChange: () => void;
}

export const RacerListItem: React.FC<RacerListItemProps> = ({ racer, event, currentUser, onRacerChange }) => {
  // A ref to programmatically click the hidden file input element.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(racer.trackAvatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const { addToast } = useToast();

  // --- Permissions Logic ---
  // The user can delete a racer if they are the event creator OR the person who added the racer.
  const canDelete = currentUser.id === event.creatorUserId || currentUser.id === racer.uploaderUserId;
  // The user can upload a GPX file if they are the event creator OR the person who added the racer.
  const canUpload = currentUser.id === event.creatorUserId || currentUser.id === racer.uploaderUserId;

  // --- Event Handlers ---

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete racer "${racer.racerName}"? This will also delete their GPX file.`)) {
      return;
    }
    try {
      await authenticatedFetch(`/groups/${event.groupId}/events/${event.id}/racers/${racer.id}`, {
        method: 'DELETE',
      });
      addToast('Racer deleted.', 'success');
      onRacerChange(); // Trigger a data refresh in the parent component.
    } catch (error: any) {
      addToast(error.message, 'error');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('gpxFile', file);

    try {
      await authenticatedFetch(`/groups/${event.groupId}/events/${event.id}/racers/${racer.id}/gpx`, {
        method: 'POST',
        body: formData,
      });
      addToast('GPX file uploaded successfully!', 'success');
      onRacerChange(); // Refresh data to show the new file status.
    } catch (error: any) {
      addToast(`Upload failed: ${error.message}`, 'error');
    }
  };

  const handleColorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    try {
      // In a real-world app with many users, you might want to debounce this call
      // to avoid sending too many API requests if the user drags the color picker around.
      await updateRacerColor(event.groupId, event.id, racer.id, newColor);
      onRacerChange(); // Refresh data to confirm the color change.
    } catch (error: any) {
      addToast(`Failed to update color: ${error.message}`, 'error');
    }
  };

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);
    setIsUploading(true);

    try {
      const response = await authenticatedFetch<{ avatarUrl: string }>(`/groups/${event.groupId}/events/${event.id}/racers/${racer.id}/avatar`, {
        method: 'PUT',
        body: formData,
      });
      addToast("Racer avatar updated!", 'success');
      // Optimistically update the UI with the new URL from the response
      setCurrentAvatarUrl(response.avatarUrl);
      onRacerChange(); // Trigger a refresh in the parent component
    } catch (error: any) {
      addToast(`Failed to update avatar: ${error.message}`, 'error');
    }
    finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="racer-list-item">
      <div className="racer-identity">
        <div className="racer-avatar-wrapper" onClick={handleAvatarClick} title="Change Racer Avatar">
          <UserAvatar
            avatarUrl={currentAvatarUrl}
            name={racer.racerName}
            className="racer-avatar"
          />
          <div className="edit-avatar-overlay">
            {isUploading 
              ? <div className="spinner"></div> 
              : '✏️'}
          </div>
        </div>
        <input
          type="file"
          ref={avatarInputRef}
          onChange={handleAvatarFileChange}
          style={{ display: 'none' }}
          accept="image/png, image/jpeg, image/gif"
        />
        <input
          type="color"
          className="racer-color-picker"
          value={racer.trackColor}
          onChange={handleColorChange}
          title="Change track color"
        />
        <span className="racer-name">{racer.racerName}</span>
      </div>
      <div className="racer-status-actions">
        {racer.gpxFilePath ? (
          <span className="gpx-status uploaded">GPX Uploaded</span>
        ) : (
          <span className="gpx-status missing">No GPX</span>
        )}
        <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept=".gpx" />
        {canUpload && <button onClick={handleUploadClick}>Upload</button>}
        {canDelete && <button onClick={handleDelete} className="delete">Delete</button>}
      </div>
    </div>
  );
};
