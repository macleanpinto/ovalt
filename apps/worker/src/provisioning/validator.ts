import type { ContainerInfo, VerificationCheck, ContainerProvisioningStatus } from "./types.js";

/**
 * Container provisioning validation utilities.
 * Verifies that server containers are properly configured and ready for migration.
 */

/**
 * Validate GTM server container ID format.
 */
export function validateContainerId(containerId: string | undefined): VerificationCheck {
  const timestamp = new Date().toISOString();

  if (!containerId || containerId.trim() === "") {
    return {
      name: "container_id_format",
      status: "failed",
      message: "Server container ID is missing",
      timestamp
    };
  }

  const trimmed = containerId.trim();
  const gtmPattern = /^GTM-[A-Z0-9]{1,10}$/i;

  if (!gtmPattern.test(trimmed)) {
    return {
      name: "container_id_format",
      status: "failed",
      message: `Invalid GTM container ID format: "${trimmed}". Expected format: GTM-XXXXXXX`,
      timestamp
    };
  }

  return {
    name: "container_id_format",
    status: "passed",
    message: `Valid GTM server container ID: ${trimmed}`,
    timestamp
  };
}

/**
 * Validate tagging server URL format.
 */
export function validateTaggingUrl(url: string | undefined): VerificationCheck {
  const timestamp = new Date().toISOString();

  if (!url || url.trim() === "") {
    return {
      name: "tagging_url_format",
      status: "failed",
      message: "Tagging server URL is missing",
      timestamp
    };
  }

  const trimmed = url.trim();

  // Must be HTTPS
  if (!trimmed.startsWith("https://")) {
    return {
      name: "tagging_url_format",
      status: "failed",
      message: `Tagging URL must use HTTPS: "${trimmed}"`,
      timestamp
    };
  }

  // Basic URL validation
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      throw new Error("Missing hostname");
    }
  } catch (err) {
    return {
      name: "tagging_url_format",
      status: "failed",
      message: `Invalid tagging URL: "${trimmed}" - ${err instanceof Error ? err.message : "malformed"}`,
      timestamp
    };
  }

  return {
    name: "tagging_url_format",
    status: "passed",
    message: `Valid tagging server URL: ${trimmed}`,
    timestamp
  };
}

/**
 * Check if tagging server is reachable (basic connectivity check).
 */
export async function checkTaggingServerReachability(url: string): Promise<VerificationCheck> {
  const timestamp = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "TagRelay/1.0 (Server-Verification)"
      }
    });

    clearTimeout(timeoutId);

    // Server-side GTM typically returns 200 or 204 for health checks
    // or 400 for invalid requests (but server is up)
    if (response.status >= 200 && response.status < 500) {
      return {
        name: "server_reachability",
        status: "passed",
        message: `Tagging server is reachable (HTTP ${response.status})`,
        timestamp
      };
    }

    return {
      name: "server_reachability",
      status: "failed",
      message: `Tagging server returned unexpected status: HTTP ${response.status}`,
      timestamp
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // AbortError means timeout
    if (message.includes("aborted") || message.includes("timeout")) {
      return {
        name: "server_reachability",
        status: "failed",
        message: "Tagging server did not respond within 10 seconds - check DNS and firewall settings",
        timestamp
      };
    }

    return {
      name: "server_reachability",
      status: "failed",
      message: `Cannot reach tagging server: ${message}`,
      timestamp
    };
  }
}

/**
 * Validate complete container configuration.
 */
export function validateContainerConfig(containerInfo: ContainerInfo): VerificationCheck[] {
  const checks: VerificationCheck[] = [];

  // Check container ID
  checks.push(validateContainerId(containerInfo.serverContainerPublicId));

  // Check tagging URL
  checks.push(validateTaggingUrl(containerInfo.serverTaggingUrl));

  // Check provider is set
  const timestamp = new Date().toISOString();
  if (!containerInfo.provider || containerInfo.provider === "undecided") {
    checks.push({
      name: "provider_selected",
      status: "failed",
      message: "Hosting provider not selected - choose provider in Migration Hub",
      timestamp
    });
  } else {
    checks.push({
      name: "provider_selected",
      status: "passed",
      message: `Hosting provider: ${containerInfo.provider}`,
      timestamp
    });
  }

  return checks;
}

/**
 * Determine overall provisioning status from verification checks.
 */
export function determineProvisioningStatus(checks: VerificationCheck[]): ContainerProvisioningStatus {
  if (checks.length === 0) {
    return "not_started";
  }

  const hasFailed = checks.some(c => c.status === "failed");
  const hasPending = checks.some(c => c.status === "pending");
  const allPassed = checks.every(c => c.status === "passed" || c.status === "skipped");

  if (hasFailed) {
    // Check if failures are recoverable
    const criticalFailures = checks.filter(
      c => c.status === "failed" && (c.name === "container_id_format" || c.name === "provider_selected")
    );

    if (criticalFailures.length > 0) {
      return "manual_intervention_required";
    }

    return "failed";
  }

  if (hasPending) {
    return "provisioning";
  }

  if (allPassed) {
    return "ready";
  }

  return "pending";
}

/**
 * Generate required actions list from failed checks.
 */
export function generateRequiredActions(checks: VerificationCheck[]): string[] {
  const actions: string[] = [];

  for (const check of checks) {
    if (check.status === "failed") {
      switch (check.name) {
        case "container_id_format":
          actions.push(
            "Create a server-side GTM container in Google Tag Manager (tagmanager.google.com) with type 'Server'"
          );
          actions.push("Save the server container ID (GTM-XXXXXXX) in the Migration Hub");
          break;

        case "tagging_url_format":
          actions.push("Deploy the server-side tagging server to your hosting provider");
          actions.push("Save the HTTPS tagging server URL in the Migration Hub");
          break;

        case "server_reachability":
          actions.push("Verify DNS configuration points to the tagging server");
          actions.push("Check firewall rules allow HTTPS traffic to the tagging server");
          actions.push("Confirm the tagging server deployment is running and healthy");
          break;

        case "provider_selected":
          actions.push("Select a hosting provider (Google Cloud, Stape, TAGGRS, or Other) in the Migration Hub");
          break;
      }
    }
  }

  // Deduplicate actions
  return [...new Set(actions)];
}
