import React from 'react';
import { Link } from 'react-router-dom';
import { InvitationDropdown } from '../dashboard/invitations/InvitationDropdown.tsx';
import { UserProfileDropdown } from './UserProfileDropdown.tsx';
import './Header.css';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <Link to="/" className="header-logo">
        RaceViz
      </Link>
      <div className="header-actions">
        <InvitationDropdown />
        <UserProfileDropdown />
      </div>
    </header>
  );
};