package api

import (
	"fmt"
	"net/http"
)

// handleSSE is the handler for Server-Sent Events.
func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	// 1. Get the authenticated user's ID from the context (via the auth middleware).
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusUnauthorized)
		return
	}

	// 2. Set the required headers for an SSE connection.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Allow cross-origin access for the event stream
	w.Header().Set("Access-Control-Allow-Origin", s.config.ParsedFrontendURL.String())

	// Flusher is needed to send data to the client as it becomes available.
	flusher, ok := w.(http.Flusher)
	if !ok {
		s.errorJSON(w, fmt.Errorf("streaming unsupported"), http.StatusInternalServerError)
		return
	}

	// 3. Add this client connection to our broker.
	clientChan := s.broker.AddClient(userID)

	// 4. When the client disconnects, remove them from the broker.
	defer s.broker.RemoveClient(userID)

	// 5. Start an infinite loop to listen for messages and client disconnects.
	for {
		select {
		case message, open := <-clientChan:
			if !open {
				// The channel was closed by the broker.
				return
			}
			// Format the message according to the SSE spec: "data: {...}\n\n"
			fmt.Fprintf(w, "data: %s\n\n", message)
			// Flush the response to send the message immediately.
			flusher.Flush()
		case <-r.Context().Done():
			// The client has disconnected. The defer function will handle cleanup.
			return
		}
	}
}
