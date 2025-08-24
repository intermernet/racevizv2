package email

import (
	"fmt"
	"net/smtp"
	"net/url"
)

// SMTPServerConfig holds all the necessary configuration for connecting to an SMTP server.
type SMTPServerConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	Sender   string // The "From" email address
}

// EmailService provides a method for sending emails.
type EmailService struct {
	config SMTPServerConfig
	auth   smtp.Auth
}

// NewEmailService creates a new service for sending emails.
func NewEmailService(config SMTPServerConfig) *EmailService {
	// Set up authentication information.
	auth := smtp.PlainAuth("", config.Username, config.Password, config.Host)
	return &EmailService{
		config: config,
		auth:   auth,
	}
}

// SendInvitationEmail constructs and sends a group invitation email.
func (s *EmailService) SendInvitationEmail(recipientEmail, inviterName, groupName, frontendURL string) error {
	addr := fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)

	subject := fmt.Sprintf("You've been invited to join the group '%s' on RaceViz!", groupName)

	// We use the frontendURL to construct a proper registration link.
	// Adding the email as a query parameter can pre-fill the form on the frontend for a better user experience.
	registrationLink := fmt.Sprintf("%s/register?email=%s", frontendURL, url.QueryEscape(recipientEmail))

	// The body now uses the dynamic registrationLink.
	body := fmt.Sprintf(
		"Hi there,\n\n%s has invited you to join their group '%s' on RaceViz.\n\nFollow this link to sign up and accept your invitation:\n%s\n\nSee you on the track!\nThe RaceViz Team",
		inviterName,
		groupName,
		registrationLink,
	)

	message := []byte(
		"To: " + recipientEmail + "\r\n" +
			"From: " + s.config.Sender + "\r\n" +
			"Subject: " + subject + "\r\n" +
			"\r\n" +
			body + "\r\n")

	err := smtp.SendMail(addr, s.auth, s.config.Sender, []string{recipientEmail}, message)
	if err != nil {
		return fmt.Errorf("smtp error: %w", err)
	}

	return nil
}
