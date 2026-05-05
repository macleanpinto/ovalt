import type { Rule } from "./schema.js";

/**
 * Advertising platform ruleset.
 * Covers Google Ads, Floodlight, remarketing, and other ad conversion tracking.
 */

export const adsRules: Rule[] = [
  {
    id: "google-ads-conversion-linker",
    name: "Google Ads Conversion Linker",
    description: "Google Ads Conversion Linker (gclidw) — stores gclid/wbraid/gbraid in first-party cookies. Does not itself track conversions, so no conversion ID/label is configured on this tag.",
    category: "ads",
    priority: 910,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "gclidw"
      }
    ],
    transform: {
      serverTagType: "Google Ads Conversion Linker (Server)",
      description:
        "Server-side Conversion Linker — persists gclid/wbraid/gbraid in first-party cookies on the tagging server domain so downstream Ads tags can attribute conversions.",
      parameterMappings: [],
      configurationHints: [
        "Enable first-party domain for tagging server (custom subdomain recommended)",
        "No Conversion ID or Label needed here — those belong on the Google Ads Conversion tag",
        "Ensure cookie flags (SameSite, Secure) match your cookie policy"
      ]
    },
    provisional: false,
    evidenceRef: "https://support.google.com/tagmanager/answer/7549390",
    tags: ["ads", "google-ads", "conversion-linker", "gclid"]
  },
  {
    id: "google-ads-conversion",
    name: "Google Ads Conversion Tracking",
    description: "Google Ads conversion tracking tag (awct)",
    category: "ads",
    priority: 900,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "awct"
      }
    ],
    transform: {
      serverTagType: "Google Ads Conversion Tracking",
      description: "Server-side Google Ads conversion tag",
      parameterMappings: [
        {
          clientParam: "conversionId",
          serverParam: "conversionId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "conversionLabel",
          serverParam: "conversionLabel",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "conversionValue",
          serverParam: "conversionValue",
          required: false,
          transform: "currency"
        },
        {
          clientParam: "currencyCode",
          serverParam: "currencyCode",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "transactionId",
          serverParam: "transactionId",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Server-side Google Ads conversion tracking requires first-party cookie setup",
        "Ensure gclid/wbraid/gbraid click IDs are captured in server container",
        "Enable Enhanced Conversions if sending hashed user data",
        "Verify conversion counting method (One vs Every) matches business requirements"
      ]
    },
    provisional: false,
    evidenceRef: "https://support.google.com/tagmanager/answer/13005567",
    constraints: [
      {
        type: "requiresParameter",
        field: "conversionId",
        severity: "critical",
        message: "Conversion ID is required for Google Ads conversion tracking"
      },
      {
        type: "requiresParameter",
        field: "conversionLabel",
        severity: "critical",
        message: "Conversion Label is required for Google Ads conversion tracking"
      }
    ],
    manualReview: [
      {
        trigger: "missingParameter",
        priority: "high",
        action: "Verify Conversion ID and Label from Google Ads account. Test conversion tracking in Google Ads preview mode."
      }
    ],
    tags: ["google-ads", "conversion", "ads", "ppc"]
  },
  {
    id: "google-ads-remarketing",
    name: "Google Ads Remarketing",
    description: "Google Ads remarketing tag (aw_remarketing)",
    category: "ads",
    priority: 850,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "aw_remarketing"
      }
    ],
    transform: {
      serverTagType: "Google Ads Remarketing",
      description: "Server-side Google Ads remarketing tag for audience building",
      parameterMappings: [
        {
          clientParam: "conversionId",
          serverParam: "conversionId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "customParameters",
          serverParam: "customParameters",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Remarketing lists will build based on server-side tag fires",
        "Ensure appropriate consent for remarketing audiences (GDPR/CCPA)",
        "Custom parameters can segment audiences for dynamic remarketing"
      ]
    },
    provisional: false,
    evidenceRef: "https://support.google.com/google-ads/answer/7305793",
    constraints: [
      {
        type: "requiresConsent",
        severity: "warning",
        message: "Remarketing requires appropriate user consent for advertising cookies in regulated regions"
      }
    ],
    manualReview: [
      {
        trigger: "consentRequired",
        priority: "medium",
        action: "Verify consent signal is properly passed to server container and blocks remarketing tag when consent is not granted"
      }
    ],
    tags: ["google-ads", "remarketing", "audiences", "ads"]
  },
  {
    id: "floodlight-counter",
    name: "Floodlight Counter",
    description: "Campaign Manager 360 / Floodlight counter tag",
    category: "ads",
    priority: 850,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "flc"
      }
    ],
    transform: {
      serverTagType: "Floodlight Counter",
      description: "Server-side Floodlight counter tag for Campaign Manager",
      parameterMappings: [
        {
          clientParam: "advertiserId",
          serverParam: "advertiserId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "groupTag",
          serverParam: "groupTag",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "activityTag",
          serverParam: "activityTag",
          required: true,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Floodlight server-side tags require Campaign Manager configuration",
        "Ensure Floodlight IDs match Campaign Manager setup",
        "Test in Campaign Manager using Floodlight debugger"
      ]
    },
    provisional: true,
    evidenceRef: "https://support.google.com/campaignmanager/answer/13234809",
    constraints: [
      {
        type: "requiresParameter",
        field: "advertiserId",
        severity: "critical",
        message: "Advertiser ID is required for Floodlight tags"
      }
    ],
        tags: ["floodlight", "campaign-manager", "dcm", "ads"]
  },
  {
    id: "floodlight-sales",
    name: "Floodlight Sales",
    description: "Campaign Manager 360 / Floodlight sales tag with conversion value",
    category: "ads",
    priority: 900,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "fls"
      }
    ],
    transform: {
      serverTagType: "Floodlight Sales",
      description: "Server-side Floodlight sales tag with revenue tracking",
      parameterMappings: [
        {
          clientParam: "advertiserId",
          serverParam: "advertiserId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "groupTag",
          serverParam: "groupTag",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "activityTag",
          serverParam: "activityTag",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "revenue",
          serverParam: "revenue",
          required: false,
          transform: "currency"
        },
        {
          clientParam: "orderId",
          serverParam: "orderId",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Include revenue value for conversion value reporting",
        "Use orderId for transaction deduplication",
        "Validate revenue format matches Floodlight expectations"
      ]
    },
    provisional: true,
    evidenceRef: "https://support.google.com/campaignmanager/answer/13234809",
    constraints: [
      {
        type: "requiresParameter",
        field: "revenue",
        severity: "warning",
        message: "Revenue parameter recommended for sales Floodlight tags to enable conversion value tracking"
      }
    ],
    tags: ["floodlight", "campaign-manager", "sales", "conversion", "ads"]
  },
  {
    id: "google-ads-enhanced-conversions",
    name: "Google Ads Enhanced Conversions",
    description: "Enhanced conversion tracking with hashed user data",
    category: "ads",
    priority: 920,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "awct"
      },
      {
        field: "hasParameter",
        operator: "equals",
        value: "em"
      }
    ],
    transform: {
      serverTagType: "Google Ads Conversion Tracking",
      description: "Server-side Google Ads conversion with enhanced conversions (hashed user data)",
      parameterMappings: [
        {
          clientParam: "conversionId",
          serverParam: "conversionId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "conversionLabel",
          serverParam: "conversionLabel",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "em",
          serverParam: "email",
          required: false,
          transform: "hash"
        },
        {
          clientParam: "phone_number",
          serverParam: "phone_number",
          required: false,
          transform: "hash"
        }
      ],
      configurationHints: [
        "Enhanced Conversions must be enabled in Google Ads account",
        "Hash user data (email, phone) using SHA-256 in server tag",
        "Ensure proper consent for sending hashed user data",
        "User data helps improve conversion measurement accuracy"
      ]
    },
    provisional: false,
    evidenceRef: "https://support.google.com/google-ads/answer/11062876",
    constraints: [
      {
        type: "requiresPII",
        severity: "warning",
        message: "Enhanced conversions include hashed PII - ensure proper hashing and user consent"
      },
      {
        type: "requiresConsent",
        severity: "warning",
        message: "Verify consent covers enhanced conversion data collection"
      }
    ],
    manualReview: [
      {
        trigger: "securityRisk",
        priority: "high",
        action: "Verify PII hashing implementation and confirm Enhanced Conversions is enabled in Google Ads account"
      }
    ],
    tags: ["google-ads", "enhanced-conversions", "conversion", "pii"]
  }
];
