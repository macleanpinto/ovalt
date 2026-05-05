import type { CanonicalTag, MappingRecord } from "../types.js";
import type { Constraint, ManualReviewCondition, Rule } from "./schema.js";

/**
 * Validation engine - checks constraints and determines manual review requirements.
 */

export type ValidationResult = {
  passed: boolean;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  field?: string;
};

export type ManualAction = {
  priority: "low" | "medium" | "high" | "critical";
  reason: string;
  recommendation: string;
};

/**
 * Validate a single constraint against a tag and its mapping.
 */
export function validateConstraint(
  tag: CanonicalTag,
  constraint: Constraint,
  mapping?: MappingRecord
): ValidationResult {
  const { type, field, severity, message } = constraint;

  switch (type) {
    case "requiresParameter": {
      if (!field) {
        return { passed: true, severity, message };
      }
      const hasParam = field in tag.parameters || tag.rawParameterKeys.includes(field);
      return {
        passed: hasParam,
        severity,
        message: hasParam ? `Parameter ${field} present` : message,
        field
      };
    }

    case "requiresConsent": {
      // Check if tag has consent-related parameters or if it's in a consent category
      const consentParams = ["consent", "consentMode", "consentState", "analytics_storage", "ad_storage"];
      const hasConsentParam = consentParams.some(
        cp => cp in tag.parameters || tag.rawParameterKeys.some(k => k.toLowerCase().includes("consent"))
      );
      const passed = hasConsentParam;
      return {
        passed,
        severity,
        message: passed ? "Consent handling detected" : message
      };
    }

    case "requiresPII": {
      // Check for PII-related parameters
      const piiPattern = /email|phone|mobile|firstname|lastname|address|zip|postal/i;
      const hasPII = Object.keys(tag.parameters).some(k => piiPattern.test(k)) ||
        tag.rawParameterKeys.some(k => piiPattern.test(k));

      // For PII constraints, "passed" means PII was found when expected
      return {
        passed: hasPII,
        severity,
        message: hasPII
          ? "PII parameters detected - ensure proper hashing/redaction in server tag"
          : message
      };
    }

    case "requiresSecureEndpoint": {
      // Check if any endpoint URLs in parameters are HTTPS
      const urlParams = Object.entries(tag.parameters).filter(([_, v]) =>
        typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))
      );

      if (urlParams.length === 0) {
        return { passed: true, severity, message };
      }

      const allSecure = urlParams.every(([_, v]) => v.startsWith("https://"));
      return {
        passed: allSecure,
        severity,
        message: allSecure ? "All endpoints use HTTPS" : message
      };
    }

    case "deprecatedFeature": {
      // Generic deprecation warning
      return {
        passed: false,
        severity,
        message
      };
    }

    case "customValidation": {
      // Custom validation logic can be extended here
      return {
        passed: true,
        severity,
        message
      };
    }

    default:
      return { passed: true, severity, message };
  }
}

/**
 * Validate all constraints for a rule against a tag.
 */
export function validateConstraints(
  tag: CanonicalTag,
  rule: Rule,
  mapping?: MappingRecord
): ValidationResult[] {
  if (!rule.constraints || rule.constraints.length === 0) {
    return [];
  }

  return rule.constraints.map(constraint => validateConstraint(tag, constraint, mapping));
}

/**
 * Evaluate manual review conditions to generate manual actions.
 */
export function evaluateManualReview(
  tag: CanonicalTag,
  rule: Rule,
  validationResults: ValidationResult[]
): ManualAction[] {
  const actions: ManualAction[] = [];

  if (!rule.manualReview || rule.manualReview.length === 0) {
    return actions;
  }

  for (const condition of rule.manualReview) {
    let shouldTrigger = false;

    switch (condition.trigger) {
      case "missingParameter": {
        const requiredParams = rule.transform.parameterMappings?.filter(pm => pm.required) || [];
        const missingParams = requiredParams.filter(
          pm => !(pm.clientParam in tag.parameters || tag.rawParameterKeys.includes(pm.clientParam))
        );
        shouldTrigger = missingParams.length > 0;
        break;
      }

      case "customTag": {
        shouldTrigger = tag.type.startsWith("cvt_") || tag.type === "html";
        break;
      }

      case "securityRisk": {
        // Check for inline HTML, external scripts, or unsafe patterns
        shouldTrigger = tag.type === "html" ||
          Object.values(tag.parameters).some(v =>
            typeof v === "string" && (v.includes("<script") || v.includes("eval("))
          );
        break;
      }

      case "complexLogic": {
        // Heuristic: many parameters or nested structures
        shouldTrigger = Object.keys(tag.parameters).length > 15 ||
          tag.rawParameterKeys.length > 20;
        break;
      }

      case "consentRequired": {
        // Check if validation found consent-related issues
        const hasConsentIssue = validationResults.some(
          vr => !vr.passed && vr.message.toLowerCase().includes("consent")
        );
        shouldTrigger = hasConsentIssue;
        break;
      }
    }

    if (shouldTrigger) {
      actions.push({
        priority: condition.priority,
        reason: `${condition.trigger}: ${tag.name}`,
        recommendation: condition.action
      });
    }
  }

  return actions;
}

/**
 * Generate standard manual actions based on validation results + provisional/missing-required flags.
 */
export function generateStandardManualActions(
  validationResults: ValidationResult[],
  provisional: boolean,
  missingRequired: boolean
): ManualAction[] {
  const actions: ManualAction[] = [];

  // Add actions for failed validations
  const criticalFailures = validationResults.filter(vr => !vr.passed && vr.severity === "critical");
  const errorFailures = validationResults.filter(vr => !vr.passed && vr.severity === "error");

  for (const failure of criticalFailures) {
    actions.push({
      priority: "critical",
      reason: "Critical validation failure",
      recommendation: failure.message
    });
  }

  for (const failure of errorFailures) {
    actions.push({
      priority: "high",
      reason: "Validation error",
      recommendation: failure.message
    });
  }

  if (missingRequired) {
    actions.push({
      priority: "high",
      reason: "Missing required parameter",
      recommendation: "Fill the required parameter on the source tag before deploying to server."
    });
  }

  if (provisional) {
    actions.push({
      priority: "medium",
      reason: "Provisional mapping",
      recommendation: "Mapping is best-effort (no vendor documentation). Verify parameter mappings and test event delivery in server container preview."
    });
  }

  return actions;
}
