import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.tsx';

// --- Layout Components ---
// Layouts act as wrappers for pages, providing shared UI like headers or sidebars.
import { MainLayout } from './layouts/MainLayout.tsx';

// --- Page Components ---
// Pages are the top-level components rendered by a specific route.
import { HomePage } from './pages/HomePage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { GroupPage } from './pages/GroupPage.tsx';
import { EventMapPage } from './pages/EventMapPage.tsx';
import { ManageRacersPage } from './pages/ManageRacersPage.tsx';
import { AuthCallbackPage } from './pages/AuthCallbackPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

/**
 * The root App component is responsible for defining the application's entire routing structure.
 * It uses the `useAuth` hook to determine if a user is logged in and renders different
 * sets of routes accordingly.
 */
function App(): React.ReactElement {
  const { user } = useAuth();

  return (
    <Routes>
      {/*
        This is a ternary operator that switches between two completely different
        sets of top-level routes based on the user's authentication state.
      */}
      {user ? (
        // --- AUTHENTICATED ROUTES ---
        // If the user is logged in, all primary navigation happens inside the MainLayout.
        // The `MainLayout` component renders the shared `Header`, and the nested <Route>
        // components are rendered in its `<Outlet />`.
        <Route path="/" element={<MainLayout />}>
          {/* The `index` route defaults to the Dashboard when the path is exactly "/". */}
          <Route index element={<DashboardPage />} />
          <Route path="groups/:groupId" element={<GroupPage />} />
          <Route path="groups/:groupId/events/:eventId/manage" element={<ManageRacersPage />} />
        </Route>
      ) : (
        // --- PUBLIC-ONLY ROUTES ---
        // If the user is not logged in, the only primary page they can see is the HomePage,
        // which contains the login/registration form.
        <Route path="/" element={<HomePage />} />
      )}

      {/* --- GLOBAL ROUTES --- */}
      {/* These routes are accessible to everyone, regardless of authentication state. */}
      
      {/* The OAuth callback page needs to be globally accessible to process the login redirect. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* The public, shareable map view is globally accessible. */}
      <Route path="/events/:groupId/:eventId/view" element={<EventMapPage />} />
      
      {/* The "catch-all" 404 route. This must be the last route defined. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;