import { describe, it, expect } from "vitest";
import {
  validateContainerId,
  validateTaggingUrl,
  validateContainerConfig,
  determineProvisioningStatus,
  generateRequiredActions
} from "./validator.js";
import type { ContainerInfo, VerificationCheck } from "./types.js";

describe("Provisioning Validator", () => {
  describe("validateContainerId", () => {
    it("should validate correct GTM container ID", () => {
      const result = validateContainerId("GTM-ABCD123");

      expect(result.status).toBe("passed");
      expect(result.name).toBe("container_id_format");
      expect(result.message).toContain("Valid GTM server container ID");
    });

    it("should reject empty container ID", () => {
      const result = validateContainerId("");

      expect(result.status).toBe("failed");
      expect(result.message).toContain("missing");
    });

    it("should reject invalid format", () => {
      const result = validateContainerId("INVALID-123");

      expect(result.status).toBe("failed");
      expect(result.message).toContain("Invalid GTM container ID format");
    });

    it("should handle undefined", () => {
      const result = validateContainerId(undefined);

      expect(result.status).toBe("failed");
    });

    it("should trim whitespace", () => {
      const result = validateContainerId("  GTM-ABC123  ");

      expect(result.status).toBe("passed");
    });
  });

  describe("validateTaggingUrl", () => {
    it("should validate correct HTTPS URL", () => {
      const result = validateTaggingUrl("https://gtm.example.com");

      expect(result.status).toBe("passed");
      expect(result.name).toBe("tagging_url_format");
    });

    it("should reject HTTP URL", () => {
      const result = validateTaggingUrl("http://gtm.example.com");

      expect(result.status).toBe("failed");
      expect(result.message).toContain("must use HTTPS");
    });

    it("should reject empty URL", () => {
      const result = validateTaggingUrl("");

      expect(result.status).toBe("failed");
      expect(result.message).toContain("missing");
    });

    it("should reject malformed URL", () => {
      const result = validateTaggingUrl("not-a-url");

      expect(result.status).toBe("failed");
      // Non-HTTPS URLs are caught first
      expect(result.message).toContain("must use HTTPS");
    });

    it("should handle undefined", () => {
      const result = validateTaggingUrl(undefined);

      expect(result.status).toBe("failed");
    });
  });

  describe("validateContainerConfig", () => {
    it("should pass for complete valid config", () => {
      const containerInfo: ContainerInfo = {
        serverContainerPublicId: "GTM-ABC123",
        serverTaggingUrl: "https://gtm.example.com",
        provider: "google_cloud"
      };

      const checks = validateContainerConfig(containerInfo);

      expect(checks.length).toBeGreaterThan(0);
      const allPassed = checks.every(c => c.status === "passed");
      expect(allPassed).toBe(true);
    });

    it("should fail for missing container ID", () => {
      const containerInfo: ContainerInfo = {
        serverTaggingUrl: "https://gtm.example.com",
        provider: "google_cloud"
      };

      const checks = validateContainerConfig(containerInfo);

      const containerIdCheck = checks.find(c => c.name === "container_id_format");
      expect(containerIdCheck?.status).toBe("failed");
    });

    it("should fail for missing tagging URL", () => {
      const containerInfo: ContainerInfo = {
        serverContainerPublicId: "GTM-ABC123",
        provider: "google_cloud"
      };

      const checks = validateContainerConfig(containerInfo);

      const urlCheck = checks.find(c => c.name === "tagging_url_format");
      expect(urlCheck?.status).toBe("failed");
    });

    it("should fail for undecided provider", () => {
      const containerInfo: ContainerInfo = {
        serverContainerPublicId: "GTM-ABC123",
        serverTaggingUrl: "https://gtm.example.com",
        provider: "undecided"
      };

      const checks = validateContainerConfig(containerInfo);

      const providerCheck = checks.find(c => c.name === "provider_selected");
      expect(providerCheck?.status).toBe("failed");
    });
  });

  describe("determineProvisioningStatus", () => {
    it("should return ready when all checks pass", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "passed",
          message: "OK",
          timestamp: new Date().toISOString()
        },
        {
          name: "tagging_url_format",
          status: "passed",
          message: "OK",
          timestamp: new Date().toISOString()
        }
      ];

      const status = determineProvisioningStatus(checks);

      expect(status).toBe("ready");
    });

    it("should return manual_intervention_required for critical failures", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "failed",
          message: "Missing",
          timestamp: new Date().toISOString()
        }
      ];

      const status = determineProvisioningStatus(checks);

      expect(status).toBe("manual_intervention_required");
    });

    it("should return failed for non-critical failures", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "passed",
          message: "OK",
          timestamp: new Date().toISOString()
        },
        {
          name: "server_reachability",
          status: "failed",
          message: "Cannot reach",
          timestamp: new Date().toISOString()
        }
      ];

      const status = determineProvisioningStatus(checks);

      expect(status).toBe("failed");
    });

    it("should return provisioning when checks are pending", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "passed",
          message: "OK",
          timestamp: new Date().toISOString()
        },
        {
          name: "server_reachability",
          status: "pending",
          message: "Checking...",
          timestamp: new Date().toISOString()
        }
      ];

      const status = determineProvisioningStatus(checks);

      expect(status).toBe("provisioning");
    });

    it("should return not_started for empty checks", () => {
      const status = determineProvisioningStatus([]);

      expect(status).toBe("not_started");
    });
  });

  describe("generateRequiredActions", () => {
    it("should generate actions for missing container ID", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "failed",
          message: "Missing",
          timestamp: new Date().toISOString()
        }
      ];

      const actions = generateRequiredActions(checks);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.includes("Create a server-side GTM container"))).toBe(true);
    });

    it("should generate actions for missing tagging URL", () => {
      const checks: VerificationCheck[] = [
        {
          name: "tagging_url_format",
          status: "failed",
          message: "Missing",
          timestamp: new Date().toISOString()
        }
      ];

      const actions = generateRequiredActions(checks);

      expect(actions.some(a => a.includes("Deploy the server-side tagging server"))).toBe(true);
    });

    it("should generate actions for reachability issues", () => {
      const checks: VerificationCheck[] = [
        {
          name: "server_reachability",
          status: "failed",
          message: "Timeout",
          timestamp: new Date().toISOString()
        }
      ];

      const actions = generateRequiredActions(checks);

      expect(actions.some(a => a.includes("DNS") || a.includes("firewall"))).toBe(true);
    });

    it("should deduplicate actions", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "failed",
          message: "Missing",
          timestamp: new Date().toISOString()
        },
        {
          name: "container_id_format",
          status: "failed",
          message: "Missing",
          timestamp: new Date().toISOString()
        }
      ];

      const actions = generateRequiredActions(checks);

      // Should not have duplicate actions
      const uniqueActions = new Set(actions);
      expect(uniqueActions.size).toBe(actions.length);
    });

    it("should return empty array for all passed checks", () => {
      const checks: VerificationCheck[] = [
        {
          name: "container_id_format",
          status: "passed",
          message: "OK",
          timestamp: new Date().toISOString()
        }
      ];

      const actions = generateRequiredActions(checks);

      expect(actions).toEqual([]);
    });
  });
});
