/**
 * GTM Variable Type Mappings: Client-Side → Server-Side
 *
 * Maps client-side variable types to server-side equivalents.
 * Server-side variables read from request context instead of browser/DOM.
 */

export interface VariableTypeMapping {
  /** Client-side variable type */
  clientType: string;
  /** Server-side variable type (null if no direct equivalent) */
  serverType: string | null;
  /** Human-readable name */
  name: string;
  /** Can this be automatically migrated? */
  canAutoMigrate: boolean;
  /** Configuration notes */
  notes?: string;
}

/**
 * Client-side variables and their server equivalents
 */
export const VARIABLE_TYPE_MAPPINGS: VariableTypeMapping[] = [
  // Data Layer Variables
  {
    clientType: 'v',
    serverType: 'eventData',
    name: 'Data Layer Variable',
    canAutoMigrate: true,
    notes: 'Client data layer variables map to Event Data variables on server. Read from incoming event payload.'
  },
  {
    clientType: 'dataLayer',
    serverType: 'eventData',
    name: 'Data Layer Variable (alt)',
    canAutoMigrate: true,
    notes: 'Client data layer variables map to Event Data variables on server.'
  },

  // Constant
  {
    clientType: 'c',
    serverType: 'c',
    name: 'Constant',
    canAutoMigrate: true,
    notes: 'Constants work the same on client and server.'
  },

  // JavaScript Variable
  {
    clientType: 'jsm',
    serverType: null,
    name: 'JavaScript Variable',
    canAutoMigrate: false,
    notes: 'JavaScript variables cannot run on server (no DOM/window). Reimplement as Custom JavaScript variable with sandboxed APIs.'
  },

  // Custom JavaScript (sandboxed)
  {
    clientType: 'j',
    serverType: 'j',
    name: 'Custom JavaScript',
    canAutoMigrate: false,
    notes: 'Custom JavaScript on server uses sandboxed APIs (no DOM). Review and rewrite for server context.'
  },

  // First-Party Cookie
  {
    clientType: '1p',
    serverType: 'r',
    name: '1st Party Cookie',
    canAutoMigrate: true,
    notes: 'First-party cookies map to HTTP Request Cookie variables on server. Read from Cookie header.'
  },

  // HTTP Referrer
  {
    clientType: 'f',
    serverType: 'remoteAddress',
    name: 'Referrer',
    canAutoMigrate: true,
    notes: 'Client referrer maps to server Request Header variable (read "referer" header).'
  },

  // URL
  {
    clientType: 'u',
    serverType: 'requestUrl',
    name: 'URL',
    canAutoMigrate: false,
    notes: 'Client URL variable reads from browser. On server, use Event Data variable for page_location or Request URL variable.'
  },

  // Auto-Event Variable
  {
    clientType: 'aev',
    serverType: null,
    name: 'Auto-Event Variable',
    canAutoMigrate: false,
    notes: 'Auto-event variables (click text, form ID, etc.) are client-side only. Send as event parameters to server.'
  },

  // Element Visibility
  {
    clientType: 'vis',
    serverType: null,
    name: 'Element Visibility',
    canAutoMigrate: false,
    notes: 'Element visibility is DOM-specific. Not applicable to server-side.'
  },

  // Video
  {
    clientType: 'ytv',
    serverType: null,
    name: 'YouTube Video',
    canAutoMigrate: false,
    notes: 'YouTube video variables are client-side only. Send video data as event parameters.'
  },

  // Lookup Table
  {
    clientType: 'smm',
    serverType: 'smm',
    name: 'Lookup Table',
    canAutoMigrate: true,
    notes: 'Lookup tables work the same on client and server.'
  },

  // Regex Table
  {
    clientType: 're',
    serverType: 're',
    name: 'Regex Table',
    canAutoMigrate: true,
    notes: 'Regex tables work the same on client and server.'
  },

  // Random Number
  {
    clientType: 'r',
    serverType: 'r',
    name: 'Random Number',
    canAutoMigrate: true,
    notes: 'Random number variables work the same on client and server.'
  },

  // Container ID
  {
    clientType: 'ctid',
    serverType: 'ctid',
    name: 'Container ID',
    canAutoMigrate: true,
    notes: 'Container ID works the same on client and server.'
  },

  // Container Version
  {
    clientType: 'ctv',
    serverType: 'ctv',
    name: 'Container Version',
    canAutoMigrate: true,
    notes: 'Container version works the same on client and server.'
  },

  // Environment Name
  {
    clientType: 'e',
    serverType: 'e',
    name: 'Environment Name',
    canAutoMigrate: true,
    notes: 'Environment name works the same on client and server.'
  },

  // Debug Mode
  {
    clientType: 'd',
    serverType: 'd',
    name: 'Debug Mode',
    canAutoMigrate: true,
    notes: 'Debug mode works the same on client and server.'
  },

  // Google Analytics Settings
  {
    clientType: 'gas',
    serverType: null,
    name: 'Google Analytics Settings',
    canAutoMigrate: false,
    notes: 'GA Settings variable is client-side. On server, configure GA4 tags directly with settings.'
  }
];

/**
 * Server-side only variable types (not present on client)
 */
export const SERVER_ONLY_VARIABLES = [
  'eventData',           // Read from incoming event payload
  'requestUrl',          // Full request URL
  'requestPath',         // Request path only
  'requestQuery',        // Query string parameter
  'requestHeader',       // HTTP request header
  'requestBody',         // Request body (for POST)
  'requestMethod',       // HTTP method (GET, POST, etc.)
  'clientName',          // GTM client name
  'remoteAddress',       // Client IP address
  'requestProtocol',     // HTTP or HTTPS
  'requestHost',         // Request hostname
];

/**
 * GTM Built-in Variables - Client-Side
 * These are automatically available on client but need mapping to server equivalents
 */
export const BUILTIN_VARIABLE_MAPPINGS: Record<string, string | null> = {
  // Page
  'Page URL': 'Event Data: page_location',
  'Page Hostname': 'Event Data: page_location (parse hostname)',
  'Page Path': 'Event Data: page_location (parse path)',
  'Referrer': 'HTTP Request Header: referer',

  // Click
  'Click Element': null,  // Client-only
  'Click Classes': null,  // Client-only
  'Click ID': null,       // Client-only
  'Click Target': null,   // Client-only
  'Click URL': null,      // Client-only
  'Click Text': null,     // Client-only

  // Form
  'Form Element': null,   // Client-only
  'Form Classes': null,   // Client-only
  'Form ID': null,        // Client-only
  'Form Target': null,    // Client-only
  'Form URL': null,       // Client-only
  'Form Text': null,      // Client-only

  // Error
  'Error Message': null,  // Client-only
  'Error URL': null,      // Client-only
  'Error Line': null,     // Client-only

  // Video
  'Video Provider': null, // Client-only
  'Video Status': null,   // Client-only
  'Video URL': null,      // Client-only
  'Video Title': null,    // Client-only
  'Video Duration': null, // Client-only
  'Video Current Time': null, // Client-only
  'Video Percent': null,  // Client-only
  'Video Visible': null,  // Client-only

  // Scroll
  'Scroll Depth Threshold': null, // Client-only
  'Scroll Depth Units': null,     // Client-only
  'Scroll Direction': null,       // Client-only

  // Visibility
  'Percent Visible': null, // Client-only
  'On-Screen Duration': null, // Client-only

  // Container
  'Container ID': 'Container ID',
  'Container Version': 'Container Version',
  'Debug Mode': 'Debug Mode',
  'Environment Name': 'Environment Name',
  'Random Number': 'Random Number',

  // Event
  'Event': 'Event Name'  // Maps to Event Data
};

/**
 * Fast lookup map: clientType → serverType
 */
export const CLIENT_TO_SERVER_VARIABLE_TYPE: Record<string, string | null> =
  Object.fromEntries(
    VARIABLE_TYPE_MAPPINGS.map(m => [m.clientType, m.serverType])
  );

/**
 * Get variable type mapping details
 */
export function getVariableTypeMapping(clientType: string): VariableTypeMapping | null {
  return VARIABLE_TYPE_MAPPINGS.find(m => m.clientType === clientType) || null;
}

/**
 * Check if variable can be automatically migrated
 */
export function canAutoMigrateVariable(clientType: string): boolean {
  const mapping = getVariableTypeMapping(clientType);
  return mapping?.canAutoMigrate && mapping.serverType !== null || false;
}

/**
 * Get migration strategy for a variable
 */
export function getVariableMigrationStrategy(clientType: string): {
  canMigrate: boolean;
  serverType: string | null;
  strategy: 'automatic' | 'manual-rewrite' | 'client-only';
  recommendation: string;
} {
  const mapping = getVariableTypeMapping(clientType);

  if (!mapping) {
    return {
      canMigrate: false,
      serverType: null,
      strategy: 'client-only',
      recommendation: `Unknown variable type "${clientType}". May need custom implementation.`
    };
  }

  if (mapping.canAutoMigrate && mapping.serverType) {
    return {
      canMigrate: true,
      serverType: mapping.serverType,
      strategy: 'automatic',
      recommendation: `Automatically migrates to "${mapping.serverType}". ${mapping.notes || ''}`
    };
  }

  if (mapping.serverType) {
    return {
      canMigrate: true,
      serverType: mapping.serverType,
      strategy: 'manual-rewrite',
      recommendation: `Can migrate but requires manual configuration. ${mapping.notes || ''}`
    };
  }

  return {
    canMigrate: false,
    serverType: null,
    strategy: 'client-only',
    recommendation: `This variable is client-side only. ${mapping.notes || ''}`
  };
}

/**
 * Build server variable configuration from client variable
 */
export function buildServerVariableConfig(
  clientVariable: Record<string, any>,
  serverType: string
): Record<string, any> {
  const config: Record<string, any> = {
    name: clientVariable.name || 'Unnamed Variable',
    type: serverType
  };

  // For Event Data variables, map the data layer key
  if (serverType === 'eventData' && clientVariable.parameter) {
    const dataLayerName = clientVariable.parameter.find((p: any) => p.key === 'name');
    if (dataLayerName?.value) {
      config.parameter = [
        {
          type: 'template',
          key: 'keyPath',
          value: dataLayerName.value
        }
      ];
    }
  }

  // For constants, copy the value
  if (serverType === 'c' && clientVariable.parameter) {
    const valueParam = clientVariable.parameter.find((p: any) => p.key === 'value');
    if (valueParam) {
      config.parameter = [valueParam];
    }
  }

  // For lookup/regex tables, copy the table configuration
  if ((serverType === 'smm' || serverType === 're') && clientVariable.parameter) {
    config.parameter = clientVariable.parameter;
  }

  // Copy format value if present
  if (clientVariable.formatValue !== undefined) {
    config.formatValue = clientVariable.formatValue;
  }

  // Copy disabling triggers if present
  if (clientVariable.disablingTriggerId && Array.isArray(clientVariable.disablingTriggerId)) {
    config.disablingTriggerId = clientVariable.disablingTriggerId;
  }

  // Copy enabling triggers if present
  if (clientVariable.enablingTriggerId && Array.isArray(clientVariable.enablingTriggerId)) {
    config.enablingTriggerId = clientVariable.enablingTriggerId;
  }

  return config;
}
