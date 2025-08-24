// internal/api/models.go

package api

import (
	"time"

	"github.com/intermernet/raceviz/internal/database"
)

// UserResponse is the DTO for a user's public profile.
// It's carefully structured to only expose safe and necessary data.
type UserResponse struct {
	ID       int64  `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	// The AvatarURL is a simple string or null, making it easy for the frontend.
	AvatarURL *string   `json:"avatarUrl"` // Use a pointer to handle null values gracefully
	CreatedAt time.Time `json:"createdAt"`
}

// toUserResponse is a "mapper" function that converts our internal database model
// into the public-facing UserResponse DTO.
func toUserResponse(user *database.User) UserResponse {
	var avatarURL *string
	// If the database value is valid (not NULL), we get a pointer to the string.
	if user.AvatarURL.Valid {
		avatarURL = &user.AvatarURL.String
	}

	return UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Username:  user.Username,
		AvatarURL: avatarURL, // This will be `null` in JSON if the pointer is nil
		CreatedAt: user.CreatedAt,
	}
}

// toUserResponseList is a helper to convert a slice of database users.
func toUserResponseList(users []database.User) []UserResponse {
	responseList := make([]UserResponse, len(users))
	for i, user := range users {
		responseList[i] = toUserResponse(&user)
	}
	return responseList
}

// NOTE: You would create other response DTOs here as needed, for example,
// a `GroupResponse` that includes a list of `UserResponse` members.
