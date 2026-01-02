## 2026-01-02

- **Promotion Payload Responsibilities**:
  - Promotions and loyalty reward cards are designed within XXXChatNow, including point allocation (base/bonus).
  - Promotion payloads contain only essential information (`user_id`, `membership_level`, `base_points`, `bonus_points`, optionally `model_id` and `bonus_expiration_days`).
  - RedRoomRewards processes the payload, applying multipliers and expiration rules based on membership level, with defaults of 365+1 days (base) and 45+1 days (bonus).
  - Explicit expiration overrides in payloads take precedence, e.g., for campaigns like Pride Week.

- **Boundary Clarification**:
  - XXXChatNow handles all promotion design and payload preparation.
  - RedRoomRewards ensures ledger immutability and applies deterministic, auditable rules to points.

- **Courtesy Rules**:
  - All expiration timelines include a courtesy "+1 day" for user convenience.

- **Immutability & Traceability**:
  - Transactions from promotion payload processing are strictly immutable and logged in the ledger.

These decisions align with clear service boundaries and ensure consistency across promotion processing and loyalty mechanics.
