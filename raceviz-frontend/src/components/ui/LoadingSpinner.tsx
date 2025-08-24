import React from 'react';
import './LoadingSpinner.css';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="spinner-overlay">
      <div className="loading-spinner"></div>
    </div>
  );
};