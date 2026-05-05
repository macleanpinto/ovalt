import { z } from "zod";

/**
 * Core rule engine schema for deterministic tag mapping.
 *
 * Rules are versioned, testable, and auditable. Each rule defines:
 * - match: conditions that must be satisfied
 * - transform: mapping to server-side equivalent
 * - provisional: whether this mapping is best-effort vs vendor-documented
 * - constraints: validation requirements
 * - manualReview: when human review is required
 */

export const matchConditionSchema = z.object({
  /** Field to match against (tagType, tagName, parameter keys, etc) */
  field: z.enum(["tagType", "tagName", "hasParameter", "parameterValue", "category"]),
  /** Match operator */
  operator: z.enum(["equals", "contains", "matches", "startsWith", "oneOf"]),
  /** Value to match (string, regex pattern, or array for oneOf) */
  value: z.union([z.string(), z.array(z.string())]),
  /** Case sensitive matching (default: false) */
  caseSensitive: z.boolean().optional(),
  /** Invert the match (NOT) */
  negate: z.boolean().optional()
});

export type MatchCondition = z.infer<typeof matchConditionSchema>;

export const parameterMappingSchema = z.object({
  /** Client-side parameter name */
  clientParam: z.string(),
  /** Server-side parameter name */
  serverParam: z.string(),
  /** Whether this parameter is required */
  required: z.boolean().optional(),
  /** Transform function to apply */
  transform: z.enum(["passthrough", "hash", "redact", "currency", "eventName"]).optional(),
  /** Default value if missing */
  defaultValue: z.string().optional()
});

export type ParameterMapping = z.infer<typeof parameterMappingSchema>;

export const transformSchema = z.object({
  /** Target server-side tag type or template */
  serverTagType: z.string(),
  /** Human-readable description of the transformation */
  description: z.string(),
  /** Parameter mappings */
  parameterMappings: z.array(parameterMappingSchema).optional(),
  /** Server-side configuration hints */
  configurationHints: z.array(z.string()).optional()
});

export type Transform = z.infer<typeof transformSchema>;

export const constraintSchema = z.object({
  /** Constraint type */
  type: z.enum([
    "requiresParameter",
    "requiresConsent",
    "requiresPII",
    "requiresSecureEndpoint",
    "deprecatedFeature",
    "customValidation"
  ]),
  /** Parameter or field name (for requiresParameter) */
  field: z.string().optional(),
  /** Severity if constraint is violated */
  severity: z.enum(["info", "warning", "error", "critical"]),
  /** Message to show when constraint is violated */
  message: z.string()
});

export type Constraint = z.infer<typeof constraintSchema>;

export const manualReviewConditionSchema = z.object({
  /** Condition that triggers manual review */
  trigger: z.enum([
    "missingParameter",
    "customTag",
    "securityRisk",
    "complexLogic",
    "consentRequired"
  ]),
  /** Threshold or specific value */
  threshold: z.union([z.number(), z.string()]).optional(),
  /** Priority for review */
  priority: z.enum(["low", "medium", "high", "critical"]),
  /** Specific action required */
  action: z.string()
});

export type ManualReviewCondition = z.infer<typeof manualReviewConditionSchema>;

export const ruleSchema = z.object({
  /** Unique rule identifier */
  id: z.string(),
  /** Rule name for display */
  name: z.string(),
  /** Rule description */
  description: z.string(),
  /** Category this rule applies to */
  category: z.enum(["analytics", "ecommerce", "social", "ads", "custom", "consent", "unknown"]),
  /** Priority (higher = checked first) */
  priority: z.number().int().min(0).max(1000).default(500),
  /** Match conditions (ALL must be satisfied) */
  matchConditions: z.array(matchConditionSchema).min(1),
  /** Transformation to apply */
  transform: transformSchema,
  /** Whether this mapping is provisional (best-effort, not vendor-documented). */
  provisional: z.boolean().default(false),
  /** Evidence reference (documentation URL) */
  evidenceRef: z.string().url(),
  /** Constraints to validate */
  constraints: z.array(constraintSchema).optional(),
  /** Manual review conditions */
  manualReview: z.array(manualReviewConditionSchema).optional(),
  /** Tags for filtering/grouping */
  tags: z.array(z.string()).optional()
});

export type Rule = z.infer<typeof ruleSchema>;

export const rulesetSchema = z.object({
  /** Ruleset version */
  version: z.string(),
  /** Ruleset name */
  name: z.string(),
  /** Description */
  description: z.string().optional(),
  /** Creation/update timestamp */
  lastModified: z.string(),
  /** Rules in this ruleset */
  rules: z.array(ruleSchema)
});

export type Ruleset = z.infer<typeof rulesetSchema>;

export const ruleMatchResultSchema = z.object({
  /** Whether the rule matched */
  matched: z.boolean(),
  /** The rule that matched */
  rule: ruleSchema.optional(),
  /** True when the matched tag is missing a required parameter. */
  missingRequired: z.boolean().optional(),
  /** Client-param names flagged as required-but-absent on the source tag. */
  missingParameters: z.array(z.string()).optional(),
  /** Additional context from matching */
  matchContext: z.record(z.unknown()).optional()
});

export type RuleMatchResult = z.infer<typeof ruleMatchResultSchema>;
