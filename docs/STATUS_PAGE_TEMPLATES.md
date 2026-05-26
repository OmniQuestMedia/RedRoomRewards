# Status Page Incident Templates

**Audience:** OQMI ops / on-call when an incident is being communicated
externally.

**Purpose:** drop-in copy for status-page posts during an incident. Every
template is short by design — the goal is to deliver information, not prose.

**Status:** drafts. Refine after the first real incident teaches us what reads
off.

**Authority:** defers to `docs/OPERATIONAL_RUNBOOK.md` §1 (severity
classification), `docs/DISASTER_RECOVERY_RUNBOOK.md` §14 (DR communication
rules). On any conflict, those win.

---

## 1. Communication rules (read every time before posting)

These are the rules that don't change between incidents:

1. **Be specific.** Vague "we're investigating" updates burn trust. Say what you
   know, what you don't, and your next checkpoint time.
2. **Don't speculate on cause.** Speculation creates corrections that look worse
   than silence. Stick to observed effects.
3. **Acknowledge user impact in user terms.** "Members are unable to redeem
   points" beats "service degraded."
4. **Set the next-update time explicitly.** If you say "in 30 minutes," post in
   30 minutes — even if it's just "still investigating, next update in 30
   minutes."
5. **Resolution post is not optional.** Even if the incident self-resolved, post
   a resolution. Followed within 7 days by a post-incident summary if
   user-visible.
6. **Don't apologize twice.** A single brief acknowledgement of impact is
   professional. Repeated apologies read defensive.
7. **No internal jargon.** No `RECON_MISMATCH`, no `tenant_id`, no SHA hashes in
   user-facing copy.

---

## 2. Lifecycle

Every incident has the same shape, regardless of severity:

```
   [Investigating]  ─▶  [Identified]  ─▶  [Monitoring]  ─▶  [Resolved]
       ↑                     ↑                 ↑                ↑
       │                     │                 │                │
   first post           cause known       fix deployed       all-clear
   within 15 min        but not fixed      verifying         duration met
```

- **Investigating** — we know there's a problem; we don't yet know what.
- **Identified** — we know the cause; we're working on the fix.
- **Monitoring** — we've deployed the fix; verifying that it sticks.
- **Resolved** — verified clean for the duration threshold (15 min for P0/P1; 5
  min for P2).

Each phase has a template below. Pick the one that matches your current state.

---

## 3. Templates by severity

### 3.1 P0 — full outage / invariant breach

**Investigating (post within 15 min of detection):**

```
[time] We're investigating a service outage affecting RedRoomRewards.
Earn and redeem operations are currently failing. We're prioritizing this
and will post an update within 30 minutes.
```

**Identified:**

```
[time] We've identified the cause as [brief, non-speculative description —
e.g. "an issue with our database connectivity"]. Engineering is deploying
a fix. Earn and redeem remain unavailable. Next update in 30 minutes.
```

**Monitoring:**

```
[time] The fix has been deployed. We're now verifying that earn and redeem
operations are working as expected. Next update in 30 minutes if not
sooner.
```

**Resolved:**

```
[time] All systems are operating normally. Earn and redeem have been
verified working for the past 15 minutes. We'll publish a post-incident
summary within 7 days.
```

### 3.2 P1 — partial outage (one tenant, or one feature)

**Investigating:**

```
[time] We're investigating reports of [feature] failing for [merchant /
all merchants]. [Other features] are operating normally. Next update in
30 minutes.
```

**Identified:**

```
[time] We've identified the cause as [brief description]. A fix is in
progress. [Feature] remains affected. Other features unaffected. Next
update in 30 minutes.
```

**Monitoring:**

```
[time] Fix deployed. Verifying that [feature] is working as expected.
Next update in 30 minutes if not sooner.
```

**Resolved:**

```
[time] [Feature] is back to normal. Verified clean for the past 15
minutes. Post-incident summary within 7 days.
```

### 3.3 P2 — degraded / cosmetic

P2 incidents are typically not posted to a public status page unless they affect
a meaningful user experience. Internal-comms only is the default; promote to
public if user-impact extends past 30 minutes.

**Public investigating (only if promoted):**

```
[time] Some users may experience [observed effect — e.g. slower page
loads]. Functionality is unaffected. We're investigating.
```

**Resolved:**

```
[time] [Effect] has been resolved. No data or functionality was affected.
```

### 3.4 Scheduled maintenance

**Announcement (≥ 48 hours in advance for non-emergency maintenance):**

```
[date, time, duration] We'll be performing scheduled maintenance on
RedRoomRewards. During this window, [specific impact — e.g. "earn and
redeem will be paused"] for an estimated [duration].

What you'll experience: [user-visible effect].
What you don't need to do: [reassurance, e.g. "no action required from
your team"].
```

**Started:**

```
[time] Scheduled maintenance has started. Estimated duration: [X
minutes].
```

**Completed:**

```
[time] Scheduled maintenance complete. All systems operating normally.
```

---

## 4. Specific scenarios

These are pre-written for the failure modes documented in
`DISASTER_RECOVERY_RUNBOOK.md` §2. Edit times and specifics; the structure is
intentional.

### 4.1 DR-2 — App Platform outage (DigitalOcean-side)

```
[time] We're experiencing service disruption due to an upstream
infrastructure issue at our hosting provider. Earn, redeem, and balance
checks are currently failing. We're tracking the upstream provider's
status and will post when service is restored. Next update in 30
minutes.
```

### 4.2 DR-4 — Atlas cluster outage

```
[time] We're investigating a database connectivity issue affecting
RedRoomRewards. Earn and redeem operations are failing. Member balances
remain safe in our backups; no data has been lost. Engineering is working
on restoration. Next update in 30 minutes.
```

After PITR restore in progress:

```
[time] We're restoring our database from the most recent backup. This
typically takes 1–2 hours. Once restoration is complete, we'll verify
balances and resume operations. Next update in 30 minutes.
```

### 4.3 DR-7 — Cloudflare / DNS outage

```
[time] We're working around an issue affecting our CDN. Some users may
experience errors connecting to RedRoomRewards. Engineering is
implementing a workaround. Next update in 15 minutes.
```

### 4.4 DR-8 — Suspected secret leak (key rotation)

This one is **NOT publicly posted unless customer data is affected**. Key
rotation is a routine operational event; posting it on the status page invites
speculation about what happened. Communicate directly with affected integrators;
only post publicly if there's user-visible impact (e.g. their integration goes
401 for hours).

If publicly posted:

```
[time] As part of routine security operations, we've rotated credentials
for an integration partner. The partner's service may be briefly
unavailable while they update their configuration. No member data was
affected. Next update in 30 minutes.
```

### 4.5 DR-9 — Data discrepancy investigation (RECON_MISMATCH at scale)

This one walks a careful line — be specific enough not to look evasive, vague
enough not to invite social-engineering / fraud:

```
[time] We've detected a discrepancy in some loyalty point records and
have temporarily paused certain operations while we investigate. No
member balances have been mutated; we never auto-correct. Engineering is
tracing affected records and will publish a remediation plan once the
scope is understood. Next update in 1 hour.
```

Key word choices in that template — copy them exactly:

- **"a discrepancy in some records"** (specific count comes later, not now).
- **"temporarily paused certain operations"** (don't enumerate which until you
  know).
- **"never auto-correct"** (signals the system worked as designed by halting).
- **"scope is understood"** (commits to a future scope statement; doesn't lock
  you to a number you haven't measured).

---

## 5. Post-incident summary (within 7 days for P0/P1)

Format for the public-facing summary:

```
On [date], between [time] and [time] [timezone], RedRoomRewards
experienced [user-visible effect]. [Audience — e.g. "Members on
RedRoomPleasures"] were unable to [action] for approximately [duration].

What happened: [non-speculative description of cause, written in plain
English. No internal jargon.].

What we're doing about it: [specific, time-bound mitigations. "We've
added X" beats "we'll do better."].

Member impact: [count or scope, with a commitment to direct outreach if
individual records were affected].

We're sorry for the disruption. If you have questions, contact
[support channel].
```

Rules for this:

- **One concrete cause, one concrete mitigation.** A litany of "contributing
  factors" reads defensive.
- **Don't promise things you can't ship.** "We've added monitoring for X" is
  concrete; "We'll never let this happen again" is unkeepable.
- **Direct outreach if individual records affected.** Don't make affected
  members find their own story in a public summary.
- **No SHAs, no commit links, no Jira IDs in the public summary.** Internal
  artifacts go in the internal post-mortem, not the public one.

---

## 6. Channels

| Channel                                        | Use for                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Status page (`status.redroomrewards.com`)      | All public incident comms. Single source of truth for users.                         |
| Direct email to integrators                    | P0/P1 events affecting their tenant. Copy from `INTEGRATOR_HANDOFF_EMAILS.md` style. |
| Internal channel (TBD — Slack / Linear / etc.) | Operator coordination during the incident. Never customer-facing.                    |
| Twitter / public social                        | Only at declaration of P0 (if user-visible) and at resolution.                       |

The status page is the primary surface. Everything else points to it.

---

## 7. Internal post-mortem (separate from public summary)

Within 7 days of any P0 / P1, an internal post-mortem covers:

- Timeline (UTC, minute-precision) from detection through resolution.
- Root cause (technical, with code/data references).
- Detection delay (how long between fault and detection?).
- Response delay (how long between detection and first action?).
- What worked. What didn't. (Plain language; this isn't a performance review.)
- Action items with owners and target dates.

Internal post-mortems live in `docs/history/` per `OPERATIONAL_RUNBOOK.md` §3.
Public summary derives from the internal one but never copies internal language
verbatim.

---

_Updates require a CHORE: commit. Every real incident is an opportunity to
refine these templates — append to §4 with new scenario templates as they're
earned._
