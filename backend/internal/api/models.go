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

// RacerResponse is the DTO for a racer. It ensures that nullable fields
// are correctly represented as a string or `null` in the JSON response.
type RacerResponse struct {
	ID             int64   `json:"id"`
	EventID        int64   `json:"eventId"`
	UploaderUserID int64   `json:"uploaderUserId"`
	RacerName      string  `json:"racerName"`
	TrackColor     string  `json:"trackColor"`
	TrackAvatarURL *string `json:"trackAvatarUrl"`
	GpxFilePath    *string `json:"gpxFilePath"`
}

// toRacerResponse is a "mapper" function that converts our internal database model
// into the public-facing RacerResponse DTO.
func toRacerResponse(racer *database.Racer) RacerResponse {
	var avatarURL *string
	if racer.TrackAvatarURL.Valid {
		avatarURL = &racer.TrackAvatarURL.String
	}

	var gpxPath *string
	if racer.GpxFilePath.Valid {
		gpxPath = &racer.GpxFilePath.String
	}

	return RacerResponse{
		ID:             racer.ID,
		EventID:        racer.EventID,
		UploaderUserID: racer.UploaderUserID,
		RacerName:      racer.RacerName,
		TrackColor:     racer.TrackColor,
		TrackAvatarURL: avatarURL,
		GpxFilePath:    gpxPath,
	}
}

// toRacerResponseList is a helper to convert a slice of database racers.
func toRacerResponseList(racers []*database.Racer) []RacerResponse {
	responseList := make([]RacerResponse, len(racers))
	for i, racer := range racers {
		responseList[i] = toRacerResponse(racer)
	}
	return responseList
}

// EventResponse is the DTO for an event. It ensures that nullable date fields
// are correctly represented as an ISO 8601 string or `null` in the JSON response.
type EventResponse struct {
	ID            int64   `json:"id"`
	GroupID       int64   `json:"groupId"`
	Name          string  `json:"name"`
	StartDate     *string `json:"startDate"` // Pointer to handle null
	EndDate       *string `json:"endDate"`   // Pointer to handle null
	EventType     string  `json:"eventType"`
	CreatorUserID int64   `json:"creatorUserId"`
}

// toEventResponse is a "mapper" function that converts our internal database model
// into the public-facing EventResponse DTO.
func toEventResponse(event *database.Event) EventResponse {
	var startDate, endDate *string

	if event.StartDate.Valid {
		s := event.StartDate.Time.Format(time.RFC3339)
		startDate = &s
	}
	if event.EndDate.Valid {
		e := event.EndDate.Time.Format(time.RFC3339)
		endDate = &e
	}

	return EventResponse{
		ID:            event.ID,
		GroupID:       event.GroupID,
		Name:          event.Name,
		StartDate:     startDate,
		EndDate:       endDate,
		EventType:     event.EventType,
		CreatorUserID: event.CreatorUserID,
	}
}

// toEventResponseList is a helper to convert a slice of database events.
func toEventResponseList(events []*database.Event) []EventResponse {
	responseList := make([]EventResponse, len(events))
	for i, event := range events {
		responseList[i] = toEventResponse(event)
	}
	return responseList
}
