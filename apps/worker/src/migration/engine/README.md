# Migration rules engine

Deterministic, versioned rules to map client-side GTM tags to server-side equivalents. See `docs/system-design.md` and repo `CLAUDE.md` for **type-based** deployment rules (no name-pattern logic in deploy code).

## Layout

| File | Role |
|------|------|
| `schema.ts` | Rule / ruleset Zod schemas |
| `matcher.ts` | Match + priority |
| `validator.ts` | Constraints, manual-review flags |
| `rules-ga4.ts`, `rules-ads.ts`, `rules-social.ts`, `rules-custom.ts` | Rule packs |
| `index.ts` | Orchestration |
| `*.test.ts` | Unit tests |

## Rule shape (conceptual)

Each rule: **match** conditions → **transform** (server type / params) → **confidence** → **constraints** / manual-review triggers.

## Versioning

Ruleset uses semantic versioning (see `RULESET_VERSION` in code). Bump minor for new rules, major for schema or behavior breaks.

## Adding rules

1. Prefer vendor docs as evidence.  
2. Add tests in `*.test.ts`.  
3. Keep confidence conservative.  
4. Bump ruleset version when behavior changes.
