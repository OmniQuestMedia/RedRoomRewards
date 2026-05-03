# Integrator Handoff Emails

**Audience:** Kevin (or whoever sends the handoff) when the integration is ready to begin.

**Purpose:** copy-paste-ready emails that hand off the integration packet to the WordPress plugin author and the Cyrano team. Edit the bracketed placeholders; send.

**Status:** drafts — refine after first send if anything reads off.

---

## When to send these

When the following are true:

- Staging is up at `https://api-staging.redroomrewards.com` and `/health` returns 200.
- Per-tenant HMAC keys have been generated for the recipient.
- The merchant has registered a webhook receive URL with you (or you've coordinated where it'll live).
- The packets in `docs/integrations/` have not been touched in the last 24 hours (signal that the spec is stable for handoff).

If any of those are false, hold the email — the integrator's first impression matters; sending them at unstable spec is wasted goodwill.

---

## How to deliver the credentials

The HMAC `api_secret` does **not** go in the email body. Two acceptable channels:

1. **1Password / Bitwarden / equivalent shared vault.** Create a one-time link or share the entry directly with the recipient's account. Auto-expire after 7 days.
2. **Encrypted file attachment.** PGP-encrypted to the recipient's published key. Send the encrypted blob; verify decryption by phone or signal.

Email mentions "credentials handed over via 1Password" (or whichever channel you used) but never contains the secret itself.

---

## Email 1 — RedRoomPleasures (WordPress plugin author)

**Subject:** RedRoomRewards integration — kickoff packet for the WordPress plugin

```
Hi [Author Name],

We're ready to start wiring RedRoomPleasures into the RedRoomRewards
loyalty engine. Everything you need to begin is in the OmniQuestMediaInc/
RedRoomRewards repo — you've been invited as a collaborator with
read access.

Start here:

  docs/integrations/redroompleasures-wordpress.md

That's the integration packet — it walks through the operations the WP
plugin needs to perform (earn-on-completion, redeem-at-checkout, balance
read), the inbound webhook events you'll receive, the error handling
matrix, and a 14-step staging smoke-test checklist.

There's also a reference plugin already in the repo:

  integrations/wordpress-redroompleasures/

It implements the packet end-to-end (HMAC-signed client, WC hooks,
webhook receiver, [rrr_balance] shortcode) and ships with 18
self-contained tests:

  cd integrations/wordpress-redroompleasures && php tests/run-tests.php

You can use it as a starting point or as a reference. Whichever fits
your style.

Supporting docs you'll want open:

  docs/AUTH_CONTRACT.md           — HMAC envelope spec (signing string, replay window, key rotation)
  docs/UX_INTEGRATION_BRIEF.md    — error codes mapped to user-facing copy slots, idempotency contract, rate-limit envelope

Your credentials:

  Tenant ID:    redroompleasures
  API Key ID:   [rrp-key-2026-XX]
  API Secret:   [delivered via 1Password share — link expires 7 days from today]
  Staging API:  https://api-staging.redroomrewards.com/api/v1

Webhook receive URL we'll deliver to: please confirm. Suggested:

  https://www.redroompleasures.com/wp-json/rrr/v1/webhook

(That's where the reference plugin's receiver registers automatically.)

Smoke-test gate: when you've completed the 14-step checklist in §8 of
the packet against staging, ping us — we'll schedule the Alpha test
pack run with you in the loop.

Questions, ambiguity, or anything that reads weird in the docs: file
an issue in the RRR repo with the label integration:redroompleasures.
Don't email — issues are easier to track and we'd rather fix the doc
than answer the same question twice.

Key rotation cadence is 90 days with a 7-day overlap window. We'll
issue a new key pair before the current one expires; expect that as
business as usual.

— Kevin
```

---

## Email 2 — Cyrano (backend team)

**Subject:** RedRoomRewards integration — kickoff packet for Cyrano server-side

```
Hi [Lead Name],

Ready to start wiring Cyrano into the RedRoomRewards loyalty engine.
You're already a collaborator on OmniQuestMediaInc/RedRoomRewards (or
will be by the time you read this).

Start here:

  docs/integrations/cyrano.md

That's the integration packet — it covers all 7 escrow / redeem flows
(hold, settle, refund, partial-settle, direct redeem, model gift,
balance read), the inbound webhook event subscriptions (settled /
refunded / partial / fraud.signal / recon.mismatch / expiration.warning /
refund.applied), reference TypeScript snippets for HMAC verification
using timingSafeEqual, the cross-stack vocabulary alignment, and a
19-step staging smoke-test checklist.

Supporting docs you'll want open:

  docs/AUTH_CONTRACT.md            — HMAC envelope spec (canonical signing string, replay window, key rotation)
  docs/UX_INTEGRATION_BRIEF.md     — error codes, idempotency contract, rate-limit envelope, reason-code catalog (§7.2)
  docs/UX_CROSS_STACK_ALIGNMENT.md — RRR ↔ CNZ ↔ Cyrano vocabulary decisions; binding-target rationale

Two architectural callouts worth re-reading even if you skim the rest:

1. SPIN_WHEEL_PLAY (and any chance-based merchant feature) is owned
   by Cyrano — RRR's role is wallet validation + debit only via signed
   service-to-service request. Don't put any RNG / chance-based logic
   on the RRR side. CEO D1 is firm on that. Inline architectural note
   in §4.5 of your packet covers this.

2. Recon-mismatch handling: if RRR ever fires you a recon.mismatch
   webhook for a Cyrano member, treat it as a HARD pause for that
   member's wallet-mutating actions on the Cyrano side. Don't auto-
   clear on a timer; wait for OQMI to clear it. §10 of the packet.

Your credentials:

  Tenant ID:    cyrano
  API Key ID:   [cyr-key-2026-XX]
  API Secret:   [delivered via 1Password share — link expires 7 days from today]
  Staging API:  https://api-staging.redroomrewards.com/api/v1

Webhook receive URL: please confirm where you want us to post.

Smoke-test gate: when you've completed the 19-step checklist in §9 of
the packet against staging, ping us — we'll schedule the Alpha test
pack run with you in the loop.

Cross-stack note: Grok is producing wireframes for both stacks against
docs/UX_INTEGRATION_BRIEF.md and the Cyrano-side equivalent. The
shared component primitives (TierBadge, WalletBuckets, AuditRow,
ComplianceOverlay) are documented in docs/ux/00-shared-components.md
and intended to be reusable across both stacks. If your front-end
team is reading those, surface anything that doesn't match Cyrano's
presenter contract and we'll resolve.

Questions / ambiguity: file an issue in the RRR repo with the label
integration:cyrano. We'd rather fix the doc than answer the same
question twice.

Key rotation cadence is 90 days with a 7-day overlap window.

— Kevin
```

---

## What both emails deliberately don't say

- **No marketing copy.** These are technical handoffs to engineers. Save the brand voice for the customer-facing surfaces.
- **No timeline pressure.** Integrators perform best when given a clear spec and trusted to execute. If you need a deadline, schedule a follow-up call, don't bake it into the kickoff email.
- **No mention of compensation, contracts, or business terms.** Those go in a separate email — keep the kickoff focused on shipping the integration.
- **No cc'ing of the entire team.** One recipient, named, with a clear single point of accountability. CC people once they're actually needed.
- **No links to internal Slack channels or non-public-doc URLs.** Keep the recipient self-sufficient with what's in the repo.

---

## After they reply

If the recipient says **"got it, starting"**: nothing else from you for at least a week. They need to read the packet and start coding without micromanagement.

If the recipient says **"I'm confused about X"**: thank them, then file the question as an issue against the repo yourself with the appropriate label. That builds the FAQ for the next integrator. Reply to them with the issue link.

If they file a **GitHub issue**: respond there, not via email. Keep the audit trail in one place.

If they say **"my smoke-test gate passed"**: confirm with the staging logs (look for their tenant_id in the last 24h). Then schedule the Alpha test pack with them. Email is fine here — short, with the proposed time window.

---

_This template is a living document. Refine after first send based on what reads off._
