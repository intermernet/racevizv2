import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
      <h1>404 - Page Not Found</h1>
      <p>Sorry, the page you are looking for does not exist.</p>
      <Link to="/" style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>
        Return to Home
      </Link>
    </div>
  );
};