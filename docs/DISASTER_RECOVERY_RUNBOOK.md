# Disaster Recovery Runbook — RedRoomRewards

**Audience:** OQMI ops / on-call when something is on fire at scale. Sibling to `docs/OPERATIONAL_RUNBOOK.md`; this doc covers the larger-blast-radius events that the day-to-day runbook punts on.

**Scope:** events where standard incident response (rollback, restart, restore-one-record) is not enough — typically because a region, a provider, or a data store is partially or fully unavailable.

**Status:** draft. Becomes runnable once the first DR drill (per §13) has been completed.

**Authority:** defers to `docs/OPERATIONAL_RUNBOOK.md` §0 invariants — even in DR, the ledger is append-only and `Wallet.balance == sum(PointLot.remaining) == sum(LedgerEntry.delta)` must hold. If a procedure here would violate either, **stop and escalate**.

---

## 1. The mental model

DR planning is risk classification. For each failure mode you need to know: how much data can we lose (RPO), how long can we be down (RTO), and which procedure brings us back.

Production targets — not yet validated in a drill, see §13:

| Metric                              | Target                | Notes                                                             |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------- |
| **RPO (Recovery Point Objective)**  | ≤ 15 minutes of writes | Atlas continuous backup PITR; nightly logical export is fallback  |
| **RTO (Recovery Time Objective)**   | ≤ 4 hours              | Aggressive for a 2-merchant closed beta; relax if observed reality says otherwise |
| **MTTR (Mean Time To Recover)**     | ≤ 1 hour for common faults | Day-to-day stuff — covered by OPERATIONAL_RUNBOOK              |
| **Ledger durability**               | Zero tolerance for loss | Even at the cost of extended downtime — never acknowledge a write that wasn't durably committed |

Staging targets are looser (best-effort RPO/RTO; the ledger durability rule still applies).

---

## 2. Failure modes — what we plan for

| ID    | Failure                                                | Likelihood | Severity | Procedure |
| ----- | ------------------------------------------------------ | ---------- | -------- | --------- |
| DR-1  | Single App Platform instance crash                     | high       | low      | §3 (auto-recovery; LB drains)         |
| DR-2  | App Platform full outage (region or provider)          | low        | high     | §4 (failover or wait)                 |
| DR-3  | Atlas cluster degradation (one node lost)              | medium     | medium   | §5 (replica heals automatically)      |
| DR-4  | Atlas cluster full outage (all replicas down)          | low        | high     | §6 (PITR restore to sibling cluster)  |
| DR-5  | Atlas regional outage (ca-central-1 entirely)          | very low   | critical | §7 (multi-region restore — see notes) |
| DR-6  | Keycloak Droplet unrecoverable                         | low        | high     | §8 (rebuild from realm export)        |
| DR-7  | Cloudflare / DNS outage                                | low        | medium   | §9 (origin-direct fallback)           |
| DR-8  | Secret leak (HMAC key, JWT_SECRET, Mongo creds)        | low        | high     | §10 (skip-overlap rotation; OPERATIONAL_RUNBOOK §5.4) |
| DR-9  | Data corruption — silent bad write at scale            | very low   | critical | §11 (PITR + ledger replay)            |
| DR-10 | Lost realm signing keys                                | very low   | critical | §12 (mass session invalidation; bootstrap new keys) |

"Likelihood" is qualitative; revisit after the first 90 days of production data.

---

## 3. DR-1 — single App Platform instance crash

Auto-recovery. The DO App Platform load balancer drains the dead instance and routes traffic to surviving instances. If `≥ 2 instances` is configured (production minimum per `PRODUCTION_DEPLOY_SPEC.md` §4.1), there is no perceptible outage.

**Operator action:** none, unless it recurs. Recurrence within 24h escalates to investigating the deploy SHA.

---

## 4. DR-2 — App Platform full outage

DO App Platform region or provider down. The Keycloak Droplet may also be affected (same region). Atlas may or may not be — Atlas is on AWS, App Platform is on DO — so the data is likely intact.

**Procedure:**

1. Confirm via DO status page. Rule out a misconfigured DNS / WAF first — the most common "App Platform is down" alert is actually Cloudflare or DNS.
2. If genuinely DO-side and ETA > 2 hours: prepare the failover procedure (§7 below for the Atlas-only equivalent; for App Platform the same shape applies — stand up a Fly.io or Render emergency instance pointed at the production Atlas cluster).
3. Do **not** attempt failover if DO ETA is < 1 hour. The failover itself introduces risk.
4. While down: post to the status page; notify integrators directly (small list — RedRoomPleasures plugin author, Cyrano team).
5. After recovery: full smoke-test (`PRODUCTION_DEPLOY_SPEC.md` §9). Run `npm run reconcile` against every active tenant.

---

## 5. DR-3 — Atlas single-node degradation

Atlas replica sets are 3-node by default. Losing one node still leaves a quorum (2/3); writes continue. Atlas heals automatically.

**Operator action:** monitor the Atlas console. Confirm the replacement node comes up within Atlas's SLA. If it doesn't (rare), open a ticket with Atlas.

The `mongoose.startSession` transactions remain healthy in this state; we don't lose write capability.

---

## 6. DR-4 — Atlas cluster full outage (within ca-central-1)

All three nodes unreachable but the data still exists in backup. Likely cause: Atlas internal incident affecting one cluster.

**Procedure:**

1. **Stop accepting writes.** The API will start failing `/health` (DB reachability check from D-005). DO App Platform should already be routing failure responses; double-check that it's not silently caching successful responses.
2. Confirm via Atlas console that the cluster is not auto-recovering.
3. **PITR restore** to a sibling cluster:
   - In Atlas console: select the production cluster → Backups → Continuous Cloud Backup → Choose Point in Time.
   - Select a timestamp **just before** the outage began. This is the RPO bound.
   - Restore to a **new** cluster (don't restore-in-place; the original may come back).
4. Update `MONGODB_URI` in DO App Platform to point at the new cluster. Deploy the env-var change.
5. Re-run `/health` smoke test.
6. Run `npm run reconcile --tenant-id=<tenant>` for every active tenant. Look for any in-flight transaction that the PITR cut off mid-write — those are the cases where you may have lost ≤ 15 min of acknowledged writes.
7. If reconcile flags any divergence, follow `OPERATIONAL_RUNBOOK.md` §3 — author compensating ledger entries; do not directly mutate `Wallet.balance`.
8. Notify integrators. Post-incident report within 24h.

When the original cluster comes back (Atlas usually does), keep the restored sibling as the production cluster. The original becomes a forensic snapshot — don't merge them.

**Expected RTO:** 1–2 hours (Atlas PITR is fast; the slow part is reconciling and notifying integrators).

---

## 7. DR-5 — Atlas regional outage (ca-central-1)

Worst-case single-provider event. ca-central-1 (Montreal) entirely unreachable.

**This procedure is currently aspirational.** It must be drilled at least once before production go-live, and the drill must reveal whether the multi-region restore plan actually works at our scale and tier.

### Constraints

- Data residency requires us to stay in Canada (per CEO 2026-04-28). Atlas Canada has only ca-central-1 in AWS; the alternative is us-east-1, which violates residency unless the outage is declared a documented emergency exception.
- Cross-border restore during an emergency is a CEO call. Document it; don't assume it.

### Procedure (CEO-approved emergency only)

1. CEO declares the cross-border-restore emergency exception. No restore until this is documented.
2. Trigger PITR restore to a new cluster in **us-east-1** (closest geographically; AWS).
3. Update `MONGODB_URI`; deploy. The API is now serving from US data.
4. Notify integrators of the temporary residency exception.
5. When ca-central-1 recovers: PITR-restore *back* to ca-central-1; cut over again. The us-east-1 cluster is preserved as a forensic snapshot until residency-compliant deletion.
6. Post-incident report covers the residency exception explicitly.

### Constraints we accept

- **RTO is not 4 hours in this scenario.** Plan for 8–12 hours. Cross-region PITR isn't fast.
- **Some Cyrano session state may be lost** outside the ledger (escrow holds in flight at the moment of the cut). Reconcile aggressively.

If this drill (when it runs) reveals the procedure isn't viable, the alternative is to accept extended downtime through the regional outage and not failover. That's a real option for a closed-beta product; document the choice if it becomes the policy.

---

## 8. DR-6 — Keycloak Droplet unrecoverable

The Droplet itself is gone (deleted, unbootable, etc.) but the realm export and the managed Postgres backups exist.

**Procedure:**

1. Provision a fresh Droplet with the same sizing (`PRODUCTION_DEPLOY_SPEC.md` §5.1).
2. Install Keycloak + Caddy + connect to the Postgres instance.
3. Restore the latest Postgres backup (or use the live one if it's still up — Postgres is a separate service from the Droplet).
4. Import the most recent realm export from the audit repo: `kc.sh import --file <export>.json`.
5. Verify the realm came back: roles, groups, clients, claim mappers.
6. **Active sessions are lost.** All users must re-authenticate. This is acceptable — RTO budget for Keycloak is roughly equal to the access-token lifetime (15 min) anyway, since most clients will refresh through the loss naturally.
7. Verify the API still validates JWTs (the public keys may have changed if Keycloak generated new ones; if so, the API's cached JWKS will refresh automatically within the JWKS cache TTL).

**Expected RTO:** 1–2 hours.

---

## 9. DR-7 — Cloudflare / DNS outage

Cloudflare in front of the API; DNS delegated to Cloudflare for the apex.

**Procedure:**

1. Confirm via Cloudflare status page.
2. If extended ETA: revert DNS authority to the original registrar's nameservers (records were captured during the Cloudflare cutover — keep the originals in the audit repo).
3. Point `api.` and `auth.` directly at the DO origin IPs (bypassing the WAF).
4. **Risk accepted during bypass:** no DDoS protection, no edge rate-limit, no WAF. The App Platform's per-IP rate-limit becomes the sole defense.
5. When Cloudflare recovers: re-delegate; verify cache-purge.

**Expected RTO:** 30 min (DNS propagation is the slow part).

---

## 10. DR-8 — Secret leak

Covered procedurally by `OPERATIONAL_RUNBOOK.md` §5.4 (skip-overlap rotation). DR-classified here because the operational urgency is high enough to warrant top-of-page status.

**Within 1 hour of leak detection:**

- Revoke the leaked credential (skip the 7-day overlap).
- Issue a replacement.
- Hand to integrator over a secure channel.
- Audit logs for the time window the leaked credential could have been abused; quantify exposure.

**Within 24 hours:**

- Post-incident report.
- Specific guard rails added (e.g. log-redaction rule that would have caught the leak; CI scan for the pattern).

---

## 11. DR-9 — Data corruption — silent bad write at scale

A code bug or operational mistake caused a sustained pattern of bad writes for hours before detection.

**This is the worst-case scenario** because it can't be fixed by a clean restore — the restored state still has the bad writes.

**Procedure:**

1. Identify the time window where bad writes occurred.
2. Identify the affected records (by tenant, by user, by reason_code).
3. Decide the remediation strategy:
   - **Compensating ledger entries** for each affected record. Preserves history; auditable. The right answer when the bad writes are countable.
   - **PITR-restore to before the bug** + **forward-replay good writes from logs**. Right when the bad writes are uncountable. Requires the structured-log audit trail to be intact (§7 of OPERATIONAL_RUNBOOK).
4. Author a one-off remediation script. Get the script reviewed (CEO + a second engineer) before running.
5. Run the script in dry-run mode against a PITR-restored sibling cluster first.
6. If dry-run is clean: run against production. Otherwise iterate the script.
7. Run reconcile after.
8. Post-incident report with full timeline, the scope of compromise, and the remediation script committed to the audit repo.

**The ledger is append-only.** Even in DR-9, the answer is never to `UPDATE` or `DELETE` ledger entries. The remediation is always additive (compensating entries).

---

## 12. DR-10 — Lost realm signing keys

Keycloak's signing keys are gone (Droplet died and Postgres backups were corrupted, or some other unlikely combination).

This invalidates every JWT in flight. All users must re-authenticate.

**Procedure:**

1. Bootstrap a fresh Keycloak per §8.
2. Generate fresh signing keys (Keycloak does this automatically on realm creation).
3. Force a JWKS refresh on the API side.
4. Notify integrators that all sessions are dead — their first request post-recovery will get 401 `AUTH_INVALID`; their users will sign in again.
5. Audit: how did we lose backups? File a CHORE ticket to harden backup posture.

**Expected RTO:** 4 hours, mostly bootstrap + verification.

---

## 13. DR drill schedule

DR procedures don't survive contact with reality unless they're drilled. Schedule:

| Drill                              | Cadence                | First scheduled |
| ---------------------------------- | ---------------------- | --------------- |
| Atlas PITR restore (DR-4)          | Quarterly              | Pre-go-live     |
| Keycloak rebuild (DR-6)            | Quarterly              | Pre-go-live     |
| Cloudflare / DNS bypass (DR-7)     | Annually + on cutover  | Pre-go-live     |
| App Platform failover (DR-2)       | Annually               | Post-go-live    |
| Multi-region restore (DR-5)        | **Once before production go-live**, then annually if a viable plan emerges | Pre-go-live |
| Secret leak rotation (DR-8)        | Quarterly (table-top)  | Pre-go-live     |
| Data corruption remediation (DR-9) | Annually (table-top)   | Post-go-live    |

Drill log:

| Date         | Drill                  | Outcome | Notes                                  |
| ------------ | ---------------------- | ------- | -------------------------------------- |
| _(none yet)_ | _(first drill scheduled at staging-up + production cutover)_ | _—_ | _—_ |

Append, don't delete. A drill that surfaced a procedural gap is more useful than one that "passed."

---

## 14. Communication during DR events

| Audience              | Channel                                 | Cadence                          |
| --------------------- | --------------------------------------- | -------------------------------- |
| Integrators (Phase-1) | Direct email + Slack (if shared)        | At declaration; every 30 min during outage; at resolution |
| End users             | Status page                             | Within 15 min of declaration; on resolution |
| Internal OQMI         | (TBD as the team grows)                 | —                                |
| Public                | Twitter / status page only              | At declaration if user-visible   |

Rules:

- **Be specific.** Vague "we're investigating" updates burn trust. Say what you know, what you don't, and your next checkpoint time.
- **Don't speculate on cause** until you know. Speculation is the source of post-resolution corrections that look worse than silence.
- **Acknowledge the impact.** "Members are unable to redeem points" is more useful than "service degraded."
- **Final post-incident report** within 7 days, public summary on the status page within 24 hours.

---

## 15. What this runbook deliberately does not cover

- **Day-to-day incident response** — covered by `docs/OPERATIONAL_RUNBOOK.md`.
- **Penetration testing or red-team scenarios** — separate deliverable post-go-live.
- **Long-term archival / WORM compliance** — referenced as a v2 hardening item in OPERATIONAL_RUNBOOK §15.
- **Runtime feature kill-switches** — feature flags exist (`FLAGS.md`); DR doesn't disable features, it restores availability.
- **Communication with regulators** — PIPEDA breach-notification obligations are a separate compliance procedure (post-go-live).

---

## 16. Open items

- [ ] First Atlas PITR restore drill scheduled.
- [ ] First Keycloak rebuild drill scheduled.
- [ ] DR-5 multi-region restore plan: validate that ca-central-1 → us-east-1 PITR is technically feasible at our tier and that the residency-exception protocol is documented with CEO sign-off.
- [ ] Status page provider chosen and cutover-tested.
- [ ] Two-person on-call rotation in place (also in OPERATIONAL_RUNBOOK §15).
- [ ] PIPEDA breach-notification procedure drafted (separate doc).

When all checked, this runbook is "ready for production."

---

_DR runbooks are only as good as their last drill. Append to §13 every time. Update procedures based on what drills surface._
