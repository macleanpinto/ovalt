import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { CanonicalTag, MappingRecord, MappingEvidence } from "./types.js";
import { isGenericRulesetFallback } from "./rulesV1.js";
import { braveWebSearch, type WebSearchHit } from "./webSearch.js";

const ANALYST_REVIEW_LINE = "No dedicated ruleset mapping; analyst review required before publish.";

const agentJsonSchema = z.object({
  category: z.enum(["analytics", "ecommerce", "social", "ads", "custom", "unknown"]),
  serverRecommendation: z.string().min(20).max(2500),
  confidence: z.number().min(0).max(10),
  provisional: z.boolean(),
  manualActions: z.array(z.string().min(3).max(400)).max(6),
  primaryDocUrl: z.string().url().optional()
});

export type MappingAgentEnv = {
  braveApiKey?: string;
  /** When set (with model id), structured mapping uses Amazon Bedrock instead of snippet-only fallback. */
  bedrock?: { client: BedrockRuntimeClient; modelId: string };
};

function buildSearchQuery(tag: CanonicalTag): string {
  const type = tag.type.trim() || "unknown";
  return `Google Tag Manager server-side "${type}" tag migration sGTM`;
}

function hitsToContext(hits: WebSearchHit[]): string {
  return hits
    .slice(0, 6)
    .map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.description}`)
    .join("\n\n");
}

function extractJsonFromModelText(text: string): string {
  const t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function mappingFromHits(
  base: MappingRecord,
  hits: WebSearchHit[],
  query: string
): MappingRecord {
  const top = hits[0];
  const summary = hits
    .slice(0, 3)
    .map((h) => `• ${h.title}: ${h.description.slice(0, 220)}${h.description.length > 220 ? "…" : ""}`)
    .join("\n");

  const evidence: MappingEvidence = {
    type: "agent_web",
    ref: top?.url ?? "agent:web-search",
    sources: hits.slice(0, 5).map((h) => ({ title: h.title, url: h.url })),
    searchQuery: query
  };

  return {
    ...base,
    category: base.category === "unknown" ? "custom" : base.category,
    serverRecommendation: [
      "Web-assisted mapping (rule engine had no dedicated match). Synthesize a server-side approach from the sources below; prefer official vendor / Google docs.",
      "",
      summary || "(no snippet text returned)",
      "",
      "Validate parameters and security constraints in server GTM preview before publish."
    ].join("\n"),
    confidence: Math.min(6.4, base.confidence + 0.3),
    provisional: true,
    evidence,
    manualActions: [
      "Cross-check the cited URLs against the vendor’s current server-side / CAPI / sGTM documentation.",
      "Confirm event names, PII hashing, and consent behavior for your regions."
    ]
  };
}

async function synthesizeWithBedrock(opts: {
  client: BedrockRuntimeClient;
  modelId: string;
  tag: CanonicalTag;
  hits: WebSearchHit[];
  query: string;
}): Promise<z.infer<typeof agentJsonSchema> | null> {
  const { client, modelId, tag, hits, query } = opts;
  const paramKeys = [...new Set([...Object.keys(tag.parameters), ...tag.rawParameterKeys])].slice(0, 40);

  const user = [
    `GTM client tag to migrate to server-side GTM:`,
    `- name: ${tag.name}`,
    `- type: ${tag.type}`,
    `- parameter keys (sample): ${paramKeys.join(", ") || "(none)"}`,
    "",
    `Search query used: ${query}`,
    "",
    "Search results (snippets):",
    hitsToContext(hits),
    "",
    "Return ONLY a single JSON object with keys: category, serverRecommendation, confidence, provisional, manualActions, primaryDocUrl (optional).",
    "manualActions must be concrete verification steps — do NOT say analyst review required if documentation supports a path.",
    "confidence: be conservative (typically 5.5–7.5) unless snippets are clearly official vendor docs."
  ].join("\n");

  const res = await client.send(
    new ConverseCommand({
      modelId,
      messages: [
        {
          role: "user",
          content: [{ text: user }]
        }
      ],
      system: [
        {
          text: "You are a senior analytics engineer specializing in Google Tag Manager server-side containers. Respond with a single valid JSON object only, no markdown code fences or other prose."
        }
      ],
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.2
      }
    })
  );

  const blocks = res.output?.message?.content ?? [];
  const textBlock = blocks.find(
    (c: { text?: unknown }): c is { text: string } => typeof c.text === "string"
  );
  const raw = textBlock?.text ? extractJsonFromModelText(textBlock.text) : "";
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const out = agentJsonSchema.safeParse(parsed);
  return out.success ? out.data : null;
}

function bedrockFromProcessEnv(e: NodeJS.ProcessEnv): MappingAgentEnv["bedrock"] {
  const modelId = e.TAG_RELAY_BEDROCK_MODEL_ID?.trim();
  if (!modelId) return undefined;
  const region = e.AWS_REGION?.trim() || "us-east-1";
  const endpoint = e.AWS_ENDPOINT?.trim();
  const client = new BedrockRuntimeClient({
    region,
    ...(endpoint ? { endpoint } : {})
  });
  return { client, modelId };
}

/**
 * For tags the rules engine only mapped generically, search the web and try to produce a concrete mapping.
 * On failure (no API key, search empty, or errors), returns the original record so analyst review copy stays.
 */
export async function tryWebAgentMapping(
  tag: CanonicalTag,
  baseMapping: MappingRecord,
  env: MappingAgentEnv
): Promise<MappingRecord> {
  if (!isGenericRulesetFallback(baseMapping)) return baseMapping;

  const braveKey = env.braveApiKey?.trim();
  if (!braveKey) return baseMapping;

  const query = buildSearchQuery(tag);
  let hits: WebSearchHit[];
  try {
    hits = await braveWebSearch(query, braveKey);
  } catch {
    return baseMapping;
  }

  if (hits.length === 0) return baseMapping;

  const bedrock = env.bedrock;
  if (bedrock) {
    try {
      const syn = await synthesizeWithBedrock({
        client: bedrock.client,
        modelId: bedrock.modelId,
        tag,
        hits,
        query
      });
      if (syn) {
        const primary = syn.primaryDocUrl ?? hits[0]?.url ?? "agent:web-search";
        const evidence: MappingEvidence = {
          type: "agent_web",
          ref: primary,
          sources: hits.slice(0, 5).map((h) => ({ title: h.title, url: h.url })),
          searchQuery: query
        };
        const cleanedActions = syn.manualActions.filter((a) => !/analyst review required/i.test(a));
        return {
          ...baseMapping,
          category: syn.category,
          serverRecommendation: syn.serverRecommendation,
          confidence: Math.min(10, Math.max(0, syn.confidence)),
          provisional: syn.provisional,
          evidence,
          manualActions:
            cleanedActions.length > 0
              ? cleanedActions
              : ["Verify against official documentation before publish."]
        };
      }
    } catch {
      /* fall through to snippet-only */
    }
  }

  return mappingFromHits(baseMapping, hits, query);
}

export function parseMappingAgentEnv(e: NodeJS.ProcessEnv): MappingAgentEnv {
  return {
    braveApiKey: e.TAG_RELAY_BRAVE_SEARCH_API_KEY || e.BRAVE_SEARCH_API_KEY,
    bedrock: bedrockFromProcessEnv(e)
  };
}

/** True when the pipeline should surface hard analyst review for this mapping. */
export function mappingNeedsAnalystEscalation(m: MappingRecord): boolean {
  return m.manualActions.some((a) => a.includes(ANALYST_REVIEW_LINE) || a.toLowerCase().includes("analyst review required"));
}

/**
 * Zip tags with rule output and run the web agent for generic fallbacks only.
 */
export async function enrichMappingsWithWebAgent(
  tags: CanonicalTag[],
  mappings: MappingRecord[],
  env: MappingAgentEnv
): Promise<MappingRecord[]> {
  if (!env.braveApiKey?.trim()) return mappings;

  const out: MappingRecord[] = [];
  for (let i = 0; i < mappings.length; i++) {
    const m = mappings[i];
    const tag = tags[i];
    if (!tag || !isGenericRulesetFallback(m)) {
      out.push(m);
      continue;
    }
    const upgraded = await tryWebAgentMapping(tag, m, env);
    out.push(upgraded);
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}
