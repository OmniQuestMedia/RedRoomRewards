// Package ledger defines the immutable transaction data model for RedRoomRewards.
//
// WARNING: Never allow direct user/client manipulation. All entries must originate from
// audited service logic and API authentication per architecture and security policy.
package ledger

import (
	"time"
	"errors"
)

// TransactionType enumerates allowed, auditable transaction kinds.
type TransactionType string

const (
	TransactionTypeEarn      TransactionType = "EARN"
	TransactionTypeRedeem    TransactionType = "REDEEM"
	TransactionTypeAdjust    TransactionType = "ADJUST"
)

// Transaction is an immutable, append-only ledger entry representing
// a single balance change event. Entries must never be mutated or deleted.
type Transaction struct {
	ID            string          // Unique, audit-grade identifier (UUID v4 recommended)
	UserID        string          // Authenticated user/entity (never sensitive PII in clear)
	Type          TransactionType // EARN, REDEEM, ADJUST
	Amount        int64           // Signed integer (allow negative for REDUCE, positive for EARN/ADJUST)
	Reference     string          // Application-level reference/event/correlation id
	Timestamp     time.Time       // Creation time (UTC, RFC3339)
	CommittedBy   string          // Issuer (service account, operator login, system job)
	Comment       string          // Optional, non-PII description/reason
}

// NewTransaction validates and instantiates a new immutable transaction entry.
func NewTransaction(
	id, userID string,
	ttype TransactionType,
	amount int64,
	ref, committedBy, comment string,
) (*Transaction, error) {
	if id == "" || userID == "" || committedBy == "" {
		return nil, errors.New("missing required transaction field")
	}
	// Optionally perform type and reference validation here, per audit policy
	ts := time.Now().UTC()
	return &Transaction{
		ID:          id,
		UserID:      userID,
		Type:        ttype,
		Amount:      amount,
		Reference:   ref,
		Timestamp:   ts,
		CommittedBy: committedBy,
		Comment:     comment,
	}, nil
}