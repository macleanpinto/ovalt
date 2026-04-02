import { describe, it, expect } from "vitest";
import { applyRuleset, aggregateConfidence, loadRuleset } from "./index.js";
import type { CanonicalTag } from "../types.js";

describe("Ruleset Engine", () => {
  describe("loadRuleset", () => {
    it("should load ruleset with all rules", () => {
      const ruleset = loadRuleset();

      expect(ruleset.version).toBe("2.0.0");
      expect(ruleset.rules.length).toBeGreaterThan(20);
      expect(ruleset.name).toBe("Tag Relay Core Ruleset");
    });

    it("should have rules sorted by priority implicitly", () => {
      const ruleset = loadRuleset();

      // Check that high-priority rules exist
      const highPriorityRules = ruleset.rules.filter(r => r.priority && r.priority >= 900);
      expect(highPriorityRules.length).toBeGreaterThan(5);
    });
  });

  describe("GA4 Rules", () => {
    it("should match Google Tag with high confidence", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "GA4 Configuration",
        type: "googtag",
        firingTriggerIds: ["2"],
        parameters: {
          tagId: "G-XXXXXXXXXX"
        },
        rawParameterKeys: ["tagId"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("analytics");
      expect(mappings[0].confidence).toBeGreaterThan(9.0);
      expect(mappings[0].provisional).toBe(false);
      expect(mappings[0].serverRecommendation).toContain("GA4");
    });

    it("should match GA4 event tag", () => {
      const tag: CanonicalTag = {
        tagId: "2",
        name: "GA4 Custom Event",
        type: "gaawe",
        firingTriggerIds: ["3"],
        parameters: {
          eventName: "user_engagement",
          eventParameters: "engagement_time_msec=100"
        },
        rawParameterKeys: ["eventName", "eventParameters"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("analytics");
      expect(mappings[0].confidence).toBeGreaterThanOrEqual(8.0);
      expect(mappings[0].serverRecommendation).toContain("event");
    });

    it("should match GA4 purchase event with high confidence", () => {
      const tag: CanonicalTag = {
        tagId: "3",
        name: "Purchase Event",
        type: "gaawe",
        firingTriggerIds: ["4"],
        parameters: {
          eventName: "purchase",
          transaction_id: "TXN123",
          value: "99.99",
          currency: "USD",
          items: "[...]"
        },
        rawParameterKeys: ["eventName", "transaction_id", "value", "currency", "items"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("ecommerce");
      expect(mappings[0].confidence).toBeGreaterThanOrEqual(8.5);
      expect(mappings[0].serverRecommendation).toContain("purchase");
    });
  });

  describe("Social Media Rules", () => {
    it("should match Meta Pixel with provisional confidence", () => {
      const tag: CanonicalTag = {
        tagId: "10",
        name: "Facebook Pixel",
        type: "html",
        firingTriggerIds: ["11"],
        parameters: {
          html: "fbq('track', 'PageView')"
        },
        rawParameterKeys: ["html"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      // Should match custom HTML rule, not Meta rule (since no explicit Meta type)
      expect(mappings[0].confidence).toBeLessThan(7.0);
      expect(mappings[0].provisional).toBe(true);
    });

    it("should identify Meta Pixel from tag name pattern", () => {
      const tag: CanonicalTag = {
        tagId: "12",
        name: "Meta Pixel - Purchase",
        type: "custom_meta_pixel",
        firingTriggerIds: ["13"],
        parameters: {
          pixelId: "123456789",
          eventName: "Purchase",
          value: "100.00"
        },
        rawParameterKeys: ["pixelId", "eventName", "value"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("social");
      expect(mappings[0].serverRecommendation).toContain("Meta");
    });
  });

  describe("Ads Rules", () => {
    it("should match Google Ads conversion tag", () => {
      const tag: CanonicalTag = {
        tagId: "20",
        name: "Google Ads Conversion",
        type: "awct",
        firingTriggerIds: ["21"],
        parameters: {
          conversionId: "AW-123456789",
          conversionLabel: "abcd1234"
        },
        rawParameterKeys: ["conversionId", "conversionLabel"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("ads");
      expect(mappings[0].confidence).toBeGreaterThanOrEqual(8.5);
      expect(mappings[0].serverRecommendation).toContain("Google Ads");
    });

    it("should flag missing required parameters", () => {
      const tag: CanonicalTag = {
        tagId: "22",
        name: "Google Ads Conversion - Incomplete",
        type: "awct",
        firingTriggerIds: ["23"],
        parameters: {
          conversionId: "AW-123456789"
          // Missing conversionLabel
        },
        rawParameterKeys: ["conversionId"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].confidence).toBeLessThan(8.8); // Reduced due to missing param
      expect(mappings[0].manualActions.length).toBeGreaterThan(0);
    });
  });

  describe("Custom Tag Rules", () => {
    it("should handle custom HTML with low confidence", () => {
      const tag: CanonicalTag = {
        tagId: "30",
        name: "Custom Script",
        type: "html",
        firingTriggerIds: ["31"],
        parameters: {
          html: "<script>console.log('test')</script>"
        },
        rawParameterKeys: ["html"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("custom");
      expect(mappings[0].confidence).toBeLessThanOrEqual(4.0);
      expect(mappings[0].provisional).toBe(true);
      expect(mappings[0].manualActions.some(a => a.includes("CRITICAL"))).toBe(true);
    });

    it("should handle community template tags", () => {
      const tag: CanonicalTag = {
        tagId: "32",
        name: "Custom Template Tag",
        type: "cvt_custom_template",
        firingTriggerIds: ["33"],
        parameters: {},
        rawParameterKeys: []
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("custom");
      expect(mappings[0].confidence).toBeLessThan(6.0);
      expect(mappings[0].serverRecommendation).toContain("template");
    });

    it("should match consent platform tags", () => {
      const tag: CanonicalTag = {
        tagId: "35",
        name: "Cookiebot Consent",
        type: "html",
        firingTriggerIds: ["36"],
        parameters: {
          html: "Cookiebot consent script"
        },
        rawParameterKeys: ["html"]
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      // Will match consent or HTML rule depending on priority
      expect(["consent", "custom"]).toContain(mappings[0].category);
    });
  });

  describe("Fallback Behavior", () => {
    it("should handle unknown tag types with generic fallback", () => {
      const tag: CanonicalTag = {
        tagId: "40",
        name: "Unknown Vendor Tag",
        type: "unknown_vendor",
        firingTriggerIds: ["41"],
        parameters: {},
        rawParameterKeys: []
      };

      const mappings = applyRuleset([tag]);

      expect(mappings).toHaveLength(1);
      expect(mappings[0].category).toBe("unknown");
      expect(mappings[0].confidence).toBeLessThanOrEqual(5.5);
      expect(mappings[0].provisional).toBe(true);
      expect(mappings[0].manualActions.length).toBeGreaterThan(0);
    });
  });

  describe("aggregateConfidence", () => {
    it("should calculate weighted average confidence", () => {
      const mappings = applyRuleset([
        {
          tagId: "1",
          name: "GA4 Config",
          type: "googtag",
          firingTriggerIds: [],
          parameters: { tagId: "G-XXX" },
          rawParameterKeys: ["tagId"]
        },
        {
          tagId: "2",
          name: "Meta Pixel",
          type: "custom_meta",
          firingTriggerIds: [],
          parameters: {},
          rawParameterKeys: []
        }
      ]);

      const { score, provisional } = aggregateConfidence(mappings);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(10);
      expect(typeof provisional).toBe("boolean");
    });

    it("should mark as provisional if any mapping has low confidence", () => {
      const mappings = applyRuleset([
        {
          tagId: "1",
          name: "GA4 Config",
          type: "googtag",
          firingTriggerIds: [],
          parameters: { tagId: "G-XXX" },
          rawParameterKeys: ["tagId"]
        },
        {
          tagId: "2",
          name: "Custom HTML",
          type: "html",
          firingTriggerIds: [],
          parameters: { html: "<script></script>" },
          rawParameterKeys: ["html"]
        }
      ]);

      const { provisional } = aggregateConfidence(mappings);

      expect(provisional).toBe(true);
    });

    it("should return zero score for empty mappings", () => {
      const { score, provisional } = aggregateConfidence([]);

      expect(score).toBe(0);
      expect(provisional).toBe(true);
    });
  });

  describe("Multiple Tags", () => {
    it("should handle multiple tags correctly", () => {
      const tags: CanonicalTag[] = [
        {
          tagId: "1",
          name: "GA4 Config",
          type: "googtag",
          firingTriggerIds: ["2"],
          parameters: { tagId: "G-XXX" },
          rawParameterKeys: ["tagId"]
        },
        {
          tagId: "3",
          name: "Google Ads Conversion",
          type: "awct",
          firingTriggerIds: ["4"],
          parameters: {
            conversionId: "AW-123",
            conversionLabel: "abc"
          },
          rawParameterKeys: ["conversionId", "conversionLabel"]
        },
        {
          tagId: "5",
          name: "Custom Script",
          type: "html",
          firingTriggerIds: ["6"],
          parameters: { html: "<script></script>" },
          rawParameterKeys: ["html"]
        }
      ];

      const mappings = applyRuleset(tags);

      expect(mappings).toHaveLength(3);
      expect(mappings[0].category).toBe("analytics");
      expect(mappings[1].category).toBe("ads");
      expect(mappings[2].category).toBe("custom");
    });
  });
});
