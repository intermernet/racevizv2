package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AppClaims defines the custom claims we want to include in our JWT.
// We embed jwt.RegisteredClaims to include standard claims like 'ExpiresAt'.
// UserID is our custom claim to identify the authenticated user.
type AppClaims struct {
	UserID int64 `json:"userID"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a new signed JWT string for a given user ID.
// The token will have a standard expiration time.
func GenerateJWT(userID int64, secret string) (string, error) {
	// Define the token's expiration time. 24 hours is a common choice.
	expirationTime := time.Now().Add(24 * time.Hour)

	// Create the claims object, including our custom UserID and the standard 'ExpiresAt' claim.
	claims := &AppClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	// Create a new token object with the specified signing method and claims.
	// HS256 (HMAC using SHA-256) is a common and secure signing method.
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign the token with our secret key to generate the final token string.
	// This signature ensures that the token cannot be tampered with by the client.
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateJWT parses and validates a JWT string.
// It checks the token's signature to ensure it hasn't been tampered with and
// verifies standard claims like the expiration time.
// If valid, it returns the custom claims.
func ValidateJWT(tokenString string, secret string) (*AppClaims, error) {
	// Parse the token string. The key function provides the secret key used to
	// verify the token's signature.
	token, err := jwt.ParseWithClaims(tokenString, &AppClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Security check: ensure the token's signing method is what we expect.
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})

	if err != nil {
		// This handles various errors, such as a malformed token, an invalid signature,
		// or an expired token (jwt.ErrTokenExpired).
		return nil, err
	}

	// If the token is valid, we can safely type-assert the claims to our AppClaims struct.
	if claims, ok := token.Claims.(*AppClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}
