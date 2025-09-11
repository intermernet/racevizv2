package database

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"sync"

	_ "modernc.org/sqlite" // The pure Go SQLite driver
)

// Service is the central struct for managing all database interactions.
// It holds connections to the main DB and all group-specific DBs,
// and ensures thread-safe write operations via a map of mutexes.
type Service struct {
	mainDbPath      string // Full path to main.db
	groupDbBasePath string // Path to the directory where group DBs are stored

	mainDB      *sql.DB
	groupDBs    map[int64]*sql.DB
	dbMutexes   map[string]*sync.Mutex // Maps a DB filename (e.g., "main.db") to its mutex
	serviceLock sync.RWMutex           // A lock to protect the maps themselves from concurrent access
}

// NewService creates and initializes a new database service.
// It opens the main database connection and prepares the service for use.
func NewService(mainDbPath, groupDbBasePath string) (*Service, error) {
	// Open the main database. `?_foreign_keys=on` is crucial for data integrity.
	mainDB, err := sql.Open("sqlite", mainDbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("could not open main.db: %w", err)
	}

	// Ping the database to ensure the connection is alive.
	if err := mainDB.Ping(); err != nil {
		return nil, fmt.Errorf("could not connect to main.db: %w", err)
	}

	return &Service{
		mainDbPath:      mainDbPath,
		groupDbBasePath: groupDbBasePath,
		mainDB:          mainDB,
		groupDBs:        make(map[int64]*sql.DB),
		dbMutexes:       make(map[string]*sync.Mutex),
	}, nil
}

// getMutex retrieves or creates a mutex for a given database filename (e.g., "group_123.db").
// This ensures that we have one mutex per database file.
func (s *Service) getMutex(dbName string) *sync.Mutex {
	s.serviceLock.Lock() // Lock for writing to the map
	defer s.serviceLock.Unlock()

	if _, ok := s.dbMutexes[dbName]; !ok {
		s.dbMutexes[dbName] = &sync.Mutex{}
	}
	return s.dbMutexes[dbName]
}

// WriteToMainDB executes a write operation (INSERT, UPDATE, DELETE) on the main database
// within a transaction, protected by a mutex to ensure serial access.
func (s *Service) WriteToMainDB(writeFunc func(tx *sql.Tx) error) error {
	mutex := s.getMutex("main.db")
	mutex.Lock()
	defer mutex.Unlock()

	tx, err := s.mainDB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	// Execute the provided function. If it returns an error, rollback the transaction.
	if err := writeFunc(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("transaction error: %v, rollback error: %v", err, rbErr)
		}
		return err
	}

	// If the function was successful, commit the transaction.
	return tx.Commit()
}

// GetMainDB provides a direct, read-only connection to the main database.
func (s *Service) GetMainDB() *sql.DB {
	return s.mainDB
}

// GetGroupDB returns a connection to a specific group's database.
// It uses a read-lock to check for an existing connection and promotes to a
// write-lock only if a new connection needs to be created and stored in the map.
func (s *Service) GetGroupDB(groupID int64) (*sql.DB, error) {
	s.serviceLock.RLock()
	db, ok := s.groupDBs[groupID]
	s.serviceLock.RUnlock()

	if ok {
		return db, nil // Return existing connection
	}

	// If not found, acquire a full lock to create it.
	s.serviceLock.Lock()
	defer s.serviceLock.Unlock()

	// Double-check in case another goroutine created it while we were waiting for the lock.
	db, ok = s.groupDBs[groupID]
	if ok {
		return db, nil
	}

	// Create a new connection.
	dbName := fmt.Sprintf("group_%d.db", groupID)
	dbPath := filepath.Join(s.groupDbBasePath, dbName)
	db, err := sql.Open("sqlite", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("could not open %s: %w", dbName, err)
	}

	s.groupDBs[groupID] = db
	return db, nil
}

// Close safely closes all open database connections when the application shuts down.
func (s *Service) Close() {
	s.serviceLock.Lock()
	defer s.serviceLock.Unlock()

	s.mainDB.Close()
	for _, db := range s.groupDBs {
		db.Close()
	}
	log.Println("All database connections closed.")
}

// InitMainDB sets up the schema for the main database if the tables don't exist.
// This is idempotent and safe to run on every application start.
func (s *Service) InitMainDB() error {
	// Use the Write function to ensure this is thread-safe on first run
	return s.WriteToMainDB(func(tx *sql.Tx) error {
		// Users table
		_, err := tx.Exec(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY,
				email TEXT UNIQUE NOT NULL,
				username TEXT,
				password_hash TEXT,
				avatar_url TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);`)
		if err != nil {
			return err
		}

		// Groups table
		_, err = tx.Exec(`
			CREATE TABLE IF NOT EXISTS groups (
				id INTEGER PRIMARY KEY,
				name TEXT NOT NULL,
				creator_user_id INTEGER NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (creator_user_id) REFERENCES users (id) ON DELETE SET NULL
			);`)
		if err != nil {
			return err
		}

		// Group Members (many-to-many relationship between users and groups)
		_, err = tx.Exec(`
			CREATE TABLE IF NOT EXISTS group_members (
				group_id INTEGER NOT NULL,
				user_id INTEGER NOT NULL,
				joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (group_id, user_id),
				FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
				FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
			);`)
		if err != nil {
			return err
		}

		// Invitations table
		_, err = tx.Exec(`
			CREATE TABLE IF NOT EXISTS invitations (
				id INTEGER PRIMARY KEY,
				group_id INTEGER NOT NULL,
				inviter_user_id INTEGER NOT NULL,
				invitee_email TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
				FOREIGN KEY (inviter_user_id) REFERENCES users (id) ON DELETE CASCADE
			);`)
		if err != nil {
			return err
		}

		return nil
	})
}

// InitGroupDB sets up the schema for a specific group's database.
func (s *Service) InitGroupDB(groupID int64) error {
	groupDB, err := s.GetGroupDB(groupID)
	if err != nil {
		return err
	}

	// Create tables within the group-specific database.
	// No mutex needed here as this is typically called right after group creation,
	// which is already a mutex-protected write operation.

	// Events table
	_, err = groupDB.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id INTEGER PRIMARY KEY,
			group_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			start_date DATETIME,
			end_date DATETIME,
			event_type TEXT NOT NULL, -- 'race' or 'time_trial'
			creator_user_id INTEGER NOT NULL
		);`)
	if err != nil {
		return err
	}

	// Racers table
	_, err = groupDB.Exec(`
		CREATE TABLE IF NOT EXISTS racers (
			id INTEGER PRIMARY KEY,
			event_id INTEGER NOT NULL,
			uploader_user_id INTEGER NOT NULL,
			racer_name TEXT NOT NULL,
			track_color TEXT NOT NULL,
			track_avatar_url TEXT,
			gpx_file_path TEXT, -- The filename of the GPX track
			FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
		);`)
	if err != nil {
		return err
	}

	return nil
}
