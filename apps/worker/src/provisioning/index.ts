/**
 * Container provisioning module - orchestrates GTM server-side container setup and verification.
 */

export { verifyContainerProvisioning, isContainerReady, getStatusMessage, buildProvisioningGuide } from "./service.js";
export {
  validateContainerId,
  validateTaggingUrl,
  checkTaggingServerReachability,
  validateContainerConfig,
  determineProvisioningStatus,
  generateRequiredActions
} from "./validator.js";
export type {
  ContainerProvisioningStatus,
  HostingProvider,
  ContainerInfo,
  ProvisioningResult,
  VerificationCheck,
  ProvisioningContext
} from "./types.js";
