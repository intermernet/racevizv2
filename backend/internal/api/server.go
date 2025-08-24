package api

import (
	"encoding/json"
	"net/http"

	"github.com/intermernet/raceviz/internal/config"
	"github.com/intermernet/raceviz/internal/database"
	"github.com/intermernet/raceviz/internal/email"    // Import email package
	"github.com/intermernet/raceviz/internal/realtime" // Import realtime package
)

// Server is the main struct for the API. It holds all dependencies required
// by the HTTP handlers, such as the application configuration and the database service.
// This approach, known as dependency injection, makes the application modular and easier to test.
type Server struct {
	config *config.Config
	db     *database.Service
	broker *realtime.Broker
	email  *email.EmailService
	// Future dependencies like a WebSocket hub, email client, or logger can be added here.
}

// NewServer is a constructor function that creates and returns a new instance of the Server.
// It takes the application's configuration and database service as arguments and
// wires them into the newly created Server object.
func NewServer(cfg *config.Config, db *database.Service, broker *realtime.Broker, email *email.EmailService) *Server {
	return &Server{
		config: cfg,
		db:     db,
		broker: broker,
		email:  email,
	}
}

// envelope is a custom map type used for creating structured JSON responses.
// Using a named type like this can make the code more readable, especially
// when wrapping responses, e.g., `envelope{"user": userObject}`.
type envelope map[string]interface{}

// writeJSON is a helper method for sending JSON responses. It takes the destination
// http.ResponseWriter, an HTTP status code, the data to be encoded, and optional headers.
// It marshals the data to JSON and sets the appropriate 'Content-Type' header.
// This centralizes response logic and ensures all JSON responses are consistent.
func (s *Server) writeJSON(w http.ResponseWriter, status int, data interface{}, headers ...http.Header) {
	// Marshal the data into a JSON byte slice. The empty prefix "" and tab "\t" for indentation
	// are used to make the JSON output pretty-printed, which is helpful for debugging.
	js, err := json.MarshalIndent(data, "", "\t")
	if err != nil {
		// If marshaling fails, it's a server-side error. We send a plain text
		// error response because we can't be sure that our JSON error format is valid.
		http.Error(w, "Internal Server Error: Failed to marshal JSON", http.StatusInternalServerError)
		return
	}

	// Append any additional headers passed to the function.
	if len(headers) > 0 {
		for key, value := range headers[0] {
			w.Header()[key] = value
		}
	}

	// Set the standard JSON content type header and write the status code.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(js)
}

// errorJSON is a helper method for sending standardized JSON error responses.
// It takes an error and a status code, formats it into a consistent JSON object
// `{"error": "message"}`, and sends it to the client using the writeJSON helper.
// This ensures that all API errors have a predictable format.
func (s *Server) errorJSON(w http.ResponseWriter, err error, status ...int) {
	// Default to a 500 Internal Server Error if no specific status is provided.
	statusCode := http.StatusInternalServerError
	if len(status) > 0 {
		statusCode = status[0]
	}

	// Create the error response payload.
	errorResponse := envelope{"error": err.Error()}

	// Send the JSON response.
	s.writeJSON(w, statusCode, errorResponse)
}
