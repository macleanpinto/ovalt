import type { CanonicalTag } from "../types.js";
import type { MatchCondition, Rule, RuleMatchResult } from "./schema.js";

/**
 * Rule matching engine - evaluates match conditions against canonical tags.
 */

function testCondition(tag: CanonicalTag, condition: MatchCondition): boolean {
  const { field, operator, value, caseSensitive = false, negate = false } = condition;

  let testValue: string | string[];

  // Extract the field value from the tag
  switch (field) {
    case "tagType":
      testValue = tag.type;
      break;
    case "tagName":
      testValue = tag.name;
      break;
    case "hasParameter":
      // Check if parameter exists
      if (typeof value === "string") {
        const hasParam = value in tag.parameters || tag.rawParameterKeys.includes(value);
        return negate ? !hasParam : hasParam;
      }
      return negate ? true : false;
    case "parameterValue":
      // Check parameter value (format: "paramName:paramValue")
      if (typeof value === "string" && value.includes(":")) {
        const [paramName, expectedValue] = value.split(":", 2);
        testValue = tag.parameters[paramName] || "";
        return matchOperator(testValue, operator, expectedValue, caseSensitive) !== negate;
      }
      return negate ? true : false;
    case "category":
      // Category is determined by heuristics, match against tag content
      testValue = `${tag.name} ${tag.type} ${Object.values(tag.parameters).join(" ")}`;
      break;
    default:
      return false;
  }

  // Normalize case if needed
  let normalizedValue = value;
  if (!caseSensitive && typeof testValue === "string") {
    testValue = testValue.toLowerCase();
    if (typeof value === "string") {
      normalizedValue = value.toLowerCase();
    } else if (Array.isArray(value)) {
      normalizedValue = value.map(v => v.toLowerCase());
    }
  }

  const result = matchOperator(testValue, operator, normalizedValue, caseSensitive);
  return negate ? !result : result;
}

function matchOperator(
  testValue: string | string[],
  operator: MatchCondition["operator"],
  value: string | string[],
  caseSensitive: boolean
): boolean {
  const testStr = Array.isArray(testValue) ? testValue.join(" ") : testValue;

  switch (operator) {
    case "equals":
      if (typeof value === "string") {
        return testStr === value;
      }
      return false;

    case "contains":
      if (typeof value === "string") {
        return testStr.includes(value);
      }
      return false;

    case "matches":
      if (typeof value === "string") {
        try {
          const flags = caseSensitive ? "" : "i";
          const regex = new RegExp(value, flags);
          return regex.test(testStr);
        } catch {
          return false;
        }
      }
      return false;

    case "startsWith":
      if (typeof value === "string") {
        return testStr.startsWith(value);
      }
      return false;

    case "oneOf":
      if (Array.isArray(value)) {
        return value.some(v => testStr === v || testStr.includes(v));
      }
      return false;

    default:
      return false;
  }
}

/**
 * Check if all match conditions are satisfied for a given tag.
 */
export function evaluateRule(tag: CanonicalTag, rule: Rule): RuleMatchResult {
  // All conditions must match (AND logic)
  const allMatch = rule.matchConditions.every(condition => testCondition(tag, condition));

  if (!allMatch) {
    return { matched: false };
  }

  // Calculate confidence modifier based on parameter completeness
  let confidenceModifier = 0;
  const paramMappings = rule.transform.parameterMappings || [];
  const requiredParams = paramMappings.filter(pm => pm.required);

  if (requiredParams.length > 0) {
    const foundRequired = requiredParams.filter(pm =>
      pm.clientParam in tag.parameters || tag.rawParameterKeys.includes(pm.clientParam)
    );

    if (foundRequired.length < requiredParams.length) {
      // Missing required parameters - reduce confidence
      confidenceModifier = -1.5;
    } else {
      // All required parameters present - slight boost
      confidenceModifier = 0.3;
    }
  }

  return {
    matched: true,
    rule,
    confidenceModifier,
    matchContext: {
      matchedConditions: rule.matchConditions.length,
      hasRequiredParams: requiredParams.length === 0 || confidenceModifier >= 0
    }
  };
}

/**
 * Find the first matching rule for a tag.
 * Rules are evaluated in priority order (highest first).
 */
export function findMatchingRule(tag: CanonicalTag, rules: Rule[]): RuleMatchResult {
  // Sort rules by priority (descending)
  const sortedRules = [...rules].sort((a, b) => (b.priority || 500) - (a.priority || 500));

  for (const rule of sortedRules) {
    const result = evaluateRule(tag, rule);
    if (result.matched) {
      return result;
    }
  }

  return { matched: false };
}

/**
 * Find all matching rules for a tag (useful for debugging).
 */
export function findAllMatchingRules(tag: CanonicalTag, rules: Rule[]): RuleMatchResult[] {
  const sortedRules = [...rules].sort((a, b) => (b.priority || 500) - (a.priority || 500));

  return sortedRules
    .map(rule => evaluateRule(tag, rule))
    .filter(result => result.matched);
}
