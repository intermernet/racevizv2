package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/intermernet/raceviz/internal/database"
	"github.com/intermernet/raceviz/internal/gpx"

	"github.com/go-chi/chi/v5"
)

// --- Structs for JSON Payloads & Responses ---

// createEventPayload defines the structure for creating a new event.
// StartDate and EndDate are optional, used only for 'race' type events.
type createEventPayload struct {
	Name      string `json:"name"`
	StartDate string `json:"startDate,omitempty"`
	EndDate   string `json:"endDate,omitempty"`
	EventType string `json:"eventType"` // "race" or "time_trial"
}

// addRacerPayload defines the structure for adding a racer to an event.
type addRacerPayload struct {
	RacerName string `json:"racerName"`
}

// publicEventDataResponse is the DTO for the public-facing map data.
type publicEventDataResponse struct {
	Event database.Event  `json:"event"`
	Users []UserResponse  `json:"users"`
	Paths []gpx.TrackPath `json:"paths"`
}

// --- HTTP Handlers ---

// handleGetEventDetails fetches the details for a single event.
func (s *Server) handleGetEventDetails(w http.ResponseWriter, r *http.Request) {
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

	event, err := s.db.GetEventByID(groupDB, eventID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, errors.New("event not found"), http.StatusNotFound)
			return
		}
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, envelope{"event": event})
}

// handleCreateEvent handles the creation of a new event within a group.
// It now correctly handles date logic based on the event type.
func (s *Server) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	creatorID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupID, err := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	if err != nil {
		s.errorJSON(w, errors.New("invalid group ID"), http.StatusBadRequest)
		return
	}

	isMember, err := s.db.IsUserGroupMember(s.db.GetMainDB(), groupID, creatorID)
	if err != nil || !isMember {
		s.errorJSON(w, errors.New("forbidden: you are not a member of this group"), http.StatusForbidden)
		return
	}

	var payload createEventPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	var startDate, endDate *time.Time

	if payload.Name == "" || payload.EventType == "" {
		s.errorJSON(w, errors.New("name and eventType are required"), http.StatusBadRequest)
		return
	}

	if payload.EventType == "race" {
		if payload.StartDate == "" {
			s.errorJSON(w, errors.New("startDate is required for race events"), http.StatusBadRequest)
			return
		}
		parsedStart, err := time.Parse(time.RFC3339, payload.StartDate)
		if err != nil {
			s.errorJSON(w, errors.New("invalid startDate format, use RFC3339"), http.StatusBadRequest)
			return
		}
		startDate = &parsedStart

		parsedEnd := parsedStart
		if payload.EndDate != "" {
			parsedEnd, err = time.Parse(time.RFC3339, payload.EndDate)
			if err != nil || parsedEnd.Before(parsedStart) {
				s.errorJSON(w, errors.New("endDate must be after startDate"), http.StatusBadRequest)
				return
			}
		}
		endDate = &parsedEnd
	} else if payload.EventType != "time_trial" {
		s.errorJSON(w, errors.New("eventType must be 'race' or 'time_trial'"), http.StatusBadRequest)
		return
	}

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	newEvent, err := s.db.CreateEvent(groupDB, groupID, payload.Name, startDate, endDate, payload.EventType, creatorID)
	if err != nil {
		s.errorJSON(w, errors.New("failed to create event"), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusCreated, envelope{"event": newEvent})
}

// handleDeleteEvent handles deleting an event, its racers, and their associated GPX files.
func (s *Server) handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	deleterID, err := s.getUserIDFromContext(r)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	groupID, _ := strconv.ParseInt(chi.URLParam(r, "groupID"), 10, 64)
	eventID, _ := strconv.ParseInt(chi.URLParam(r, "eventID"), 10, 64)

	groupDB, err := s.db.GetGroupDB(groupID)
	if err != nil {
		s.errorJSON(w, errors.New("group database not found"), http.StatusInternalServerError)
		return
	}

	event, err := s.db.GetEventByID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, errors.New("event not found"), http.StatusNotFound)
		return
	}
	if event.CreatorUserID != deleterID {
		s.errorJSON(w, errors.New("forbidden: only the event creator can delete this event"), http.StatusForbidden)
		return
	}

	racers, err := s.db.GetRacersByEventID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, errors.New("could not retrieve racers for cleanup"), http.StatusInternalServerError)
		return
	}

	if err := s.db.DeleteEvent(groupDB, eventID); err != nil {
		s.errorJSON(w, errors.New("failed to delete event records"), http.StatusInternalServerError)
		return
	}

	for _, racer := range racers {
		if racer.GpxFilePath.Valid {
			filePath := filepath.Join(s.config.GpxPath, racer.GpxFilePath.String)
			if err := os.Remove(filePath); err != nil {
				log.Printf("WARN: failed to delete gpx file %s: %v", filePath, err)
			}
		}
	}

	s.writeJSON(w, http.StatusOK, envelope{"message": "event deleted successfully"})
}

// handleGetPublicEventData provides all necessary data for the map view.
func (s *Server) handleGetPublicEventData(w http.ResponseWriter, r *http.Request) {
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
		s.errorJSON(w, fmt.Errorf("group database %d not found", groupID), http.StatusInternalServerError)
		return
	}

	event, err := s.db.GetEventByID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, errors.New("event not found"), http.StatusNotFound)
		return
	}

	racers, err := s.db.GetRacersByEventID(groupDB, eventID)
	if err != nil {
		s.errorJSON(w, err, http.StatusInternalServerError)
		return
	}

	uploaderIDs := make(map[int64]struct{})
	for _, racer := range racers {
		uploaderIDs[racer.UploaderUserID] = struct{}{}
	}
	dbUsers, err := s.db.GetUsersByIDs(s.db.GetMainDB(), uploaderIDs)
	if err != nil {
		s.errorJSON(w, errors.New("could not retrieve user data"), http.StatusInternalServerError)
		return
	}
	userResponses := toUserResponseList(dbUsers)

	racerColorMap := make(map[int64]string)
	for _, racer := range racers {
		racerColorMap[racer.ID] = racer.TrackColor
	}

	var trackPaths []gpx.TrackPath
	for _, racer := range racers {
		if !racer.GpxFilePath.Valid {
			continue
		}
		fullPath := filepath.Join(s.config.GpxPath, racer.GpxFilePath.String)
		processedPath, err := gpx.ProcessFile(fullPath, event.EventType, racer.ID)
		if err != nil {
			log.Printf("WARN: could not process GPX file %s for event %d: %v", racer.GpxFilePath.String, event.ID, err)
			continue
		}
		if processedPath != nil {
			if color, ok := racerColorMap[racer.ID]; ok {
				processedPath.TrackColor = color
			}
			trackPaths = append(trackPaths, *processedPath)
		}
	}

	response := publicEventDataResponse{
		Event: *event,
		Users: userResponses,
		Paths: trackPaths,
	}

	s.writeJSON(w, http.StatusOK, response)
}
