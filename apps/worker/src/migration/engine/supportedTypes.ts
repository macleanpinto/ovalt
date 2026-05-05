/**
 * Single source of truth for supported client-side tag types.
 *
 * Tags whose GTM `type` is not in this list are surfaced in the
 * analysis UI as "Not supported" and cannot be approved or deployed.
 *
 * Keep this list small on purpose: every supported type must have a
 * deterministic, vendor-documented server-side mapping.
 */
export const SUPPORTED_CLIENT_TAG_TYPES = [
  "gaawe",      // GA4 Event tag
  "googtag",    // Google tag (gtag)
  "awct",       // Google Ads Conversion Tracking
  "gclidw",     // Google Ads Conversion Linker
  "cvt_5RM3Q"   // Meta Pixel community template (client container specific)
] as const;

export type SupportedClientTagType = typeof SUPPORTED_CLIENT_TAG_TYPES[number];

export function isSupportedClientTagType(type: string): type is SupportedClientTagType {
  return (SUPPORTED_CLIENT_TAG_TYPES as readonly string[]).includes(type);
}
