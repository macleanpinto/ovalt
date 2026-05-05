import type { CanonicalTag, MappingRecord } from "../types.js";
import type { Rule, Ruleset } from "./schema.js";
import { findMatchingRule } from "./matcher.js";
import { validateConstraints, evaluateManualReview, generateStandardManualActions } from "./validator.js";
import { ga4Rules } from "./rules-ga4.js";
import { socialRules } from "./rules-social.js";
import { adsRules } from "./rules-ads.js";
import { customRules } from "./rules-custom.js";
import { isSupportedClientTagType, SUPPORTED_CLIENT_TAG_TYPES } from "./supportedTypes.js";

/**
 * Main ruleset engine - orchestrates rule matching, validation, and mapping generation.
 */

export const RULESET_VERSION = "2.0.0";

/**
 * Load the current ruleset with all rule definitions.
 */
export function loadRuleset(): Ruleset {
  return {
    version: RULESET_VERSION,
    name: "Tag Relay Core Ruleset",
    description: "Production ruleset for GTM web-to-server migration with GA4, social, ads, and custom tag support",
    lastModified: new Date().toISOString(),
    rules: [
      ...ga4Rules,
      ...adsRules,
      ...socialRules,
      ...customRules
    ]
  };
}

/**
 * Apply ruleset engine to canonical tags and generate mapping records.
 */
export function applyRuleset(tags: CanonicalTag[]): MappingRecord[] {
  const ruleset = loadRuleset();
  const mappings: MappingRecord[] = [];

  for (const tag of tags) {
    const supported = isSupportedClientTagType(tag.type);

    // Unsupported tag types short-circuit: analysis UI still shows the tag,
    // but it cannot be approved or deployed.
    if (!supported) {
      mappings.push(createUnsupportedMapping(tag));
      continue;
    }

    const matchResult = findMatchingRule(tag, ruleset.rules);

    if (!matchResult.matched || !matchResult.rule) {
      mappings.push(createFallbackMapping(tag));
      continue;
    }

    const rule = matchResult.rule;
    const missingRequired = Boolean(matchResult.missingRequired);
    const missingParameters = matchResult.missingParameters ?? [];

    // Validate constraints
    const validationResults = validateConstraints(tag, rule);

    // Check for critical validation failures
    const criticalFailures = validationResults.filter(vr => !vr.passed && vr.severity === "critical");
    const hasCriticalFailure = criticalFailures.length > 0;

    // Evaluate manual review conditions
    const ruleManualActions = evaluateManualReview(tag, rule, validationResults);
    const standardManualActions = generateStandardManualActions(
      validationResults,
      rule.provisional,
      missingRequired
    );

    // Merge and deduplicate manual actions
    const allManualActions = [...ruleManualActions, ...standardManualActions];
    const uniqueManualActions = deduplicateManualActions(allManualActions);

    const finalProvisional = rule.provisional || hasCriticalFailure;
    const reviewReason = deriveReviewReason({
      rule,
      tagType: tag.type,
      provisional: finalProvisional,
      missingRequired
    });

    // Build mapping record
    const mapping: MappingRecord = {
      clientTagId: tag.tagId,
      clientTagName: tag.name,
      clientTagType: tag.type,
      category: rule.category,
      serverRecommendation: buildServerRecommendation(rule, validationResults),
      provisional: finalProvisional,
      missingRequired,
      missingParameters,
      supported: true,
      reviewReason,
      evidence: {
        type: "docs",
        ref: rule.evidenceRef
      },
      manualActions: uniqueManualActions.map(ma => `[${ma.priority.toUpperCase()}] ${ma.recommendation}`)
    };

    mappings.push(mapping);
  }

  return mappings;
}

/**
 * Build server recommendation text from rule and validation results.
 */
function buildServerRecommendation(rule: Rule, validationResults: Array<{ passed: boolean; severity: string; message: string }>): string {
  const parts: string[] = [rule.transform.description];

  // Add configuration hints
  if (rule.transform.configurationHints && rule.transform.configurationHints.length > 0) {
    parts.push("");
    parts.push("Configuration:");
    rule.transform.configurationHints.forEach(hint => {
      parts.push(`• ${hint}`);
    });
  }

  // Add validation warnings
  const warnings = validationResults.filter(vr => !vr.passed && (vr.severity === "warning" || vr.severity === "error"));
  if (warnings.length > 0) {
    parts.push("");
    parts.push("Validation Notes:");
    warnings.forEach(w => {
      parts.push(`⚠ ${w.message}`);
    });
  }

  return parts.join("\n");
}

/**
 * Create fallback mapping for tags that don't match any rule.
 * This should rarely happen due to generic fallback rule.
 */
function createFallbackMapping(tag: CanonicalTag): MappingRecord {
  return {
    clientTagId: tag.tagId,
    clientTagName: tag.name,
    clientTagType: tag.type,
    category: "unknown",
    serverRecommendation: "No matching rule found - manual analysis required",
    provisional: true,
    missingRequired: false,
    missingParameters: [],
    supported: true,
    reviewReason: "No ruleset match — manual analysis required",
    evidence: {
      type: "docs",
      ref: "https://developers.google.com/tag-platform/tag-manager/server-side"
    },
    manualActions: [
      "[CRITICAL] No ruleset mapping available - research vendor documentation and consult engineering support"
    ]
  };
}

/**
 * Short human-readable reason for "Needs Review" when missingParameters alone
 * doesn't explain it. We special-case Meta because that's the most common
 * provisional path and its reason is specific and actionable.
 */
function deriveReviewReason(opts: {
  rule: Rule;
  tagType: string;
  provisional: boolean;
  missingRequired: boolean;
}): string | null {
  // Missing-required already surfaced as chips on the card; no need to repeat.
  if (opts.missingRequired) return null;
  if (!opts.provisional) return null;

  // Meta Pixel community template (cvt_5RM3Q) — requires a CAPI access token.
  if (opts.tagType === "cvt_5RM3Q" || opts.rule.category === "social") {
    return "Provisional: Meta CAPI access token required at deploy";
  }

  return "Provisional mapping — verify in server container preview before publishing";
}

/**
 * Mapping for tag types outside the supported whitelist. The tag still appears
 * in the analysis view so the user sees what it is, but cannot be approved or
 * deployed — only the 5 supported types pass the deploy endpoint guardrail.
 */
function createUnsupportedMapping(tag: CanonicalTag): MappingRecord {
  return {
    clientTagId: tag.tagId,
    clientTagName: tag.name,
    clientTagType: tag.type,
    category: "unknown",
    serverRecommendation:
      `Tag type "${tag.type}" is not supported for automated migration. ` +
      `Tag Relay currently supports: ${SUPPORTED_CLIENT_TAG_TYPES.join(", ")}. ` +
      `Rebuild this tag manually in the server container or exclude it from the migration.`,
    provisional: true,
    missingRequired: false,
    missingParameters: [],
    supported: false,
    reviewReason: `Tag type "${tag.type}" is not supported — manual rebuild required`,
    evidence: {
      type: "docs",
      ref: "https://developers.google.com/tag-platform/tag-manager/server-side"
    },
    manualActions: [
      `[CRITICAL] Unsupported tag type "${tag.type}" — cannot be auto-migrated. Manual rebuild required.`
    ]
  };
}

/**
 * Deduplicate manual actions by recommendation text.
 */
function deduplicateManualActions(actions: Array<{ priority: string; reason: string; recommendation: string }>) {
  const seen = new Set<string>();
  const unique: typeof actions = [];

  for (const action of actions) {
    const key = `${action.priority}:${action.recommendation}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(action);
    }
  }

  return unique;
}

/**
 * Whether a run needs manual review: any mapping is unsupported, provisional,
 * or missing a required parameter.
 */
export function runNeedsReview(mappings: MappingRecord[]): boolean {
  if (mappings.length === 0) return true;
  return mappings.some(m => !m.supported || m.provisional || m.missingRequired);
}

/**
 * Export rule definitions for testing and documentation.
 */
export { ga4Rules, socialRules, adsRules, customRules };
export { SUPPORTED_CLIENT_TAG_TYPES, isSupportedClientTagType } from "./supportedTypes.js";
export type { SupportedClientTagType } from "./supportedTypes.js";
export type { Rule, Ruleset };
