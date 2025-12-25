# Database Migrations

**Status**: Scaffolded only - no migrations yet

## Purpose

Database migration scripts for schema versioning and evolution.

## Guidelines

When creating migrations:
- Use timestamp-based naming (e.g., `20251215_create_wallets_table.sql`)
- Include both `up` and `down` migration scripts
- Test migrations on development and staging first
- Never modify existing migrations (create new ones instead)
- Document breaking changes clearly

## Required Indexes

For performance, ensure these indexes exist when implementing:

### Core Wallet & Ledger Indexes
- Wallet lookups by userId (unique)
- Transaction lookups by userId
- Transaction lookups by idempotencyKey (unique)
- Transaction lookups by timestamp

### Ingest & DLQ Indexes (M1)
- **ingest_events.eventId** (unique) - Fast idempotency checks
- **ingest_events.status, ingest_events.nextAttemptAt** (compound) - Worker polling
- **dlq_events.eventId** (unique) - Replay lookups
- **dlq_events.movedToDLQAt** - Replay date range queries
- **dlq_events.eventType** - Event type filtering for replay
- **idempotency_records.pointsIdempotencyKey, idempotency_records.eventScope** (compound unique) - Prevent double processing

### Reservation & Hold Indexes (M1)
- **points_reservations.reservationId** (unique) - Primary lookup
- **points_reservations.userId, points_reservations.createdAt** (compound) - User reservation history
- **points_reservations.status, points_reservations.expiresAt** (compound) - Expiry cleanup job
- **points_reservations.expiresAt** (TTL index with expireAfterSeconds: 0) - Auto-cleanup

## Index Verification Script

Before production deployment, verify all indexes exist:

```javascript
// MongoDB shell script to verify M1 indexes
db = db.getSiblingDB('redroomrewards');

// Check ingest_events indexes
db.ingest_events.getIndexes();
// Expected: eventId (unique), status+nextAttemptAt (compound)

// Check dlq_events indexes
db.dlq_events.getIndexes();
// Expected: eventId (unique), movedToDLQAt, eventType

// Check idempotency_records indexes
db.idempotency_records.getIndexes();
// Expected: pointsIdempotencyKey+eventScope (compound unique)

// Check points_reservations indexes
db.points_reservations.getIndexes();
// Expected: reservationId (unique), userId+createdAt, status+expiresAt, expiresAt (TTL)
```

## Scaling Guidance (M1 Production Surfaces)

### Ingest Worker Scaling
- **Expected Load**: 100-1000 events/second
- **Index Strategy**: Compound index on (status, nextAttemptAt) enables efficient worker polling
- **Monitoring**: Track queue depth and processing latency
- **Alert Threshold**: Queue depth > 10,000 events or latency > 60 seconds
- **Scaling Action**: Increase maxConcurrentJobs or deploy additional worker instances

### DLQ & Replay Scaling
- **Expected Load**: < 1% of ingest volume under normal conditions
- **Index Strategy**: EventId for point lookups, movedToDLQAt for date ranges
- **Monitoring**: Track DLQ size and replay success rate
- **Alert Threshold**: DLQ size > 1000 events (indicates systemic issues)
- **Scaling Action**: Investigate root cause of failures, batch replay with maxEvents limit

### Reservation System Scaling
- **Expected Load**: 10-100 reservations/second
- **Index Strategy**: Compound indexes for user lookups and status filtering
- **Monitoring**: Track active reservation count and expiry job performance
- **Alert Threshold**: Active reservations > 100,000 or expiry job > 10 seconds
- **Scaling Action**: Implement batch expiry with limits, consider reservation TTL tuning

### Activity Feed (Future M2+)
- **Expected Load**: TBD based on feature requirements
- **Index Strategy**: userId + timestamp for timeline queries
- **Monitoring**: Query performance and feed generation latency
- **Scaling Action**: Implement pagination, caching, or read replicas

### Partner Admin Operations (Future M2+)
- **Expected Load**: < 100 operations/day (low volume, high importance)
- **Index Strategy**: Dispute ID, user ID, and status for admin queries
- **Monitoring**: Track dispute resolution time and fraud flag rates
- **Scaling Action**: Manual review queue management, automated fraud detection

## Audit Trail Requirements

All transaction tables must support 7+ year retention.
