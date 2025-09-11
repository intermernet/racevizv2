import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.tsx';
import { Link } from 'react-router-dom';
import './UserProfileDropdown.css';

export const UserProfileDropdown: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Effect to handle clicks outside of the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return null; // Don't render if the user is not logged in
  }

  return (
    <div className="user-profile-widget" ref={dropdownRef}>
      <button className="profile-button" onClick={() => setIsOpen(!isOpen)}>
        <img 
          src={user.avatarUrl} 
          alt="User avatar" 
          className="profile-avatar" 
        />
      </button>

      {isOpen && (
        <div className="profile-dropdown">
          <div className="dropdown-header">
            Signed in as <br />
            <strong>{user.username}</strong>
          </div>
          <ul>
            <li>
              <Link to="/settings" className="dropdown-link" onClick={() => setIsOpen(false)}>Account Settings</Link>
            </li>
            <li>
              <button className="logout-button" onClick={logout}>
                Log Out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};