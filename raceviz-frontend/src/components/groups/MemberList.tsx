import React from 'react';
import type { Group, UserProfile } from '../../types';
import { MemberListItem } from './MemberListItem.tsx';
import { authenticatedFetch } from '../../services/api';
import './MemberList.css';

interface MemberListProps {
  members: UserProfile[];
  group: Group;
  currentUser: UserProfile;
  onMemberRemoved: () => void;
}

export const MemberList: React.FC<MemberListProps> = ({ members, group, currentUser, onMemberRemoved }) => {
  const handleRemoveMember = async (memberIdToRemove: number) => {
    if (!window.confirm('Are you sure you want to remove this member from the group?')) {
      return;
    }
    
    try {
      await authenticatedFetch(`/groups/${group.id}/members/${memberIdToRemove}`, {
        method: 'DELETE',
      });
      // On success, call the callback to trigger a data refresh in the parent component.
      onMemberRemoved();
    } catch (error: any) {
      alert(`Failed to remove member: ${error.message}`);
    }
  };

  return (
    <div className="member-list-card">
      {members.length > 0 ? (
        <ul className="member-list">
          {members.map((member) => (
            <MemberListItem
              key={member.id}
              member={member}
              isCreator={member.id === group.creatorUserId}
              canBeRemoved={currentUser.id === group.creatorUserId && member.id !== currentUser.id}
              onRemove={() => handleRemoveMember(member.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="no-members-message">This group has no members yet.</p>
      )}
    </div>
  );
};