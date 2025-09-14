package api

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"encoding/json"

	"github.com/intermernet/raceviz/internal/auth"
	"golang.org/x/crypto/bcrypt"
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

// handleUpdateMyAvatar is an authenticated endpoint that allows a user to
// update their own avatar URL.
func (s *Server) handleUpdateMyAvatar(w http.ResponseWriter, r *http.Request) {
	// 1. Get the authenticated user's ID from the request context.
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// --- 2. Handle File Upload ---
	// Set a max file size (e.g., 5MB)
	r.Body = http.MaxBytesReader(w, r.Body, 5<<20)
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		s.errorJSON(w, errors.New("file is too large (max 5MB)"), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		s.errorJSON(w, errors.New("invalid file upload: 'avatar' field is missing"), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// --- 3. Store the File ---
	ext := filepath.Ext(header.Filename)
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".gif" {
		s.errorJSON(w, errors.New("invalid file type: only jpg, png, gif are allowed"), http.StatusBadRequest)
		return
	}
	newFileName := fmt.Sprintf("user_avatar_%d_%d%s", userID, time.Now().UnixNano(), ext)
	newFilePath := filepath.Join(s.config.AvatarPath, newFileName)

	dst, err := os.Create(newFilePath)
	if err != nil {
		s.errorJSON(w, errors.New("could not save file"), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		s.errorJSON(w, errors.New("could not write file to disk"), http.StatusInternalServerError)
		return
	}

	// --- 4. Update Database Record ---
	publicAvatarURL := fmt.Sprintf("/public/avatars/%s", newFileName)
	if err := s.db.UpdateUserAvatar(s.db.GetMainDB(), userID, publicAvatarURL); err != nil {
		os.Remove(newFilePath) // Attempt to clean up the file if DB update fails.
		s.errorJSON(w, errors.New("failed to update avatar"), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "Avatar updated successfully"})
}

// handleUpdateMyProfile handles updates to username and password.
func (s *Server) handleUpdateMyProfile(w http.ResponseWriter, r *http.Request) {
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	var payload struct {
		Username    string `json:"username"`
		OldPassword string `json:"oldPassword"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	// No changes submitted
	if payload.Username == "" && payload.NewPassword == "" {
		s.errorJSON(w, errors.New("no changes provided"), http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(s.db.GetMainDB(), userID)
	if err != nil {
		s.errorJSON(w, errors.New("user not found"), http.StatusNotFound)
		return
	}

	var newPasswordHash string
	if payload.NewPassword != "" {
		// User must provide old password to change it
		if !user.PasswordHash.Valid {
			s.errorJSON(w, errors.New("cannot change password for OAuth user"), http.StatusBadRequest)
			return
		}
		if payload.OldPassword == "" {
			s.errorJSON(w, errors.New("old password is required to set a new one"), http.StatusBadRequest)
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(payload.OldPassword)); err != nil {
			s.errorJSON(w, errors.New("incorrect old password"), http.StatusUnauthorized)
			return
		}
		if len(payload.NewPassword) < 8 {
			s.errorJSON(w, errors.New("new password must be at least 8 characters"), http.StatusBadRequest)
			return
		}
		hashedPassword, err := auth.HashPassword(payload.NewPassword)
		if err != nil {
			s.errorJSON(w, errors.New("failed to hash new password"), http.StatusInternalServerError)
			return
		}
		newPasswordHash = hashedPassword
	}

	if err := s.db.UpdateUser(s.db.GetMainDB(), userID, payload.Username, newPasswordHash); err != nil {
		s.errorJSON(w, errors.New("failed to update profile"), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "Profile updated successfully"})
}

// handleDeleteMyProfile handles deleting a user's own account.
func (s *Server) handleDeleteMyProfile(w http.ResponseWriter, r *http.Request) {
	userID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// The ON DELETE SET NULL on the groups table and ON DELETE CASCADE on
	// group_members and invitations tables will handle dissociating the user's content.
	if err := s.db.DeleteUser(s.db.GetMainDB(), userID); err != nil {
		s.errorJSON(w, errors.New("failed to delete profile"), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "Profile deleted successfully"})
}
