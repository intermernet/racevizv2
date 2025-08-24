package api

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/tkrajina/gpxgo/gpx"
)

// handleGpxUpload processes a GPX file upload for a specific racer in an event.
// It performs authorization, validation based on event type, file storage, and updates the database.
func (s *Server) handleGpxUpload(w http.ResponseWriter, r *http.Request) {
	// --- 1. Authentication & Authorization ---
	uploaderID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	// --- 2. Parse URL Parameters ---
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
	racerID, err := strconv.ParseInt(chi.URLParam(r, "racerID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid racer ID"), http.StatusBadRequest)
		return
	}

	// --- 3. Database Lookups & Authorization Checks ---
	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, errors.New("group database not found"), http.StatusInternalServerError)
		return
	}

	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, uploaderID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

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

	if uploaderID != racer.UploaderUserID && uploaderID != event.CreatorUserID {
		s.errorJSON(w, errors.New("forbidden: you can only upload files for racers you created or as the event owner"), http.StatusForbidden)
		return
	}

	// --- 4. Handle File Upload ---
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB max file size
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		s.errorJSON(w, errors.New("file is too large (max 10MB)"), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("gpxFile")
	if err != nil {
		s.errorJSON(w, errors.New("invalid file upload"), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// --- 5. GPX Data Validation ---
	gpxBytes, err := io.ReadAll(file)
	if err != nil {
		s.errorJSON(w, errors.New("could not read uploaded file"), http.StatusInternalServerError)
		return
	}

	gpxData, err := gpx.ParseBytes(gpxBytes)
	if err != nil {
		s.errorJSON(w, errors.New("invalid GPX file format"), http.StatusBadRequest)
		return
	}

	if len(gpxData.Tracks) == 0 || len(gpxData.Tracks[0].Segments) == 0 || len(gpxData.Tracks[0].Segments[0].Points) == 0 {
		s.errorJSON(w, errors.New("GPX file contains no track points"), http.StatusBadRequest)
		return
	}

	// --- Conditional Date Validation ---
	// Only perform the strict date check if the event is a "race".
	if event.EventType == "race" {
		if !event.StartDate.Valid || !event.EndDate.Valid {
			s.errorJSON(w, errors.New("cannot upload to a race event with no date range"), http.StatusInternalServerError)
			return
		}

		firstPointTime := gpxData.Tracks[0].Segments[0].Points[0].Timestamp
		lastPointTime := gpxData.Tracks[0].Segments[0].Points[len(gpxData.Tracks[0].Segments[0].Points)-1].Timestamp

		// Allow a small buffer (e.g., 1 hour) to account for timezone issues or GPS start delays.
		buffer := time.Hour * 1
		if firstPointTime.Before(event.StartDate.Time.Add(-buffer)) || lastPointTime.After(event.EndDate.Time.Add(buffer)) {
			msg := fmt.Sprintf("GPX track times are outside the event dates (%s to %s)",
				event.StartDate.Time.Format(time.RFC822), event.EndDate.Time.Format(time.RFC822))
			s.errorJSON(w, errors.New(msg), http.StatusBadRequest)
			return
		}
	}
	// For "time_trial" events, no date validation is performed.

	// --- 6. Store the File ---
	if racer.GpxFilePath.Valid && racer.GpxFilePath.String != "" {
		oldPath := filepath.Join(s.config.GpxPath, racer.GpxFilePath.String)
		if err := os.Remove(oldPath); err != nil {
			log.Printf("WARN: could not remove old gpx file %s: %v", oldPath, err)
		}
	}

	newFileName := fmt.Sprintf("group_%d_event_%d_racer_%d_%d.gpx", groupID, eventID, racerID, time.Now().UnixNano())
	newFilePath := filepath.Join(s.config.GpxPath, newFileName)

	dst, err := os.Create(newFilePath)
	if err != nil {
		s.errorJSON(w, errors.New("could not save file"), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := dst.Write(gpxBytes); err != nil {
		s.errorJSON(w, errors.New("could not write file to disk"), http.StatusInternalServerError)
		return
	}

	// --- 7. Update Database Record ---
	err = s.db.UpdateRacerGpxFile(groupDB, racerID, newFileName)
	if err != nil {
		os.Remove(newFilePath) // Attempt to clean up the file if the DB update fails.
		s.errorJSON(w, errors.New("could not update racer record in database"), http.StatusInternalServerError)
		return
	}

	// --- 8. Success Response ---
	s.writeJSON(w, http.StatusCreated, envelope{
		"message": "GPX file uploaded and linked to racer successfully",
		"gpxPath": newFileName,
	})
}
