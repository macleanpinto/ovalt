# Migration rules engine

Deterministic, versioned rules to map client-side GTM tags to server-side equivalents. See `docs/system-design.md` and repo `CLAUDE.md` for **type-based** deployment rules (no name-pattern logic in deploy code).

## Layout

| File | Role |
|------|------|
| `schema.ts` | Rule / ruleset Zod schemas |
| `matcher.ts` | Match + priority + missing-required detection |
| `validator.ts` | Constraints, manual-review flags |
| `supportedTypes.ts` | Whitelist of client tag types the engine will deploy |
| `rules-ga4.ts`, `rules-ads.ts`, `rules-social.ts`, `rules-custom.ts` | Rule packs |
| `index.ts` | Orchestration |
| `*.test.ts` | Unit tests |

## Rule shape (conceptual)

Each rule: **match** conditions → **transform** (server type / params) → `provisional` flag (best-effort vs vendor-documented) → **constraints** / manual-review triggers.

Tag types outside `SUPPORTED_CLIENT_TAG_TYPES` short-circuit to an "unsupported" mapping regardless of rule matches — they surface in the UI for visibility but cannot be approved or deployed.

## Review signals

Every mapping carries:

- `supported: boolean` — in the whitelist
- `provisional: boolean` — mapping is best-effort (e.g. Meta CAPI community template needs an access token at deploy)
- `missingRequired: boolean` + `missingParameters: string[]` — required client params absent on the source tag; UI prompts the user to fill them in the Review & Deploy modal

A run's status is `needs_review` if any mapping is unsupported, provisional, or missing required info; `completed` otherwise.

## Versioning

Ruleset uses semantic versioning (see `RULESET_VERSION` in code). Bump minor for new rules, major for schema or behavior breaks.

## Adding rules

1. Prefer vendor docs as evidence — mark the mapping `provisional: false` only if a deterministic, documented server-side equivalent exists.
2. Add the client tag type to `supportedTypes.ts` if you want the rule to be deployable.
3. Add tests in `*.test.ts` covering both the match and the review-signal flags.
4. Bump ruleset version when behavior changes.
