import { useState, useEffect, useRef } from 'react';

// Define a generic message type for flexibility
interface SSEMessage<T = any> {
  type: string;
  payload: T;
}

export const useSSE = (url: string | null) => {
  const [lastMessage, setLastMessage] = useState<SSEMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Do nothing if the URL is null (e.g., user is not logged in).
    if (!url) {
      return;
    }

    // Create a new EventSource instance. It will automatically try to connect.
    const eventSource = new EventSource(url, { withCredentials: false }); // We use a token, not cookies
    eventSourceRef.current = eventSource;

    // Handler for when a message is received from the server.
    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);
        setLastMessage(message);
      } catch (error) {
        console.error('Failed to parse SSE message:', event.data);
      }
    };

    // Handler for any connection errors.
    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      // The browser will automatically try to reconnect.
      // We can close it manually if we want to stop.
      eventSource.close();
    };

    // The cleanup function is critical. It closes the connection when the component unmounts.
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [url]); // This effect re-runs if the URL changes.

  return { lastMessage };
};