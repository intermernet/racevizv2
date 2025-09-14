package database

import (
	"database/sql"
	"time"
)

// User represents a record in the 'users' table.
// It uses `sql.NullString` for fields that can be NULL in the database,
// such as the password for an OAuth-only user or a user who hasn't set an avatar.
type User struct {
	ID           int64          `json:"id"`
	Email        string         `json:"email"`
	Username     string         `json:"username"`
	PasswordHash sql.NullString `json:"-"` // Omit from JSON responses for security
	AvatarURL    sql.NullString `json:"avatarUrl"`
	CreatedAt    time.Time      `json:"createdAt"`
}

// Group represents a record in the 'groups' table in the main database.
type Group struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	CreatorUserID int64     `json:"creatorUserId"`
	CreatedAt     time.Time `json:"createdAt"`
}

// Event represents a record in an 'events' table within a specific group's database.
type Event struct {
	ID            int64        `json:"id"`
	GroupID       int64        `json:"groupId"` // Foreign key to the group this event belongs to
	Name          string       `json:"name"`
	StartDate     sql.NullTime `json:"startDate"`
	EndDate       sql.NullTime `json:"endDate"`
	EventType     string       `json:"eventType"` // Can be 'race' or 'time_trial'
	CreatorUserID int64        `json:"creatorUserId"`
	HasGpxData    bool         `json:"-"` // Not a DB field, populated by query
}

// Racer represents a record in a 'racers' table within a group's database.
// It links a user's uploaded GPX file to a specific event.
type Racer struct {
	ID             int64          `json:"id"`
	EventID        int64          `json:"eventId"`
	UploaderUserID int64          `json:"uploaderUserId"`
	RacerName      string         `json:"racerName"`
	TrackColor     string         `json:"trackColor"`
	TrackAvatarURL sql.NullString `json:"trackAvatarUrl"`
	GpxFilePath    sql.NullString `json:"gpxFilePath"`
}

// Invitation represents a record in the 'invitations' table.
type Invitation struct {
	ID            int64     `json:"id"`
	GroupID       int64     `json:"groupId"`
	InviterUserID int64     `json:"inviterUserId"`
	InviteeEmail  string    `json:"inviteeEmail"`
	Status        string    `json:"status"` // e.g., 'pending', 'accepted', 'declined'
	CreatedAt     time.Time `json:"createdAt"`

	// These extra fields are not part of the 'invitations' table schema itself.
	// They are populated by a JOIN query in `GetPendingInvitationsByEmail`
	// to provide richer data to the API without requiring extra lookups.
	GroupName   string `json:"groupName"`
	InviterName string `json:"inviterName"`
}
