package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// RegisterRoutes sets up all the API endpoints and middleware for the application.
func (s *Server) RegisterRoutes(r *chi.Mux) {
	// --- Global Middleware (Applied to ALL routes) ---
	// These are safe and useful for both REST API and WebSocket upgrade requests.
	r.Use(middleware.Logger)    // Logs incoming requests
	r.Use(middleware.Recoverer) // Recovers from panics and returns a 500 error

	// --- Static File Server ---
	// This handler serves avatar files directly from the /public/avatars path.
	r.Handle("/public/avatars/*", http.StripPrefix("/public/avatars/", http.FileServer(http.Dir(s.config.AvatarPath))))

	// --- REST API Group with CORS ---
	// We create a new routing group specifically for our versioned REST API.
	// All routes defined within this group will be prefixed with "/api/v1".
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(cors.Handler(cors.Options{
			// In production, you would tighten this to your frontend's domain.
			AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000", s.config.FrontendURL},
			AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
			AllowCredentials: true,
			MaxAge:           300, // How long the browser can cache preflight results
		}))

		// Auth routes
		r.Post("/users/register", s.handleRegisterUser)
		r.Post("/users/login", s.handleLoginUser)
		r.Get("/auth/google/login", s.handleGoogleLogin)
		r.Get("/auth/google/callback", s.handleGoogleCallback)

		// Public data routes
		r.Get("/events/{groupID}/{eventID}/public", s.handleGetPublicEventData)

		// --- Authenticated REST Routes ---
		// This nested group uses our custom authMiddleware. Every route defined
		// inside this group will first be processed by the middleware, which
		// checks for a valid JWT.
		r.Group(func(r chi.Router) {
			r.Use(s.authMiddleware)

			// This is an authenticated endpoint for establishing the notification stream.
			r.Get("/notifications/stream", s.handleSSE)

			// User Routes
			r.Get("/users/me", s.handleGetMyProfile)
			r.Patch("/users/me", s.handleUpdateMyProfile)
			r.Delete("/users/me", s.handleDeleteMyProfile)
			r.Put("/users/me/avatar", s.handleUpdateMyAvatar)

			// Group Routes
			r.Get("/groups", s.handleGetMyGroups)
			r.Post("/groups", s.handleCreateGroup)
			r.Get("/groups/{groupID}", s.handleGetGroupDetails)
			r.Get("/groups/{groupID}/events", s.handleGetGroupEvents)
			r.Get("/groups/{groupID}/members", s.handleGetGroupMembers)
			r.Post("/groups/{groupID}/invite", s.handleInviteUserToGroup)
			r.Delete("/groups/{groupID}/members/{memberID}", s.handleRemoveGroupMember)

			// Invitation Routes
			r.Get("/invitations", s.handleGetMyInvitations)
			r.Post("/invitations/{invitationID}/accept", s.handleAcceptInvitation)
			r.Post("/invitations/{invitationID}/decline", s.handleDeclineInvitation)

			// Event Routes
			r.Get("/groups/{groupID}/events/{eventID}", s.handleGetEventDetails)
			r.Post("/groups/{groupID}/events", s.handleCreateEvent)
			r.Delete("/groups/{groupID}/events/{eventID}", s.handleDeleteEvent)

			// Racer & GPX Routes
			r.Get("/groups/{groupID}/events/{eventID}/racers", s.handleGetRacersForEvent)
			r.Post("/groups/{groupID}/events/{eventID}/racers", s.handleAddRacer)
			r.Delete("/groups/{groupID}/events/{eventID}/racers/{racerID}", s.handleDeleteRacer)
			r.Post("/groups/{groupID}/events/{eventID}/racers/{racerID}/gpx", s.handleGpxUpload)
			r.Patch("/groups/{groupID}/events/{eventID}/racers/{racerID}", s.handleUpdateRacerColor)
			r.Put("/groups/{groupID}/events/{eventID}/racers/{racerID}/avatar", s.handleUpdateRacerAvatar)
		})
	})
}
