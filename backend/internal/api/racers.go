// internal/api/racers.go
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
)

// handleAddRacer adds a new racer entry to an existing event.
func (s *Server) handleAddRacer(w http.ResponseWriter, r *http.Request) {
	adderID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	eventID, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)

	// Authorization: Check if the user is a member of the group.
	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, adderID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

	var payload addRacerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	if payload.RacerName == "" {
		s.errorJSON(w, errors.New("racerName is required"), http.StatusBadRequest)
		return
	}

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// --- COLOR GENERATION LOGIC ---
	// 1. Get existing colors to ensure uniqueness.
	existingRacers, err := s.db.GetRacersByEventID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}
	existingColors := make(map[string]bool)
	for _, racer := range existingRacers {
		existingColors[racer.TrackColor] = true
	}

	// 2. Generate a new random color until it's unique.
	var newColor string
	rand.Seed(time.Now().UnixNano())
	for {
		newColor = fmt.Sprintf("#%06x", rand.Intn(0xFFFFFF))
		if !existingColors[newColor] {
			break
		}
	}

	// Do not set a default track avatar. Let the frontend's fallback logic handle it.
	newRacer, err := s.db.AddRacerToEvent(groupDB, eventID, adderID, payload.RacerName, newColor, sql.NullString{})
	if err != nil {
		s.errorJSON(w, errors.New("failed to add racer to event"), http.StatusInternalServerError)
		return
	}

	racerResponse := toRacerResponse(newRacer)

	s.writeJSON(w, http.StatusCreated, envelope{"racer": racerResponse})
	//s.writeJSON(w, http.StatusCreated, envelope{"racer": newRacer})
}

// handleGetRacersForEvent fetches all racers associated with a specific event.
func (s *Server) handleGetRacersForEvent(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}
	eventID, err := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid event ID"), http.StatusBadRequest)
		return
	}

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	racers, err := s.db.GetRacersByEventID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	racerResponses := toRacerResponseList(racers)

	s.writeJSON(w, http.StatusOK, envelope{"racers": racerResponses})

	//s.writeJSON(w, http.StatusOK, envelope{"racers": racers})
}

// handleUpdateRacerColor handles requests to change a racer's color.
func (s *Server) handleUpdateRacerColor(w http.ResponseWriter, r *http.Request) {
	// Simple auth: just check if the user is a group member.
	adderID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}
	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, adderID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

	racerID, _ := strconv.ParseInt(chi.URLParam(r, "racerID"), 10, 64)

	var payload struct {
		Color string `json:"color"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("invalid request body"), http.StatusBadRequest)
		return
	}

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	if err := s.db.UpdateRacerColor(groupDB, racerID, payload.Color); err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "color updated successfully"})
}

// handleUpdateRacerAvatar handles requests to change a specific racer's avatar.
func (s *Server) handleUpdateRacerAvatar(w http.ResponseWriter, r *http.Request) {
	// Auth: Check if the user is a member of the group.
	updaterID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}
	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, updaterID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

	racerID, _ := strconv.ParseInt(chi.URLParam(r, "racerID"), 10, 64)

	// --- 1. Handle File Upload ---
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

	// --- 2. Store the File ---
	// Create a unique filename to prevent collisions.
	ext := filepath.Ext(header.Filename)
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".gif" {
		s.errorJSON(w, errors.New("invalid file type: only jpg, png, gif are allowed"), http.StatusBadRequest)
		return
	}
	newFileName := fmt.Sprintf("racer_avatar_%d_%d%s", racerID, time.Now().UnixNano(), ext)
	// This assumes you have a publicly served directory for avatars.
	// Ensure `s.config.AvatarPath` is configured and the directory exists.
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

	// --- 3. Update Database Record ---
	// Construct the public URL for the saved file.
	// This assumes your public avatar directory is served at `/public/avatars`.
	publicAvatarURL := fmt.Sprintf("/public/avatars/%s", newFileName)

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// Update the racer's avatar URL in the database.
	if err := s.db.UpdateRacerAvatar(groupDB, racerID, publicAvatarURL); err != nil {
		os.Remove(newFilePath) // Attempt to clean up the file if DB update fails.
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{
		"message":   "Racer avatar updated successfully",
		"avatarUrl": publicAvatarURL,
	})
}

// handleDeleteRacer deletes a racer and their associated GPX file.
func (s *Server) handleDeleteRacer(w http.ResponseWriter, r *http.Request) {
	deleterID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	eventID, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)
	racerID, _ := strconv.ParseInt(chi.URLParam(r, "racerID"), 10, 64)

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// Authorization Check
	event, err := s.db.GetEventByID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, errors.New("event not found"), http.StatusNotFound)
		return
	}
	racer, err := s.db.GetRacerByID(groupDB, racerID)
	if err != nil {
		s.errorJSON(w, errors.New("racer not found"), http.StatusNotFound)
		return
	}

	// A user can delete a racer if they are the event creator OR they are the one who uploaded the racer.
	if deleterID != event.CreatorUserID && deleterID != racer.UploaderUserID {
		s.errorJSON(w, errors.New("forbidden: you do not have permission to delete this racer"), http.StatusForbidden)
		return
	}

	// 1. Get the GPX file path BEFORE deleting the DB record.
	gpxPathToDelete := ""
	if racer.GpxFilePath.Valid {
		gpxPathToDelete = racer.GpxFilePath.String
	}

	// 2. Delete the racer record from the database.
	if err := s.db.DeleteRacer(groupDB, racerID); err != nil {
		s.errorJSON(w, errors.New("failed to delete racer record"), http.StatusInternalServerError)
		return
	}

	// 3. If a file was associated, delete it from the filesystem.
	if gpxPathToDelete != "" {
		fullPath := filepath.Join(s.config.GpxPath, gpxPathToDelete)
		if err := os.Remove(fullPath); err != nil {
			log.Printf("WARN: failed to delete gpx file %s: %v", fullPath, err)
		}
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "racer deleted successfully"})
}
