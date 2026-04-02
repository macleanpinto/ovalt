---
name: code-review
description: Review code changes for correctness, regressions, reliability, and test quality. Use when reviewing pull requests, diffs, feature branches, or when the user asks for a review.
---

# Code Review

## Quick Start

When asked to review code:

1. Identify behavioral changes from the diff.
2. Prioritize correctness and regression risks.
3. Check data integrity and error handling.
4. Evaluate test coverage for changed behavior.
5. Return findings ordered by severity.

## Review Priorities

1. Functional correctness.
2. Data integrity risks.
3. Reliability and edge-case handling.
4. Missing or weak tests.
5. Maintainability concerns with practical impact.

## Output Format

Use this exact structure:

```markdown
## Findings
- [Severity] Title
  - Why it matters:
  - Where:
  - Suggested fix:

## Open Questions / Assumptions
- ...

## Test Gaps
- ...

## Quick Summary
- ...
```

## Severity Levels

- `Critical`: likely production outage, data corruption, or severe breakage.
- `High`: core behavior incorrect or strong regression risk.
- `Medium`: meaningful reliability or maintainability issue.
- `Low`: low-risk improvement.

## Tag Relay Notes

- Ensure migration mappings are deterministic and auditable.
- Ensure unknown patterns are surfaced as explicit manual actions.
- Ensure parity checks cover required events and params.
- Ensure reports include confidence and compliance flags.
