import React, { useEffect } from 'react';
import type { ToastMessage } from '../../hooks/useToast.tsx'; // We will create this hook next
import './Toast.css';

interface ToastProps {
  message: ToastMessage;
  onDismiss: (id: number) => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onDismiss }) => {
  // Automatically dismiss the toast after a few seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(message.id);
    }, 5000); // 5 seconds

    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  return (
    <div className={`toast-item toast-${message.type}`}>
      <div className="toast-content">{message.text}</div>
      <button className="toast-dismiss" onClick={() => onDismiss(message.id)}>
        &times;
      </button>
    </div>
  );
};