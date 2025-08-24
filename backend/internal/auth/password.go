package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// argonParams defines the parameters for the Argon2id hashing algorithm.
// These parameters control the computational cost of hashing a password.
// It's a balance between security and server performance.
// - memory:      The amount of memory used by the algorithm (in KiB).
// - iterations:  The number of passes over the memory.
// - parallelism: The number of threads used by the algorithm.
// - saltLength:  The length of the random salt.
// - keyLength:   The length of the generated hash.
type argonParams struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
	saltLength  uint32
	keyLength   uint32
}

// DefaultParams provides a good starting point for security in a web application.
// These values should be reviewed periodically and may need to be increased
// as computing power grows.
var DefaultParams = &argonParams{
	memory:      64 * 1024, // 64 MB
	iterations:  3,
	parallelism: 2,
	saltLength:  16,
	keyLength:   32,
}

// HashPassword takes a plain-text password and returns a securely hashed string.
// The returned string includes the algorithm version, parameters, salt, and hash,
// all encoded and formatted for easy storage in a single database field.
func HashPassword(password string) (string, error) {
	p := DefaultParams

	// 1. Generate a cryptographically secure random salt.
	salt := make([]byte, p.saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	// 2. Generate the hash using Argon2id.
	// Argon2id is a hybrid version that provides resistance to both side-channel
	// and timing attacks, making it the recommended choice.
	hash := argon2.IDKey([]byte(password), salt, p.iterations, p.memory, p.parallelism, p.keyLength)

	// 3. Encode the salt and hash into Base64 for storage.
	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	// 4. Format the final string for storage.
	// Format: $argon2id$v=19$m=<memory>,t=<iterations>,p=<parallelism>$<salt>$<hash>
	// This format is standardized and allows for easy parsing and parameter upgrades in the future.
	format := "$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s"
	fullHash := fmt.Sprintf(format, argon2.Version, p.memory, p.iterations, p.parallelism, b64Salt, b64Hash)

	return fullHash, nil
}

// CheckPasswordHash compares a plain-text password with a stored hash to see if they match.
// It parses the stored hash string to extract the parameters and salt needed to re-compute the hash.
func CheckPasswordHash(password, storedHash string) bool {
	// 1. Parse the stored hash to extract its components.
	p, salt, hash, err := decodeHash(storedHash)
	if err != nil {
		// If the stored hash is malformed, it can't possibly match.
		return false
	}

	// 2. Re-compute the hash of the user-provided password using the *exact same* parameters and salt.
	otherHash := argon2.IDKey([]byte(password), salt, p.iterations, p.memory, p.parallelism, p.keyLength)

	// 3. Perform a constant-time comparison.
	// subtle.ConstantTimeCompare prevents timing attacks, where an attacker could
	// measure the time it takes to compare hashes to guess the correct hash byte by byte.
	if subtle.ConstantTimeCompare(hash, otherHash) == 1 {
		return true
	}

	return false
}

// decodeHash is a helper function to parse the formatted hash string.
func decodeHash(fullHash string) (p *argonParams, salt, hash []byte, err error) {
	vals := strings.Split(fullHash, "$")
	if len(vals) != 6 {
		return nil, nil, nil, errors.New("invalid stored hash format")
	}

	if vals[1] != "argon2id" {
		return nil, nil, nil, errors.New("unsupported hashing algorithm")
	}

	p = &argonParams{}
	_, err = fmt.Sscanf(vals[3], "m=%d,t=%d,p=%d", &p.memory, &p.iterations, &p.parallelism)
	if err != nil {
		return nil, nil, nil, err
	}

	salt, err = base64.RawStdEncoding.DecodeString(vals[4])
	if err != nil {
		return nil, nil, nil, err
	}
	p.saltLength = uint32(len(salt))

	hash, err = base64.RawStdEncoding.DecodeString(vals[5])
	if err != nil {
		return nil, nil, nil, err
	}
	p.keyLength = uint32(len(hash))

	return p, salt, hash, nil
}
