# GTM Mappings Registry

Comprehensive type-based mapping registry for migrating Google Tag Manager configurations from client-side to server-side.

## Overview

This module provides **TYPE-BASED** mappings (never name-based pattern matching) for:

- **Tags**: 35+ tag types across Google Analytics, Ads, Social (Meta, TikTok, etc.), and Analytics platforms
- **Triggers**: 20+ trigger types including pageviews, custom events, clicks, forms, etc.
- **Variables**: 25+ variable types including Data Layer, cookies, constants, lookup tables, etc.

## Usage

### Basic Tag Type Mapping

```typescript
import { CLIENT_TO_SERVER_TAG_TYPE, getMigrationRecommendation } from './gtm-mappings';

// Simple lookup
const serverType = CLIENT_TO_SERVER_TAG_TYPE['gaawe'];
// → 'sgtmgaaw' (Server-side GA4)

// Detailed recommendation
const recommendation = getMigrationRecommendation('gaawe');
// → {
//     canMigrate: true,
//     serverType: 'sgtmgaaw',
//     complexity: 'automatic',
//     recommendation: 'Can be automatically migrated...',
//     evidenceRef: 'https://developers.google.com/...'
//   }
```

### Trigger Type Mapping

```typescript
import { CLIENT_TO_SERVER_TRIGGER_TYPE, getTriggerMigrationStrategy } from './gtm-mappings';

// Simple lookup
const serverType = CLIENT_TO_SERVER_TRIGGER_TYPE['PAGEVIEW'];
// → 'serverPageview'

// Migration strategy
const strategy = getTriggerMigrationStrategy('CLICK');
// → {
//     canMigrate: true,
//     serverType: 'customEvent',
//     strategy: 'via-custom-event',
//     recommendation: 'Client-side trigger. Send events to server...'
//   }
```

### Variable Type Mapping

```typescript
import { CLIENT_TO_SERVER_VARIABLE_TYPE, getVariableMigrationStrategy } from './gtm-mappings';

// Simple lookup
const serverType = CLIENT_TO_SERVER_VARIABLE_TYPE['v'];
// → 'eventData' (Data Layer Variable → Event Data)

// Migration strategy
const strategy = getVariableMigrationStrategy('jsm');
// → {
//     canMigrate: false,
//     serverType: null,
//     strategy: 'client-only',
//     recommendation: 'JavaScript variables cannot run on server...'
//   }
```

## Supported Tag Types

### Automatic Migration (9 types)
- **Google Analytics**: `googtag`, `gaawe`, `gaawc` → `sgtmgaaw`
- **Google Ads**: `awct`, `sp` → `sgtmgads`
- **Floodlight**: `fls`, `flc` → `sgtmflood`
- **Custom Image**: `img` → `img`

### Template Required (14+ types)
- **Meta**: `facebook_pixel`, `fbcapi` (requires Meta Conversions API template)
- **TikTok**: `tiktok_pixel` (requires TikTok Events API template)
- **Snapchat**: `snapchat_pixel` (requires Snapchat CAPI template)
- **LinkedIn**: `linkedin_insight` (requires LinkedIn Conversions API template)
- **Twitter/X**: `twitter_uwt` (requires X Conversions API template)
- **Pinterest**: `pinterest_tag` (requires Pinterest CAPI template)
- **Reddit**: `reddit_pixel` (requires Reddit CAPI template)
- **Microsoft**: `microsoftadvertising` (requires UET template)
- **Analytics**: `mixpanel`, `amplitude`, `segment` (require HTTP API templates)

### Manual Only (4 types)
- **Universal Analytics**: `ua` (deprecated, migrate to GA4)
- **Custom HTML**: `html` (analyze and reimplement as custom template)
- **Tag Sequencing**: `tl` (use setup/teardown tags)
- **Hotjar**: `hotjar` (session replay requires client-side)

## Coverage Statistics

```typescript
import { getMappingCoverage } from './gtm-mappings';

const coverage = getMappingCoverage();
// → {
//     tags: { total: 35, automatic: 9, templateRequired: 14, manualOnly: 4 },
//     triggers: { total: 20, canAutoMigrate: 6, requiresClientProxy: 8, clientOnly: 6 },
//     variables: { total: 25, canAutoMigrate: 12, requiresRewrite: 4, clientOnly: 9 },
//     summary: { totalMappings: 80, automaticMigrations: 27, requiresManualWork: 57 }
//   }
```

## Architecture Principles

### ✅ DO: Type-Based Mapping

```typescript
// CORRECT: Use GTM type IDs
const serverType = CLIENT_TO_SERVER_TAG_TYPE[clientTag.type];
```

### ❌ DON'T: Name-Based Pattern Matching

```typescript
// WRONG: Never match on tag names
if (tagName.includes('GA4') || tagName.includes('Facebook')) {
  // This violates the generic migration principle!
}
```

### Generic Property Copying

The deployment code copies ALL properties from client entities:

```typescript
// Copy entire parameter array
tagConfig.parameter = clientTag.parameter;

// Copy all optional properties
if (clientTag.consentSettings) tagConfig.consentSettings = clientTag.consentSettings;
if (clientTag.priority) tagConfig.priority = clientTag.priority;
// ... etc
```

## Extending the Registry

### Adding a New Tag Type

Edit `tag-type-mappings.ts`:

```typescript
export const NEW_PROVIDER_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'provider_tag',
    serverType: 'sgtm_provider',
    name: 'Provider Tag',
    provider: 'ProviderName',
    complexity: 'automatic',
    evidenceRef: 'https://docs.provider.com/server-side',
    notes: 'Maps directly to server-side equivalent.'
  }
];

// Add to ALL_TAG_TYPE_MAPPINGS
export const ALL_TAG_TYPE_MAPPINGS: TagTypeMapping[] = [
  ...GOOGLE_ANALYTICS_MAPPINGS,
  ...NEW_PROVIDER_MAPPINGS,
  // ...
];
```

### Adding a New Trigger Type

Edit `trigger-type-mappings.ts`:

```typescript
{
  clientType: 'NEW_TRIGGER_TYPE',
  serverType: 'customEvent',
  name: 'New Trigger Type',
  canAutoMigrate: false,
  notes: 'Send to server as custom event.'
}
```

### Adding a New Variable Type

Edit `variable-type-mappings.ts`:

```typescript
{
  clientType: 'new_var',
  serverType: 'eventData',
  name: 'New Variable Type',
  canAutoMigrate: true,
  notes: 'Maps to Event Data variable.'
}
```

## Testing

```bash
npm test -- gtm-mappings
```

## Evidence Sources

All mappings include `evidenceRef` pointing to official documentation:
- Google Tag Manager Server-Side docs
- Provider API documentation (Meta CAPI, TikTok Events API, etc.)
- GTM Community Template Gallery

## Related Files

- **Deployment Logic**: `apps/api/src/server.ts` (uses these mappings)
- **Rule Engine**: `apps/worker/src/migration/engine/` (categorization rules)
- **Templates**: `apps/api/src/gtm-templates/` (custom template definitions)

## Migration Flow

1. **Parse** GTM container → extract entities with types
2. **Lookup** client type in mapping registry
3. **Transform** using type-based mapping
4. **Copy** ALL properties from source entity
5. **Deploy** via GTM API
6. **Validate** and report results

## Notes

- **Type IDs are stable**: GTM uses internal type IDs (`gaawe`, `awct`) that don't change
- **Names are unreliable**: Users can name tags anything; never match on names
- **API validates structures**: Copy properties as-is; GTM API returns errors if incompatible
- **Extensibility first**: Easy to add new types without changing deployment logic
