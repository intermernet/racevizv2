import React, { createContext, useState, useContext, useCallback } from 'react';
// 1. Import *types* from React using `import type`.
import type { ReactNode } from 'react';

// 2. Import the Toast component.
import { Toast } from '../components/ui/Toast.tsx';

// Define the shape of a single toast message.
export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

// Define the shape of the data the context will provide.
interface ToastContextType {
  addToast: (text: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// The provider component that will wrap the application.
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // `addToast` is memoized with useCallback to prevent unnecessary re-renders of consuming components.
  const addToast = useCallback((text: string, type: ToastType) => {
    const newToast: ToastMessage = {
      id: Date.now() + Math.random(), // Add random number to avoid collision on rapid calls
      text,
      type,
    };
    setToasts(prevToasts => [newToast, ...prevToasts]);
  }, []);

  // `dismissToast` is memoized for the same reason.
  const dismissToast = useCallback((id: number) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* The ToastContainer is rendered here, outside of the main app flow,
          ensuring it always sits on top of other content. */}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast key={toast.id} message={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// The custom hook that components will use to access the addToast function.
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    // This safeguard ensures the hook is always used within a ToastProvider.
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};