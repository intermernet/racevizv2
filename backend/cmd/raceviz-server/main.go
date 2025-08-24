package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/intermernet/raceviz/internal/api"
	"github.com/intermernet/raceviz/internal/config"
	"github.com/intermernet/raceviz/internal/database"
	"github.com/intermernet/raceviz/internal/email"
	"github.com/intermernet/raceviz/internal/realtime"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

// main is the entry point for the RaceViz backend server.
func main() {
	// --- 1. Load Configuration ---
	// It's a common practice to load configuration from a .env file during development.
	// This allows for easy management of secrets and settings without hardcoding them.
	// In a production environment, these would typically be set as actual environment variables.
	if err := godotenv.Load(); err != nil {
		log.Println("INFO: No .env file found, using environment variables from the system.")
	}

	cfg, err := config.New()
	if err != nil {
		// A valid configuration is required to run, so we exit if it fails.
		log.Fatalf("FATAL: Failed to load application configuration: %v", err)
	}

	// --- 2. Ensure Required Directories Exist ---
	// The application needs specific directories to store its data. We ensure they
	// are created on startup to prevent runtime errors.
	if err := os.MkdirAll(cfg.DbPath, 0755); err != nil {
		log.Fatalf("FATAL: Failed to create database directory at %s: %v", cfg.DbPath, err)
	}
	if err := os.MkdirAll(cfg.GpxPath, 0755); err != nil {
		log.Fatalf("FATAL: Failed to create GPX storage directory at %s: %v", cfg.GpxPath, err)
	}

	log.Println("INFO: Application directories verified.")

	broker := realtime.NewBroker() // Changed from NewHub()

	emailService := email.NewEmailService(email.SMTPServerConfig{
		Host:     cfg.SmtpHost,
		Port:     cfg.SmtpPort,
		Username: cfg.SmtpUser,
		Password: cfg.SmtpPass,
		Sender:   cfg.SmtpSender,
	})

	log.Println("INFO: Realtime Hub and Email Service initialized.")

	// --- 3. Initialize Database Service ---
	// The database service manages all connections and ensures thread-safe writes.
	// We pass the full path to the main database file.
	mainDbFullPath := filepath.Join(cfg.DbPath, "main.db")
	dbService, err := database.NewService(mainDbFullPath, cfg.DbPath)
	if err != nil {
		log.Fatalf("FATAL: Failed to initialize database service: %v", err)
	}
	// 'defer' ensures that the Close() method is called when the main function exits,
	// gracefully closing all open database connections.
	defer dbService.Close()

	log.Println("INFO: Database service initialized successfully.")

	// --- 4. Initialize Main Database Schema ---
	// This step creates the necessary tables (users, groups, etc.) in the main
	// database if they do not already exist. It's safe to run on every startup.
	if err := dbService.InitMainDB(); err != nil {
		log.Fatalf("FATAL: Failed to initialize main database schema: %v", err)
	}

	log.Println("INFO: Main database schema verified.")

	// --- 5. Set Up API Server and Routes ---
	// Create a new instance of our API server, injecting the dependencies it needs
	// (like the config and the database service).
	serverAPI := api.NewServer(cfg, dbService, broker, emailService)

	// Create a new Chi router. Chi is a lightweight and powerful router for Go.
	router := chi.NewRouter()

	// Register all the application's API endpoints and middleware with the router.
	// This keeps the routing logic clean and organized in the `routes.go` file.
	serverAPI.RegisterRoutes(router)

	log.Println("INFO: API routes registered.")

	// --- 6. Start the HTTP Server ---
	// Announce the server is starting and on which address.
	log.Printf("INFO: RaceViz server starting on %s", cfg.ServerAddr)

	// Start the web server. ListenAndServe blocks until the server is stopped
	// or an unrecoverable error occurs.
	if err := http.ListenAndServe(cfg.ServerAddr, router); err != nil {
		log.Fatalf("FATAL: Failed to start server: %v", err)
	}
}
