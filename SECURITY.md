# Security Policy

**Repository**: RedRoomRewards  
**Last Updated**: 2025-12-15  
**Status**: Active

---

## Overview

Security is fundamental to RedRoomRewards. As a financial ledger system managing loyalty points, we treat all security concerns with the same rigor as monetary systems.

---

## Supported Versions

RedRoomRewards is currently in foundation phase. Security updates will apply to:

| Version | Status | Security Updates |
| ------- | ------ | ---------------- |
| 0.1.x   | Current (Foundation) | :white_check_mark: Active |
| < 0.1   | Legacy/Archived | :x: Not supported |

**Note**: All code in `/archive/xxxchatnow-seed/` is unsupported legacy code and MUST NOT be used.

---

## Reporting a Vulnerability

### How to Report

We take security vulnerabilities seriously. If you discover a security issue:

**DO**:
1. **Email security concerns to**: [security@omniquestmedia.com](mailto:security@omniquestmedia.com) (or appropriate contact)
2. **Include**:
   - Detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fixes (if available)
3. **Do NOT**:
   - Open public GitHub issues for security vulnerabilities
   - Disclose vulnerabilities publicly before fix is available
   - Exploit vulnerabilities for any reason

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Assessment**: Within 5 business days
- **Fix Timeline**: Based on severity
  - Critical: Within 7 days
  - High: Within 30 days
  - Medium: Within 90 days
  - Low: Next release cycle

### Disclosure Policy

- We will acknowledge your report privately
- We will keep you informed of progress
- We will publicly credit you (if desired) once fix is deployed
- Coordinated disclosure: We prefer 90 days before public disclosure

---

## Security Requirements

### Code Security

#### Prohibited Practices

**ABSOLUTE PROHIBITIONS** (see `/docs/UNIVERSAL_ARCHITECTURE.md` Section 2):

1. **Legacy Code Reuse**:
   - ⛔ NO code from `/archive/xxxchatnow-seed/` may be referenced or used
   - ⛔ Archived code contains known vulnerabilities and deprecated patterns
   - ⛔ Any PR using legacy code will be rejected immediately
   - **Rationale**: Legacy XXXChatNow code has security vulnerabilities and architectural anti-patterns

2. **Inappropriate Functionality**:
   - ⛔ NO runtime UI code in this repository
   - ⛔ NO chat or messaging logic
   - ⛔ NO broadcast or streaming code
   - ⛔ NO tipping or payment processing
   - **Rationale**: These concerns belong elsewhere and increase attack surface

#### Required Practices

1. **Secrets Management**:
   - ✅ Use environment variables for all secrets
   - ✅ Never commit API keys, passwords, or tokens
   - ✅ Use `.env.example` for documentation, never `.env`
   - ✅ Rotate secrets regularly

2. **Input Validation**:
   - ✅ Validate all inputs server-side
   - ✅ Sanitize data before database operations
   - ✅ Use parameterized queries (Mongoose ODM handles this)
   - ✅ Reject malformed or suspicious requests

3. **Authentication & Authorization**:
   - ✅ All API endpoints require authentication
   - ✅ Use JWT tokens for stateless auth
   - ✅ Implement role-based access control (Admin, Model, Viewer)
   - ✅ Token expiration and refresh mechanisms

4. **Data Protection**:
   - ✅ Encrypt sensitive data at rest
   - ✅ Use HTTPS/TLS for all communications
   - ✅ Hash passwords with bcrypt (if user auth implemented)
   - ✅ Minimal PII collection and storage

5. **Audit Logging**:
   - ✅ Log all financial transactions
   - ✅ Include request IDs for tracing
   - ✅ Never log secrets or sensitive data
   - ✅ 7+ year retention for compliance

### Dependency Security

- **Dependabot**: Automated weekly security updates (Mondays 04:00 UTC)
- **CodeQL**: Automated security analysis on all PRs
- **Policy**: No dependencies with known critical CVEs
- **Updates**: Apply security patches within 7 days of release

### Infrastructure Security

1. **Database**:
   - Connection strings in environment variables only
   - Use connection pooling with limits
   - Enable MongoDB authentication
   - Regular backups with encryption

2. **API Security**:
   - Rate limiting on all endpoints
   - Request size limits
   - CORS configuration
   - API versioning for stability

3. **CI/CD Security**:
   - Secrets stored in GitHub Secrets
   - No secrets in workflow files
   - Required status checks before merge
   - Branch protection on `main` and `develop`

---

## Security Testing

### Required Before Merge

- ✅ CodeQL security analysis passes
- ✅ Super-Linter checks pass
- ✅ No known vulnerabilities in dependencies
- ✅ Input validation tests for all endpoints
- ✅ Authentication tests for protected routes

### Recommended Practices

- Penetration testing before production deployment
- Regular security audits of financial logic
- Review all third-party dependencies
- Monitor for security advisories

---

## Compliance

### Financial Transaction Standards

RedRoomRewards treats loyalty points as financial instruments:

- **Immutability**: Ledger entries cannot be modified
- **Auditability**: 7+ year retention of all transactions
- **Atomicity**: All operations are atomic with rollback
- **Idempotency**: Prevent duplicate transactions
- **Accuracy**: Balance calculations must be precise

See `COPILOT_GOVERNANCE.md` Section 2.1 for detailed requirements.

### Data Retention

- **Transaction Logs**: 7+ years minimum
- **Audit Trails**: 7+ years minimum
- **User Data**: Per applicable privacy regulations
- **Backups**: Encrypted with regular verification

---

## Incident Response

In case of a security incident:

1. **Immediate Actions**:
   - Assess scope and impact
   - Contain the breach
   - Preserve evidence

2. **Communication**:
   - Notify security team immediately
   - Document timeline and actions
   - Prepare incident report

3. **Remediation**:
   - Deploy fixes
   - Verify fix effectiveness
   - Conduct post-mortem

4. **Disclosure**:
   - Notify affected users if applicable
   - Public disclosure after fix deployment
   - Update security documentation

---

## Security Checklist for PRs

All pull requests must verify:

- [ ] No secrets or credentials in code
- [ ] All inputs validated server-side
- [ ] Authentication/authorization implemented
- [ ] No legacy code patterns used
- [ ] Dependencies have no critical CVEs
- [ ] CodeQL and Super-Linter pass
- [ ] Security-sensitive changes reviewed by human
- [ ] Tests cover security scenarios

---

## Additional Resources

- **Universal Architecture**: [`/docs/UNIVERSAL_ARCHITECTURE.md`](/docs/UNIVERSAL_ARCHITECTURE.md) - Section 5 (Security Requirements)
- **Governance**: [`/COPILOT_GOVERNANCE.md`](/COPILOT_GOVERNANCE.md) - Section 2.3 (Safe and Auditable Logging)
- **API Contract**: [`/api/openapi.yaml`](/api/openapi.yaml) - Security schemes

---

## Contact

- **Security Issues**: [security@omniquestmedia.com](mailto:security@omniquestmedia.com)
- **General Issues**: [GitHub Issues](https://github.com/OmniQuestMedia/RedRoomRewards/issues) (non-security only)

---

**Security is everyone's responsibility. Report concerns early and often.**
