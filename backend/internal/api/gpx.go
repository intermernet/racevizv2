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

// handleGpxUpload is the HTTP handler for uploading a GPX track for a specific racer.
// It performs authorization, validation, file storage, and updates the database.
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

	// Check if uploader is a group member (basic permission).
	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, uploaderID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

	// Fetch event and racer details.
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

	// Check if the uploader is either the person who created the racer entry or the event creator.
	if uploaderID != racer.UploaderUserID && uploaderID != event.CreatorUserID {
		s.errorJSON(w, errors.New("forbidden: you can only upload files for racers you created"), http.StatusForbidden)
		return
	}

	// --- 4. Handle File Upload ---
	// Set a max upload size (e.g., 10 MB) to prevent abuse.
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		s.errorJSON(w, errors.New("file is too large (max 10MB)"), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("gpxFile") // "gpxFile" must match the name attribute in the form data.
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

	// Check for a valid, non-empty track.
	if len(gpxData.Tracks) == 0 || len(gpxData.Tracks[0].Segments) == 0 || len(gpxData.Tracks[0].Segments[0].Points) == 0 {
		s.errorJSON(w, errors.New("GPX file contains no track points"), http.StatusBadRequest)
		return
	}

	// Validate that the track's timestamps are within the event's allowed date range.
	firstPointTime := gpxData.Tracks[0].Segments[0].Points[0].Timestamp
	lastPointTime := gpxData.Tracks[0].Segments[0].Points[len(gpxData.Tracks[0].Segments[0].Points)-1].Timestamp

	// Give a little buffer (e.g., 1 hour) to account for timezone issues or GPS start delays.
	buffer := time.Hour * 1
	if firstPointTime.Before(event.StartDate.Add(-buffer)) || lastPointTime.After(event.EndDate.Add(buffer)) {
		msg := fmt.Sprintf("GPX track times (%s to %s) are outside the event dates (%s to %s)",
			firstPointTime.Format(time.RFC822), lastPointTime.Format(time.RFC822),
			event.StartDate.Format(time.RFC822), event.EndDate.Format(time.RFC822))
		s.errorJSON(w, errors.New(msg), http.StatusBadRequest)
		return
	}

	// --- 6. Store the File ---
	// If a file already exists for this racer, delete it first.
	if racer.GpxFilePath.String != "" {
		oldPath := filepath.Join(s.config.GpxPath, racer.GpxFilePath.String)
		if err := os.Remove(oldPath); err != nil {
			log.Printf("WARN: could not remove old gpx file %s: %v", oldPath, err)
		}
	}

	// Generate a unique, non-guessable filename.
	newFileName := fmt.Sprintf("group_%d_event_%d_racer_%d_%d.gpx", groupID, eventID, racerID, time.Now().UnixNano())
	newFilePath := filepath.Join(s.config.GpxPath, newFileName)

	// Create the new file on the server.
	dst, err := os.Create(newFilePath)
	if err != nil {
		s.errorJSON(w, errors.New("could not save file"), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy the uploaded file's content (which is still in memory as gpxBytes) to the destination.
	if _, err := dst.Write(gpxBytes); err != nil {
		s.errorJSON(w, errors.New("could not write file to disk"), http.StatusInternalServerError)
		return
	}

	// --- 7. Update Database Record ---
	err = s.db.UpdateRacerGpxFile(groupDB, racerID, newFileName)
	if err != nil {
		// If this fails, we should try to clean up the file we just created.
		os.Remove(newFilePath)
		s.errorJSON(w, errors.New("could not update racer record in database"), http.StatusInternalServerError)
		return
	}

	// --- 8. Success Response ---
	s.writeJSON(w, http.StatusCreated, envelope{
		"message": "GPX file uploaded and linked to racer successfully",
		"gpxPath": newFileName,
	})
}
