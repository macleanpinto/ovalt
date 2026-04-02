import type { CanonicalTag } from "./types.js";
import type { MappingRecord } from "./types.js";
import type { ContainerProvisioningStatus, ContainerInfo } from "../provisioning/types.js";
import {
  buildParityMatrix,
  consentHints,
  scanPiiInTags,
  generateComplianceSummary,
  countByCategory,
  identifyHighRiskMappings
} from "./validation.js";
import { triggerSummary } from "./canonical.js";

export type MigrationReportPayload = {
  runId: string;
  importId: string;
  projectId: string;
  rulesetVersion: string;
  generatedAt: string;
  executiveSummary: string;
  confidenceScore: number;
  provisional: boolean;
  summaryCounts: {
    mappings: number;
    warnings: number;
    manualActions: number;
    highRisk: number;
    byCategory: Record<string, number>;
  };
  containerSummary: {
    totalTags: number;
    totalTriggers: number;
    totalVariables: number;
  };
  containerElements: {
    tags: Array<Record<string, unknown>>;
    triggers: Array<Record<string, unknown>>;
    variables: Array<Record<string, unknown>>;
  };
  complianceFlags: {
    piiRisk: "low" | "medium" | "high";
    consentModeRecommended: boolean;
    notes: string[];
    piiFieldsSample: string[];
    complianceRisks: string[];
  };
  containerProvisioning: {
    status: ContainerProvisioningStatus;
    containerInfo?: ContainerInfo;
    message?: string;
    requiredActions: string[];
  };
  parityMatrix: ReturnType<typeof buildParityMatrix>;
  mappings: MappingRecord[];
  manualActions: { priority: "high" | "medium" | "low"; reason: string; recommendation: string }[];
  detectedTags: {
    id: string;
    name: string;
    type: string;
    category: string;
    status: "ready" | "mapping" | "needs_review";
    triggerSummary: string;
    parameters?: Record<string, string>;
    firingTriggerIds?: string[];
  }[];
  frontendChangeSteps: string[];
};

function statusForMapping(m: MappingRecord): "ready" | "mapping" | "needs_review" {
  if (m.confidence >= 8.5 && !m.provisional) return "ready";
  if (m.confidence >= 6) return "mapping";
  return "needs_review";
}

function buildFrontendChangeSteps(containerProvisioning: {
  status: ContainerProvisioningStatus;
  containerInfo?: ContainerInfo;
  requiredActions: string[];
}): string[] {
  const steps: string[] = [];

  // Add container setup steps if not ready
  if (containerProvisioning.status !== "ready") {
    steps.push(...containerProvisioning.requiredActions);
    steps.push("Complete server container setup before proceeding with web container changes");
  }

  // Add standard deployment steps
  const serverUrl = containerProvisioning.containerInfo?.serverTaggingUrl || "your tagging server URL";

  steps.push(
    `Point your web Google tag / GA4 config to the server tagging URL (server_container_url = ${serverUrl})`,
    "Test in GTM preview mode - verify events are forwarding to the server container",
    "Publish the web container after validation in GTM preview",
    "Publish the server container after adding server-side GA4 / CAPI tags that mirror this blueprint",
    "Use first-party subdomain for tagging endpoint to improve cookie and ad-blocker resilience",
    "Monitor server-side tag delivery in GTM debug console and vendor platforms"
  );

  return steps;
}

function categoryLabel(m: MappingRecord): string {
  const map: Record<string, string> = {
    analytics: "ANALYTICS",
    ecommerce: "E-COMMERCE",
    social: "SOCIAL",
    ads: "ADS",
    custom: "CUSTOM",
    consent: "CONSENT",
    unknown: "GENERAL"
  };
  return map[m.category] ?? "GENERAL";
}

export function buildMigrationReport(opts: {
  runId: string;
  importId: string;
  projectId: string;
  rulesetVersion: string;
  tags: CanonicalTag[];
  mappings: MappingRecord[];
  confidenceScore: number;
  provisional: boolean;
  triggerLookup: Map<string, string>;
  containerProvisioning: {
    status: ContainerProvisioningStatus;
    containerInfo?: ContainerInfo;
    message?: string;
    requiredActions: string[];
  };
  containerSummary?: {
    totalTags: number;
    totalTriggers: number;
    totalVariables: number;
  };
  containerElements?: {
    tags: Array<Record<string, unknown>>;
    triggers: Array<Record<string, unknown>>;
    variables: Array<Record<string, unknown>>;
  };
}): MigrationReportPayload {
  const pii = scanPiiInTags(opts.tags);
  const consent = consentHints(opts.tags);
  const complianceSummary = generateComplianceSummary(opts.tags, opts.mappings);
  const categoryCounts = countByCategory(opts.mappings);
  const highRiskMappings = identifyHighRiskMappings(opts.mappings);
  const parityMatrix = buildParityMatrix(opts.mappings);

  const manualFlat: MigrationReportPayload["manualActions"] = [];
  for (const m of opts.mappings) {
    for (const rec of m.manualActions) {
      if (manualFlat.length >= 48) break;
      manualFlat.push({
        priority: m.confidence < 6 ? "high" : "medium",
        reason: `${m.clientTagName}: ${rec}`,
        recommendation: m.serverRecommendation.slice(0, 280)
      });
    }
  }

  const detectedTags = opts.tags.map((t, idx) => {
    const m = opts.mappings[idx];
    if (!m) {
      return {
        id: t.tagId,
        name: t.name,
        type: t.type,
        category: "GENERAL",
        status: "needs_review" as const,
        triggerSummary: triggerSummary(t, opts.triggerLookup),
        parameters: t.parameters,
        firingTriggerIds: t.firingTriggerIds
      };
    }
    return {
      id: t.tagId,
      name: t.name,
      type: t.type,
      category: categoryLabel(m),
      status: statusForMapping(m),
      triggerSummary: triggerSummary(t, opts.triggerLookup),
      parameters: t.parameters,
      firingTriggerIds: t.firingTriggerIds
    };
  });

  const warnings = opts.mappings.filter((m) => m.provisional || m.confidence < 7).length;

  // Add container provisioning context to executive summary
  const provisioningNote =
    opts.containerProvisioning.status === "ready"
      ? "Server container is verified and ready for deployment."
      : opts.containerProvisioning.status === "manual_intervention_required"
      ? "Server container requires manual setup before deployment."
      : `Server container status: ${opts.containerProvisioning.status}.`;

  const executiveSummary = [
    `Tag Relay migration run ${opts.runId} for import ${opts.importId} (${opts.projectId}).`,
    `Analyzed ${opts.tags.length} client-side tags with ruleset ${opts.rulesetVersion}.`,
    `Weighted confidence ${opts.confidenceScore}/10${opts.provisional ? " (provisional mappings present — review before publish)" : ""}.`,
    highRiskMappings.length > 0
      ? `${highRiskMappings.length} high-risk mappings require critical review before deployment.`
      : "All mappings meet minimum quality thresholds.",
    complianceSummary.piiDetected
      ? `PII-related parameters detected (${complianceSummary.piiLevel} sensitivity) — ensure proper hashing and consent.`
      : "No obvious PII parameter keys detected in scanned tag fields.",
    provisioningNote
  ].join(" ");

  return {
    runId: opts.runId,
    importId: opts.importId,
    projectId: opts.projectId,
    rulesetVersion: opts.rulesetVersion,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    confidenceScore: opts.confidenceScore,
    provisional: opts.provisional,
    summaryCounts: {
      mappings: opts.mappings.length,
      warnings,
      manualActions: manualFlat.length,
      highRisk: highRiskMappings.length,
      byCategory: categoryCounts
    },
    containerSummary: opts.containerSummary || {
      totalTags: opts.tags.length,
      totalTriggers: 0,
      totalVariables: 0
    },
    containerElements: opts.containerElements || {
      tags: [],
      triggers: [],
      variables: []
    },
    complianceFlags: {
      piiRisk: complianceSummary.piiLevel,
      consentModeRecommended: consent.consentModeRecommended,
      notes: [...consent.notes, ...(pii.fields.length ? [`PII-like keys: ${pii.fields.slice(0, 12).join("; ")}`] : [])],
      piiFieldsSample: pii.fields.slice(0, 24),
      complianceRisks: complianceSummary.complianceRisks
    },
    containerProvisioning: opts.containerProvisioning,
    parityMatrix,
    mappings: opts.mappings,
    manualActions: manualFlat,
    detectedTags,
    frontendChangeSteps: buildFrontendChangeSteps(opts.containerProvisioning)
  };
}
