import React from 'react';
import './GoogleLoginButton.css';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const GoogleLoginButton: React.FC = () => {
  const handleLogin = () => {
    // Redirect the user to the backend's login endpoint.
    // The backend handles the redirect to Google's consent page.
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  };

  return (
    <button className="google-login-btn" onClick={handleLogin}>
      {/* Ensure you have a google-icon.svg in your /public directory */}
      <img src="/google-icon.svg" alt="Google icon" />
      <span>Sign in with Google</span>
    </button>
  );
};