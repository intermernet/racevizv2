package api

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/intermernet/raceviz/internal/auth"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	googleOauth2 "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

// --- Structs for JSON Payloads ---

// registerUserPayload defines the structure of the JSON body expected for user registration.
type registerUserPayload struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// loginUserPayload defines the structure of the JSON body expected for user login.
type loginUserPayload struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// --- OAUTH LOGIC ---

// googleOAuthConfig holds the configuration for our Google OAuth2 client.
// It's a global variable within this package, initialized once.
var googleOAuthConfig *oauth2.Config

// initOAuthConfig initializes the global googleOAuthConfig variable.
// It must be called once at server startup (e.g., from the NewServer constructor).
func (s *Server) initOAuthConfig() {
	googleOAuthConfig = &oauth2.Config{
		ClientID:     s.config.GoogleOauthClientID,
		ClientSecret: s.config.GoogleOauthClientSecret,
		RedirectURL:  s.config.GoogleOauthRedirectURL,
		Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
		Endpoint:     google.Endpoint,
	}
}

// generateStateOauthCookie creates a random state string and sets it as an HttpOnly cookie
// to prevent Cross-Site Request Forgery (CSRF) attacks during the OAuth flow.
func generateStateOauthCookie(w http.ResponseWriter) string {
	b := make([]byte, 16)
	rand.Read(b)
	state := hex.EncodeToString(b)
	cookie := &http.Cookie{
		Name:     "oauthstate",
		Value:    state,
		Expires:  time.Now().Add(10 * time.Minute),
		HttpOnly: true, // Prevents client-side script access
	}
	http.SetCookie(w, cookie)
	return state
}

// handleGoogleLogin is the entry point for the OAuth flow. It redirects the user to Google's consent page.
func (s *Server) handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if googleOAuthConfig == nil {
		s.initOAuthConfig()
	}
	state := generateStateOauthCookie(w)
	url := googleOAuthConfig.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// handleGoogleCallback is where Google redirects the user back after they grant consent.
func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	// 1. Validate the state cookie to ensure the request is legitimate.
	oauthState, _ := r.Cookie("oauthstate")
	if r.FormValue("state") != oauthState.Value {
		s.errorJSON(w, errors.New("invalid oauth state"), http.StatusUnauthorized)
		return
	}

	// 2. Exchange the authorization code from Google for an access token.
	code := r.FormValue("code")
	token, err := googleOAuthConfig.Exchange(context.Background(), code)
	if err != nil {
		s.errorJSON(w, fmt.Errorf("failed to exchange code for token: %w", err), http.StatusInternalServerError)
		return
	}

	// 3. Use the access token to get the user's profile info from Google's API.
	oauth2Service, err := googleOauth2.NewService(context.Background(), option.WithTokenSource(googleOAuthConfig.TokenSource(context.Background(), token)))
	if err != nil {
		s.errorJSON(w, fmt.Errorf("failed to create oauth service: %w", err), http.StatusInternalServerError)
		return
	}
	userInfo, err := oauth2Service.Userinfo.Get().Do()
	if err != nil {
		s.errorJSON(w, fmt.Errorf("failed to get user info: %w", err), http.StatusInternalServerError)
		return
	}

	// 4. "Upsert" user: Find the user by email or create a new one if they don't exist.
	user, err := s.db.GetUserByEmail(s.db.GetMainDB(), userInfo.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) { // User does not exist, so create them.
			err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
				var createErr error
				// Note: password_hash is empty for OAuth-only users.
				user, createErr = s.db.CreateUser(tx, userInfo.Email, userInfo.Name, "")
				return createErr
			})
			if err != nil {
				s.errorJSON(w, errors.New("failed to create user"), http.StatusInternalServerError)
				return
			}
		} else { // A different database error occurred.
			s.errorJSON(w, err, http.StatusInternalServerError)
			return
		}
	}

	// 5. Generate our application's own JWT for the user for session management.
	appToken, err := auth.GenerateJWT(user.ID, s.config.JwtSecret)
	if err != nil {
		s.errorJSON(w, errors.New("could not generate token"), http.StatusInternalServerError)
		return
	}

	// 6. Redirect the user back to the frontend's callback page with the token in the URL.
	redirectURL := fmt.Sprintf("%s/auth/callback?token=%s", s.config.FrontendURL, appToken)
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// --- PASSWORD-BASED AUTH ---

// handleRegisterUser handles creation of a new user account via email/password.
func (s *Server) handleRegisterUser(w http.ResponseWriter, r *http.Request) {
	var payload registerUserPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	if payload.Email == "" || payload.Password == "" || payload.Username == "" {
		s.errorJSON(w, errors.New("username, email, and password are required"), http.StatusBadRequest)
		return
	}
	if len(payload.Password) < 8 {
		s.errorJSON(w, errors.New("password must be at least 8 characters long"), http.StatusBadRequest)
		return
	}

	_, err := s.db.GetUserByEmail(s.db.GetMainDB(), payload.Email)
	if err == nil {
		s.errorJSON(w, errors.New("a user with this email address already exists"), http.StatusConflict)
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		s.errorJSON(w, errors.New("internal server error"), http.StatusInternalServerError)
		return
	}

	hashedPassword, err := auth.HashPassword(payload.Password)
	if err != nil {
		s.errorJSON(w, errors.New("internal server error"), http.StatusInternalServerError)
		return
	}

	err = s.db.WriteToMainDB(func(tx *sql.Tx) error {
		_, err := s.db.CreateUser(tx, payload.Email, payload.Username, hashedPassword)
		return err
	})
	if err != nil {
		s.errorJSON(w, errors.New("could not create user"), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusCreated, envelope{"message": "user registered successfully"})
}

// handleLoginUser handles authentication for an existing user via email/password.
func (s *Server) handleLoginUser(w http.ResponseWriter, r *http.Request) {
	var payload loginUserPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		s.errorJSON(w, errors.New("bad request: could not decode JSON"), http.StatusBadRequest)
		return
	}

	if payload.Email == "" || payload.Password == "" {
		s.errorJSON(w, errors.New("email and password are required"), http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByEmail(s.db.GetMainDB(), payload.Email)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			s.errorJSON(w, errors.New("invalid email or password"), http.StatusUnauthorized)
			return
		}
		s.errorJSON(w, errors.New("internal server error"), http.StatusInternalServerError)
		return
	}

	// Check if the user is an OAuth-only user (no password set).
	// We check both Valid and the String value for robustness.
	if !user.PasswordHash.Valid || user.PasswordHash.String == "" {
		s.errorJSON(w, errors.New("please log in using the method you signed up with"), http.StatusUnauthorized)
		return
	}

	// Check the provided password against the stored hash.
	match := auth.CheckPasswordHash(payload.Password, user.PasswordHash.String)
	if !match {
		s.errorJSON(w, errors.New("invalid email or password"), http.StatusUnauthorized)
		return
	}

	// Generate a JWT for the authenticated session.
	tokenString, err := auth.GenerateJWT(user.ID, s.config.JwtSecret)
	if err != nil {
		s.errorJSON(w, errors.New("could not generate token"), http.StatusInternalServerError)
		return
	}

	// Return the token AND the clean user profile DTO to the frontend.
	response := envelope{
		"token": tokenString,
		"user":  toUserResponse(user),
	}
	s.writeJSON(w, http.StatusOK, response)
}
