package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/intermernet/raceviz/internal/database"
	"github.com/intermernet/raceviz/internal/realtime" // Used for the Message struct

	"github.com/go-chi/chi/v5"
)

// --- Structs for JSON Payloads ---

// createGroupPayload defines the expected JSON body for a group creation request.
type createGroupPayload struct {
	Name string `json:"name"`
}

// inviteUserPayload defines the expected JSON body for a group invitation request.
type inviteUserPayload struct {
	Email string `json:"email"`
}

// --- HTTP Handlers ---

// handleGetMyGroups is the HTTP handler for fetching all groups the authenticated user is a member of.
func (s *Server) handleGetMyGroups(w http.ResponseWriter, r *http.Request) {
	// 1. Get the authenticated user's ID from the context.
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// 2. Fetch the groups from the database using the new query.
	groups, err := s.db.GetGroupsByUserID(s.db.GetMainDB(), userID)
	if err != nil {
		// sql.ErrNoRows is not an error here; it just means the user has no groups.
		// So we only handle actual database errors.
		if !errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
	}

	// 3. Respond with the list of groups. This will be an empty array if none were found.
	s.writeJSON(w, http.StatusOK, envelope{"groups": groups})
}

// handleCreateGroup is the HTTP handler for creating a new group.
// It requires an authenticated user, who will become the group's creator/owner.
func (s *Server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	// 1. Get the authenticated user's ID from the context.
	creatorID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	var payload createGroupPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	// 2. Validate input.
	if payload.Name == "" {
		s.errorJSON(w, errors.New("group name is required"), http.StatusBadRequest)
		return
	}

	// 3. Perform database operations within a single transaction.
	// This ensures that either both the group is created AND the creator is added as a member, or nothing happens.
	var newGroup *database.Group
	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		var txErr error
		// Create the group record.
		newGroup, txErr = s.db.CreateGroup(tx, payload.Name, creatorID)
		if txErr != nil {
			return txErr
		}
		// Add the creator as the first member of the new group.
		return s.db.AddGroupMember(tx, newGroup.ID, creatorID)
	})

	if err != nil {
		s.errorJSON(w, errors.New("failed to create group"), http.StatusInternalServerError)
		return
	}

	// 4. Initialize the group-specific database file.
	// This creates the group_<id>.db file and sets up its schema for events, racers, etc.
	if err := s.db.InitGroupDB(newGroup.ID); err != nil {
		// In a real-world scenario, you might want to roll back the group creation
		// in the main DB if this step fails.
		s.errorJSON(w, errors.New("failed to initialize group database"), http.StatusInternalServerError)
		return
	}

	// 5. Respond with the details of the newly created group.
	s.writeJSON(w, http.StatusCreated, envelope{"group": newGroup})
}

// handleInviteUserToGroup is the HTTP handler for inviting a user to a group.
// It checks if a user exists to decide whether to send a WebSocket message or an email.
func (s *Server) handleInviteUserToGroup(w http.ResponseWriter, r *http.Request) {
	// 1. Get authenticated user and group ID from the request.
	inviterID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupIDStr := chi.URLParam(r, "groupID")
	groupID, err := strconv.ParseInt(groupIDStr, 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}

	var payload inviteUserPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	if payload.Email == "" {
		s.errorJSON(w, errors.New("invitee email is required"), http.StatusBadRequest)
		return
	}

	// 2. Authorization Check: Verify the authenticated user is the group creator.
	group, err := s.db.GetGroupByID(s.db.GetMainDB(), groupID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, errors.New("group not found"), http.StatusNotFound)
			return
		}
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	if group.CreatorUserID != inviterID {
		s.errorJSON(w, errors.New("forbidden: only the group creator can invite members"), http.StatusForbidden)
		return
	}

	// 3. Create the invitation record in the database.
	var newInvitation *database.Invitation
	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		var txErr error
		newInvitation, txErr = s.db.CreateInvitation(tx, groupID, inviterID, payload.Email)
		return txErr
	})

	if err != nil {
		s.errorJSON(w, errors.New("failed to create invitation"), http.StatusInternalServerError)
		return
	}

	// --- 4. NOTIFICATION LOGIC ---
	// Check if an account exists for the invitee's email.
	invitee, err := s.db.GetUserByEmail(s.db.GetMainDB(), payload.Email)

	// We also need the inviter's profile to get their username for the notifications.
	inviter, inviterErr := s.db.GetUserByID(s.db.GetMainDB(), inviterID)

	if err == nil && inviterErr == nil {
		// --- Case 1: User EXISTS. Send an SSE notification. ---
		log.Printf("User %s exists. Sending SSE notification for invitation %d.", payload.Email, newInvitation.ID)

		wsPayload := map[string]interface{}{
			"id":          newInvitation.ID,
			"groupId":     group.ID,
			"groupName":   group.Name,
			"inviterName": inviter.Username,
		}

		message := realtime.Message{Type: "new_invitation", Payload: wsPayload}
		s.broker.NotifyUser(invitee.ID, message)

	} else if errors.Is(err, sql.ErrNoRows) && inviterErr == nil {
		// --- Case 2: User DOES NOT EXIST. Send an SMTP email. ---
		log.Printf("User %s does not exist. Sending SMTP email for invitation %d.", payload.Email, newInvitation.ID)

		err := s.email.SendInvitationEmail(payload.Email, inviter.Username, group.Name, s.config.FrontendURL)
		if err != nil {
			log.Printf("ERROR: Failed to send invitation email to %s: %v", payload.Email, err)
		}
	} else {
		// --- Case 3: A database error occurred fetching user details. ---
		log.Printf("ERROR: Could not fetch user details for notification dispatch. Invitee err: %v, Inviter err: %v", err, inviterErr)
	}

	s.writeJSON(w, http.StatusCreated, envelope{"message": "invitation sent successfully"})
}

// handleRemoveGroupMember is the HTTP handler for removing a member from a group.
// Only the creator of the group can perform this action.
func (s *Server) handleRemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	// 1. Get authenticated user and path parameters.
	removerID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	memberID, _ := strconv.ParseInt(chi.URLParam(r, "memberID"), 10, 64)

	if groupID == 0 || memberID == 0 {
		s.errorJSON(w, errors.New("invalid group or member ID"), http.StatusBadRequest)
		return
	}

	// 2. Authorization Check: Verify the remover is the group creator.
	group, err := s.db.GetGroupByID(s.db.GetMainDB(), groupID)
	if err != nil {
		s.errorJSON(w, errors.New("group not found"), http.StatusNotFound)
		return
	}

	if group.CreatorUserID != removerID {
		s.errorJSON(w, errors.New("forbidden: only the group creator can remove members"), http.StatusForbidden)
		return
	}

	// 3. Business Rule: Prevent the creator from removing themselves.
	if group.CreatorUserID == memberID {
		s.errorJSON(w, errors.New("group creator cannot be removed"), http.StatusBadRequest)
		return
	}

	// 4. Remove the member from the database.
	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		return s.db.RemoveGroupMember(tx, groupID, memberID)
	})

	if err != nil {
		s.errorJSON(w, errors.New("failed to remove member"), http.StatusInternalServerError)
		return
	}

	// 5. Success Response.
	s.writeJSON(w, http.StatusOK, envelope{"message": "member removed successfully"})
}

// handleGetGroupDetails fetches the details for a single group.
func (s *Server) handleGetGroupDetails(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}

	group, err := s.db.GetGroupByID(s.db.GetMainDB(), groupID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, errors.New("group not found"), http.StatusNotFound)
			return
		}
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"group": group})
}

// handleGetGroupEvents fetches all events for a specific group.
func (s *Server) handleGetGroupEvents(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	events, err := s.db.GetEventsByGroupID(groupDB, groupID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	eventResponses := toEventResponseList(events)
	s.writeJSON(w, http.StatusOK, envelope{"events": eventResponses})
}

// handleGetGroupMembers fetches all members for a specific group.
func (s *Server) handleGetGroupMembers(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}

	dbMembers, err := s.db.GetMembersByGroupID(s.db.GetMainDB(), groupID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// Convert the internal database models to the clean UserResponse DTO
	memberResponses := toUserResponseList(dbMembers)
	s.writeJSON(w, http.StatusOK, envelope{"members": memberResponses})
}
