import React from 'react';
import type { UserProfile } from '../../types';
import { UserAvatar } from '../ui/UserAvatar.tsx';
import './MemberListItem.css';

interface MemberListItemProps {
  member: UserProfile;
  isCreator: boolean;
  canBeRemoved: boolean; // Pre-calculated permission to show the remove button
  onRemove: () => void;
}

export const MemberListItem: React.FC<MemberListItemProps> = ({ member, isCreator, canBeRemoved, onRemove }) => {
  return (
    <li className="member-list-item">
      <div className="member-info">
        <UserAvatar
          avatarUrl={member.avatarUrl}
          name={member.username}
          className="member-avatar"
        />
        <span className="member-name">{member.username}</span>
        {isCreator && <span className="member-badge creator-badge">Creator</span>}
      </div>
      <div className="member-actions">
        {canBeRemoved && (
          <button className="remove-member-btn" onClick={onRemove}>Remove</button>
        )}
      </div>
    </li>
  );
};