> **ARCHIVED 2026-07-11** — spent point-in-time report, quarantined per `docs/SOURCE_OF_TRUTH.md`. Not for current work; the live source of truth is `README.md` / the canonical docs in `docs/SOURCE_OF_TRUTH.md`. Git history preserves the original.

# CLEANUP CHECKLIST — RedRoomRewards

This document tracks all features, files, modules, and logic inherited from the
chatnow.zone stack that MUST be removed or audited out of this repository.

**Goal:** Ensure RedRoomRewards is strictly limited to isolated, auditable,
self-profile and points logic, with NO leftover social, media, or marketplace
code.

---

## Repository Structure Cleanup (completed 2026-04-17)

- [x] Remove `archive/xxxchatnow-seed/` (CEO Decision D1)
- [x] Remove retired feature spec and briefing documents (CEO Decision D1,
      RRR-P1-007)
- [x] Remove stale resolution docs (PR81, Jest, dependency conflict)
- [x] Remove duplicate `copilot-governance.md`
- [x] Consolidate 28 root markdown files to 8 (RRR-P4-004)
- [x] Move security docs to `docs/security/`
- [x] Move implementation/history docs to `docs/history/`
- [x] Move governance docs to `docs/governance/`
- [x] Update all cross-references (19 files)
- [x] Clean up `docs/commit to main as docs/` directory

---

## Mandatory Feature/Module Removal

All four legacy-concern sections below have been audited against `src/` as of
**2026-04-22 (RRR-WORK-001-A007)**. The audit grepped `src/` for each concern's
characteristic terms and found **no residual imports, services, models, or code
paths** matching any of them. Following A-004 (deletion of the dead
`api/src/modules/` NestJS tree), the only executable code under `src/` is wallet
/ ledger / earn / redeem / escrow / ingest / admin-ops / auth — all in-scope per
the RRR charter.

Audit command (verbatim):

```
grep -rniE "<concern-terms>" src/ --include="*.ts"
  | grep -v "\.spec\.ts\|\.test\.ts\|test-setup\|__tests__"
```

with the concern-terms enumerated inline per section. Matches returned were
limited to unrelated state-machine labels (`settling`, `refunding`), generic
logger payload keys (`message`, `errorMessage`), `PerformanceQueue` item
references, and MongoDB `connection` plumbing — none of which are legacy
chatnow.zone code.

### 1. Media & Broadcasting

- [x] All video broadcasting modules, streaming services, upload handlers.
- [x] All image/picture/media uploading/download/display capabilities.
- [x] All media/asset storage and related endpoints.

Verified-clean terms: `broadcast`, `livestream`, `stream`, `upload`, `media`,
`image`, `video`, `cdn`, `avatar`, `thumbnail`.

### 2. Social/Interactive Features

- [x] "Goal" systems (collective progress, reward milestones, shared "goals").
- [x] Liking functionality (user likes, upvotes, hearts, etc.).
- [x] Spinning wheel / chance-based game logic. _(Also locked out by Invariant
      "Slot machine mechanics: permanently retired" — CEO Decision D1.)_
- [x] User-to-user or "model-to-user" messaging (including chat, DMs, inboxes,
      notifications, public or private rooms).
- [x] Any direct messaging, notification, or "shout" systems.

Verified-clean terms: `goal`, `like`, `spin`, `wheel`, `chat`, `message`,
`inbox`, `dm`, `notification`, `follow(er|ing)`.

### 3. Market/Commerce Logic

- [x] Product listing/posting UIs, APIs, DB models (including "offers," "items,"
      or similar concepts).
- [x] Purchase, checkout, payment, or "sales" features as implemented for
      chatnow.zone.
- [x] Cart/wishlist, purchasing, or marketplace endpoints.
- [x] Any product-discovery, store, or model-monetization logic.

Verified-clean terms: `product`, `offer`, `item` (as in commerce — only
`PerformanceQueue` "queue item" remains, which is RRR-native), `checkout`,
`cart`, `wishlist`, `marketplace`, `storefront`, `catalog`.

### 4. Discovery/Social Browsing

- [x] User directory, search, or "profile browsing" features.
- [x] Any access to other user or "model" profiles (profile view endpoints,
      "people you may like," etc.).
- [x] Friends, following, or connection endpoints or UIs.
- [x] Any code path that reveals another user's existence except to admins.

Verified-clean terms: `directory`, `profile.?view`, `browse`, `discover`,
`friend`, `connection` (only MongoDB `connection` plumbing remains),
`following`.

---

## Other Areas for Audit

- [ ] Remove/disable all privileged, magic, or legacy admin backdoors.
      _(Follow-up: track under the SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY review
      cadence; not in Wave A scope.)_
- [ ] Remove integrations with video CDNs or chat providers. _(Follow-up: no
      such integrations currently exist in `src/`; confirm again during Wave C
      webhook / external-integration work.)_
- [ ] Confirm logging/audit does not record or expose sensitive data.
      _(Follow-up: addressed in part by removal of `console.error` in
      `src/api/receipt-endpoint.example.ts` under A-008; broader PII-in- logs
      sweep is a Wave C item.)_
- [ ] Remove or rewrite legacy seeders, tests, or fixtures tied to old features.
      _(Follow-up: `archive/xxxchatnow-seed/` is already removed; re-verify no
      seeders reference retired concepts during Wave C.)_
- [ ] Migrate `src/metrics/logger.ts` and `src/metrics/ingest-logger.ts` from
      direct `console.*` writes to pino while preserving the AlertSeverity /
      MetricEventType routing. The two files emit structured JSON to
      stdout/stderr by design (M1 production hardening) — they predate the pino
      migration in D-001 and are the last `console.*` callers under `src/`. They
      each carry a file-level `eslint-disable no-console` and a header comment
      noting the migration intent. _(Tracked post-Alpha: mapping AlertSeverity →
      pino levels needs explicit table, not a sed-and-pray pass.)_

---

## P0.5 — Ledger Compliance Flags (rule_applied_id audit, 2026-05-11)

Per coding doctrine §9.3, every ledger write must carry a `rule_applied_id` on
the entry. The following **production** service / worker files touch the ledger
(`.create`, `.save`, or construct `LedgerEntry` objects) but do **not** yet
reference `rule_applied_id`. They are flagged here for follow-up in Phase 1.

> **FIZ scope** — any fix to these files requires the `FIZ:` commit prefix with
> `REASON:`, `IMPACT:`, and `CORRELATION_ID:` fields, and mandatory human review
> before merge.

| File                                       | Why flagged                                                    |
| ------------------------------------------ | -------------------------------------------------------------- |
| `src/ledger/ledger.service.ts`             | Core ledger write path — `rule_applied_id` not in entry schema |
| `src/services/point-accrual.service.ts`    | Creates ledger entries on earn events                          |
| `src/services/admin-ops.service.ts`        | Admin earn/adjust creates ledger entries                       |
| `src/admin/admin-earn.service.ts`          | Admin earn path, ledger writes present                         |
| `src/redemption/redemption.service.ts`     | Redeem path creates ledger entries                             |
| `src/services/creator-gifting.service.ts`  | Gifting transactions write to ledger                           |
| `src/wallets/wallet.service.ts`            | Wallet mutation path, ledger entry creation                    |
| `src/services/settlement.service.ts`       | Settlement path writes ledger entries                          |
| `src/services/point-expiration.service.ts` | Expiry compensating entries                                    |
| `src/reservations/service.ts`              | Reservation hold/release ledger entries                        |
| `src/ingest-worker/worker.ts`              | Ingest worker creates ledger entries on events                 |
| `src/ingest-worker/replay.ts`              | Replay path writes ledger entries                              |
| `src/events/wallet-event-publisher.ts`     | Emits events after ledger writes                               |

**Recommended remediation (Phase 1):**

1. Add `rule_applied_id` to the `LedgerEntryDocument` schema
   (`src/db/models/ledger-entry.model.ts`) and to the `CreateLedgerEntryDto`.
2. Propagate a required `rule_applied_id` parameter through
   `LedgerService.create`.
3. Update all call sites in the files above to pass the applicable rule ID.
4. Add a CI check (`scripts/ci/no-hardcoded-balance.js` pattern) that fails the
   build if any ledger write omits `rule_applied_id`.

---

Mark each item as complete when the module, API, endpoint, UI, or DB schema is
purged. For ambiguous cases, escalate to architecture review.

---
