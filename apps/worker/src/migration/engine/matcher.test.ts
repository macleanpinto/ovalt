import { describe, it, expect } from "vitest";
import { evaluateRule, findMatchingRule } from "./matcher.js";
import type { CanonicalTag } from "../types.js";
import type { Rule } from "./schema.js";

describe("Rule Matcher", () => {
  describe("evaluateRule", () => {
    it("should match tag type equals condition", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "googtag",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "analytics",
        priority: 500,
        matchConditions: [
          {
            field: "tagType",
            operator: "equals",
            value: "googtag"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
      expect(result.rule).toBe(rule);
    });

    it("should match tag type contains condition", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "gaawe",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "analytics",
        priority: 500,
        matchConditions: [
          {
            field: "tagType",
            operator: "contains",
            value: "ga"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
    });

    it("should match hasParameter condition", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "test",
        firingTriggerIds: [],
        parameters: {
          eventName: "purchase"
        },
        rawParameterKeys: ["eventName"]
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "analytics",
        priority: 500,
        matchConditions: [
          {
            field: "hasParameter",
            operator: "equals",
            value: "eventName"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
    });

    it("should match parameterValue condition", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Purchase Event",
        type: "gaawe",
        firingTriggerIds: [],
        parameters: {
          eventName: "purchase"
        },
        rawParameterKeys: ["eventName"]
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "ecommerce",
        priority: 500,
        matchConditions: [
          {
            field: "parameterValue",
            operator: "equals",
            value: "eventName:purchase"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
    });

    it("should match category pattern", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Facebook Pixel",
        type: "custom",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "social",
        priority: 500,
        matchConditions: [
          {
            field: "category",
            operator: "matches",
            value: "facebook|meta"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
    });

    it("should require all conditions to match (AND logic)", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "gaawe",
        firingTriggerIds: [],
        parameters: {
          eventName: "purchase"
        },
        rawParameterKeys: ["eventName"]
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "ecommerce",
        priority: 500,
        matchConditions: [
          {
            field: "tagType",
            operator: "equals",
            value: "gaawe"
          },
          {
            field: "hasParameter",
            operator: "equals",
            value: "eventName"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
    });

    it("should fail if any condition doesn't match", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "gaawe",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "ecommerce",
        priority: 500,
        matchConditions: [
          {
            field: "tagType",
            operator: "equals",
            value: "gaawe"
          },
          {
            field: "hasParameter",
            operator: "equals",
            value: "eventName"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test"
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(false);
    });

    it("should flag missingRequired for missing required parameters", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "test",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rule: Rule = {
        id: "test-rule",
        name: "Test Rule",
        description: "Test",
        category: "analytics",
        priority: 500,
        matchConditions: [
          {
            field: "tagType",
            operator: "equals",
            value: "test"
          }
        ],
        transform: {
          serverTagType: "Test",
          description: "Test",
          parameterMappings: [
            {
              clientParam: "requiredParam",
              serverParam: "requiredParam",
              required: true
            }
          ]
        },
        provisional: false,
        evidenceRef: "https://example.com"
      };

      const result = evaluateRule(tag, rule);

      expect(result.matched).toBe(true);
      expect(result.missingRequired).toBe(true);
    });
  });

  describe("findMatchingRule", () => {
    it("should find highest priority matching rule", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "test",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rules: Rule[] = [
        {
          id: "low-priority",
          name: "Low Priority",
          description: "Test",
          category: "analytics",
          priority: 100,
          matchConditions: [
            {
              field: "tagType",
              operator: "equals",
              value: "test"
            }
          ],
          transform: {
            serverTagType: "Low",
            description: "Test"
          },
          provisional: false,
          evidenceRef: "https://example.com"
        },
        {
          id: "high-priority",
          name: "High Priority",
          description: "Test",
          category: "analytics",
          priority: 900,
          matchConditions: [
            {
              field: "tagType",
              operator: "equals",
              value: "test"
            }
          ],
          transform: {
            serverTagType: "High",
            description: "Test"
          },
          provisional: false,
          evidenceRef: "https://example.com"
        }
      ];

      const result = findMatchingRule(tag, rules);

      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe("high-priority");
    });

    it("should return no match if no rules match", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "Test Tag",
        type: "unknown",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };

      const rules: Rule[] = [
        {
          id: "test",
          name: "Test",
          description: "Test",
          category: "analytics",
          priority: 500,
          matchConditions: [
            {
              field: "tagType",
              operator: "equals",
              value: "different"
            }
          ],
          transform: {
            serverTagType: "Test",
            description: "Test"
          },
          provisional: false,
          evidenceRef: "https://example.com"
        }
      ];

      const result = findMatchingRule(tag, rules);

      expect(result.matched).toBe(false);
    });
  });
});
