import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanonicalTag, MappingRecord } from "./types.js";
import { RULESET_V1_GENERIC_EVIDENCE_REF } from "./rulesV1.js";
import {
  enrichMappingsWithWebAgent,
  mappingNeedsAnalystEscalation,
  tryWebAgentMapping,
  type MappingAgentEnv
} from "./mappingAgent.js";

function tag(partial: Partial<CanonicalTag> & Pick<CanonicalTag, "tagId" | "name" | "type">): CanonicalTag {
  return {
    firingTriggerIds: [],
    parameters: {},
    rawParameterKeys: [],
    ...partial
  };
}

function genericMapping(tag: CanonicalTag): MappingRecord {
  return {
    clientTagId: tag.tagId,
    clientTagName: tag.name,
    clientTagType: tag.type,
    category: "unknown",
    serverRecommendation: "generic",
    confidence: 5.8,
    provisional: true,
    evidence: { type: "docs", ref: RULESET_V1_GENERIC_EVIDENCE_REF },
    manualActions: ["No dedicated ruleset mapping; analyst review required before publish."]
  };
}

describe("mappingAgent", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("skips agent when Brave key is missing", async () => {
    const t = tag({ tagId: "1", name: "X", type: "vendor_xyz" });
    const m = [genericMapping(t)];
    const out = await enrichMappingsWithWebAgent([t], m, {});
    expect(out).toBe(m);
    expect(mappingNeedsAnalystEscalation(out[0])).toBe(true);
  });

  it("upgrades generic mapping when Brave returns hits and Bedrock returns JSON", async () => {
    const t = tag({ tagId: "1", name: "Pinterest", type: "pinterest_tag" });
    const m = [genericMapping(t)];

    const payload = {
      category: "social",
      serverRecommendation:
        "Server: Pinterest Conversions API — map events per Pinterest server-side documentation; hash PII.",
      confidence: 6.2,
      provisional: true,
      manualActions: ["Confirm Pinterest tag ID and access token in server environment."],
      primaryDocUrl: "https://example.com/docs"
    };

    const mockClient = {
      send: vi.fn().mockResolvedValue({
        output: {
          message: {
            content: [{ text: JSON.stringify(payload) }]
          }
        }
      })
    } as unknown as BedrockRuntimeClient;

    const env: MappingAgentEnv = {
      braveApiKey: "b",
      bedrock: { client: mockClient, modelId: "anthropic.claude-3-haiku-20240307-v1:0" }
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("brave.com")) {
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "Pinterest server-side",
                  url: "https://example.com/docs",
                  description: "Use Conversions API from server GTM."
                }
              ]
            }
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    });

    const out = await enrichMappingsWithWebAgent([t], m, env);
    expect(out[0].evidence.type).toBe("agent_web");
    expect(out[0].category).toBe("social");
    expect(mappingNeedsAnalystEscalation(out[0])).toBe(false);
    expect(mockClient.send).toHaveBeenCalled();
  });

  it("keeps analyst escalation when Brave returns no results", async () => {
    const t = tag({ tagId: "1", name: "X", type: "unknown_type" });
    const base = genericMapping(t);

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ web: { results: [] } }), { status: 200 })
    );

    const mockClient = { send: vi.fn() } as unknown as BedrockRuntimeClient;
    const out = await tryWebAgentMapping(t, base, {
      braveApiKey: "k",
      bedrock: { client: mockClient, modelId: "x" }
    });
    expect(out.evidence).toEqual(base.evidence);
    expect(mappingNeedsAnalystEscalation(out)).toBe(true);
    expect(mockClient.send).not.toHaveBeenCalled();
  });

  it("does not alter non-generic mappings", async () => {
    const t = tag({ tagId: "1", name: "GA", type: "googtag", parameters: { tagId: "G-1" } });
    const nonGeneric: MappingRecord = {
      clientTagId: t.tagId,
      clientTagName: t.name,
      clientTagType: t.type,
      category: "analytics",
      serverRecommendation: "GA server",
      confidence: 9,
      provisional: false,
      evidence: { type: "docs", ref: "https://developers.google.com/tag-platform/tag-manager/server-side" },
      manualActions: []
    };

    globalThis.fetch = vi.fn(() => {
      throw new Error("fetch should not run");
    });

    const out = await enrichMappingsWithWebAgent([t], [nonGeneric], { braveApiKey: "k" });
    expect(out[0]).toBe(nonGeneric);
  });
});
