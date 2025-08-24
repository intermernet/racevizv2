import React, { useState } from 'react';
import { publicFetch } from '../../services/api.ts';
import { GoogleLoginButton } from './GoogleLoginButton.tsx';
import './AuthForm.css';

export const AuthForm: React.FC = () => {
  // State to toggle between 'login' and 'register' modes
  const [isLoginMode, setIsLoginMode] = useState(true);

  // Form input states
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // State for handling API call status
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleModeToggle = () => {
    setIsLoginMode(!isLoginMode);
    // Clear form fields and errors when switching modes
    setEmail('');
    setUsername('');
    setPassword('');
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (isLoginMode) {
        // Login Logic
        const data = await publicFetch('/users/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        localStorage.setItem('authToken', data.token);
        window.location.reload();
      } else {
        // Registration Logic
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters long.");
        }
        await publicFetch('/users/register', {
          method: 'POST',
          body: JSON.stringify({ email, username, password }),
        });
        setSuccessMessage('Registration successful! Please log in.');
        handleModeToggle(); // Switch to login mode after successful registration
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-form-card">
        <h2>{isLoginMode ? 'Login' : 'Create Account'}</h2>

        <GoogleLoginButton />
        <div className="auth-divider">
            <span>OR</span>
        </div>
        
        <form onSubmit={handleSubmit}>
          {!isLoginMode && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {successMessage && <p className="auth-success">{successMessage}</p>}

          <button type="submit" className="auth-submit-btn" disabled={isLoading}>
            {isLoading ? 'Loading...' : isLoginMode ? 'Login' : 'Create Account'}
          </button>
        </form>
        <div className="auth-toggle">
          <p>
            {isLoginMode ? "Don't have an account?" : 'Already have an account?'}
            <button onClick={handleModeToggle} disabled={isLoading}>
              {isLoginMode ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};