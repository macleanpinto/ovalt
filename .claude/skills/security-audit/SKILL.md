---
name: security-audit
description: Audit code and architecture for exploitable vulnerabilities, privacy risks, and insecure defaults. Use when the user asks for security review, threat modeling, hardening, or compliance checks.
---

# Security Audit

## Quick Start

When performing a security audit:

1. Identify attack surfaces (API, parsing, storage, auth).
2. Review input validation and trust boundaries.
3. Check authn/authz, secret handling, and sensitive logging.
4. Review data protection, PII handling, and retention controls.
5. Return prioritized findings with concrete remediations.

## Audit Focus Areas

- Authentication and authorization
- Input validation and unsafe parsing
- Injection vectors (SQL, command, path, template)
- Secret exposure and credential handling
- PII processing, redaction, and retention
- Abuse controls (rate limit, replay, idempotency)
- Dependency/supply-chain risk indicators

## Output Format

Use this exact structure:

```markdown
## Findings
- [Severity] Title
  - Attack scenario:
  - Impact:
  - Where:
  - Remediation:

## Threat Model Notes
- ...

## Hardening Checklist
- ...

## Residual Risk Summary
- ...
```

## Severity Levels

- `Critical`: directly exploitable with severe impact.
- `High`: realistic exploitation path with major impact.
- `Medium`: meaningful weakness with constrained exploitability.
- `Low`: hardening recommendation with low immediate risk.

## Tag Relay Notes

- Validate consent-aware defaults.
- Flag PII leakage risks in event parameters.
- Verify auditability (ruleset versioning and run traceability).
- Ensure reports avoid leaking secrets or sensitive identifiers.
