import { describe, expect, it } from "vitest";
import { applyRulesV1, aggregateConfidence } from "./rulesV1.js";
import type { CanonicalTag } from "./types.js";

function tag(partial: Partial<CanonicalTag> & Pick<CanonicalTag, "tagId" | "name" | "type">): CanonicalTag {
  return {
    firingTriggerIds: [],
    parameters: {},
    rawParameterKeys: [],
    ...partial
  };
}

describe("applyRulesV1", () => {
  it("maps googtag with high confidence", () => {
    const tags: CanonicalTag[] = [
      tag({
        tagId: "1",
        name: "GA4 Config",
        type: "googtag",
        parameters: { tagId: "G-TEST123" }
      })
    ];
    const m = applyRulesV1(tags);
    expect(m).toHaveLength(1);
    expect(m[0].confidence).toBeGreaterThan(8);
    expect(m[0].category).toBe("analytics");
  });

  it("flags html tags for manual review", () => {
    const tags: CanonicalTag[] = [
      tag({
        tagId: "2",
        name: "Custom remarketing HTML",
        type: "html",
        parameters: {}
      })
    ];
    const m = applyRulesV1(tags);
    expect(m[0].confidence).toBeLessThan(6);
    expect(m[0].manualActions.length).toBeGreaterThan(0);
  });

  it("aggregateConfidence returns provisional when needed", () => {
    const tags: CanonicalTag[] = [
      tag({ tagId: "a", name: "x", type: "googtag", parameters: { tagId: "G-1" } }),
      tag({ tagId: "b", name: "y", type: "html", parameters: {} })
    ];
    const m = applyRulesV1(tags);
    const agg = aggregateConfidence(m);
    expect(agg.score).toBeGreaterThan(0);
    expect(agg.provisional).toBe(true);
  });
});
