import type { CanonicalTag, MappingRecord } from "../types.js";
import type { Rule, Ruleset } from "./schema.js";
import { findMatchingRule } from "./matcher.js";
import { validateConstraints, evaluateManualReview, generateStandardManualActions } from "./validator.js";
import { ga4Rules } from "./rules-ga4.js";
import { socialRules } from "./rules-social.js";
import { adsRules } from "./rules-ads.js";
import { customRules } from "./rules-custom.js";

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
    const matchResult = findMatchingRule(tag, ruleset.rules);

    if (!matchResult.matched || !matchResult.rule) {
      // No rule matched - should not happen due to fallback rule
      mappings.push(createFallbackMapping(tag));
      continue;
    }

    const rule = matchResult.rule;
    const baseConfidence = rule.confidence;
    const confidenceModifier = matchResult.confidenceModifier || 0;
    const finalConfidence = Math.max(0, Math.min(10, baseConfidence + confidenceModifier));

    // Validate constraints
    const validationResults = validateConstraints(tag, rule);

    // Check for critical validation failures
    const criticalFailures = validationResults.filter(vr => !vr.passed && vr.severity === "critical");
    const hasCriticalFailure = criticalFailures.length > 0;

    // Evaluate manual review conditions
    const ruleManualActions = evaluateManualReview(tag, rule, finalConfidence, validationResults);
    const standardManualActions = generateStandardManualActions(
      finalConfidence,
      validationResults,
      rule.provisional
    );

    // Merge and deduplicate manual actions
    const allManualActions = [...ruleManualActions, ...standardManualActions];
    const uniqueManualActions = deduplicateManualActions(allManualActions);

    // Build mapping record
    const mapping: MappingRecord = {
      clientTagId: tag.tagId,
      clientTagName: tag.name,
      clientTagType: tag.type,
      category: rule.category,
      serverRecommendation: buildServerRecommendation(rule, validationResults),
      confidence: hasCriticalFailure ? Math.min(finalConfidence, 4.0) : finalConfidence,
      provisional: rule.provisional || hasCriticalFailure || finalConfidence < 7.0,
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
    confidence: 3.0,
    provisional: true,
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
 * Calculate aggregate confidence score across all mappings.
 * Weights higher-impact categories more heavily.
 */
export function aggregateConfidence(mappings: MappingRecord[]): { score: number; provisional: boolean } {
  if (mappings.length === 0) {
    return { score: 0, provisional: true };
  }

  let sum = 0;
  let sumW = 0;

  for (const m of mappings) {
    const w = getCategoryWeight(m.category);
    sum += m.confidence * w;
    sumW += w;
  }

  const score = Number(Math.min(10, sum / sumW).toFixed(2));
  const provisional = mappings.some(m => m.provisional || m.confidence < 7.0);

  return { score, provisional };
}

/**
 * Get category weight for confidence aggregation.
 * Higher-impact categories (ecommerce, analytics, conversion) get more weight.
 */
function getCategoryWeight(category: MappingRecord["category"]): number {
  switch (category) {
    case "ecommerce":
      return 1.3;
    case "analytics":
      return 1.2;
    case "ads":
      return 1.1;
    case "social":
      return 1.0;
    case "consent":
      return 1.4; // Compliance is critical
    case "custom":
      return 0.9;
    case "unknown":
      return 0.7;
    default:
      return 1.0;
  }
}

/**
 * Export rule definitions for testing and documentation.
 */
export { ga4Rules, socialRules, adsRules, customRules };
export type { Rule, Ruleset };
