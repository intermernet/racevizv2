import React from 'react';
import { AuthForm } from '../components/auth/AuthForm.tsx';
import './HomePage.css';

/**
 * HomePage is now the public-facing landing page. It only contains
 * the welcome message and the authentication form. Authenticated users
 * are now handled by the routing logic in App.tsx.
 */
export const HomePage: React.FC = () => {
  return (
    <div className="homepage-container">
      <div className="auth-view-container">
        <header className="auth-header">
          <h1>Welcome to RaceViz</h1>
          <p>Visualize your race data like never before.</p>
        </header>
        <AuthForm />
      </div>
    </div>
  );
};