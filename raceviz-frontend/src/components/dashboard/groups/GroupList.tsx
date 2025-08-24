import React, { useState } from 'react';

// Import shared types
import type { Group } from '../../../types/index.ts';

// Import child components
import { GroupListItem } from './GroupListItem.tsx';
import { CreateGroupModal } from './CreateGroupModal.tsx';

// Import the component's specific stylesheet
import './GroupList.css';

interface GroupListProps {
  /**
   * The initial list of groups passed down from the parent component.
   * This component will then manage its own state internally.
   */
  initialGroups: Group[];
}

/**
 * A component that displays a list of the user's groups and provides
 * functionality to create new ones.
 */
export const GroupList: React.FC<GroupListProps> = ({ initialGroups }) => {
  // The component manages its own list of groups in state. This allows us to
  // add a newly created group to the UI without needing a full page refresh.
  const [groups, setGroups] = useState<Group[]>(initialGroups);

  // State to control the visibility of the "Create Group" modal.
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * This callback function is passed to the CreateGroupModal. When a group is
   * successfully created inside the modal, it calls this function with the
   * new group data returned from the API.
   */
  const handleGroupCreated = (newGroup: Group) => {
    // Add the new group to the top of the list for immediate user feedback.
    // This is an "optimistic update" as we assume the API call was successful.
    setGroups(prevGroups => [newGroup, ...prevGroups]);
    setIsModalOpen(false); // Close the modal upon success
  };

  return (
    <div className="group-list-container">
      <div className="group-list-header">
        <h2>My Groups</h2>
        {/* This button toggles the state to open the creation modal. */}
        <button className="create-group-btn" onClick={() => setIsModalOpen(true)}>
          + Create Group
        </button>
      </div>

      {/* Conditionally render the list or a message if the user has no groups. */}
      {groups.length > 0 ? (
        <ul className="group-list">
          {groups.map((group) => (
            <GroupListItem key={group.id} group={group} />
          ))}
        </ul>
      ) : (
        <p className="no-groups-message">
          You are not a member of any groups yet. Why not create one?
        </p>
      )}
      
      {/* Render the modal. It will only be visible when `isModalOpen` is true. */}
      <CreateGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGroupCreated={handleGroupCreated}
      />
    </div>
  );
};