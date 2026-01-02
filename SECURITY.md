## Security Policy

### Last Updated: January 2, 2026

At OmniQuestMedia, the security of our platform and user data is of the utmost priority. Below, we outline the standards and practices used to ensure a secure environment for RedRoomRewards.

---

### Secure Promotion Payload Processing
We have enhanced safety measures when processing promotion payloads. Our system:
- Validates all incoming payloads against strict security schemas to prevent malformed or malicious data.
- Filters all data to prevent injection attacks or unauthorized access.
- Monitors and logs all payload processing for anomalies, with robust alert systems for suspicious activities.

---

### Secure Defaults for Expiration Dates
- All promotions automatically use secure default expiration dates aligned with standard retention guidelines unless explicitly defined.
- Expirations are capped to ensure no unintended prolonged activity.
- Default settings are reviewed monthly to keep up-to-date with new security insights.

---

### Idempotency for Payload Submissions
- To ensure that no promotion payload is processed multiple times, all payload submissions are idempotent. Any reprocessing attempts of the same payload will be intercepted and logged.
- Properly configured idempotency keys are a mandatory field, validated at the API level.

---

For any further security concerns or reports, please reach out via [security@omniquestmedia.com](mailto:security@omniquestmedia.com).

Thank you for your commitment to a secure platform.