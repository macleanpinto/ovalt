import type { Rule } from "./schema.js";

/**
 * Custom tag and consent management ruleset.
 * Handles HTML tags, custom templates, consent platforms, and edge cases.
 */

export const customRules: Rule[] = [
  {
    id: "consent-cookiebot",
    name: "Cookiebot Consent Platform",
    description: "Cookiebot consent management platform integration",
    category: "consent",
    priority: 950,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "cookiebot|consent"
      }
    ],
    transform: {
      serverTagType: "Server-side Consent State",
      description: "Pass consent signals to server container for tag gating",
      configurationHints: [
        "Implement consent state forwarding from web container to server container",
        "Use GTM Consent Mode API to gate server-side tags based on consent",
        "Map consent categories (analytics_storage, ad_storage, etc.) to Cookiebot categories",
        "Server-side tags should check consent state before firing"
      ]
    },
    provisional: true,
    evidenceRef: "https://support.cookiebot.com/hc/en-us/articles/360016047000-Cookiebot-and-Google-Tag-Manager",
    constraints: [
      {
        type: "requiresConsent",
        severity: "critical",
        message: "Consent platform must properly pass consent signals to server container to gate tags"
      }
    ],
    manualReview: [
      {
        trigger: "consentRequired",
        priority: "critical",
        action: "Implement consent state forwarding to server container. Test that server-side tags respect consent choices in preview mode."
      }
    ],
    tags: ["consent", "cookiebot", "gdpr", "compliance"]
  },
  {
    id: "consent-onetrust",
    name: "OneTrust Consent Platform",
    description: "OneTrust consent management platform integration",
    category: "consent",
    priority: 950,
    matchConditions: [
      {
        field: "category",
        operator: "matches",
        value: "onetrust|optanon"
      }
    ],
    transform: {
      serverTagType: "Server-side Consent State",
      description: "Pass OneTrust consent signals to server container",
      configurationHints: [
        "Forward OneTrust consent categories to server container using consent state variables",
        "Implement server-side tag gating based on consent",
        "Map OneTrust categories to GTM Consent Mode types",
        "Test consent blocking in server preview mode"
      ]
    },
    provisional: true,
    evidenceRef: "https://support.google.com/tagmanager/answer/10718549",
    constraints: [
      {
        type: "requiresConsent",
        severity: "critical",
        message: "OneTrust consent signals must be forwarded to server container"
      }
    ],
    manualReview: [
      {
        trigger: "consentRequired",
        priority: "critical",
        action: "Configure OneTrust to pass consent state to server GTM. Verify server tags respect consent before production deployment."
      }
    ],
    tags: ["consent", "onetrust", "gdpr", "compliance"]
  },
  {
    id: "custom-html-tag",
    name: "Custom HTML Tag",
    description: "Custom HTML tag (not portable to server-side)",
    category: "custom",
    priority: 800,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "html"
      }
    ],
    transform: {
      serverTagType: "Not Portable - Requires Rebuild",
      description: "Custom HTML cannot run in server-side sandbox - must rebuild as supported tag type",
      configurationHints: [
        "Analyze HTML tag functionality and determine equivalent server-side approach",
        "Options: Custom template tag, HTTP request to external endpoint, or server-side client",
        "Review security constraints of server-side sandbox",
        "Test rebuilt tag thoroughly in server preview mode"
      ]
    },
    provisional: true,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/server-side/api",
    constraints: [
      {
        type: "customValidation",
        severity: "critical",
        message: "Custom HTML tags cannot run server-side - manual rebuild required"
      },
      {
        type: "deprecatedFeature",
        severity: "error",
        message: "HTML tag functionality must be reimplemented using server-side tag templates or HTTP requests"
      }
    ],
    manualReview: [
      {
        trigger: "customTag",
        priority: "critical",
        action: "Review HTML tag functionality and rebuild using server-side tag template, custom template, or HTTP client tag. Document rebuild approach for client approval."
      },
      {
        trigger: "securityRisk",
        priority: "critical",
        action: "Analyze HTML tag for security implications. Ensure rebuilt version maintains security constraints of server-side environment."
      }
    ],
    tags: ["custom", "html", "not-portable", "manual-rebuild"]
  },
  {
    id: "community-template-tag",
    name: "Community Gallery Template",
    description: "Custom template tag from GTM Community Gallery",
    category: "custom",
    priority: 750,
    matchConditions: [
      {
        field: "tagType",
        operator: "startsWith",
        value: "cvt_"
      }
    ],
    transform: {
      serverTagType: "Server-side Template (If Available)",
      description: "Check for equivalent server-side template or rebuild using HTTP request",
      configurationHints: [
        "Search GTM Gallery for server-side version of this template",
        "If no server template exists, consider using HTTP Request tag to call vendor endpoint",
        "Review template permissions and security in server-side context",
        "Test template functionality in server preview mode"
      ]
    },
    provisional: true,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/templates",
    constraints: [
      {
        type: "customValidation",
        severity: "warning",
        message: "Community templates may not have server-side equivalents - verify availability"
      }
    ],
    manualReview: [
      {
        trigger: "customTag",
        priority: "high",
        action: "Search GTM Gallery for server-side template or contact template author. If unavailable, rebuild using HTTP Request tag or custom template."
      },
      {
        trigger: "complexLogic",
        priority: "medium",
        action: "Review template logic and security constraints for server-side compatibility"
      }
    ],
    tags: ["custom", "template", "community-gallery"]
  },
  {
    id: "custom-image-tag",
    name: "Custom Image / Pixel Tag",
    description: "Custom image tag (1x1 pixel tracking)",
    category: "custom",
    priority: 700,
    matchConditions: [
      {
        field: "tagType",
        operator: "equals",
        value: "img"
      }
    ],
    transform: {
      serverTagType: "HTTP Request",
      description: "Convert image tag to server-side HTTP request",
      parameterMappings: [
        {
          clientParam: "url",
          serverParam: "url",
          required: true,
          transform: "passthrough"
        }
      ],
      configurationHints: [
        "Use HTTP Request tag to replicate pixel functionality",
        "Ensure HTTPS endpoint for security",
        "Pass query parameters as needed",
        "Verify vendor accepts server-side requests (check User-Agent, IP restrictions)"
      ]
    },
    provisional: true,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/server-side/send-requests",
    constraints: [
      {
        type: "requiresSecureEndpoint",
        severity: "error",
        message: "Pixel endpoint must use HTTPS"
      }
    ],
        tags: ["custom", "pixel", "image", "http-request"]
  },
  {
    id: "generic-http-request",
    name: "Generic HTTP Request / API Call",
    description: "Generic tag making HTTP requests or API calls",
    category: "custom",
    priority: 600,
    matchConditions: [
      {
        field: "hasParameter",
        operator: "equals",
        value: "url"
      }
    ],
    transform: {
      serverTagType: "HTTP Request",
      description: "Server-side HTTP Request tag",
      parameterMappings: [
        {
          clientParam: "url",
          serverParam: "url",
          required: true,
          transform: "passthrough"
        },
        {
          clientParam: "method",
          serverParam: "method",
          required: false,
          defaultValue: "GET"
        }
      ],
      configurationHints: [
        "Use HTTP Request tag type in server container",
        "Configure headers, body, and authentication as needed",
        "Ensure endpoint accepts server-to-server requests",
        "Handle rate limiting and error responses appropriately"
      ]
    },
    provisional: true,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/server-side/send-requests",
        tags: ["custom", "http", "api", "generic"]
  },
  {
    id: "generic-fallback",
    name: "Generic Tag (No Specific Rule Match)",
    description: "Fallback for tags that don't match any specific rule",
    category: "unknown",
    priority: 100,
    matchConditions: [
      {
        field: "tagType",
        operator: "matches",
        value: ".*"
      }
    ],
    transform: {
      serverTagType: "Requires Analysis",
      description: "No dedicated ruleset mapping available - analyst review required",
      configurationHints: [
        "Research vendor documentation for server-side / CAPI support",
        "Consider HTTP Request tag if vendor has server-side API",
        "Check GTM Gallery for server-side templates",
        "Engage vendor support for migration guidance"
      ]
    },
    provisional: true,
    evidenceRef: "https://developers.google.com/tag-platform/tag-manager/server-side",
        tags: ["fallback", "unknown", "requires-analysis"]
  }
];
