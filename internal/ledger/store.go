// Package ledger implements the append-only store interface for immutable transactions.
//
// WARNING: This is an append-only contract. No mutation or deletion of transactions
// is supported. Storage implementations must never permit updates or removals of entries.
//
// Reference: SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md
package ledger

import (
	"errors"
	"sync"
)

// Store is the contract for an append-only persistent ledger.
type Store interface {
	// Append adds a new immutable transaction to the ledger.
	// Returns error if the tx.ID already exists (idempotency enforced).
	Append(tx *Transaction) error

	// GetByUser returns all transactions for a user, ordered oldest->newest.
	GetByUser(userID string) ([]*Transaction, error)

	// GetByReference retrieves transactions by reference/correlation id (for reconciliation).
	GetByReference(ref string) ([]*Transaction, error)

	// All returns all transactions (rare for prod; for backup/audit, restrict in API use).
	All() ([]*Transaction, error)
}

// InMemoryStore is a stub, production-unsafe in-memory append-only ledger.
// Used for unit testing and early prototyping.
// Not concurrency/atomicity safe for prod without further controls.
type InMemoryStore struct {
	mu           sync.RWMutex
	byID         map[string]*Transaction
	byUser       map[string][]*Transaction
	byRef        map[string][]*Transaction
	ordered      []*Transaction
}

// NewInMemoryStore creates a new, empty append-only ledger.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		byID:   make(map[string]*Transaction),
		byUser: make(map[string][]*Transaction),
		byRef:  make(map[string][]*Transaction),
	}
}

// Append inserts a new transaction if its ID is unique; otherwise error.
func (s *InMemoryStore) Append(tx *Transaction) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.byID[tx.ID]; exists {
		return errors.New("duplicate transaction ID (idempotency enforced)")
	}
	s.byID[tx.ID] = tx
	s.byUser[tx.UserID] = append(s.byUser[tx.UserID], tx)
	s.byRef[tx.Reference] = append(s.byRef[tx.Reference], tx)
	s.ordered = append(s.ordered, tx)
	return nil
}

func (s *InMemoryStore) GetByUser(userID string) ([]*Transaction, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cpy := make([]*Transaction, len(s.byUser[userID]))
	copy(cpy, s.byUser[userID])
	return cpy, nil
}

func (s *InMemoryStore) GetByReference(ref string) ([]*Transaction, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cpy := make([]*Transaction, len(s.byRef[ref]))
	copy(cpy, s.byRef[ref])
	return cpy, nil
}

func (s *InMemoryStore) All() ([]*Transaction, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cpy := make([]*Transaction, len(s.ordered))
	copy(cpy, s.ordered)
	return cpy, nil
}
