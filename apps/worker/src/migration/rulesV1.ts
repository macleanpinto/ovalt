import type { CanonicalTag, MappingRecord } from "./types.js";

/** Fallback when no rule matches — pipeline may replace via web agent before analyst review. */
export const RULESET_V1_GENERIC_EVIDENCE_REF = "ruleset:v1:generic" as const;

export function isGenericRulesetFallback(m: MappingRecord): boolean {
  return m.evidence.type === "docs" && m.evidence.ref === RULESET_V1_GENERIC_EVIDENCE_REF;
}

function categoryForTag(tag: CanonicalTag): MappingRecord["category"] {
  const blob = `${tag.name} ${tag.type} ${Object.values(tag.parameters).join(" ")}`.toLowerCase();
  if (/purchase|checkout|add_to_cart|ecommerce|awct|transaction/i.test(blob)) return "ecommerce";
  if (/facebook|meta|pixel|fbcapi|tiktok|snapchat|linkedin|twitter|pinterest/i.test(blob)) return "social";
  if (/googleads|awct|conversion|gclid|aw_remarketing/i.test(blob)) return "ads";
  if (/ga|googtag|gaawe|analytics|measurement/i.test(blob)) return "analytics";
  if (/cvt_|custom/i.test(tag.type)) return "custom";
  return "unknown";
}

/**
 * Docs-first rules (PRD): GA4 + Meta basics; unknowns get provisional scores and manual actions.
 */
export function applyRulesV1(tags: CanonicalTag[]): MappingRecord[] {
  const mappings: MappingRecord[] = [];

  for (const tag of tags) {
    const cat = categoryForTag(tag);
    const t = tag.type.toLowerCase();
    const nameLower = tag.name.toLowerCase();

    if (t === "googtag" || t.includes("googtag")) {
      const mid = tag.parameters.tagId ?? tag.parameters.measurementIdOverride ?? "";
      mappings.push({
        clientTagId: tag.tagId,
        clientTagName: tag.name,
        clientTagType: tag.type,
        category: "analytics",
        serverRecommendation:
          `Server container: GA4 / Google tag — forward to measurement ID ${mid || "(set measurement ID in server GA4 tag)"}; use first-party tagging URL; enable redaction for IP/PII per Google server-side guidance.`,
        confidence: 9.2,
        provisional: false,
        evidence: { type: "docs", ref: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data" },
        manualActions: mid ? [] : ["Verify Measurement ID and link web container Google tag to server_container_url."]
      });
      continue;
    }

    if (t === "gaawc" || t === "gaawe" || /ga4|gaawe/i.test(t)) {
      const ev = tag.parameters.eventName ?? tag.parameters.eventSettingsTable ?? "custom_event";
      mappings.push({
        clientTagId: tag.tagId,
        clientTagName: tag.name,
        clientTagType: tag.type,
        category: "analytics",
        serverRecommendation: `Server: GA4 event "${ev}" — mirror event parameters in server GA4 tag; map revenue/currency for ecommerce events.`,
        confidence: 8.6,
        provisional: true,
        evidence: { type: "docs", ref: "https://developers.google.com/tag-platform/tag-manager/server-side" },
        manualActions: ["Confirm event parameter mapping matches GA4 recommended schema for this event type."]
      });
      continue;
    }

    if (cat === "social" || /facebook|meta|pixel|fbcapi/i.test(nameLower)) {
      mappings.push({
        clientTagId: tag.tagId,
        clientTagName: tag.name,
        clientTagType: tag.type,
        category: "social",
        serverRecommendation:
          "Server: Meta Conversions API (or partner tag) — map client event to server event; send hashed PII per Meta policy; use server container clients.",
        confidence: 6.5,
        provisional: true,
        evidence: { type: "docs", ref: "https://developers.facebook.com/docs/marketing-api/conversions-api" },
        manualActions: [
          "Map Pixel ID / access token in server environment.",
          "Validate event_name and custom_data against Meta CAPI schema."
        ]
      });
      continue;
    }

    if (cat === "ecommerce") {
      mappings.push({
        clientTagId: tag.tagId,
        clientTagName: tag.name,
        clientTagType: tag.type,
        category: "ecommerce",
        serverRecommendation:
          "Server: preserve transaction_id, value, currency, items — use GA4 server purchase/charge events and validate against client payload.",
        confidence: 7.8,
        provisional: true,
        evidence: { type: "docs", ref: "https://developers.google.com/analytics/devguides/collection/ga4/reference/events" },
        manualActions: ["Confirm items array and coupon/tax mapping for your storefront."]
      });
      continue;
    }

    if (t.startsWith("cvt_") || t === "html") {
      mappings.push({
        clientTagId: tag.tagId,
        clientTagName: tag.name,
        clientTagType: tag.type,
        category: cat === "unknown" ? "custom" : cat,
        serverRecommendation:
          t === "html"
            ? "Custom HTML is not portable to server sandbox — rebuild as supported server tag or tag template."
            : "Community template: verify equivalent server template or HTTP request tag; test in server preview.",
        confidence: t === "html" ? 4.0 : 5.5,
        provisional: true,
        evidence: { type: "docs", ref: "https://developers.google.com/tag-platform/tag-manager/server-side/how-to-build-a-server-tag" },
        manualActions: [
          "Review template behavior and security constraints in server container.",
          "Document manual rebuild steps for client sign-off."
        ]
      });
      continue;
    }

    mappings.push({
      clientTagId: tag.tagId,
      clientTagName: tag.name,
      clientTagType: tag.type,
      category: cat,
      serverRecommendation:
        "Review tag type for server compatibility — add server-side tag or client transport to server endpoint as appropriate.",
      confidence: 5.8,
      provisional: true,
      evidence: { type: "docs", ref: RULESET_V1_GENERIC_EVIDENCE_REF },
      manualActions: ["No dedicated ruleset mapping; analyst review required before publish."]
    });
  }

  return mappings;
}

function weight(m: MappingRecord): number {
  if (m.category === "ecommerce" || m.category === "analytics") return 1.2;
  if (m.category === "social") return 1.0;
  return 0.85;
}

export function aggregateConfidence(mappings: MappingRecord[]): { score: number; provisional: boolean } {
  if (mappings.length === 0) return { score: 0, provisional: true };
  let sum = 0;
  let sumW = 0;
  for (const m of mappings) {
    const w = weight(m);
    sum += m.confidence * w;
    sumW += w;
  }
  const score = Number(Math.min(10, sum / sumW).toFixed(2));
  const provisional = mappings.some((x) => x.provisional || x.confidence < 7);
  return { score, provisional };
}
