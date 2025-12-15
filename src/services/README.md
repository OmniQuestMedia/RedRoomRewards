# Services Module

**Status**: Scaffolded only - no implementation yet

## Purpose

The services module contains:
- Business logic and domain services
- Integration with external systems
- Orchestration of ledger and wallet operations
- Event publishing and handling

## Key Principles

- **Server-Side Authority**: All business logic runs server-side
- **API Boundaries**: Clear separation from external systems (XXXChatNow)
- **Facts Not Logic**: Accept factual data, not game logic from external systems
- **Graceful Degradation**: Handle external system failures gracefully

## Future Implementation

When implementing this module:
- Create domain service classes
- Implement integration adapters
- Add event bus integration
- Include rate limiting and throttling
- Add comprehensive validation

See `/COPILOT_GOVERNANCE.md` Section 2.4 for API boundary rules.
