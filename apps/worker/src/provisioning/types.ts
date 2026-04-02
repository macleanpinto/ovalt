/**
 * Container provisioning types and status enums.
 */

export type ContainerProvisioningStatus =
  | "not_started"
  | "pending"
  | "provisioning"
  | "verifying"
  | "ready"
  | "failed"
  | "manual_intervention_required";

export type HostingProvider = "stape" | "taggrs" | "google_cloud" | "other" | "undecided";

export type ContainerInfo = {
  /** GTM server container public ID (GTM-XXXXXXX) */
  serverContainerPublicId?: string;
  /** GTM server container API path */
  serverContainerPath?: string;
  /** Server tagging URL (where browser requests are sent) */
  serverTaggingUrl?: string;
  /** Hosting provider */
  provider?: HostingProvider;
  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>;
};

export type ProvisioningResult = {
  status: ContainerProvisioningStatus;
  containerInfo?: ContainerInfo;
  message?: string;
  /** Actions required from user */
  requiredActions?: string[];
  /** Verification checks performed */
  verificationChecks?: VerificationCheck[];
};

export type VerificationCheck = {
  name: string;
  status: "passed" | "failed" | "skipped" | "pending";
  message: string;
  timestamp: string;
};

export type ProvisioningContext = {
  importId: string;
  projectId: string;
  /** Hosting configuration from import record */
  hosting?: {
    provider?: string;
    serverContainerPublicId?: string;
    serverTaggingUrl?: string;
    [key: string]: unknown;
  };
  /** GTM-specific metadata */
  gtm?: {
    containerPath?: string;
    serverContainerPath?: string;
    workspacePath?: string;
    [key: string]: unknown;
  };
};
