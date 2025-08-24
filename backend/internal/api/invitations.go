// internal/api/invitations.go

package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// handleGetMyInvitations fetches all pending invitations for the authenticated user.
func (s *Server) handleGetMyInvitations(w http.ResponseWriter, r *http.Request) {
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// We need the user's email to find their invitations.
	user, err := s.db.GetUserByID(s.db.GetMainDB(), userID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	invitations, err := s.db.GetPendingInvitationsByEmail(s.db.GetMainDB(), user.Email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"invitations": invitations})
}

// handleAcceptInvitation handles the logic for a user accepting a group invitation.
func (s *Server) handleAcceptInvitation(w http.ResponseWriter, r *http.Request) {
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	invitationID, err := strconv.ParseInt(chi.URLParam(r, "invitationID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid invitation ID"), http.StatusBadRequest)
		return
	}

	// We use a transaction to ensure that we both update the invitation
	// and add the user to the group, or neither operation happens.
	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		// First, get the invitation details to find the group ID.
		invitation, txErr := s.db.GetInvitationByID(tx, invitationID)
		if txErr != nil {
			return errors.New("invitation not found")
		}

		// Then, add the user to the group's member list.
		if txErr = s.db.AddGroupMember(tx, invitation.GroupID, userID); txErr != nil {
			return txErr
		}

		// Finally, update the invitation's status to 'accepted'.
		return s.db.UpdateInvitationStatus(tx, invitationID, "accepted")
	})

	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "invitation accepted successfully"})
}

// handleDeclineInvitation handles a user declining a group invitation.
func (s *Server) handleDeclineInvitation(w http.ResponseWriter, r *http.Request) {
	_, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	invitationID, err := strconv.ParseInt(chi.URLParam(r, "invitationID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid invitation ID"), http.StatusBadRequest)
		return
	}

	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		return s.db.UpdateInvitationStatus(tx, invitationID, "declined")
	})

	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "invitation declined successfully"})
}
