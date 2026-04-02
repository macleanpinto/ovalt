import type { CanonicalTag, MappingRecord, ParityRow } from "./types.js";

/**
 * Enhanced validation utilities for migration quality checks.
 * Works with the ruleset engine's validation output.
 */

const PII_KEYS = /email|phone|mobile|ssn|firstname|last_name|address|zip|postal|user_id|userid/i;

export function scanPiiInTags(tags: CanonicalTag[]): { fields: string[]; level: "low" | "medium" | "high" } {
  const fields: string[] = [];
  for (const t of tags) {
    for (const k of t.rawParameterKeys) {
      if (PII_KEYS.test(k)) fields.push(`${t.name}:${k}`);
    }
    for (const k of Object.keys(t.parameters)) {
      if (PII_KEYS.test(k)) fields.push(`${t.name}:${k}`);
    }
  }
  const level: "low" | "medium" | "high" = fields.length > 8 ? "high" : fields.length > 2 ? "medium" : "low";
  return { fields: [...new Set(fields)], level };
}

export function consentHints(tags: CanonicalTag[]): { consentModeRecommended: boolean; notes: string[] } {
  const notes: string[] = [];
  const names = tags.map((t) => `${t.name} ${t.type}`).join(" ").toLowerCase();

  if (/consent|cmp|onetrust|cookiebot|didomi/i.test(names)) {
    notes.push(
      "✓ Consent platform detected — ensure server-side tags respect consent state (Consent Mode / GTM consent APIs).",
      "⚠ Verify consent signals are forwarded from web container to server container.",
      "⚠ Test that server-side tags are blocked when consent is not granted."
    );
  } else {
    notes.push(
      "⚠ No explicit consent platform tags detected — verify Consent Mode is wired for GDPR/CCPA regions.",
      "⚠ Consider implementing GTM Consent Mode API to gate server-side tags based on user consent."
    );
  }

  return { consentModeRecommended: true, notes };
}

export function buildParityMatrix(mappings: MappingRecord[]): ParityRow[] {
  return mappings.map((m) => ({
    clientEventOrTag: m.clientTagName,
    serverEquivalent: extractServerTagType(m.serverRecommendation),
    status: determineParityStatus(m),
    notes: m.manualActions[0]
  }));
}

/**
 * Extract server tag type from recommendation text.
 */
function extractServerTagType(recommendation: string): string {
  // Try to extract first line or first sentence as tag type
  const firstLine = recommendation.split("\n")[0]?.trim() || recommendation;
  const shortVersion = firstLine.slice(0, 80);

  // Clean up common prefixes
  return shortVersion
    .replace(/^Server-side\s+/i, "")
    .replace(/^Server:\s+/i, "")
    .trim();
}

/**
 * Determine parity status based on confidence and provisional flags.
 */
function determineParityStatus(mapping: MappingRecord): "match" | "review" | "gap" {
  if (mapping.confidence >= 8.5 && !mapping.provisional) {
    return "match";
  }
  if (mapping.confidence >= 6.0) {
    return "review";
  }
  return "gap";
}

export function countWarnings(mappings: MappingRecord[]): number {
  return mappings.filter((m) => m.provisional || m.confidence < 7).length;
}

/**
 * Count mappings by category for summary reporting.
 */
export function countByCategory(mappings: MappingRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const m of mappings) {
    counts[m.category] = (counts[m.category] || 0) + 1;
  }

  return counts;
}

/**
 * Identify high-risk mappings that require critical review.
 */
export function identifyHighRiskMappings(mappings: MappingRecord[]): MappingRecord[] {
  return mappings.filter(m =>
    m.confidence < 5.0 ||
    m.manualActions.some(a => a.includes("[CRITICAL]")) ||
    m.category === "custom" && m.confidence < 7.0
  );
}

/**
 * Generate compliance summary based on PII and consent findings.
 */
export function generateComplianceSummary(
  tags: CanonicalTag[],
  mappings: MappingRecord[]
): {
  piiDetected: boolean;
  piiLevel: "low" | "medium" | "high";
  consentPlatformDetected: boolean;
  complianceRisks: string[];
} {
  const piiScan = scanPiiInTags(tags);
  const consentInfo = consentHints(tags);

  const risks: string[] = [];

  if (piiScan.level === "high") {
    risks.push("High volume of PII parameters detected - verify hashing and redaction in server tags");
  }

  if (!consentInfo.consentModeRecommended && piiScan.fields.length > 0) {
    risks.push("PII detected without explicit consent platform - ensure GDPR/CCPA compliance");
  }

  // Check for Meta/social tags with PII
  const socialWithPII = mappings.filter(m =>
    m.category === "social" &&
    tags.find(t => t.tagId === m.clientTagId && piiScan.fields.some(f => f.startsWith(t.name)))
  );

  if (socialWithPII.length > 0) {
    risks.push(`${socialWithPII.length} social media tags with PII detected - verify SHA-256 hashing is applied`);
  }

  return {
    piiDetected: piiScan.fields.length > 0,
    piiLevel: piiScan.level,
    consentPlatformDetected: /consent|cmp|onetrust|cookiebot/i.test(
      tags.map(t => t.name).join(" ")
    ),
    complianceRisks: risks
  };
}
