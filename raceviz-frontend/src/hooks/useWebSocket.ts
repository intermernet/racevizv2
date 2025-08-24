import { useState, useEffect, useRef } from 'react';

type ConnectionStatus = 'Connecting' | 'Open' | 'Closed';

// Define a generic message type for flexibility
interface WebSocketMessage<T = any> {
  type: string;
  payload: T;
}

export const useWebSocket = (url: string | null) => {
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('Closed');
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Do nothing if the URL is null (e.g., user is not logged in)
    if (!url) {
      return;
    }

    // Don't reconnect if we already have a connection
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      return;
    }

    setConnectionStatus('Connecting');
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      console.log('WebSocket connection opened');
      setConnectionStatus('Open');
    };

    ws.current.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', event.data);
      }
    };

    ws.current.onerror = (event) => {
      console.error('WebSocket error:', event);
      // The onclose event will be fired automatically after an error.
    };

    ws.current.onclose = () => {
      console.log('WebSocket connection closed');
      setConnectionStatus('Closed');
    };

    // The cleanup function is critical for preventing memory leaks.
    // It ensures the connection is closed when the component unmounts.
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]); // This effect re-runs if the URL changes

  return { lastMessage, connectionStatus };
};