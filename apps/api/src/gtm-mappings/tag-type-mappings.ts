/**
 * GTM Tag Type Mappings: Client-Side → Server-Side
 *
 * This registry maps client-side GTM tag types to their server-side equivalents.
 * Each mapping includes evidence (documentation) and configuration notes.
 *
 * CRITICAL: This uses TYPE-BASED mapping only, never name-based pattern matching.
 * Tag types are GTM internal identifiers like 'gaawe', 'awct', etc.
 */

export interface TagTypeMapping {
  /** Client-side tag type ID */
  clientType: string;
  /** Server-side tag type ID (null if no direct migration path) */
  serverType: string | null;
  /** Human-readable name */
  name: string;
  /** Provider/vendor */
  provider: string;
  /** Migration complexity: automatic, template-required, manual-only */
  complexity: 'automatic' | 'template-required' | 'manual-only';
  /** Evidence URL (official documentation) */
  evidenceRef: string;
  /** Configuration notes for migration */
  notes?: string;
}

/**
 * Google Analytics & Google Tag
 */
export const GOOGLE_ANALYTICS_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'googtag',
    serverType: 'sgtmgaaw',
    name: 'Google tag (gtag.js)',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/send-data',
    notes: 'Base Google tag initializes GA4 and Google Ads. Maps to server-side GA4 tag.'
  },
  {
    clientType: 'gaawe',
    serverType: 'sgtmgaaw',
    name: 'Google Analytics: GA4 Event',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/send-data',
    notes: 'GA4 event tags send custom events. All parameters should be copied.'
  },
  {
    clientType: 'gaawc',
    serverType: 'sgtmgaaw',
    name: 'Google Analytics: GA4 Configuration',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/send-data',
    notes: 'GA4 config tag. Merge with Google tag on server-side.'
  },
  {
    clientType: 'ua',
    serverType: null,
    name: 'Universal Analytics',
    provider: 'Google',
    complexity: 'manual-only',
    evidenceRef: 'https://support.google.com/analytics/answer/11583528',
    notes: 'Universal Analytics is deprecated (sunset July 2023). Migrate to GA4 instead.'
  }
];

/**
 * Google Ads & Marketing
 */
export const GOOGLE_ADS_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'awct',
    serverType: 'sgtmgads',
    name: 'Google Ads Conversion Tracking',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/google-ads-tag',
    notes: 'Conversion tracking tag. Requires conversion ID and label.'
  },
  {
    clientType: 'sp',
    serverType: 'sgtmgads',
    name: 'Google Ads Remarketing',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/google-ads-tag',
    notes: 'Remarketing tag. Maps to server-side Google Ads tag.'
  },
  {
    clientType: 'fls',
    serverType: 'sgtmflood',
    name: 'Floodlight Counter',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/floodlight',
    notes: 'Campaign Manager 360 Floodlight counter tag.'
  },
  {
    clientType: 'flc',
    serverType: 'sgtmflood',
    name: 'Floodlight Sales',
    provider: 'Google',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side/floodlight',
    notes: 'Campaign Manager 360 Floodlight sales tag.'
  }
];

/**
 * Meta (Facebook) Pixel & Conversions API
 */
export const META_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'facebook',
    serverType: null,
    name: 'Meta Pixel (Legacy)',
    provider: 'Meta',
    complexity: 'template-required',
    evidenceRef: 'https://developers.facebook.com/docs/marketing-api/conversions-api/server-side-tagging',
    notes: 'Legacy Facebook Pixel. Use Meta Pixel (facebook_pixel) or Conversions API template instead.'
  },
  {
    clientType: 'facebook_pixel',
    serverType: null,
    name: 'Meta Pixel',
    provider: 'Meta',
    complexity: 'template-required',
    evidenceRef: 'https://developers.facebook.com/docs/marketing-api/conversions-api/server-side-tagging',
    notes: 'Modern Meta Pixel. Requires Facebook Conversions API template on server-side.'
  },
  {
    clientType: 'fbcapi',
    serverType: null,
    name: 'Facebook Conversions API',
    provider: 'Meta',
    complexity: 'template-required',
    evidenceRef: 'https://developers.facebook.com/docs/marketing-api/conversions-api/server-side-tagging',
    notes: 'Already server-side focused. Use Meta Conversions API template in Gallery.'
  }
];

/**
 * TikTok
 */
export const TIKTOK_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'tiktok_pixel',
    serverType: null,
    name: 'TikTok Pixel',
    provider: 'TikTok',
    complexity: 'template-required',
    evidenceRef: 'https://ads.tiktok.com/help/article/events-api',
    notes: 'Requires TikTok Events API template from Gallery or custom template.'
  }
];

/**
 * Snapchat
 */
export const SNAPCHAT_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'snapchat_pixel',
    serverType: null,
    name: 'Snapchat Pixel',
    provider: 'Snapchat',
    complexity: 'template-required',
    evidenceRef: 'https://businesshelp.snapchat.com/s/article/conversions-api',
    notes: 'Requires Snapchat Conversions API template from Gallery or custom template.'
  }
];

/**
 * LinkedIn
 */
export const LINKEDIN_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'linkedin_insight',
    serverType: null,
    name: 'LinkedIn Insight Tag',
    provider: 'LinkedIn',
    complexity: 'template-required',
    evidenceRef: 'https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/conversion-tracking',
    notes: 'Requires LinkedIn Conversions API template from Gallery or custom template.'
  }
];

/**
 * Twitter/X
 */
export const TWITTER_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'twitter_uwt',
    serverType: null,
    name: 'Twitter Universal Website Tag',
    provider: 'Twitter',
    complexity: 'template-required',
    evidenceRef: 'https://business.twitter.com/en/help/campaign-measurement-and-analytics/conversion-tracking-for-websites.html',
    notes: 'Requires X (Twitter) Conversions API template. X has server-side conversion API.'
  }
];

/**
 * Pinterest
 */
export const PINTEREST_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'pinterest_tag',
    serverType: null,
    name: 'Pinterest Tag',
    provider: 'Pinterest',
    complexity: 'template-required',
    evidenceRef: 'https://help.pinterest.com/en/business/article/track-conversions-with-pinterest-tag',
    notes: 'Requires Pinterest Conversions API template. Pinterest supports server-side conversion tracking.'
  }
];

/**
 * Reddit
 */
export const REDDIT_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'reddit_pixel',
    serverType: null,
    name: 'Reddit Pixel',
    provider: 'Reddit',
    complexity: 'template-required',
    evidenceRef: 'https://ads.reddit.com/help/conversions-api',
    notes: 'Requires Reddit Conversions API template from Gallery.'
  }
];

/**
 * Microsoft (Bing Ads)
 */
export const MICROSOFT_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'microsoftadvertising',
    serverType: null,
    name: 'Microsoft Advertising (UET)',
    provider: 'Microsoft',
    complexity: 'template-required',
    evidenceRef: 'https://help.ads.microsoft.com/apex/index/3/en/60000',
    notes: 'Universal Event Tracking. Microsoft supports offline conversions; may need custom template.'
  }
];

/**
 * E-commerce & Analytics Platforms
 */
export const ANALYTICS_PLATFORMS_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'hotjar',
    serverType: null,
    name: 'Hotjar Tracking Code',
    provider: 'Hotjar',
    complexity: 'manual-only',
    evidenceRef: 'https://help.hotjar.com/hc/en-us/articles/115011639927',
    notes: 'Session replay requires client-side execution. Not suitable for server-side migration.'
  },
  {
    clientType: 'mixpanel',
    serverType: null,
    name: 'Mixpanel',
    provider: 'Mixpanel',
    complexity: 'template-required',
    evidenceRef: 'https://developer.mixpanel.com/docs/http',
    notes: 'Supports server-side events via HTTP API. Requires custom template.'
  },
  {
    clientType: 'amplitude',
    serverType: null,
    name: 'Amplitude',
    provider: 'Amplitude',
    complexity: 'template-required',
    evidenceRef: 'https://www.docs.developers.amplitude.com/analytics/apis/http-v2-api/',
    notes: 'Supports server-side events via HTTP API. Requires custom template.'
  },
  {
    clientType: 'segment',
    serverType: null,
    name: 'Segment',
    provider: 'Segment',
    complexity: 'template-required',
    evidenceRef: 'https://segment.com/docs/connections/sources/catalog/libraries/server/http-api/',
    notes: 'Segment supports server-side sources. Requires custom HTTP template.'
  }
];

/**
 * Custom & Special Tags
 */
export const CUSTOM_TAGS_MAPPINGS: TagTypeMapping[] = [
  {
    clientType: 'html',
    serverType: null,
    name: 'Custom HTML',
    provider: 'GTM',
    complexity: 'manual-only',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side',
    notes: 'Custom HTML cannot execute server-side. Analyze logic and reimplement as custom server template.'
  },
  {
    clientType: 'img',
    serverType: 'img',
    name: 'Custom Image',
    provider: 'GTM',
    complexity: 'automatic',
    evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side',
    notes: 'Image pixel tags can be migrated to server-side image tags.'
  },
  {
    clientType: 'tl',
    serverType: null,
    name: 'Tag Sequencing',
    provider: 'GTM',
    complexity: 'manual-only',
    evidenceRef: 'https://support.google.com/tagmanager/answer/6238868',
    notes: 'Tag sequencing handled differently on server. Review setup/teardown tag configuration.'
  }
];

/**
 * Master registry combining all mappings
 */
export const ALL_TAG_TYPE_MAPPINGS: TagTypeMapping[] = [
  ...GOOGLE_ANALYTICS_MAPPINGS,
  ...GOOGLE_ADS_MAPPINGS,
  ...META_MAPPINGS,
  ...TIKTOK_MAPPINGS,
  ...SNAPCHAT_MAPPINGS,
  ...LINKEDIN_MAPPINGS,
  ...TWITTER_MAPPINGS,
  ...PINTEREST_MAPPINGS,
  ...REDDIT_MAPPINGS,
  ...MICROSOFT_MAPPINGS,
  ...ANALYTICS_PLATFORMS_MAPPINGS,
  ...CUSTOM_TAGS_MAPPINGS
];

/**
 * Fast lookup map: clientType → serverType
 */
export const CLIENT_TO_SERVER_TAG_TYPE: Record<string, string | null> =
  Object.fromEntries(
    ALL_TAG_TYPE_MAPPINGS.map(m => [m.clientType, m.serverType])
  );

/**
 * Get full mapping details for a client tag type
 */
export function getTagTypeMapping(clientType: string): TagTypeMapping | null {
  return ALL_TAG_TYPE_MAPPINGS.find(m => m.clientType === clientType) || null;
}

/**
 * Check if a tag type can be automatically migrated
 */
export function isAutomaticMigration(clientType: string): boolean {
  const mapping = getTagTypeMapping(clientType);
  return mapping?.complexity === 'automatic' && mapping.serverType !== null;
}

/**
 * Check if a tag type requires a custom template
 */
export function requiresTemplate(clientType: string): boolean {
  const mapping = getTagTypeMapping(clientType);
  return mapping?.complexity === 'template-required';
}

/**
 * Handle custom template types (cvt_*)
 * Custom templates need individual analysis
 */
export function isCustomTemplate(clientType: string): boolean {
  return clientType.startsWith('cvt_');
}

/**
 * Get migration recommendation for a tag type
 */
export function getMigrationRecommendation(clientType: string): {
  canMigrate: boolean;
  serverType: string | null;
  complexity: TagTypeMapping['complexity'] | 'unknown';
  recommendation: string;
  evidenceRef?: string;
} {
  // Handle custom templates
  if (isCustomTemplate(clientType)) {
    return {
      canMigrate: false,
      serverType: null,
      complexity: 'manual-only',
      recommendation: 'Custom template detected. Review template logic and create server-side equivalent if needed.',
      evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/templates'
    };
  }

  const mapping = getTagTypeMapping(clientType);

  if (!mapping) {
    return {
      canMigrate: false,
      serverType: null,
      complexity: 'unknown',
      recommendation: `Unknown tag type "${clientType}". Research vendor documentation for server-side tracking options.`,
      evidenceRef: 'https://developers.google.com/tag-platform/tag-manager/server-side'
    };
  }

  if (mapping.complexity === 'automatic' && mapping.serverType) {
    return {
      canMigrate: true,
      serverType: mapping.serverType,
      complexity: 'automatic',
      recommendation: `Can be automatically migrated to server-side type "${mapping.serverType}". ${mapping.notes || ''}`,
      evidenceRef: mapping.evidenceRef
    };
  }

  if (mapping.complexity === 'template-required') {
    return {
      canMigrate: true,
      serverType: null,
      complexity: 'template-required',
      recommendation: `Requires custom server-side template from GTM Gallery or custom template. ${mapping.notes || ''}`,
      evidenceRef: mapping.evidenceRef
    };
  }

  return {
    canMigrate: false,
    serverType: mapping.serverType,
    complexity: mapping.complexity,
    recommendation: `Manual migration required. ${mapping.notes || ''}`,
    evidenceRef: mapping.evidenceRef
  };
}
