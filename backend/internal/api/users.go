package api

import (
	"database/sql"
	"errors"
	"net/http"
)

// handleGetMyProfile is an authenticated endpoint that retrieves the profile
// information for the currently logged-in user.
func (s *Server) handleGetMyProfile(w http.ResponseWriter, r *http.Request) {
	// 1. Get the authenticated user's ID from the request context.
	// This ID is safely injected by the `authMiddleware` after validating the JWT
	// and is guaranteed to be present for this handler to be reached.
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		// This error should theoretically never happen if middleware is set up correctly,
		// but it's good practice to handle it as a server-side failure.
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// 2. Fetch the user's full profile from the database using their ID.
	// We use the main database connection for this query.
	user, err := s.db.GetUserByID(s.db.GetMainDB(), userID)
	if err != nil {
		// If sql.ErrNoRows is returned, it indicates a data inconsistency issue
		// (e.g., a valid token exists for a user who has since been deleted).
		// We should treat this as a "Not Found" error.
		if errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, errors.New("user not found"), http.StatusNotFound)
			return
		}
		// Handle other potential database errors.
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// 3. Convert the internal database model to our clean UserResponse DTO.
	// This is a critical step to ensure we only expose the data we intend to
	// and to correctly handle nullable fields like `avatarUrl`.
	userResponse := toUserResponse(user)

	// 4. Respond with the user's profile data, wrapped in our standard envelope.
	// The `PasswordHash` field is never exposed because it's not part of the DTO.
	s.writeJSON(w, http.StatusOK, envelope{"user": userResponse})
}

// NOTE: Other user-related handlers would be added here, for example:
//
// - handleUpdateMyProfile (for PUT requests to /api/v1/users/me to change username or avatar)
// - handleGetUserProfile (for GET requests to /api/v1/users/{id} to get another user's public profile)
//
