import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { UserProfile } from '../types/index.ts';
import { authenticatedFetch } from '../services/api.ts';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.tsx';

/**
 * Defines the shape of the data and functions provided by the AuthContext.
 * This ensures type safety for any component that uses the `useAuth` hook.
 */
interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

/**
 * The actual React Context object. It's initialized as undefined and only
 * gets its value from the AuthProvider.
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The AuthProvider component is responsible for managing the user's authentication state.
 * It fetches the user's profile on initial load and provides the user data and
 * auth-related functions to its children via the AuthContext.
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  /**
   * A memoized function to fetch the current user's profile from the API.
   * It sets the user state on success or clears it on failure.
   */
  const fetchAndSetUser = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const data: { user: UserProfile } = await authenticatedFetch('/users/me');
      setUser(data.user);
    } catch (error) {
      console.error("Auth verification failed:", error);
      localStorage.removeItem('authToken');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Effect to run the user verification check when the component first mounts.
  useEffect(() => {
    fetchAndSetUser();
  }, [fetchAndSetUser]);

  /**
   * Handles the login process: saves the token, fetches user data, and navigates home.
   */
  const login = async (token: string) => {
    localStorage.setItem('authToken', token);
    setIsLoading(true);
    await fetchAndSetUser();
    navigate('/');
  };

  /**
   * Handles the logout process: removes the token and resets the user state.
   */
  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    // Full page reload on logout to ensure all state is cleared.
    window.location.href = '/';
  };

  /**
   * A function to allow other parts of the app to manually trigger a refresh
   * of the user's profile data (e.g., after updating their settings).
   */
  const refreshUser = async () => {
    await fetchAndSetUser();
  };

  // Show a loading spinner for the entire app while we're verifying the user's session.
  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * The `useAuth` hook is a simple custom hook that components can use to
 * easily access the authentication context.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
