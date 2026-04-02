# Decisions

## ADR-001: Initialize with documentation-first scaffold

- **Status:** Accepted
- **Date:** 2026-03-27
- **Context:** Repository currently contains requirements and design references but no implementation code.
- **Decision:** Start with Claude project configuration and memory-bank files before introducing runtime code.
- **Rationale:** Enables consistent AI-assisted development, preserves context between sessions, and reduces setup friction.
- **Consequences:** Future implementation tasks should keep these docs updated as architecture emerges.

## ADR-002: GTM SS container is mandatory migration target

- **Status:** Accepted
- **Date:** 2026-03-27
- **Context:** Migration output must be deployable and not stop at abstract mapping artifacts.
- **Decision:** Migration flow must create or guide creation of a GTM server-side container before completion.
- **Rationale:** Ensures end-to-end migration outcome and reduces manual infrastructure gaps.
- **Consequences:** Provisioning status and container metadata must be tracked per run and surfaced in reports/API.

## ADR-003: Confidence scoring is docs-first with agent fallback

- **Status:** Accepted
- **Date:** 2026-03-27
- **Context:** Mapping confidence must be explainable and consistent; some edge mappings may lack direct examples.
- **Decision:** Use documentation-grounded scoring first; if evidence is missing, use agent-scored provisional confidence requiring manual review.
- **Rationale:** Prioritizes verifiable accuracy while still supporting novel cases.
- **Consequences:** Mapping records must store evidence references and provisional flags.

## ADR-004: SaaS-first and provider-extensible architecture

- **Status:** Accepted
- **Date:** 2026-03-27
- **Context:** Product is SaaS and expected to support additional providers beyond GTM in future.
- **Decision:** Build multi-tenant SaaS-first with adapter-based provider extensibility and versioned mapping packs.
- **Rationale:** Enables near-term GTM execution without constraining future provider expansion (for example Taggers).
- **Consequences:** Canonical schema and adapter interfaces become core contracts from early phases.
