# Patterns

## Pattern 001: Migration Flow as Stages

Model migration workflows as explicit stages:

1. Ingest client-side configuration.
2. Normalize into an internal schema.
3. Transform to server-side equivalents.
4. Validate event parity and mapping confidence.
5. Export deployable artifacts and a human-readable report.

### Why

- Makes correctness easier to test.
- Keeps transformation logic separate from UI concerns.
- Supports gradual rollout and confidence scoring.

## Pattern 002: Documentation-First Confidence

Score mappings from documented evidence first, and only use agent-scored provisional confidence when relevant provider documentation/examples are missing.

### Why

- Keeps confidence explainable and auditable.
- Reduces risk from purely heuristic scoring.
- Preserves forward progress for undocumented edge cases.

## Pattern 003: Provider Adapter + Mapping Pack

Support new providers through two extension points:

1. `provider-adapter` for ingest/normalization.
2. `mapping-pack` for transformation rules.

### Why

- Keeps core pipeline stable while adding provider support.
- Enables future support for non-GTM providers without redesign.
