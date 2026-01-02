# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability in this project or have concerns related to security, please contact our security team at security@omniquestmedia.com. Your report will be reviewed and addressed promptly.

## Promotion Payload Handling

To ensure the security and reliability of our promotion payload handling process, we have implemented the following safeguards:

1. **Validation of Incoming Payloads:**
   - All incoming payloads will be rigorously validated against a predefined schema.
   - Any payload that fails to meet the schema requirements will be rejected immediately.

2. **Idempotency for Updates:**
   - To avoid duplicate processing, each request must include a unique identifier.
   - Our system ensures that only one update per identifier is processed, guaranteeing idempotency.

3. **Rejection of Malformed Payloads:**
   - Any payload detected as malformed or containing malicious data will be logged and rejected securely.
   - Rejection responses will include appropriate error codes and minimal, non-sensitive error information.

Our team monitors the system for compliance with these measures and applies immediate corrective actions for any violations.