import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.tsx';

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      localStorage.setItem('authToken', token);
      window.location.href = '/';

    } else {
      console.error("OAuth callback is missing the token.");
      window.location.href = '/';
    }
  }, [searchParams]); 

  return <LoadingSpinner />;
};