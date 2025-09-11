package gpx

import (
	"math"
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
	RacerID       int64        `json:"racerId"`
	Points        []TrackPoint `json:"points"`
	TrackColor    string       `json:"trackColor"`
	TotalDistance float64      `json:"totalDistance"` // Total distance of the track in meters
}

// DistanceTo calculates the great-circle distance to another point using the Haversine formula.
func (p *TrackPoint) DistanceTo(p2 *TrackPoint) float64 {
	const R = 6371e3 // Earth's radius in meters
	lat1Rad := p.Lat * math.Pi / 180
	lat2Rad := p2.Lat * math.Pi / 180
	deltaLatRad := (p2.Lat - p.Lat) * math.Pi / 180
	deltaLonRad := (p2.Lon - p.Lon) * math.Pi / 180

	a := math.Sin(deltaLatRad/2)*math.Sin(deltaLatRad/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLonRad/2)*math.Sin(deltaLonRad/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
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

	// 7. Calculate total track distance
	var totalDistance float64
	for i := 0; i < len(trackPoints)-1; i++ {
		totalDistance += trackPoints[i].DistanceTo(&trackPoints[i+1])
	}

	// 6. Assemble the final TrackPath object.
	processedPath := &TrackPath{
		RacerID:       racerID,
		Points:        trackPoints,
		TrackColor:    "",
		TotalDistance: totalDistance,
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
