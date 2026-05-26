# Keycloak Realm Spec — `rrr-alpha`

**Audience:** whoever provisions the Keycloak instance on the staging Droplet
(per `docs/STAGING_DEPLOY_SPEC.md` §5).

**Purpose:** describe the `rrr-alpha` realm's expected configuration in enough
detail that it can be reproduced from scratch via Keycloak admin UI **or**
declarative JSON realm import. Locks the Alpha-scope identity model so that
wireframe binding (UX_INTEGRATION_BRIEF.md §2) and API-side enforcement
(`AuthMiddleware`) agree on what claims live in the JWT.

**Status:** draft. Becomes the source-of-truth once staging Keycloak is up.

**Authority:** defers to `docs/UX_INTEGRATION_BRIEF.md` §2 (user roles),
`docs/AUTH_CONTRACT.md` §0 (two-leg auth), `docs/STAGING_DEPLOY_SPEC.md` §5
(Keycloak provisioning), and the `AuthMiddleware` implementation in
`src/middleware/auth.middleware.ts`.

---

## 1. Why a single realm for Alpha

Per CEO 2026-04-28: single realm with tenant claims in JWT for Alpha; revisit if
Phase-2 brings external (non-OQMI) merchants. This keeps Alpha provisioning
simple — one realm to manage, one set of signing keys, one client config per
merchant frontend.

Tradeoffs accepted:

- **Pro:** one bill, one console, one place to rotate keys.
- **Pro:** cross-tenant queries (OQMI Operator role) work natively without
  realm-bridging.
- **Con:** tenant isolation is enforced via claims-and-scope rather than
  realm-level. The `TenantScopeMiddleware` is the enforcement floor; Keycloak
  just attests the claim.
- **Con:** if a Phase-2 (truly third-party) merchant ever joins, multi-realm is
  the cleaner refactor.

Multi-realm is **not** on the Alpha roadmap. Don't pre-build it.

---

## 2. Realm settings

| Setting              | Value                                    | Notes                                                             |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| Realm name           | `rrr-alpha`                              | URL-safe; production realm will be `rrr` (no suffix)              |
| Display name         | RedRoomRewards (Alpha)                   | Shown on the login page                                           |
| Enabled              | true                                     |                                                                   |
| Default locale       | en                                       |                                                                   |
| Login theme          | keycloak (default for Alpha; rebrand v2) |                                                                   |
| Email theme          | keycloak (default)                       |                                                                   |
| Account theme        | keycloak (default)                       |                                                                   |
| Internationalization | disabled for Alpha                       | English-only                                                      |
| Forgot password      | enabled                                  | Backed by SMTP (deferred — see §10)                               |
| Remember me          | enabled                                  |                                                                   |
| Verify email         | enabled                                  | Required before any role assignment lands                         |
| Login with email     | enabled                                  | Email is the primary identifier                                   |
| Duplicate emails     | disabled                                 | One account per email                                             |
| Edit username        | disabled                                 | Username = email; not editable                                    |
| SSL required         | external requests                        | (Caddy in front terminates TLS; Keycloak sees HTTP from loopback) |

### 2.1 Token lifetimes

| Token                          | Lifetime             | Notes                                        |
| ------------------------------ | -------------------- | -------------------------------------------- |
| Access token                   | 15 min               | Short by design — refresh is cheap           |
| Refresh token                  | 30 days              | For trusted SPAs / mobile clients only       |
| SSO session idle               | 30 min               | Member surfaces                              |
| SSO session max                | 8 hours              | Hard cap; matches operator-shift expectation |
| Offline session idle           | 30 days              | (Not used in Alpha; lock down post-Alpha)    |
| Access token (impl. flow only) | 15 min               |                                              |
| ID token                       | matches access token | Required for OIDC                            |

### 2.2 Signing keys

Keycloak generates these on realm creation. Default rotation: 90 days,
automatic.

- Algorithm: **RS256**.
- Key size: **2048 bits** minimum, **4096 bits** preferred for production.
- Key rotation: handled by Keycloak. Old keys retained for verification of
  historical tokens during the rotation overlap.

Operational rotation procedure: `docs/OPERATIONAL_RUNBOOK.md` §5.3.

---

## 3. Roles

Realm-level roles (apply across all clients):

| Role name          | Description                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `member`           | Loyalty program participant (the consumer). Sees own wallet, own ledger, can redeem.          |
| `model`            | Content creator. Sees own model-allocation wallet; can gift to members within rules.          |
| `merchant_admin`   | Per-tenant operator at RedRoomPleasures or Cyrano. Scoped to one `tenant_id`.                 |
| `oqmi_operator`    | OmniQuest Media internal staff. Cross-tenant; sees everything.                                |
| `step_up_verified` | **Transient claim** — present only on tokens that have completed step-up auth (see §6 below). |

Only one of `member` / `model` / `merchant_admin` / `oqmi_operator` is granted
per user (the "primary role"). `step_up_verified` is layered on top via session
refresh and is short-lived.

### 3.1 Composite roles

None for Alpha. Don't compose roles into umbrellas — keep the role surface flat
and explicit. Composite roles tend to obscure permission grants in audit logs.

---

## 4. Groups

Groups carry the `tenant_id` attribute, which gets minted into the JWT as a
claim. One group per Phase-1 tenant:

| Group name                | Attributes                              | Notes                                         |
| ------------------------- | --------------------------------------- | --------------------------------------------- |
| `tenant/redroompleasures` | `tenant_id: redroompleasures`           | Members + merchant_admins for RRP             |
| `tenant/cyrano`           | `tenant_id: cyrano`                     | Members + models + merchant_admins for Cyrano |
| `tenant/oqmi`             | `tenant_id: oqmi`, `cross_tenant: true` | OQMI Operators only                           |

### 4.1 Group → role mapping

A user belongs to exactly one tenant group, and the group does **not** assign
roles automatically. Roles are explicit per-user grants. This keeps the audit
trail clean — every role assignment is a deliberate operator action, not a side
effect of group membership.

### 4.2 Claim mappers

Group attributes flow into the JWT via Keycloak protocol mappers:

- **Tenant ID Mapper:** group attribute `tenant_id` → JWT claim `tenant_id`.
  Token type: access + ID. Userinfo: yes.
- **Role Mapper:** realm role list → JWT claim `roles` (array). Token type:
  access. Userinfo: yes.
- **User ID Mapper:** Keycloak user ID → JWT claim `sub` (standard) and a
  duplicate `userId` for `AuthMiddleware` convenience.
- **Step-up Mapper:** session note `step_up_verified` → JWT claim
  `step_up_verified`. Refreshed only after a successful step-up flow.

The `AuthMiddleware` (`src/middleware/auth.middleware.ts`) reads `tenantId` and
`userId` (or `sub`) — keep claim names exactly aligned with that file.

---

## 5. Clients

One client per consumer surface. Two flavours:

### 5.1 Public clients (browser-facing, PKCE)

| Client ID                  | For                                                    | Redirect URIs                                    | Type   | Notes                                  |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------ | ------ | -------------------------------------- |
| `rrr-redroompleasures-web` | RedRoomPleasures customer-facing surfaces (eventually) | `https://www.redroompleasures.com/*`             | public | PKCE required; no client secret        |
| `rrr-cyrano-web`           | Cyrano customer-facing surfaces                        | `https://app.cyrano.<domain>/*` (TBD per Cyrano) | public | PKCE required                          |
| `rrr-operator-console`     | OQMI Operator console (post-Alpha UI)                  | `https://ops.redroomrewards.com/*` (post-Alpha)  | public | PKCE; restricted to oqmi_operator role |

For Alpha, the `*-web` clients are **provisioned but unused** — Phase-1
merchants integrate via service-to-service HMAC (no user JWTs in the loop until
merchant front-ends are built). The clients are stood up so the realm config is
complete and Phase-1 merchant front-ends can wire to them when ready.

### 5.2 Confidential clients (server-side, secret)

| Client ID                     | For                                          | Type         | Notes                                                                                                                                         |
| ----------------------------- | -------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `rrr-redroompleasures-server` | If RRP needs to mint user tokens server-side | confidential | Only if WP plugin issues user-bound JWTs; for Alpha it issues HMAC-signed service-to-service requests instead, so this client is **deferred** |
| `rrr-cyrano-server`           | Cyrano backend, when it issues user tokens   | confidential | Same — deferred for Alpha                                                                                                                     |

Confidential clients are deferred because Alpha integration is purely
service-to-service (HMAC). Stand them up when a real user-bound flow lands.

### 5.3 Client settings (apply to all public clients)

| Setting                            | Value                                          |
| ---------------------------------- | ---------------------------------------------- |
| Client authentication              | Off (public)                                   |
| Standard flow (Authorization Code) | Enabled                                        |
| Implicit flow                      | Disabled (deprecated; PKCE is the right shape) |
| Direct access grants               | Disabled (no resource-owner-password)          |
| Service accounts                   | Disabled for public; enabled for confidential  |
| OAuth 2.0 Device Authorization     | Disabled                                       |
| OIDC CIBA                          | Disabled                                       |
| Frontchannel logout                | Enabled                                        |
| PKCE required                      | **Required** (S256)                            |

### 5.4 Default client scopes

For every client:

- `openid` (default)
- `profile` (default)
- `email` (default)
- `roles` (default)
- `tenant` (custom scope — see §4.2 mappers)
- `step_up` (custom optional scope — granted only post-step-up)

---

## 6. Step-up authentication flow

Per `docs/ux/01-onboarding-gateflows.md` and `docs/UX_INTEGRATION_BRIEF.md`
§4.6.

### 6.1 What it is

When a member or operator initiates a high-value action (large redemption,
manual adjustment, refund, model gift above threshold), the front-end requests
an elevated token claim (`step_up_verified: true`). That elevated claim is what
gates the server-side action — `AuthMiddleware` checks for it on protected
admin/refund/adjustment endpoints.

### 6.2 Flow shape (Keycloak side)

1. Front-end detects the action requires step-up. It pauses the action and pins
   the original `X-Idempotency-Key`.
2. Front-end calls Keycloak `auth?prompt=login&acr_values=2` (or equivalent —
   final ACR values lockdown is a follow-up).
3. Keycloak triggers the step-up authenticator chain (TOTP / WebAuthn / SMS —
   Alpha lights up TOTP only; biometric is v2).
4. On grant, Keycloak issues a refreshed access token with the
   `step_up_verified: true` claim and a session note
   `step_up_verified_at: <timestamp>`.
5. Front-end replays the original action with the new token and the pinned
   idempotency key.
6. RRR's side: the action endpoint checks `step_up_verified` on the request
   token; if true and `step_up_verified_at` is within the freshness window
   (default: 5 minutes), the action proceeds.

### 6.3 Authenticator chain for Alpha

| Step | Authenticator       | Required?         | Notes                                         |
| ---- | ------------------- | ----------------- | --------------------------------------------- |
| 1    | Username + password | yes               | Existing session; not re-prompted             |
| 2    | TOTP                | yes (for step-up) | Authy / Google Authenticator / 1Password etc. |
| 3    | WebAuthn            | optional          | If user has registered a passkey              |

Biometric / Yoti / GateGuard-as-Keycloak-broker is **v2**. For Alpha, the
GateGuard AV gate runs at the RRR API layer (not Keycloak's authenticator
chain). The two systems coordinate via the wireframe in
`docs/ux/01-onboarding-gateflows.md`.

### 6.4 Step-up freshness window

5 minutes. After 5 min, the `step_up_verified` claim is treated as expired and
the action gets a fresh challenge. Tunable via realm authentication config;
don't extend past 15 min without explicit CEO approval.

---

## 7. User attributes

Custom attributes on every user record:

| Attribute       | Type    | Source                           | Maps to JWT claim           |
| --------------- | ------- | -------------------------------- | --------------------------- |
| `tenant_id`     | string  | inherited from group             | `tenant_id`                 |
| `merchant_tier` | string  | per-user, set by merchant_admin  | `merchant_tier` (on member) |
| `model_id`      | string  | per-user (model role only)       | `model_id` (on model)       |
| `cross_tenant`  | boolean | inherited from group (oqmi only) | `cross_tenant`              |

Sensitive attributes (anything personally identifying beyond email) live in
primary records (RRR's database), not Keycloak. Keycloak holds only what's
needed to authenticate and authorize.

---

## 8. Authentication flows

### 8.1 Browser flow

Default Keycloak browser flow with these tweaks:

- **Cookie** authenticator: enabled (allows session resume).
- **Identity Provider Redirector**: disabled (Alpha has no federated IdP).
- **Forms** subflow: required.
- **Conditional OTP**: required (TOTP step-up triggers from this).

### 8.2 Direct grant flow

Disabled. RRR does not support resource-owner-password grants. If a tooling need
arises (CLI auth for ops), use the device authorization flow instead — but defer
that to v2.

### 8.3 Reset-credentials flow

Default. Email-driven reset is gated on SMTP (deferred — see §10). For Alpha,
password resets are operator-mediated via the Keycloak admin console.

### 8.4 Registration flow

**Disabled at the realm level.** New accounts come from RRR's signup endpoint,
which performs AV (GateGuard) and then provisions the Keycloak user via the
admin API. No public Keycloak registration page.

This matches the architecture: RRR is the source-of-truth for member identity;
Keycloak is the credential store and the JWT issuer.

---

## 9. Required actions on first login

| Action               | Enabled? | Notes                                                |
| -------------------- | -------- | ---------------------------------------------------- |
| Verify email         | yes      | Forced before any role takes effect                  |
| Update password      | yes      | If admin-set initial password                        |
| Configure OTP        | optional | Members; required for merchant_admin / oqmi_operator |
| Update profile       | optional | Optional unless missing required attributes          |
| Terms and conditions | optional | Defer until ToS exists for Alpha                     |

---

## 10. Email / SMTP

**Deferred for Alpha.** Verify-email and forgot-password flows depend on SMTP.
For Alpha:

- Email verification is performed via operator-provided OTP code at signup time.
- Password reset is operator-mediated (admin console).

When SMTP is wired (post-Alpha):

- Provider TBD (SES, Mailgun, Postmark — separate decision).
- From address: `noreply@redroomrewards.com`.
- DKIM + SPF + DMARC properly configured.
- HTML + plaintext email templates; no images-only emails.

---

## 11. Realm export / import

The full realm config is mastered in this document plus a JSON export checked
into a **separate private repo** (audit trail). Procedure:

1. After provisioning, run from the Keycloak admin CLI:
   ```bash
   /opt/keycloak/bin/kc.sh export \
     --dir /tmp/realm-export \
     --realm rrr-alpha \
     --users skip
   ```
   `--users skip` keeps user data out of the export — users belong in a
   different export with stricter access controls.
2. Inspect the JSON for any embedded secrets (signing keys, client secrets);
   redact them before committing.
3. Commit to the audit repo monthly.
4. On re-provisioning (rebuild from scratch), import via
   `kc.sh import --file /path/to/redacted-export.json`.

The redacted JSON is a **reference**, not the source-of-truth. This document is.
If they disagree, this document wins and the JSON gets regenerated.

---

## 12. Provisioning order (for the operator standing this up)

1. Stand up the Keycloak Droplet per `STAGING_DEPLOY_SPEC.md` §5.
2. Log into Keycloak admin console; change the bootstrap admin password.
3. Create the `rrr-alpha` realm with §2 settings.
4. Create the §3 roles.
5. Create the §4 groups with their `tenant_id` attributes.
6. Configure the §4.2 claim mappers (under realm-level Client Scopes → `tenant`,
   `roles`).
7. Create the §5.1 public clients (3 of them).
8. Configure the §6 step-up authenticator chain.
9. Disable the registration flow per §8.4.
10. Disable SMTP per §10 (or leave default and let it fail closed).
11. Generate the realm signing keys (Keycloak does this automatically on
    creation; verify RS256, 4096 bits if available).
12. Run the §11 export, redact, commit to the audit repo.
13. Smoke-test: create a test user manually via admin console, assign `member`
    role, log in via the `rrr-redroompleasures-web` client (placeholder hostname
    for Alpha — point at a stub that just dumps the token), verify the JWT
    contains `tenant_id`, `roles`, `userId`, `sub`.

After step 13, the realm is "Alpha-ready."

---

## 13. What's not in this spec (deferred)

- **Federated IdPs** — no Google / Apple / GitHub login for Alpha.
- **Account linking** — single account per email; no merging.
- **Self-service registration** — disabled at the realm.
- **Multi-tenant theming** — single Keycloak theme for Alpha.
- **GateGuard as Keycloak authenticator broker** — runs at RRR API layer for
  Alpha; Keycloak integration is v2.
- **WebAuthn enforcement** — supported but optional.
- **Confidential clients** — provisioned only when user-bound server-issued
  tokens become a real flow.
- **SMTP** — see §10.
- **Production realm** (`rrr` no suffix) — provisioned at production go-live.

---

_This spec freezes when staging Keycloak is up and the export-redact-commit
cycle has run once. Updates require a CHORE: commit and a fresh
export-redact-commit cycle._
