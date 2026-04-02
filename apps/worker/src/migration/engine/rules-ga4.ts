import type { Rule } from "./schema.js";

/**
 * Google Analytics 4 / Google Tag ruleset.
 * Evidence-based rules from official Google documentation.
 */

export const ga4Rules: Rule[] = [
  {
    id: "ga4-google-tag",
    name: "Google Tag (gtag.js / Google tag)",
    description: "Base Google tag / gtag.js configuration tag that initializes GA4 measurement",
    category: "analytics",
    priority: 900,
    matchConditions: [
      {
        field: "tagType",
        operator: "oneOf",
        value: ["googtag", "gaawe", "gtm"]
      },
      {
        field: "hasParameter",
        operator: "equals",
        value: "tagId"
      }
    ],
    transform: {
      serverTagType: "Google Analytics: GA4 Configuration",
      description: "Server-side GA4 configuration tag with first-party measurement endpoint",
      parameterMappings: [
        {
          clientParam: "tagId",
          serverParam: "measurementId",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "measurementIdOverride",
          serverParam: "measurementId",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Set server container URL in web container Google tag",
        "Enable IP address redaction for GDPR compliance",
        "Configure first-party cookie domain",
        "Enable Enhanced Measurement features as needed"
      ]
    },
    confidence: 9.2,
    provisional: false,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/server-side/send-data",
    constraints: [
      {
        type: "requiresParameter",
        field: "tagId",
        severity: "critical",
        message: "Measurement ID (tagId) is required for GA4 server-side configuration"
      }
    ],
    manualReview: [
      {
        trigger: "missingParameter",
        priority: "high",
        action: "Verify Measurement ID and update web container Google tag with server_container_url parameter"
      }
    ],
    tags: ["ga4", "analytics", "google", "core"]
  },
  {
    id: "ga4-event-tag",
    name: "GA4 Event Tag",
    description: "GA4 custom event or recommended event tag",
    category: "analytics",
    priority: 850,
    matchConditions: [
      {
        field: "tagType",
        operator: "oneOf",
        value: ["gaawe", "gaawc", "ga4"]
      },
      {
        field: "hasParameter",
        operator: "equals",
        value: "eventName"
      }
    ],
    transform: {
      serverTagType: "Google Analytics: GA4 Event",
      description: "Server-side GA4 event tag with parameter pass-through",
      parameterMappings: [
        {
          clientParam: "eventName",
          serverParam: "eventName",
          required: true,
          transform: "eventName"
        },
        {
          clientParam: "eventParameters",
          serverParam: "eventParameters",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "userProperties",
          serverParam: "userProperties",
          required: false,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Map event parameters to match GA4 recommended event schema",
        "Ensure ecommerce items array structure matches GA4 spec for purchase/add_to_cart events",
        "Validate currency and value parameters for conversion events"
      ]
    },
    confidence: 8.5,
    provisional: false,
    evidenceRef: "https://developers.google.com/analytics/devguides/collection/ga4/reference/events",
    constraints: [
      {
        type: "requiresParameter",
        field: "eventName",
        severity: "error",
        message: "Event name is required for GA4 event tags"
      }
    ],
    manualReview: [
      {
        trigger: "lowConfidence",
        threshold: 8.0,
        priority: "medium",
        action: "Verify event parameter mappings match GA4 recommended event schema for this event type"
      }
    ],
    tags: ["ga4", "analytics", "google", "events"]
  },
  {
    id: "ga4-ecommerce-purchase",
    name: "GA4 Purchase / Transaction Event",
    description: "GA4 purchase or ecommerce transaction event",
    category: "ecommerce",
    priority: 950,
    matchConditions: [
      {
        field: "tagType",
        operator: "oneOf",
        value: ["gaawe", "gaawc"]
      },
      {
        field: "parameterValue",
        operator: "equals",
        value: "eventName:purchase"
      }
    ],
    transform: {
      serverTagType: "Google Analytics: GA4 Event",
      description: "Server-side GA4 purchase event with ecommerce parameters",
      parameterMappings: [
        {
          clientParam: "transaction_id",
          serverParam: "transaction_id",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "value",
          serverParam: "value",
          required: true,
          transform: "currency"
        },
        {
          clientParam: "currency",
          serverParam: "currency",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "items",
          serverParam: "items",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "coupon",
          serverParam: "coupon",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "shipping",
          serverParam: "shipping",
          required: false,
          transform: "currency"
        },
        {
          clientParam: "tax",
          serverParam: "tax",
          required: false,
          transform: "currency"
        }
      ],
      configurationHints: [
        "Verify items array structure matches GA4 ecommerce spec",
        "Ensure transaction_id is unique and matches across all ecommerce hits",
        "Validate currency code is ISO 4217 format",
        "Check that value represents total transaction value including tax and shipping"
      ]
    },
    confidence: 9.0,
    provisional: false,
    evidenceRef: "https://developers.google.com/analytics/devguides/collection/ga4/ecommerce",
    constraints: [
      {
        type: "requiresParameter",
        field: "transaction_id",
        severity: "critical",
        message: "transaction_id is required for purchase events to prevent duplicate conversions"
      },
      {
        type: "requiresParameter",
        field: "value",
        severity: "critical",
        message: "value is required for purchase events for conversion reporting"
      },
      {
        type: "requiresParameter",
        field: "currency",
        severity: "error",
        message: "currency is required for accurate revenue reporting"
      }
    ],
    manualReview: [
      {
        trigger: "missingParameter",
        priority: "critical",
        action: "Verify all required ecommerce parameters are present and validate items array structure against storefront implementation"
      }
    ],
    tags: ["ga4", "ecommerce", "purchase", "conversion"]
  },
  {
    id: "ga4-ecommerce-add-to-cart",
    name: "GA4 Add to Cart Event",
    description: "GA4 add_to_cart event for funnel tracking",
    category: "ecommerce",
    priority: 900,
    matchConditions: [
      {
        field: "tagType",
        operator: "oneOf",
        value: ["gaawe", "gaawc"]
      },
      {
        field: "parameterValue",
        operator: "equals",
        value: "eventName:add_to_cart"
      }
    ],
    transform: {
      serverTagType: "Google Analytics: GA4 Event",
      description: "Server-side GA4 add_to_cart event with items parameter",
      parameterMappings: [
        {
          clientParam: "value",
          serverParam: "value",
          required: false,
          transform: "currency"
        },
        {
          clientParam: "currency",
          serverParam: "currency",
          required: false,
          transform: "passthrough"
        },
        {
          clientParam: "items",
          serverParam: "items",
          required: true,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Ensure items array includes item_id, item_name, and price at minimum",
        "Include item_brand, item_category for enhanced reporting"
      ]
    },
    confidence: 8.8,
    provisional: false,
    evidenceRef: "https://developers.google.com/analytics/devguides/collection/ga4/ecommerce",
    constraints: [
      {
        type: "requiresParameter",
        field: "items",
        severity: "error",
        message: "items array is required for add_to_cart events"
      }
    ],
    tags: ["ga4", "ecommerce", "funnel"]
  }
];
