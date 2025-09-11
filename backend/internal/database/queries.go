package database

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

// DBorTx is an interface that allows functions to accept either a `*sql.DB` for single queries
// or a `*sql.Tx` for operations within a transaction. This promotes code reuse.
type DBorTx interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	QueryRow(query string, args ...interface{}) *sql.Row
	Query(query string, args ...interface{}) (*sql.Rows, error)
}

// --- User Queries (on mainDB) ---

func (s *Service) CreateUser(db DBorTx, email, username, passwordHash string) (*User, error) {
	// An empty password hash is set to NULL in the DB for OAuth-only users.
	var hash interface{} = passwordHash
	if passwordHash == "" {
		hash = nil
	}
	query := `INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?);`
	res, err := db.Exec(query, email, username, hash)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetUserByID(db, id)
}

func (s *Service) GetUserByEmail(db DBorTx, email string) (*User, error) {
	query := `SELECT id, email, username, password_hash, avatar_url, created_at FROM users WHERE email = ?;`
	user := &User{}
	err := db.QueryRow(query, email).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.PasswordHash,
		&user.AvatarURL,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err // Returns sql.ErrNoRows if not found
	}
	return user, nil
}

func (s *Service) GetUserByID(db DBorTx, id int64) (*User, error) {
	query := `SELECT id, email, username, password_hash, avatar_url, created_at FROM users WHERE id = ?;`
	user := &User{}
	err := db.QueryRow(query, id).Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.PasswordHash,
		&user.AvatarURL,
		&user.CreatedAt,
	)
	return user, err
}

// UpdateUserAvatar updates the avatar_url for a specific user.
func (s *Service) UpdateUserAvatar(db DBorTx, userID int64, avatarURL string) error {
	query := `UPDATE users SET avatar_url = ? WHERE id = ?;`
	res, err := db.Exec(query, avatarURL, userID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("user not found")
	}
	return nil
}

// UpdateUser updates a user's username and/or password hash.
func (s *Service) UpdateUser(db DBorTx, userID int64, username, passwordHash string) error {
	var queryBuilder strings.Builder
	queryBuilder.WriteString("UPDATE users SET ")

	var args []interface{}
	if username != "" {
		queryBuilder.WriteString("username = ? ")
		args = append(args, username)
	}

	if passwordHash != "" {
		if len(args) > 0 {
			queryBuilder.WriteString(", ")
		}
		queryBuilder.WriteString("password_hash = ? ")
		args = append(args, passwordHash)
	}

	queryBuilder.WriteString("WHERE id = ?;")
	args = append(args, userID)

	_, err := db.Exec(queryBuilder.String(), args...)
	return err
}

func (s *Service) DeleteUser(db DBorTx, userID int64) error {
	_, err := db.Exec("DELETE FROM users WHERE id = ?", userID)
	return err
}

func (s *Service) GetUsersByIDs(db DBorTx, userIDs map[int64]struct{}) ([]User, error) {
	if len(userIDs) == 0 {
		return []User{}, nil
	}

	var ids []interface{}
	for id := range userIDs {
		ids = append(ids, id)
	}

	query := `SELECT id, email, username, avatar_url FROM users WHERE id IN (?` + strings.Repeat(",?", len(ids)-1) + `);`
	rows, err := db.Query(query, ids...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.ID, &user.Email, &user.Username, &user.AvatarURL); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

// --- Group & Membership Queries (on mainDB) ---

func (s *Service) CreateGroup(tx *sql.Tx, name string, creatorID int64) (*Group, error) {
	query := `INSERT INTO groups (name, creator_user_id) VALUES (?, ?);`
	res, err := tx.Exec(query, name, creatorID)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetGroupByID(tx, id)
}

func (s *Service) GetGroupByID(db DBorTx, id int64) (*Group, error) {
	query := `SELECT id, name, creator_user_id, created_at FROM groups WHERE id = ?;`
	group := &Group{}
	err := db.QueryRow(query, id).Scan(&group.ID, &group.Name, &group.CreatorUserID, &group.CreatedAt)
	return group, err
}

func (s *Service) GetGroupsByUserID(db DBorTx, userID int64) ([]*Group, error) {
	query := `
		SELECT g.id, g.name, g.creator_user_id, g.created_at
		FROM groups g
		JOIN group_members gm ON g.id = gm.group_id
		WHERE gm.user_id = ?
		ORDER BY g.created_at DESC;`

	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*Group
	for rows.Next() {
		group := &Group{}
		if err := rows.Scan(&group.ID, &group.Name, &group.CreatorUserID, &group.CreatedAt); err != nil {
			return nil, err
		}
		groups = append(groups, group)
	}
	return groups, nil
}

func (s *Service) GetMembersByGroupID(db DBorTx, groupID int64) ([]User, error) {
	query := `
		SELECT u.id, u.email, u.username, u.avatar_url, u.created_at
		FROM users u
		JOIN group_members gm ON u.id = gm.user_id
		WHERE gm.group_id = ?
		ORDER BY u.username;`

	rows, err := db.Query(query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []User
	for rows.Next() {
		member := User{}
		if err := rows.Scan(&member.ID, &member.Email, &member.Username, &member.AvatarURL, &member.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, nil
}

func (s *Service) AddGroupMember(tx *sql.Tx, groupID, userID int64) error {
	query := `INSERT INTO group_members (group_id, user_id) VALUES (?, ?);`
	_, err := tx.Exec(query, groupID, userID)
	return err
}

func (s *Service) RemoveGroupMember(tx *sql.Tx, groupID, userID int64) error {
	query := `DELETE FROM group_members WHERE group_id = ? AND user_id = ?;`
	_, err := tx.Exec(query, groupID, userID)
	return err
}

func (s *Service) IsUserGroupMember(db DBorTx, groupID, userID int64) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?);`
	var exists bool
	err := db.QueryRow(query, groupID, userID).Scan(&exists)
	return exists, err
}

// --- Invitation Queries (on mainDB) ---

func (s *Service) CreateInvitation(tx *sql.Tx, groupID, inviterID int64, inviteeEmail string) (*Invitation, error) {
	query := `INSERT INTO invitations (group_id, inviter_user_id, invitee_email) VALUES (?, ?, ?);`
	res, err := tx.Exec(query, groupID, inviterID, inviteeEmail)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetInvitationByID(tx, id)
}

func (s *Service) GetInvitationByID(db DBorTx, id int64) (*Invitation, error) {
	query := `SELECT id, group_id, inviter_user_id, invitee_email, status, created_at FROM invitations WHERE id = ?;`
	inv := &Invitation{}
	err := db.QueryRow(query, id).Scan(
		&inv.ID,
		&inv.GroupID,
		&inv.InviterUserID,
		&inv.InviteeEmail,
		&inv.Status,
		&inv.CreatedAt,
	)
	return inv, err
}

func (s *Service) GetPendingInvitationsByEmail(db DBorTx, email string) ([]*Invitation, error) {
	query := `
		SELECT
			i.id, i.group_id, g.name AS group_name, i.inviter_user_id, u.username AS inviter_name, i.invitee_email, i.status, i.created_at
		FROM invitations i
		JOIN groups g ON i.group_id = g.id
		JOIN users u ON i.inviter_user_id = u.id
		WHERE i.invitee_email = ? AND i.status = 'pending'
		ORDER BY i.created_at DESC;`

	rows, err := db.Query(query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invitations []*Invitation
	for rows.Next() {
		inv := &Invitation{}
		if err := rows.Scan(
			&inv.ID, &inv.GroupID, &inv.GroupName, &inv.InviterUserID,
			&inv.InviterName, &inv.InviteeEmail, &inv.Status, &inv.CreatedAt,
		); err != nil {
			return nil, err
		}
		invitations = append(invitations, inv)
	}
	return invitations, nil
}

func (s *Service) UpdateInvitationStatus(tx *sql.Tx, invitationID int64, status string) error {
	query := `UPDATE invitations SET status = ? WHERE id = ? AND status = 'pending';`
	res, err := tx.Exec(query, status, invitationID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("invitation not found, already actioned, or invalid status")
	}
	return nil
}

// --- Event & Racer Queries (on groupDB) ---

func (s *Service) CreateEvent(db DBorTx, groupID int64, name string, start, end *time.Time, eventType string, creatorID int64) (*Event, error) {
	query := `INSERT INTO events (group_id, name, start_date, end_date, event_type, creator_user_id) VALUES (?, ?, ?, ?, ?, ?);`
	res, err := db.Exec(query, groupID, name, start, end, eventType, creatorID)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetEventByID(db, id)
}

func (s *Service) GetEventByID(db DBorTx, id int64) (*Event, error) {
	query := `SELECT id, group_id, name, start_date, end_date, event_type, creator_user_id FROM events WHERE id = ?;`
	event := &Event{}
	err := db.QueryRow(query, id).Scan(&event.ID, &event.GroupID, &event.Name, &event.StartDate, &event.EndDate, &event.EventType, &event.CreatorUserID)
	return event, err
}

func (s *Service) GetEventsByGroupID(db DBorTx, groupID int64) ([]*Event, error) {
	query := `SELECT id, group_id, name, start_date, end_date, event_type, creator_user_id
			  FROM events
			  WHERE group_id = ?
			  ORDER BY start_date DESC;`

	rows, err := db.Query(query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*Event
	for rows.Next() {
		event := &Event{}
		if err := rows.Scan(&event.ID, &event.GroupID, &event.Name, &event.StartDate, &event.EndDate, &event.EventType, &event.CreatorUserID); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func (s *Service) DeleteEvent(db DBorTx, eventID int64) error {
	query := `DELETE FROM events WHERE id = ?;`
	res, err := db.Exec(query, eventID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("event not found or already deleted")
	}
	return nil
}

func (s *Service) AddRacerToEvent(db DBorTx, eventID, uploaderID int64, racerName, trackColor string, avatarURL sql.NullString) (*Racer, error) {
	query := `INSERT INTO racers (event_id, uploader_user_id, racer_name, track_color, track_avatar_url) VALUES (?, ?, ?, ?, ?);`
	res, err := db.Exec(query, eventID, uploaderID, racerName, trackColor, avatarURL)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetRacerByID(db, id)
}

func (s *Service) GetRacerByID(db DBorTx, id int64) (*Racer, error) {
	query := `SELECT id, event_id, uploader_user_id, racer_name, track_color, track_avatar_url, gpx_file_path FROM racers WHERE id = ?;`
	racer := &Racer{}
	err := db.QueryRow(query, id).Scan(
		&racer.ID, &racer.EventID, &racer.UploaderUserID,
		&racer.RacerName, &racer.TrackColor, &racer.TrackAvatarURL, &racer.GpxFilePath,
	)
	return racer, err
}

func (s *Service) GetRacersByEventID(db DBorTx, eventID int64) ([]*Racer, error) {
	query := `SELECT id, event_id, uploader_user_id, racer_name, track_color, track_avatar_url, gpx_file_path FROM racers WHERE event_id = ?;`
	rows, err := db.Query(query, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var racers []*Racer
	for rows.Next() {
		racer := &Racer{}
		if err := rows.Scan(
			&racer.ID, &racer.EventID, &racer.UploaderUserID,
			&racer.RacerName, &racer.TrackColor, &racer.TrackAvatarURL, &racer.GpxFilePath,
		); err != nil {
			return nil, err
		}
		racers = append(racers, racer)
	}
	return racers, nil
}

func (s *Service) UpdateRacerColor(db DBorTx, racerID int64, newColor string) error {
	query := `UPDATE racers SET track_color = ? WHERE id = ?;`
	res, err := db.Exec(query, newColor, racerID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("racer not found")
	}
	return nil
}

// UpdateRacerAvatar updates the track_avatar_url for a specific racer.
func (s *Service) UpdateRacerAvatar(db DBorTx, racerID int64, avatarURL string) error {
	query := `UPDATE racers SET track_avatar_url = ? WHERE id = ?;`
	res, err := db.Exec(query, avatarURL, racerID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("racer not found")
	}
	return nil
}

// DeleteRacer removes a single racer entry from the database.
func (s *Service) DeleteRacer(db DBorTx, racerID int64) error {
	query := `DELETE FROM racers WHERE id = ?;`
	res, err := db.Exec(query, racerID)
	if err != nil {
		return err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("racer not found or already deleted")
	}
	return nil
}

func (s *Service) UpdateRacerGpxFile(db DBorTx, racerID int64, filePath string) error {
	query := `UPDATE racers SET gpx_file_path = ? WHERE id = ?;`
	_, err := db.Exec(query, filePath, racerID)
	return err
}
