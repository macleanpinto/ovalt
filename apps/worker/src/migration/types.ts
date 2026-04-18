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

/** Rule-engine docs link, agent web search + synthesis, or ruleset-internal marker. */
export type MappingEvidence =
  | { type: "docs"; ref: string }
  | {
      type: "agent_web";
      /** Primary documentation URL or first search hit */
      ref: string;
      sources?: { title?: string; url: string }[];
      searchQuery?: string;
    };

export type MappingRecord = {
  clientTagId: string;
  clientTagName: string;
  clientTagType: string;
  category: "analytics" | "ecommerce" | "social" | "ads" | "custom" | "consent" | "unknown";
  serverRecommendation: string;
  confidence: number;
  provisional: boolean;
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
  confidence: number;
  provisional: boolean;
  manualActions: string[];
};

export type ParityRow = {
  clientEventOrTag: string;
  serverEquivalent: string;
  status: "match" | "review" | "gap";
  notes?: string;
};

export type QueueMessage =
  | {
      type: "migration";
      runId: string;
      importId: string;
      projectId: string;
      rulesetVersion: string;
    }
  | {
      type: "deployment";
      runId: string;
      deploymentConfig: {
        clientContainerPath: string;
        clientWorkspacePath: string;
        serverContainerPath: string;
        serverContainerUrl: string;
        approvedTagIds: string[];
        tagsByType: Record<string, string[]>;
        metaAccessToken?: string;
      };
      gtmSessionId: string;
    };
