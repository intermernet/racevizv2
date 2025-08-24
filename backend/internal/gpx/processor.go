package gpx

import (
	"os"
	"time"

	"github.com/tkrajina/gpxgo/gpx"
)

// TrackPoint represents a single, simplified point in a race track.
// This is the structure that will be sent to the frontend.
type TrackPoint struct {
	Lat       float64   `json:"lat"`
	Lon       float64   `json:"lon"`
	Timestamp time.Time `json:"timestamp"`
}

// TrackPath represents the complete, processed track for a single racer.
type TrackPath struct {
	RacerID    int64        `json:"racerId"`
	Points     []TrackPoint `json:"points"`
	TrackColor string       `json:"trackColor"`
}

// ProcessFile reads a GPX file from a given path, validates it, and processes it
// based on the event type. It returns a structured TrackPath ready for the frontend.
func ProcessFile(filePath, eventType string, racerID int64) (*TrackPath, error) {
	// 1. Read the GPX file from the filesystem.
	gpxBytes, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	// 2. Parse the file content using the gpxgo library.
	gpxData, err := gpx.ParseBytes(gpxBytes)
	if err != nil {
		return nil, err
	}

	// 3. Validate that the GPX data contains at least one track with points.
	if len(gpxData.Tracks) == 0 || len(gpxData.Tracks[0].Segments) == 0 || len(gpxData.Tracks[0].Segments[0].Points) == 0 {
		return nil, nil // Not an error, but an empty track that we can ignore.
	}

	// 4. If the event is a "Time Trial", normalize the timestamps.
	if eventType == "time_trial" {
		normalizeGpxTime(gpxData)
	}

	// 5. Convert the library's GPX format into our simplified TrackPoint slice.
	var trackPoints []TrackPoint
	for _, track := range gpxData.Tracks {
		for _, segment := range track.Segments {
			for _, point := range segment.Points {
				trackPoints = append(trackPoints, TrackPoint{
					Lat:       point.Latitude,
					Lon:       point.Longitude,
					Timestamp: point.Timestamp,
				})
			}
		}
	}

	// 6. Assemble the final TrackPath object.
	processedPath := &TrackPath{
		RacerID:    racerID,
		Points:     trackPoints,
		TrackColor: "",
	}

	return processedPath, nil
}

// normalizeGpxTime modifies a GPX structure in-place. It finds the timestamp of the
// very first point and then recalculates all other timestamps as durations
// relative to that start time, anchored to the Unix epoch.
func normalizeGpxTime(gpxData *gpx.GPX) {
	// Find the objective start time (the timestamp of the very first point).
	startTime := gpxData.Tracks[0].Segments[0].Points[0].Timestamp

	// Define a common, absolute start point for all tracks (the Unix epoch).
	epoch := time.Unix(0, 0).UTC()

	// Iterate through every single point in the GPX data.
	for i := range gpxData.Tracks {
		for j := range gpxData.Tracks[i].Segments {
			for k := range gpxData.Tracks[i].Segments[j].Points {
				point := &gpxData.Tracks[i].Segments[j].Points[k]

				// Calculate how long after the start this point occurred.
				durationSinceStart := point.Timestamp.Sub(startTime)

				// Set the point's new timestamp to be the epoch plus that duration.
				// Now, every track will start at "1970-01-01 00:00:00" and go from there.
				point.Timestamp = epoch.Add(durationSinceStart)
			}
		}
	}
}
