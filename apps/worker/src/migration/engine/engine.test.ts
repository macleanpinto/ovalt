import { describe, it, expect } from "vitest";
import { applyRuleset, runNeedsReview, loadRuleset, SUPPORTED_CLIENT_TAG_TYPES, isSupportedClientTagType } from "./index.js";
import type { CanonicalTag } from "../types.js";

describe("Ruleset Engine", () => {
  describe("loadRuleset", () => {
    it("should load ruleset with all rules", () => {
      const ruleset = loadRuleset();
      expect(ruleset.version).toBe("2.0.0");
      expect(ruleset.rules.length).toBeGreaterThan(20);
      expect(ruleset.name).toBe("Tag Relay Core Ruleset");
    });

    it("should have high-priority rules", () => {
      const ruleset = loadRuleset();
      const highPriorityRules = ruleset.rules.filter(r => r.priority && r.priority >= 900);
      expect(highPriorityRules.length).toBeGreaterThan(5);
    });
  });

  describe("Supported tag-type whitelist", () => {
    it("exposes the five supported client tag types", () => {
      expect(SUPPORTED_CLIENT_TAG_TYPES).toEqual([
        "gaawe",
        "googtag",
        "awct",
        "gclidw",
        "cvt_5RM3Q"
      ]);
    });

    it.each(["gaawe", "googtag", "awct", "gclidw", "cvt_5RM3Q"])(
      "isSupportedClientTagType(%s) === true",
      type => {
        expect(isSupportedClientTagType(type)).toBe(true);
      }
    );

    it.each(["html", "img", "gaawc", "ua", "cvt_other_template", "unknown_vendor"])(
      "isSupportedClientTagType(%s) === false",
      type => {
        expect(isSupportedClientTagType(type)).toBe(false);
      }
    );
  });

  describe("Supported client tag types", () => {
    it("maps googtag as supported analytics and non-provisional", () => {
      const tag: CanonicalTag = {
        tagId: "1",
        name: "GA4 Configuration",
        type: "googtag",
        firingTriggerIds: ["2"],
        parameters: { tagId: "G-XXXXXXXXXX" },
        rawParameterKeys: ["tagId"]
      };

      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.category).toBe("analytics");
      expect(mapping.provisional).toBe(false);
      expect(mapping.missingRequired).toBe(false);
    });

    it("maps gaawe as supported analytics", () => {
      const tag: CanonicalTag = {
        tagId: "2",
        name: "GA4 Custom Event",
        type: "gaawe",
        firingTriggerIds: ["3"],
        parameters: { eventName: "user_engagement" },
        rawParameterKeys: ["eventName"]
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.category).toBe("analytics");
    });

    it("maps awct as supported ads", () => {
      const tag: CanonicalTag = {
        tagId: "20",
        name: "Google Ads Conversion",
        type: "awct",
        firingTriggerIds: ["21"],
        parameters: { conversionId: "AW-123456789", conversionLabel: "abcd1234" },
        rawParameterKeys: ["conversionId", "conversionLabel"]
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.category).toBe("ads");
    });

    it("flags awct missingRequired when conversionLabel is absent and surfaces the param name", () => {
      const tag: CanonicalTag = {
        tagId: "22",
        name: "Google Ads Conversion - Incomplete",
        type: "awct",
        firingTriggerIds: ["23"],
        parameters: { conversionId: "AW-123456789" },
        rawParameterKeys: ["conversionId"]
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.missingRequired).toBe(true);
      expect(mapping.missingParameters).toEqual(["conversionLabel"]);
    });

    it("flags googtag with empty tagId as missingRequired: [tagId]", () => {
      const tag: CanonicalTag = {
        tagId: "7",
        name: "GA4 (empty)",
        type: "googtag",
        firingTriggerIds: [],
        parameters: { tagId: "   " },
        rawParameterKeys: ["tagId"]
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.missingRequired).toBe(true);
      expect(mapping.missingParameters).toEqual(["tagId"]);
    });

    it("lists empty missingParameters when all required params present", () => {
      const tag: CanonicalTag = {
        tagId: "8",
        name: "GA4 with id",
        type: "googtag",
        firingTriggerIds: [],
        parameters: { tagId: "G-XXXX" },
        rawParameterKeys: ["tagId"]
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.missingRequired).toBe(false);
      expect(mapping.missingParameters).toEqual([]);
    });

    it("maps cvt_5RM3Q (Meta Pixel community template) as supported + provisional with access-token reason", () => {
      const tag: CanonicalTag = {
        tagId: "50",
        name: "Meta Pixel",
        type: "cvt_5RM3Q",
        firingTriggerIds: ["51"],
        parameters: {},
        rawParameterKeys: []
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.provisional).toBe(true);
      // Meta rule no longer flags pixelId/eventName as missing — they live in
      // the community template's embedded config.
      expect(mapping.missingParameters).toEqual([]);
      expect(mapping.reviewReason).toContain("Meta CAPI access token");
    });

    it("maps gclidw as Conversion Linker with no required params", () => {
      const tag: CanonicalTag = {
        tagId: "60",
        name: "Google Ads - clicks",
        type: "gclidw",
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(true);
      expect(mapping.category).toBe("ads");
      expect(mapping.missingRequired).toBe(false);
      expect(mapping.missingParameters).toEqual([]);
      expect(mapping.reviewReason).toBeNull();
    });
  });

  describe("Unsupported client tag types", () => {
    it.each([
      "html",
      "img",
      "gaawc",
      "ua",
      "cvt_other_template",
      "unknown_vendor"
    ])("short-circuits %s as unsupported with a manual-rebuild action", type => {
      const tag: CanonicalTag = {
        tagId: `t-${type}`,
        name: `Tag of type ${type}`,
        type,
        firingTriggerIds: [],
        parameters: {},
        rawParameterKeys: []
      };
      const [mapping] = applyRuleset([tag]);
      expect(mapping.supported).toBe(false);
      expect(mapping.category).toBe("unknown");
      expect(mapping.provisional).toBe(true);
      expect(mapping.manualActions.some(a => a.includes("Unsupported"))).toBe(true);
      expect(mapping.serverRecommendation).toContain("not supported");
    });
  });

  describe("runNeedsReview", () => {
    it("returns true when any mapping is unsupported, provisional, or missingRequired", () => {
      const mappings = applyRuleset([
        { tagId: "1", name: "GA4 Config", type: "googtag", firingTriggerIds: [], parameters: { tagId: "G-XXX" }, rawParameterKeys: ["tagId"] },
        { tagId: "2", name: "Custom HTML", type: "html", firingTriggerIds: [], parameters: { html: "<script></script>" }, rawParameterKeys: ["html"] }
      ]);
      expect(runNeedsReview(mappings)).toBe(true);
    });

    it("returns true for empty mappings", () => {
      expect(runNeedsReview([])).toBe(true);
    });

    it("returns false when every mapping is supported, vendor-documented and complete", () => {
      const mappings = applyRuleset([
        { tagId: "1", name: "GA4 Config", type: "googtag", firingTriggerIds: [], parameters: { tagId: "G-XXX" }, rawParameterKeys: ["tagId"] }
      ]);
      expect(runNeedsReview(mappings)).toBe(false);
    });
  });

  describe("Multiple Tags", () => {
    it("preserves 1:1 tag-to-mapping alignment with mixed supported + unsupported", () => {
      const tags: CanonicalTag[] = [
        { tagId: "1", name: "GA4 Config", type: "googtag", firingTriggerIds: ["2"], parameters: { tagId: "G-XXX" }, rawParameterKeys: ["tagId"] },
        { tagId: "3", name: "Google Ads Conversion", type: "awct", firingTriggerIds: ["4"], parameters: { conversionId: "AW-123", conversionLabel: "abc" }, rawParameterKeys: ["conversionId", "conversionLabel"] },
        { tagId: "5", name: "Custom Script", type: "html", firingTriggerIds: ["6"], parameters: { html: "<script></script>" }, rawParameterKeys: ["html"] }
      ];
      const mappings = applyRuleset(tags);
      expect(mappings).toHaveLength(3);
      expect(mappings[0].supported).toBe(true);
      expect(mappings[0].category).toBe("analytics");
      expect(mappings[1].supported).toBe(true);
      expect(mappings[1].category).toBe("ads");
      expect(mappings[2].supported).toBe(false);
      expect(mappings[2].category).toBe("unknown");
    });
  });
});
