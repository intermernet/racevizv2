package realtime

import (
	"encoding/json"
	"log"
	"sync"
)

// Message is the same struct we used before, defining the shape of our real-time data.
type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Broker is the central hub for managing SSE client connections.
type Broker struct {
	// A map of client channels, keyed by user ID.
	// Each user gets a channel where messages are sent.
	clients map[int64]chan []byte
	// A mutex to protect concurrent access to the clients map.
	mu sync.RWMutex
}

// NewBroker creates a new Broker instance.
func NewBroker() *Broker {
	return &Broker{
		clients: make(map[int64]chan []byte),
	}
}

// AddClient registers a new client (a user's connection) with the broker.
func (b *Broker) AddClient(userID int64) chan []byte {
	b.mu.Lock()
	defer b.mu.Unlock()

	// If this user already has an active connection (e.g., from another tab),
	// we could close the old channel, but for simplicity, we'll just overwrite it.
	// The old connection will eventually time out or close.
	ch := make(chan []byte, 10) // Buffered channel
	b.clients[userID] = ch
	log.Printf("SSE client connected for user %d", userID)
	return ch
}

// RemoveClient unregisters a client from the broker.
func (b *Broker) RemoveClient(userID int64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if ch, ok := b.clients[userID]; ok {
		delete(b.clients, userID)
		close(ch)
		log.Printf("SSE client disconnected for user %d", userID)
	}
}

// NotifyUser sends a message to a specific user if they are connected.
func (b *Broker) NotifyUser(userID int64, message Message) {
	b.mu.RLock()
	clientChan, ok := b.clients[userID]
	b.mu.RUnlock()

	if ok {
		// Marshal the message to JSON.
		jsonMsg, err := json.Marshal(message)
		if err != nil {
			log.Printf("ERROR: could not marshal SSE message for user %d: %v", userID, err)
			return
		}

		// Send the message to the client's channel.
		// Use a non-blocking send to prevent the API handler from getting stuck
		// if the client's channel buffer is full.
		select {
		case clientChan <- jsonMsg:
			log.Printf("Sent SSE message to user %d", userID)
		default:
			log.Printf("WARN: SSE channel for user %d is full. Dropping message.", userID)
		}
	} else {
		log.Printf("INFO: User %d is not connected to SSE. Cannot send notification.", userID)
	}
}
