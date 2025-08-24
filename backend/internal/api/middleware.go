package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/intermernet/raceviz/internal/auth"
)

// contextKey is a custom type used for keys in context.Context. Using a custom
// type prevents collisions between context keys defined in different packages.
type contextKey string

// userContextKey is the specific key used to store the authenticated user's ID
// in the request context after successful authentication.
const userContextKey = contextKey("userID")

// authMiddleware is a middleware function designed to protect routes that require authentication.
// It checks for a valid JSON Web Token (JWT) from either the 'Authorization' header
// or a 'token' URL query parameter.
// If the token is valid, it extracts the user ID and injects it into the request's context.
// If the token is missing or invalid, it terminates the request with a 401 Unauthorized error.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenString := ""

		// --- TOKEN EXTRACTION LOGIC ---

		// 1. First, try to extract the token from the standard "Authorization" header.
		// This is the primary method for standard REST API calls.
		authHeader := r.Header.Get("Authorization")
		headerParts := strings.Split(authHeader, " ")
		if len(headerParts) == 2 && strings.ToLower(headerParts[0]) == "bearer" {
			tokenString = headerParts[1]
		}

		// 2. If the token was not found in the header, fall back to checking the URL query.
		// This is necessary for authenticating connections like Server-Sent Events (SSE),
		// where setting custom headers is not straightforward.
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}

		// If no token was found in either location, reject the request.
		if tokenString == "" {
			s.errorJSON(w, errors.New("authorization token is required"), http.StatusUnauthorized)
			return
		}

		// --- TOKEN VALIDATION LOGIC ---

		// Validate the token's signature and expiration time.
		claims, err := auth.ValidateJWT(tokenString, s.config.JwtSecret)
		if err != nil {
			s.errorJSON(w, errors.New("invalid or expired token"), http.StatusUnauthorized)
			return
		}

		// --- CONTEXT INJECTION ---

		// The token is valid. Extract the user ID from the token's claims.
		userID := claims.UserID

		// Create a new context from the request's context and add the userID to it.
		// This makes the userID available to any subsequent handlers in the chain.
		ctx := context.WithValue(r.Context(), userContextKey, userID)

		// Serve the next handler in the chain, passing it the new request
		// which contains our modified, user-aware context.
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// getUserIDFromContext is a helper function for our API handlers. It safely retrieves
// the authenticated user's ID from the request context.
// This should only be called by handlers that are protected by the authMiddleware.
func (s *Server) getUserIDFromContext(r *http.Request) (int64, error) {
	// Retrieve the value associated with our custom context key.
	userID, ok := r.Context().Value(userContextKey).(int64)
	if !ok {
		// This case should ideally never happen if the middleware is applied correctly.
		// It indicates a server-side logic error.
		return 0, errors.New("could not retrieve user ID from context")
	}

	return userID, nil
}
