# Architecture

## Boundaries per User Defaults
- Clearly outline the separation of concerns in user settings and defaults.
- Adherence to default user boundaries ensures predictable and reliable system behavior.

## Domain Clarity
- Define domains with explicit scope, ensuring each domain has a dedicated function and responsibility.
- Promotion design and card generation occur on the XXXChatNow system, while processing, enforcement of multipliers, and expiration logic remain strictly within RedRoomRewards. 
- User dashboards and reporting tools are implemented within client integrations, but RedRoomRewards ensures ledger integrity and accuracy.

## Clean Interfaces
- Foster minimal coupling by designing transparent and well-documented interfaces.
- All promotion payloads passed to RedRoomRewards must specify required fields such as `user_id`, `membership_level`, and point allocations. Optional overrides like `bonus_expiration_days` may modify defaults.

## Service Composition
- Enable reusable and composable services for seamless scalability and maintainability.
- Strictly separate token or purchase logic managed by XXXChatNow from points, ledger, and liability enforcement systems governed by RedRoomRewards.

## 2026-01-02
- Updated to clarify promotion payload responsibilities between XXXChatNow and RedRoomRewards.