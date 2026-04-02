import type { Rule } from "./schema.js";

/**
 * Social media pixel and conversion API ruleset.
 * Covers Meta (Facebook), TikTok, LinkedIn, Twitter, Pinterest, Snapchat.
 */

export const socialRules: Rule[] = [
  {
    id: "meta-pixel-base",
    name: "Meta Pixel (Facebook Pixel)",
    description: "Base Meta Pixel initialization or standard event",
    category: "social",
    priority: 900,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "facebook|meta|pixel|fbq"
      }
    ],
    transform: {
      serverTagType: "Meta Conversions API",
      description: "Server-side Meta CAPI tag with hashed PII and event mapping",
      parameterMappings: [
        {
          clientParam: "pixelId",
          serverParam: "pixel_id",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "eventName",
          serverParam: "event_name",
          required: true,
          transform: "eventName"
        },
        {
          clientParam: "eventId",
          serverParam: "event_id",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "userData",
          serverParam: "user_data",
          required: false,
          transform: "hash"
        },
        {
          clientParam: "customData",
          serverParam: "custom_data",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Configure Meta Conversions API access token in server container (use Secrets Manager)",
        "Hash PII fields (email, phone, name) using SHA-256 before sending",
        "Use event_id deduplication to prevent double-counting between pixel and CAPI",
        "Map custom_data fields according to Meta CAPI spec (value, currency, content_ids)",
        "Test event delivery using Meta Events Manager Test Events tool"
      ]
    },
    confidence: 6.5,
    provisional: true,
    evidenceRef: "https://developers.facebook.com/docs/marketing-api/conversions-api",
    constraints: [
      {
        type: "requiresParameter",
        field: "pixelId",
        severity: "critical",
        message: "Pixel ID is required for Meta Conversions API"
      },
      {
        type: "requiresPII",
        severity: "warning",
        message: "PII parameters detected - ensure proper SHA-256 hashing is applied in server tag"
      },
      {
        type: "requiresSecureEndpoint",
        severity: "error",
        message: "Meta CAPI requires HTTPS endpoint"
      }
    ],
    manualReview: [
      {
        trigger: "lowConfidence",
        threshold: 7.5,
        priority: "high",
        action: "Map Pixel ID and access token in server environment. Validate event_name and custom_data against Meta CAPI schema."
      },
      {
        trigger: "securityRisk",
        priority: "critical",
        action: "Verify PII hashing implementation and test with Meta Events Manager before production deployment"
      }
    ],
    tags: ["meta", "facebook", "pixel", "social", "capi"]
  },
  {
    id: "meta-pixel-purchase",
    name: "Meta Pixel Purchase Event",
    description: "Meta Pixel purchase conversion event",
    category: "social",
    priority: 950,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "facebook|meta|pixel"
      },
      {
        field: "parameterValue",
        operator: "contains",
        value: "eventName:purchase"
      }
    ],
    transform: {
      serverTagType: "Meta Conversions API",
      description: "Server-side Meta CAPI Purchase event with value and currency",
      parameterMappings: [
        {
          clientParam: "pixelId",
          serverParam: "pixel_id",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "value",
          serverParam: "custom_data.value",
          required: true,
          transform: "currency"
        },
        {
          clientParam: "currency",
          serverParam: "custom_data.currency",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "content_ids",
          serverParam: "custom_data.content_ids",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "content_type",
          serverParam: "custom_data.content_type",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Ensure value and currency match purchase transaction total",
        "Use content_ids to pass product IDs for catalog matching",
        "Include event_id from client pixel for deduplication"
      ]
    },
    confidence: 7.2,
    provisional: true,
    evidenceRef: "https://developers.facebook.com/docs/meta-pixel/implementation/conversion-tracking",
    constraints: [
      {
        type: "requiresParameter",
        field: "value",
        severity: "critical",
        message: "value is required for purchase conversion tracking"
      },
      {
        type: "requiresParameter",
        field: "currency",
        severity: "error",
        message: "currency is required for accurate conversion value reporting"
      }
    ],
    manualReview: [
      {
        trigger: "missingParameter",
        priority: "critical",
        action: "Verify value, currency, and content_ids are properly mapped from transaction data"
      }
    ],
    tags: ["meta", "facebook", "purchase", "conversion", "ecommerce"]
  },
  {
    id: "tiktok-pixel",
    name: "TikTok Pixel",
    description: "TikTok Pixel event tracking",
    category: "social",
    priority: 850,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "tiktok|ttq"
      }
    ],
    transform: {
      serverTagType: "TikTok Events API",
      description: "Server-side TikTok Events API tag (requires custom template or HTTP request tag)",
      parameterMappings: [
        {
          clientParam: "pixelId",
          serverParam: "pixel_code",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "event",
          serverParam: "event",
          required: true,
          transform: "eventName"
        }
      ],
      configurationHints: [
        "TikTok Events API requires custom server-side template or HTTP request tag",
        "Configure access token via TikTok Events Manager",
        "Hash PII parameters (email, phone_number) using SHA-256",
        "Use event_id for deduplication between pixel and Events API"
      ]
    },
    confidence: 5.8,
    provisional: true,
    evidenceRef: "https://ads.tiktok.com/help/article/events-api",
    constraints: [
      {
        type: "customValidation",
        severity: "warning",
        message: "TikTok Events API may require custom template - verify server-side template availability"
      }
    ],
    manualReview: [
      {
        trigger: "lowConfidence",
        threshold: 7.0,
        priority: "high",
        action: "Install TikTok Events API server template from GTM Gallery or build custom HTTP request tag. Test event delivery in TikTok Events Manager."
      }
    ],
    tags: ["tiktok", "social", "pixel"]
  },
  {
    id: "linkedin-insight",
    name: "LinkedIn Insight Tag",
    description: "LinkedIn Insight Tag for conversion tracking",
    category: "social",
    priority: 800,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "linkedin|insight"
      }
    ],
    transform: {
      serverTagType: "LinkedIn CAPI",
      description: "Server-side LinkedIn Conversions API (requires custom implementation)",
      configurationHints: [
        "LinkedIn CAPI requires custom server-side template or HTTP client",
        "Use LinkedIn Conversions API documentation for endpoint and authentication",
        "Hash PII fields per LinkedIn requirements"
      ]
    },
    confidence: 5.2,
    provisional: true,
    evidenceRef: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/advertising-api/conversion-api",
    manualReview: [
      {
        trigger: "customTag",
        priority: "high",
        action: "LinkedIn CAPI requires custom server-side implementation. Consult LinkedIn Conversions API documentation and engineering support."
      }
    ],
    tags: ["linkedin", "social", "b2b"]
  },
  {
    id: "pinterest-tag",
    name: "Pinterest Tag",
    description: "Pinterest conversion tracking tag",
    category: "social",
    priority: 800,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "pinterest|pintrk"
      }
    ],
    transform: {
      serverTagType: "Pinterest Conversions API",
      description: "Server-side Pinterest Conversions API (requires custom template)",
      configurationHints: [
        "Pinterest Conversions API requires custom server template",
        "Use Pinterest API credentials and configure in server container",
        "Hash PII per Pinterest requirements (email, phone)"
      ]
    },
    confidence: 5.5,
    provisional: true,
    evidenceRef: "https://developers.pinterest.com/docs/conversions/conversions/",
    manualReview: [
      {
        trigger: "customTag",
        priority: "high",
        action: "Install Pinterest Conversions API server template or build custom implementation"
      }
    ],
    tags: ["pinterest", "social", "ecommerce"]
  },
  {
    id: "twitter-pixel",
    name: "Twitter/X Pixel",
    description: "Twitter (X) conversion tracking pixel",
    category: "social",
    priority: 800,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "twitter|twq|x\\.com"
      }
    ],
    transform: {
      serverTagType: "Twitter Conversions API",
      description: "Server-side Twitter/X Conversions API (requires custom implementation)",
      configurationHints: [
        "Twitter/X Conversions API requires custom server-side implementation",
        "Review Twitter Ads API documentation for current server-side tracking options"
      ]
    },
    confidence: 5.0,
    provisional: true,
    evidenceRef: "https://developer.twitter.com/en/docs/twitter-ads-api/campaign-management/api-reference/conversions",
    manualReview: [
      {
        trigger: "customTag",
        priority: "high",
        action: "Twitter/X server-side tracking requires custom implementation. Review current Twitter Ads API capabilities."
      }
    ],
    tags: ["twitter", "x", "social"]
  },
  {
    id: "snapchat-pixel",
    name: "Snapchat Pixel",
    description: "Snapchat conversion tracking pixel",
    category: "social",
    priority: 800,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "snapchat|snap"
      }
    ],
    transform: {
      serverTagType: "Snapchat Conversions API",
      description: "Server-side Snapchat Conversions API (requires custom template)",
      configurationHints: [
        "Snapchat CAPI requires custom server template or HTTP request tag",
        "Use Snapchat Pixel ID and access token",
        "Hash PII per Snapchat requirements"
      ]
    },
    confidence: 5.5,
    provisional: true,
    evidenceRef: "https://businesshelp.snapchat.com/s/article/conversions-api",
    manualReview: [
      {
        trigger: "customTag",
        priority: "high",
        action: "Install Snapchat Conversions API server template or build custom HTTP implementation"
      }
    ],
    tags: ["snapchat", "social"]
  }
];
