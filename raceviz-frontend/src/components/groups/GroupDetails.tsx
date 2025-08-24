import React, { useState } from 'react';
import type { Group, UserProfile } from '../../types';
import { MemberList } from './MemberList.tsx';
import { InviteMemberModal } from './InviteMemberModal.tsx';
import './GroupDetails.css';

interface GroupDetailsProps {
  group: Group;
  members: UserProfile[];
  currentUser: UserProfile;
  // This function will be passed down to trigger a data refresh in the parent (GroupPage)
  onMemberUpdate: () => void;
}

export const GroupDetails: React.FC<GroupDetailsProps> = ({ group, members, currentUser, onMemberUpdate }) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Determine if the current user is the creator of the group for permission checks.
  const isCreator = currentUser.id === group.creatorUserId;

  return (
    <div className="group-details-container">
      {/* The header section with the Invite button */}
      <div className="group-details-header">
        <h2>Members</h2>
        {isCreator && (
          <button className="invite-member-btn" onClick={() => setIsInviteModalOpen(true)}>
            + Invite Member
          </button>
        )}
      </div>

      {/* The list of members */}
      <MemberList
        members={members}
        group={group}
        currentUser={currentUser}
        onMemberRemoved={onMemberUpdate} // A member removal should trigger a refresh
      />

      {/* The modal for inviting, which is only rendered when needed */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        groupId={group.id}
        onInviteSent={() => {
          // No need to refresh for an invitation, as it doesn't change the member list immediately.
          // We could show a success toast here in a real app.
          setIsInviteModalOpen(false);
        }}
      />
    </div>
  );
};