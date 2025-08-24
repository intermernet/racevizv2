import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '../components/ui/Header.tsx';
import './MainLayout.css';

/**
 * MainLayout provides a consistent structure for all authenticated views.
 * It renders a shared Header and then uses the <Outlet /> component from
 * React Router to render the specific page component for the current route.
 */
export const MainLayout: React.FC = () => {
  return (
    <div className="main-layout">
      <Header />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};