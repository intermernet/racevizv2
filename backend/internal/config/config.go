package config

import (
	"errors"
	"net/url" // Import the url package for parsing
	"os"
	"path/filepath"
	"strconv"
)

// Config holds all configuration for the application. By centralizing these
// settings, we make the application easier to manage and deploy.
type Config struct {
	// --- Server & Paths ---
	ServerAddr  string
	DataPath    string
	DbPath      string
	GpxPath     string
	AvatarPath  string
	FrontendURL string

	// --- Security ---
	JwtSecret string

	// --- Email (SMTP) ---
	SmtpHost   string
	SmtpPort   int
	SmtpUser   string
	SmtpPass   string
	SmtpSender string

	// --- Google OAuth 2.0 ---
	GoogleOauthClientID     string
	GoogleOauthClientSecret string
	GoogleOauthRedirectURL  string

	// --- Parsed & Derived Fields ---
	// Parsed version of FrontendURL for easy access to its components (scheme, host, etc.).
	// This is used for WebSocket origin validation.
	ParsedFrontendURL *url.URL
}

// New creates a new Config instance by loading values from environment variables.
// It validates that critical variables are present and will return an error if
// the configuration is invalid, preventing the server from starting.
func New() (*Config, error) {
	// Attempt to parse the SMTP port from the environment.
	port, _ := strconv.Atoi(os.Getenv("SMTP_PORT"))

	// Load all configuration values directly from environment variables.
	cfg := &Config{
		ServerAddr:              os.Getenv("SERVER_ADDR"),
		DataPath:                os.Getenv("DATA_PATH"),
		JwtSecret:               os.Getenv("JWT_SECRET"),
		FrontendURL:             os.Getenv("FRONTEND_URL"),
		SmtpHost:                os.Getenv("SMTP_HOST"),
		SmtpPort:                port,
		SmtpUser:                os.Getenv("SMTP_USER"),
		SmtpPass:                os.Getenv("SMTP_PASS"),
		SmtpSender:              os.Getenv("SMTP_SENDER"),
		GoogleOauthClientID:     os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		GoogleOauthClientSecret: os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		GoogleOauthRedirectURL:  os.Getenv("GOOGLE_OAUTH_REDIRECT_URL"),
	}

	// --- Provide sensible defaults for non-critical values ---
	if cfg.DataPath == "" {
		cfg.DataPath = "./data"
	}
	if cfg.ServerAddr == "" {
		cfg.ServerAddr = ":8080"
	}

	// --- Validate critical required values ---
	// The application will "fail fast" if these are not set.
	if cfg.JwtSecret == "" {
		return nil, errors.New("FATAL: JWT_SECRET environment variable is not set")
	}
	if cfg.FrontendURL == "" {
		return nil, errors.New("FATAL: FRONTEND_URL environment variable is not set")
	}
	if cfg.GoogleOauthClientID == "" || cfg.GoogleOauthClientSecret == "" {
		return nil, errors.New("FATAL: Google OAuth credentials are not set")
	}

	// --- Parse and derive necessary fields ---
	parsedURL, err := url.Parse(cfg.FrontendURL)
	if err != nil {
		return nil, errors.New("FATAL: Invalid FRONTEND_URL format")
	}
	cfg.ParsedFrontendURL = parsedURL

	cfg.DbPath = filepath.Join(cfg.DataPath, "databases")
	cfg.GpxPath = filepath.Join(cfg.DataPath, "gpx_files")
	cfg.AvatarPath = filepath.Join(cfg.DataPath, "avatars")

	return cfg, nil
}
