import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsForm } from './SettingsForm';
import './SettingsPage.css';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="settings-page-container">
      <div className="settings-content">
        <header className="settings-header">
          <h1>Account Settings</h1>
          <p>Manage your profile, password, and other account settings.</p>
        </header>
        <SettingsForm />
      </div>
      <div className="settings-sidebar">
        <nav>
          <ul>
            <li>
              <button onClick={() => navigate(-1)} className="back-link">
                Close
              </button>
            </li>
            {/* Add other settings navigation links here if needed in the future */}
          </ul>
        </nav>
      </div>
    </div>
  );
};