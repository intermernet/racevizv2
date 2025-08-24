import React from 'react';
import { Link } from 'react-router-dom'; // 1. Import the Link component
import type { Group } from '../../../types';
import './GroupListItem.css';

interface GroupListItemProps {
  group: Group;
}

export const GroupListItem: React.FC<GroupListItemProps> = ({ group }) => {
  // 2. The onClick handler is no longer needed.

  return (
    // The <li> remains for semantic list structure.
    <li className="group-list-item">
      {/* 3. Wrap the content in a Link component. */}
      {/* The `to` prop specifies the destination URL. */}
      <Link to={`/groups/${group.id}`} className="group-link">
        <div className="group-info">
          <h3>{group.name}</h3>
          {/* You could add more info here, like number of members or recent events */}
        </div>
        <span className="group-arrow">&rarr;</span>
      </Link>
    </li>
  );
};