import { z } from "zod";

/** Stored GTM API export shape from POST /gtm/import-container */
export const gtmExportSchema = z.object({
  kind: z.string().optional(),
  container: z.record(z.unknown()).optional(),
  workspacePath: z.string().optional(),
  entities: z
    .object({
      tags: z.array(z.record(z.unknown())).default([]),
      triggers: z.array(z.record(z.unknown())).default([]),
      variables: z.array(z.record(z.unknown())).default([]),
      folders: z.array(z.record(z.unknown())).optional(),
      builtInVariables: z.array(z.record(z.unknown())).optional()
    })
    .passthrough()
    .optional()
});

export type GtmExportPayload = z.infer<typeof gtmExportSchema>;

export type CanonicalTag = {
  tagId: string;
  name: string;
  type: string;
  firingTriggerIds: string[];
  parameters: Record<string, string>;
  /** Raw parameter list for debugging */
  rawParameterKeys: string[];
};

export type CanonicalVariable = {
  variableId: string;
  name: string;
  type: string;
  parameters: Record<string, string>;
  /** Raw parameter list for debugging */
  rawParameterKeys: string[];
  /** Format value settings if present */
  formatValue?: unknown;
};

/** Rule-engine docs link for this mapping. */
export type MappingEvidence = { type: "docs"; ref: string };

export type MappingRecord = {
  clientTagId: string;
  clientTagName: string;
  clientTagType: string;
  category: "analytics" | "ecommerce" | "social" | "ads" | "custom" | "consent" | "unknown";
  serverRecommendation: string;
  provisional: boolean;
  /** True when required parameters for this tag type are not present on the source tag. */
  missingRequired: boolean;
  /** Client-param names that are required by the matched rule but absent on the source tag. */
  missingParameters: string[];
  /** Whether this client tag type is in the supported whitelist and can be deployed. */
  supported: boolean;
  /**
   * Short human-readable reason this mapping needs review when no fields are
   * missing on the source tag. Used by the UI to explain "Needs Review" for
   * provisional mappings (e.g. Meta CAPI access token required at deploy).
   * Null when the tag is Ready or when missingParameters already explains it.
   */
  reviewReason: string | null;
  evidence: MappingEvidence;
  manualActions: string[];
};

export type VariableMappingRecord = {
  clientVariableId: string;
  clientVariableName: string;
  clientVariableType: string;
  category: "data-layer" | "constant" | "lookup" | "cookie" | "container" | "custom" | "client-only";
  serverRecommendation: string;
  canAutoMigrate: boolean;
  serverVariableType: string | null;
  provisional: boolean;
  manualActions: string[];
};

export type ParityRow = {
  clientEventOrTag: string;
  serverEquivalent: string;
  status: "match" | "review" | "gap";
  notes?: string;
};

export type MigrationMessage = {
  type?: "migration"; // Optional for backwards compatibility
  runId: string;
  importId: string;
  projectId: string;
  rulesetVersion: string;
};

export type DeploymentMessage = {
  type: "deployment";
  runId: string;
  gtmSessionId: string;
  deploymentConfig: {
    clientContainerPath: string;
    clientWorkspacePath: string;
    serverContainerPath: string;
    serverContainerUrl: string;
    approvedTagIds: string[];
    tagsByCategory: Record<string, string[]>;
    metaAccessToken?: string;
    /** Per-tag client-parameter overrides filled in by the user in Review & Deploy modal. */
    parameterOverrides?: Record<string, Record<string, string>>;
  };
};

export type QueueMessage = MigrationMessage | DeploymentMessage;
