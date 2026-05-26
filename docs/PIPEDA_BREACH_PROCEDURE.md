# PIPEDA Breach-of-Security-Safeguards Procedure

**Audience:** OQMI ops / executive when a security incident may have compromised
personal information.

**Purpose:** the procedure for satisfying Canada's _Personal Information
Protection and Electronic Documents Act_ (PIPEDA) breach-notification
obligations. PIPEDA applies because RedRoomRewards processes personal
information of Canadian individuals (per CEO 2026-04-28 — Canada-only data
residency).

**Status:** draft. Becomes the source-of-truth for the first time it's needed;
refined after that based on what reality teaches us.

**Authority:** this document is operational guidance. It is **not** legal
advice. The actual statute is the
[PIPEDA Breach of Security Safeguards Regulations](https://laws-lois.justice.ca/eng/regulations/SOR-2018-64/page-1.html)
(SOR/2018-64). When in doubt during an actual breach, defer to the regulations
and to legal counsel.

**Related:**

- `docs/OPERATIONAL_RUNBOOK.md` — incident response (the operational arm)
- `docs/DISASTER_RECOVERY_RUNBOOK.md` §2 (DR-8 secret leak; DR-9 data
  corruption)
- `docs/STATUS_PAGE_TEMPLATES.md` §5 (public communication shape)

---

## 1. The legal hook in one paragraph

PIPEDA s. 10.1 obligates an organization to notify the Office of the Privacy
Commissioner of Canada (OPC) and affected individuals "as soon as feasible" when
there's a "breach of security safeguards" that creates a "real risk of
significant harm" (RROSH). The same section requires the organization to keep
records of all breaches — including ones below the RROSH threshold — for at
least 24 months. There are no fixed deadlines beyond "as soon as feasible," but
penalties for non-notification can reach $100,000 per violation. This procedure
is the operational interpretation of those obligations.

---

## 2. What counts as a "breach of security safeguards"

PIPEDA s. 2(1) defines it as "the loss of, unauthorized access to or
unauthorized disclosure of personal information resulting from a breach of an
organization's security safeguards." For RRR specifically, the realistic shapes
are:

- Unauthorized read of member PII (email, identifiers, points balance) by an
  external party.
- Unauthorized read of member PII by an internal party who shouldn't have
  access.
- Loss of member data without recovery (e.g. backup corruption).
- Disclosure of member identifying information in logs, error responses, or
  third-party tooling that shouldn't have received it.
- Compromise of a credential that provides access to any of the above (HMAC
  `api_secret`, JWT signing key, MongoDB connection string, etc.).

**Not** breaches under PIPEDA (but still operational incidents):

- Service outages where data was inaccessible but neither lost nor disclosed.
- Failed logins, blocked attacks, defended attempts.
- Internal-only logging gaps that don't affect external parties.

---

## 3. The RROSH test

PIPEDA s. 10.1(7) defines "real risk of significant harm" with five factors. For
each breach, document the analysis explicitly:

| Factor                                                           | What to consider                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Sensitivity of the information**                               | RRR holds points balances + email + tier. Less sensitive than payment cards, but identifying.   |
| **Probability of misuse**                                        | Was the breach targeted? Did the data leave a controlled environment? Was it encrypted at rest? |
| **Number of individuals affected**                               | One member ≠ thousands. Scale modulates risk.                                                   |
| **Whether the information was encrypted, anonymized, or hashed** | At-rest TLS / KMS encryption substantially reduces RROSH. Plaintext exposure raises it.         |
| **Other relevant context**                                       | Recidivism (repeat events), geographic exposure (cross-border), industry alerts, etc.           |

Default posture: **err toward "yes, RROSH"** when uncertain. Notification is
recoverable; non-notification is a regulatory and reputational hole.

---

## 4. Severity classes

Map every incident to one of these:

| Class                                           | Definition                                                                | OPC notification          | Affected-individual notification |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| **A — Confirmed breach with RROSH**             | Personal info confirmed disclosed / lost; RROSH assessment indicates Yes. | **Required**              | **Required**                     |
| **B — Confirmed breach without RROSH**          | Personal info disclosed / lost; RROSH assessment indicates No.            | Not required              | Not required                     |
| **C — Suspected breach, scope undetermined**    | Indicators suggest a breach but data exposure is not yet confirmed.       | TBD pending investigation | TBD pending investigation        |
| **D — Operational incident, no PII implicated** | Service-affecting but no personal information was loss/disclosed.         | Not required              | Not required                     |

Class A triggers §5. Class B and beyond require §8 record-keeping but no
notifications.

---

## 5. Procedure — Class A (confirmed breach with RROSH)

When you've concluded the RROSH test in §3 returns Yes, execute these steps in
order. **Time matters** — "as soon as feasible" is statute language, not a
target.

### Step 1 — Contain (within 1 hour of confirmation)

1. **Stop the bleed.** If a credential was leaked, revoke it (skip the 7-day
   overlap window — see `OPERATIONAL_RUNBOOK.md` §5.4).
2. **Preserve evidence.** Snapshot the relevant logs, the affected DB state, and
   any forensic data **before** remediation potentially overwrites it.
3. **Document the timeline.** Detection time, confirmation time, containment
   time. UTC, minute precision.

### Step 2 — Assemble the response (within 4 hours)

1. CEO declares Class A formally (this is the trigger for §3 RROSH being a Yes).
2. Engage external counsel familiar with PIPEDA. If no counsel is on retainer at
   the time of breach, this is the moment to retain one.
3. Identify the affected individuals (count, list, contact methods).
4. Identify what specifically was exposed (which fields, for which members, for
   what window of time).

### Step 3 — Notify OPC (within 24 hours of CEO Class A declaration)

Submit via the OPC's online breach-reporting portal. The form requires:

- Name, contact info, and role of the reporter.
- Date(s) of the breach.
- Nature of the personal information involved.
- Cause and circumstances.
- Number of affected individuals.
- Steps taken to contain and remediate.
- Steps taken to notify affected individuals.
- Description of the RROSH analysis.

Submit even if some fields are still unknown — partial submission with "TBD:
under investigation" in unknown fields is preferable to delay. Update via
amendment as more is known.

### Step 4 — Notify affected individuals (within 24 hours of OPC notification, ideally same day)

Direct, individual notice. Default channel: email to the address on file. If
email isn't viable for a subset (bounced, address removed), document why and use
the most reliable alternative (postal mail if known).

The notice must include:

- A description of the breach (what, when, scope).
- A description of the personal information involved.
- The steps the organization has taken (or will take) to reduce harm.
- The steps the individual can take to reduce harm.
- A point of contact for questions.
- A statement that the OPC has been notified.

Template:

```
Subject: Important security notice from RedRoomRewards

Dear [name or member identifier],

On [date], we identified a security incident that involved your
RedRoomRewards account. We are writing to you directly because we
believe this incident may affect you.

What happened: [plain-English description, non-speculative].

What information was involved: [specific list — e.g. "your email
address and your points balance as of [date]"].

What we've done: [specific containment + mitigation steps].

What you can do: [actionable advice — change passwords if relevant,
watch for phishing, etc.].

We have notified the Office of the Privacy Commissioner of Canada,
as required by PIPEDA. If you have questions, you can reach us at
[support channel] or contact the OPC directly at 1-800-282-1376
or info@priv.gc.ca.

We are sorry that this happened.

— RedRoomRewards / OmniQuest Media Inc.
```

Editorial principles:

- **Be specific.** Vague notices invite legal exposure.
- **No marketing.** No "your security is our top priority" boilerplate.
- **Plain English.** Non-technical readers must understand.
- **One concrete remediation step the user can take.** If there isn't one, say
  so honestly.

### Step 5 — Notify other organizations / governments (if applicable)

PIPEDA s. 10.2 requires notifying other organizations that may be able to reduce
the harm — for instance, payment processors, partner merchants. For RRR
specifically, this often means notifying RedRoomPleasures and Cyrano if their
members are affected, so they can coordinate downstream notifications.

### Step 6 — Public communication (decide case-by-case)

Public statement on the status page is **discretionary** unless required by the
breach scale (e.g. all members affected — silence then is reputationally
untenable). When public statement is appropriate, use the
`STATUS_PAGE_TEMPLATES.md` §4.5 shape — specific, non-evasive, non-speculative.

### Step 7 — Record (within 30 days)

The internal record per §8 below.

---

## 6. Procedure — Class C (suspected, scope unknown)

The hard case. You see indicators (anomalous access patterns, an alert, a
third-party report) that suggest a breach, but you can't yet confirm whether or
what data was exposed.

1. **Treat as Class A operationally** while investigating. Run §5 Step 1
   (containment, evidence preservation) immediately.
2. **Don't notify yet.** Notification of an unconfirmed breach undermines future
   credibility. Confirm first.
3. **Set a clock.** Time-box the investigation (default: 72 hours). If you can't
   confirm or rule out RROSH in that window, default to Class A and notify.
4. **Document the investigation rigorously.** If the OPC ever asks "why did you
   wait?", the investigation log is the answer.

If investigation confirms Class A: execute §5 from Step 2 onward. If
investigation rules out RROSH (Class B): record per §8. If investigation rules
out a breach entirely (Class D): record per §8.

---

## 7. Procedure — Class B (confirmed but no RROSH) and Class D (no breach)

No notifications. Record per §8 with the RROSH analysis or the no-breach
determination explicitly captured.

---

## 8. Recordkeeping (mandatory, all classes, 24 months)

Every incident — including Class B and D — gets a record with the following
fields:

| Field                            | Required content                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Incident ID                      | `BREACH-YYYY-MM-DD-NN` format. Sequential within the day.                              |
| Detection timestamp              | UTC, minute precision.                                                                 |
| Detection source                 | "User report" / "Automated alert" / "External party (name)" / "Internal review" / etc. |
| Class                            | A / B / C (resolved to A or B at end of investigation) / D                             |
| Description                      | Plain-English summary of what happened.                                                |
| Personal information involved    | Specific fields, member count, time window.                                            |
| Containment actions              | What was done, when, by whom.                                                          |
| RROSH analysis                   | The five-factor analysis explicitly, with reasoning for the conclusion.                |
| OPC notification                 | If notified: date, OPC reference number, link to submission. If not: justification.    |
| Individual notifications         | If sent: count, channel, date. If not: justification.                                  |
| Other-organization notifications | If applicable: parties notified and dates.                                             |
| Remediation                      | What was done to prevent recurrence.                                                   |
| Closure timestamp                | When the incident is considered closed.                                                |

Records live in a private OQMI repository (separate from the RRR repo, with
stricter access controls). Retained for **at least 24 months** (PIPEDA minimum).
Recommended retention: **permanent** — there's no future scenario where having
more breach history hurts.

---

## 9. Roles + responsibilities

| Role                           | Responsibility                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| **CEO (Kevin)**                | Class A declaration. Final approval of OPC submission and individual-notice copy.          |
| **Privacy point-of-contact**   | OPC liaison. For Alpha / closed-beta, this is also the CEO. Add a dedicated role at scale. |
| **Engineering lead (on-call)** | Containment, evidence preservation, technical investigation.                               |
| **External counsel (PIPEDA)**  | Legal review of notification copy. RROSH-edge-case advice.                                 |
| **Public communications**      | Status-page post if applicable. For Alpha, also the CEO.                                   |

The named-role failure mode is "CEO does everything"; that works at the current
scale and stops working at scale ~10× current. Plan for delegation when team
size justifies it.

---

## 10. Drill schedule

PIPEDA breach response is the kind of procedure that fails on first contact with
reality unless drilled in advance.

| Drill                                         | Cadence   | First scheduled                         |
| --------------------------------------------- | --------- | --------------------------------------- |
| Tabletop: simulated Class A — credential leak | Annually  | Within 90 days of production go-live    |
| Tabletop: simulated Class C investigation     | Annually  | Within 90 days of production go-live    |
| Recordkeeping audit (sample 10% of records)   | Quarterly | Quarter following first record          |
| External counsel familiarity check            | Annually  | At engagement of first external counsel |

Drill log lives in the same private repo as the records.

---

## 11. What this procedure deliberately does not cover

- **Other regulatory regimes.** GDPR (EU residents), CCPA (California), HIPAA,
  etc. RRR is Canada-data-residency by design and the natural regulatory
  authority is OPC. If a non-Canadian regulator becomes relevant (e.g. an EU
  integrator's customers), that's a separate compliance procedure to author.
- **Civil litigation strategy.** Out of scope; that's external counsel's domain.
- **Insurance claim filing.** If cyber insurance is in place, notification
  triggers may also apply there. Check the policy when one is in place.
- **Internal HR consequences.** If a breach is caused by employee action, HR /
  disciplinary procedures are separate.
- **Provincial breach-notification laws.** Alberta's PIPA and Quebec's Law 25
  have their own breach-notification rules that may apply to
  provincial-jurisdiction members. When that becomes relevant (more members in
  those jurisdictions, or a breach affecting them), add their procedures here.

---

## 12. Open items

- [ ] Identify and engage external counsel familiar with PIPEDA before
      production go-live.
- [ ] Provision the private breach-records repo with appropriate ACLs.
- [ ] Decide and document the public statement decision criteria (when public,
      when private).
- [ ] First Class A tabletop drill scheduled.
- [ ] Cyber insurance policy reviewed for breach-notification obligations.
- [ ] Quebec Law 25 / Alberta PIPA delta procedure (when relevant).

When all checked, this procedure is "ready for production."

---

_This is operational guidance, not legal advice. The OPC's regulations and
external counsel always win. Updates require a CHORE: commit; substantive
changes (notification thresholds, severity classes) require legal review._
