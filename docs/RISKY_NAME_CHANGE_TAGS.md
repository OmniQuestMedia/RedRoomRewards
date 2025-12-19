# Risky Name Change Tags

This document lists patterns and locations that require special scrutiny or approval before renaming in codebases during branding migrations. 

## Definition: Risky Name Change Locations

Any instance of a legacy name MUST be flagged as risky if found in the following contexts:

- **API Endpoints & Routes**  
  * Examples: `/api/legacy/*`, `/v1/legacyAuth/login`
- **Environment Variables & Config Keys**  
  * Examples: `LEGACY_API_KEY`, `LEGACY_SECRET`, `.env`, `config.js`
- **Database Collections/Tables & Migration Scripts**  
  * Examples: `db.legacy_users`, `"table": "legacy_transactions"`
- **External Vendor/Integration IDs or Keys**  
  * API tokens, client IDs, OAuth configurations referencing external systems.
- **Persistent Storage Keys, Event Names, or Bus Topics**  
  * Examples: `localStorage['legacyUser']`, `topic: legacy.events.userLogin`
- **3rd-Party URLs or Domains (Do Not Change!)**  
  * Examples: `https://vendor.example.com/api`
- **Authentication, Licensing, or Other Security-Critical Identifiers**  
  * Examples: JWT claims like `iss: "LegacySystem"`, SSO provider IDs

---

## Handling Instructions

- **DO NOT rename** any references in these locations unless a complete migration and rollout/rollback plan exists.
- **Review all code usages** for dependencies before changing.
- **Document EVERY exception** with:
    - File path
    - Line number and excerpt
    - Risk/impact description
    - Approval status and reviewer, if applicable

## Risk Tag Table

| File Path                           | Line No. | Excerpt                                   | Risk Area          | Action/Status         | Notes/Reviewer   |
|--------------------------------------|----------|--------------------------------------------|--------------------|----------------------|------------------|
| `backend/app/api/legacy_auth.py`     | 12       | `@app.route("/legacy/v1/login")`           | API endpoint       | DO NOT CHANGE        | Pending review   |
| `config/default.json`                | 5        | `"LEGACY_API_KEY": "..."`                  | Env/config         | Do with caution      | Refactor plan required |
| `migrations/2021_add_legacy_table.sql`| 1       | `CREATE TABLE legacy_users (...`           | DB schema         | Do not change        | Migration needed |
| ...                                  | ...      | ...                                        | ...                | ...                  | ...              |

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md](./SECURITY_AUDIT_AND_NO_BACKDOOR_POLICY.md)
