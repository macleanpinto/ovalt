import type {
  ProvisioningContext,
  ProvisioningResult,
  ContainerInfo,
  ContainerProvisioningStatus
} from "./types.js";
import {
  validateContainerConfig,
  checkTaggingServerReachability,
  determineProvisioningStatus,
  generateRequiredActions
} from "./validator.js";

/**
 * Container provisioning service.
 * Orchestrates verification and status management for GTM server-side container provisioning.
 */

/**
 * Check current provisioning status and verify container configuration.
 * This is called during migration pipeline to ensure container is ready.
 */
export async function verifyContainerProvisioning(ctx: ProvisioningContext): Promise<ProvisioningResult> {
  // Extract container info from context
  const containerInfo: ContainerInfo = {
    serverContainerPublicId: ctx.hosting?.serverContainerPublicId || ctx.gtm?.serverContainerPath?.split("/").pop(),
    serverContainerPath: ctx.gtm?.serverContainerPath,
    serverTaggingUrl: ctx.hosting?.serverTaggingUrl,
    provider: normalizeProvider(ctx.hosting?.provider),
    providerMetadata: ctx.hosting
  };

  // Run validation checks
  const checks = validateContainerConfig(containerInfo);

  // If basic validation passes, try reachability check
  const urlCheck = checks.find(c => c.name === "tagging_url_format");
  if (urlCheck?.status === "passed" && containerInfo.serverTaggingUrl) {
    const reachabilityCheck = await checkTaggingServerReachability(containerInfo.serverTaggingUrl);
    checks.push(reachabilityCheck);
  }

  // Determine status
  const status = determineProvisioningStatus(checks);

  // Generate required actions if not ready
  const requiredActions = status !== "ready" ? generateRequiredActions(checks) : [];

  // Build result message
  let message: string;
  if (status === "ready") {
    message = "Server container is provisioned and verified ready for migration";
  } else if (status === "manual_intervention_required") {
    message = "Container provisioning requires manual setup - complete configuration in Migration Hub";
  } else if (status === "failed") {
    message = "Container provisioning verification failed - see required actions";
  } else {
    message = "Container provisioning in progress";
  }

  return {
    status,
    containerInfo,
    message,
    requiredActions,
    verificationChecks: checks
  };
}

/**
 * Quick check if container is ready without full verification.
 * Used for fast status checks.
 */
export function isContainerReady(ctx: ProvisioningContext): boolean {
  const hasContainerId =
    Boolean(ctx.hosting?.serverContainerPublicId?.trim()) || Boolean(ctx.gtm?.serverContainerPath?.trim());
  const hasTaggingUrl = Boolean(ctx.hosting?.serverTaggingUrl?.trim());
  const hasProvider = Boolean(ctx.hosting?.provider && ctx.hosting.provider !== "undecided");

  return hasContainerId && hasTaggingUrl && hasProvider;
}

/**
 * Get human-readable status message.
 */
export function getStatusMessage(status: ContainerProvisioningStatus): string {
  switch (status) {
    case "not_started":
      return "Container provisioning not started";
    case "pending":
      return "Waiting for container configuration";
    case "provisioning":
      return "Container provisioning in progress";
    case "verifying":
      return "Verifying container configuration";
    case "ready":
      return "Container verified and ready";
    case "failed":
      return "Container provisioning failed";
    case "manual_intervention_required":
      return "Manual setup required - see Migration Hub";
    default:
      return "Unknown provisioning status";
  }
}

/**
 * Normalize provider string to valid type.
 */
function normalizeProvider(provider: string | undefined): ContainerInfo["provider"] {
  if (!provider) return "undecided";
  const lower = provider.toLowerCase().trim();
  if (lower === "stape") return "stape";
  if (lower === "taggrs" || lower === "tagger" || lower === "taggers") return "taggrs";
  if (lower === "google_cloud" || lower === "gcp" || lower === "google") return "google_cloud";
  if (lower === "other" || lower === "custom") return "other";
  return "undecided";
}

/**
 * Build container provisioning guide based on current status.
 */
export function buildProvisioningGuide(
  result: ProvisioningResult
): {
  status: ContainerProvisioningStatus;
  isReady: boolean;
  message: string;
  steps: Array<{ step: string; status: "complete" | "in_progress" | "pending"; detail: string }>;
} {
  const { status, verificationChecks = [], requiredActions = [] } = result;

  const isReady = status === "ready";

  const steps = [
    {
      step: "Create server container in GTM",
      status: verificationChecks.find(c => c.name === "container_id_format")?.status === "passed"
        ? ("complete" as const)
        : ("pending" as const),
      detail:
        verificationChecks.find(c => c.name === "container_id_format")?.status === "passed"
          ? "Server container ID configured"
          : "Create a server-side container in Google Tag Manager"
    },
    {
      step: "Select hosting provider",
      status: verificationChecks.find(c => c.name === "provider_selected")?.status === "passed"
        ? ("complete" as const)
        : ("pending" as const),
      detail:
        verificationChecks.find(c => c.name === "provider_selected")?.status === "passed"
          ? `Provider: ${result.containerInfo?.provider || "unknown"}`
          : "Choose Google Cloud, Stape, TAGGRS, or Other"
    },
    {
      step: "Deploy tagging server",
      status: verificationChecks.find(c => c.name === "tagging_url_format")?.status === "passed"
        ? ("complete" as const)
        : ("pending" as const),
      detail:
        verificationChecks.find(c => c.name === "tagging_url_format")?.status === "passed"
          ? "Tagging server URL configured"
          : "Deploy server-side GTM to your hosting provider"
    },
    {
      step: "Verify server reachability",
      status: verificationChecks.find(c => c.name === "server_reachability")?.status === "passed"
        ? ("complete" as const)
        : verificationChecks.find(c => c.name === "server_reachability")?.status === "failed"
        ? ("pending" as const)
        : ("in_progress" as const),
      detail:
        verificationChecks.find(c => c.name === "server_reachability")?.status === "passed"
          ? "Server is reachable and responding"
          : verificationChecks.find(c => c.name === "server_reachability")
          ? verificationChecks.find(c => c.name === "server_reachability")!.message
          : "Checking server connectivity..."
    }
  ];

  return {
    status,
    isReady,
    message: getStatusMessage(status),
    steps
  };
}
