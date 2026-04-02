# Tag Relay Ruleset Engine

Production-ready rule engine for deterministic tag migration from client-side to server-side Google Tag Manager.

## Overview

The ruleset engine replaces placeholder pattern-matching logic with a structured, versioned, and extensible rule system. It provides:

- **Declarative rule definitions** with match conditions, transformations, and constraints
- **Priority-based rule matching** for deterministic behavior
- **Evidence-backed confidence scoring** using official documentation
- **Automated validation** with constraint checking
- **Manual review conditions** for edge cases and low-confidence mappings

## Architecture

```
engine/
├── schema.ts           # Rule and ruleset schemas (Zod)
├── matcher.ts          # Rule matching engine
├── validator.ts        # Constraint validation and manual review logic
├── rules-ga4.ts        # Google Analytics 4 rules
├── rules-social.ts     # Social media platform rules (Meta, TikTok, etc.)
├── rules-ads.ts        # Advertising platform rules (Google Ads, Floodlight)
├── rules-custom.ts     # Custom tags, consent platforms, fallback
├── index.ts            # Main engine orchestration
├── *.test.ts           # Unit tests
└── README.md           # This file
```

## Core Concepts

### Rules

A **rule** defines how a client-side tag should be migrated to server-side. Each rule has:

- **Match conditions**: Criteria that must be satisfied (tag type, parameters, patterns)
- **Transform**: Server-side equivalent tag type and parameter mappings
- **Confidence**: Base confidence score (0-10)
- **Constraints**: Validation requirements (required parameters, security checks)
- **Manual review conditions**: When human review is required
- **Evidence**: Documentation URL supporting the mapping

### Match Conditions

Match conditions use field-operator-value logic:

```typescript
{
  field: "tagType",
  operator: "equals",
  value: "googtag",
  caseSensitive: false,
  negate: false
}
```

**Supported fields:**
- `tagType`: GTM tag type
- `tagName`: Tag display name
- `hasParameter`: Check if parameter exists
- `parameterValue`: Match parameter value (format: `paramName:value`)
- `category`: Match against tag content/context

**Supported operators:**
- `equals`: Exact match
- `contains`: Substring match
- `matches`: Regex match
- `startsWith`: Prefix match
- `oneOf`: Match any value in array

### Priority

Rules are evaluated in priority order (highest first). This ensures specific rules match before generic fallbacks:

- **950+**: Critical conversion events (purchase, etc.)
- **900-949**: Core platform tags (GA4 config, Google Ads conversion)
- **850-899**: Standard event tags
- **800-849**: Platform-specific tags
- **700-799**: Custom implementations
- **600-699**: Generic patterns
- **100-599**: Fallbacks

### Confidence Scoring

Base confidence (0-10) from rule definition, modified by:

- **+0.3**: All required parameters present
- **-1.5**: Missing required parameters
- **Auto-adjusted**: Down to ≤4.0 for critical validation failures

**Thresholds:**
- **9.0-10.0**: Auto-accepted (if no critical issues)
- **7.0-8.9**: Accepted with review recommendation
- **5.0-6.9**: Manual review required
- **<5.0**: Blocked from auto-publish

### Constraints

Constraints validate tag configurations:

- `requiresParameter`: Specific parameter must exist
- `requiresConsent`: Consent handling required
- `requiresPII`: PII parameters detected (triggers hashing requirement)
- `requiresSecureEndpoint`: HTTPS required
- `deprecatedFeature`: Feature is deprecated
- `customValidation`: Custom logic

### Manual Review Conditions

Triggers for human review:

- `lowConfidence`: Confidence below threshold
- `missingParameter`: Required parameter missing
- `customTag`: Custom HTML or template
- `securityRisk`: Security concerns detected
- `complexLogic`: Complex tag logic
- `consentRequired`: Consent validation failed

## Usage

### Apply Ruleset

```typescript
import { applyRuleset, aggregateConfidence } from "./engine/index.js";
import type { CanonicalTag } from "./types.js";

const tags: CanonicalTag[] = extractCanonicalTags(gtmPayload);
const mappings = applyRuleset(tags);
const { score, provisional } = aggregateConfidence(mappings);

console.log(`Migration confidence: ${score}/10 (${provisional ? "provisional" : "approved"})`);
```

### Load Ruleset

```typescript
import { loadRuleset } from "./engine/index.js";

const ruleset = loadRuleset();
console.log(`Loaded ruleset v${ruleset.version} with ${ruleset.rules.length} rules`);
```

### Access Rule Definitions

```typescript
import { ga4Rules, socialRules, adsRules, customRules } from "./engine/index.js";

console.log(`GA4 rules: ${ga4Rules.length}`);
console.log(`Social rules: ${socialRules.length}`);
```

## Adding New Rules

1. **Choose the appropriate rule file** (or create a new one)
2. **Define the rule** using the schema:

```typescript
import type { Rule } from "./schema.js";

export const myNewRules: Rule[] = [
  {
    id: "unique-rule-id",
    name: "Display Name",
    description: "What this rule does",
    category: "analytics",
    priority: 850,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "my_tag_type"
      }
    ],
    transform: {
      serverTagType: "Server-side equivalent",
      description: "How to implement server-side",
      parameterMappings: [
        {
          clientParam: "clientParamName",
          serverParam: "serverParamName",
          required: true,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Step-by-step configuration guidance"
      ]
    },
    confidence: 8.5,
    provisional: false,
    evidenceRef: "https://docs.vendor.com/server-side",
    constraints: [
      {
        type: "requiresParameter",
        field: "requiredParam",
        severity: "critical",
        message: "This parameter is required"
      }
    ],
    manualReview: [
      {
        trigger: "lowConfidence",
        threshold: 8.0,
        priority: "medium",
        action: "Verify configuration in preview mode"
      }
    ],
    tags: ["vendor", "category"]
  }
];
```

3. **Import and add to ruleset** in `index.ts`:

```typescript
import { myNewRules } from "./rules-mynew.js";

export function loadRuleset(): Ruleset {
  return {
    rules: [
      ...ga4Rules,
      ...myNewRules,  // Add here
      ...customRules
    ]
  };
}
```

4. **Write tests** in `*.test.ts` files
5. **Update RULESET_VERSION** in `index.ts` if making breaking changes

## Rule Coverage

### Supported Platforms

**Analytics:**
- ✅ Google Analytics 4 (base tag, events, ecommerce)
- ✅ Google Tag / gtag.js

**Advertising:**
- ✅ Google Ads Conversion Tracking
- ✅ Google Ads Remarketing
- ✅ Google Ads Enhanced Conversions
- ✅ Floodlight (Counter & Sales)

**Social:**
- ✅ Meta Pixel / Conversions API
- ✅ TikTok Pixel / Events API
- ✅ LinkedIn Insight Tag / CAPI
- ✅ Pinterest Tag / Conversions API
- ✅ Twitter/X Pixel
- ✅ Snapchat Pixel / CAPI

**Consent & Compliance:**
- ✅ Cookiebot
- ✅ OneTrust

**Custom:**
- ✅ Custom HTML tags (with rebuild guidance)
- ✅ Community Gallery templates
- ✅ Custom image/pixel tags
- ✅ Generic HTTP requests
- ✅ Fallback for unknown tags

### Priority Roadmap

Future rule additions:

- Adobe Analytics
- Segment
- Amplitude
- Hotjar
- HubSpot
- Additional consent platforms (Didomi, Usercentrics)

## Testing

Run tests:

```bash
npm test apps/worker/src/migration/engine
```

Test coverage includes:

- Rule matching logic
- Constraint validation
- Confidence scoring
- Priority ordering
- Edge cases (missing params, unknown tags)

## Performance

The engine is designed for efficiency:

- **O(n × m)** complexity where n = tags, m = rules
- Rules sorted by priority once at load time
- First match wins (no backtracking)
- Validation runs only on matched rules

Typical performance:
- **Small container** (10-20 tags): <100ms
- **Medium container** (50-100 tags): <500ms
- **Large container** (200+ tags): <2s

## Versioning

Ruleset versions follow semantic versioning:

- **Major**: Breaking changes to rule schema or behavior
- **Minor**: New rules added, non-breaking enhancements
- **Patch**: Bug fixes, documentation updates

Current version: **2.0.0**

## Design Decisions

### Why priority-based matching?

Priority ensures deterministic behavior and allows specific rules to override generic patterns. Without priority, multiple rules could match the same tag ambiguously.

### Why docs-first evidence?

Official vendor documentation provides the most reliable mapping guidance. Web search and AI agents are fallbacks for undocumented scenarios only.

### Why confidence modifiers?

Base confidence represents the rule's inherent reliability. Modifiers adjust based on actual tag configuration (e.g., missing parameters reduce confidence).

### Why separate rule files?

Modularity improves maintainability and allows platform experts to own specific rule sets. It also enables selective loading in future (e.g., customer-specific rule overrides).

## Contributing

When adding or modifying rules:

1. **Start with evidence**: Find official vendor documentation
2. **Test thoroughly**: Add unit tests for new rules
3. **Be conservative**: Prefer lower confidence over false confidence
4. **Document assumptions**: Add comments explaining non-obvious logic
5. **Update version**: Bump RULESET_VERSION appropriately

## Support

For questions or issues with the ruleset engine:

- Review this documentation
- Check test files for usage examples
- Consult system design doc: `docs/system-design.md`
- Review PRD: `PRD-2026-03-26.md`
