/**
 * GTM Trigger Type Mappings: Client-Side → Server-Side
 *
 * Maps client-side trigger types to server-side equivalents.
 * Server-side triggers fire based on incoming HTTP requests, not browser events.
 */

export interface TriggerTypeMapping {
  /** Client-side trigger type */
  clientType: string;
  /** Server-side trigger type (null if no equivalent) */
  serverType: string | null;
  /** Human-readable name */
  name: string;
  /** Can this be automatically migrated? */
  canAutoMigrate: boolean;
  /** Configuration notes */
  notes?: string;
}

/**
 * Core client-side triggers and their server equivalents
 */
export const TRIGGER_TYPE_MAPPINGS: TriggerTypeMapping[] = [
  // Pageview triggers
  {
    clientType: 'PAGEVIEW',
    serverType: 'serverPageview',
    name: 'Page View',
    canAutoMigrate: true,
    notes: 'Client pageview maps to server pageview. Fires when GA4/gtag sends page_view event.'
  },
  {
    clientType: 'pageview',
    serverType: 'serverPageview',
    name: 'Page View (lowercase)',
    canAutoMigrate: true,
    notes: 'Client pageview maps to server pageview. Fires when GA4/gtag sends page_view event.'
  },
  {
    clientType: 'DOM_READY',
    serverType: null,
    name: 'DOM Ready',
    canAutoMigrate: false,
    notes: 'DOM Ready is client-side only. Consider using "All Pages" or custom event on server.'
  },
  {
    clientType: 'WINDOW_LOADED',
    serverType: null,
    name: 'Window Loaded',
    canAutoMigrate: false,
    notes: 'Window Loaded is client-side only. Consider using "All Pages" or custom event on server.'
  },

  // Custom Events
  {
    clientType: 'CUSTOM_EVENT',
    serverType: 'customEvent',
    name: 'Custom Event',
    canAutoMigrate: true,
    notes: 'Custom events migrate directly. Event name and filters should be preserved.'
  },
  {
    clientType: 'customEvent',
    serverType: 'customEvent',
    name: 'Custom Event (lowercase)',
    canAutoMigrate: true,
    notes: 'Custom events migrate directly. Event name and filters should be preserved.'
  },

  // Click triggers
  {
    clientType: 'CLICK',
    serverType: 'customEvent',
    name: 'Click - All Elements',
    canAutoMigrate: false,
    notes: 'Client-side click tracking. Send click events to server via dataLayer push, then trigger on custom event.'
  },
  {
    clientType: 'LINK_CLICK',
    serverType: 'customEvent',
    name: 'Click - Just Links',
    canAutoMigrate: false,
    notes: 'Client-side link click tracking. Send link_click events to server, trigger on custom event.'
  },

  // Form submission
  {
    clientType: 'FORM_SUBMISSION',
    serverType: 'customEvent',
    name: 'Form Submission',
    canAutoMigrate: false,
    notes: 'Client-side form tracking. Send form_submit events to server, trigger on custom event.'
  },

  // Scroll depth
  {
    clientType: 'SCROLL_DEPTH',
    serverType: null,
    name: 'Scroll Depth',
    canAutoMigrate: false,
    notes: 'Scroll tracking is client-side only. Send scroll events as custom events if needed.'
  },

  // Element visibility
  {
    clientType: 'ELEMENT_VISIBILITY',
    serverType: null,
    name: 'Element Visibility',
    canAutoMigrate: false,
    notes: 'Element visibility is client-side only. Send visibility events as custom events if needed.'
  },

  // Video
  {
    clientType: 'YOUTUBE_VIDEO',
    serverType: null,
    name: 'YouTube Video',
    canAutoMigrate: false,
    notes: 'Video tracking is client-side only. Send video events as custom events to server.'
  },

  // Timer
  {
    clientType: 'TIMER',
    serverType: null,
    name: 'Timer',
    canAutoMigrate: false,
    notes: 'Timer triggers are client-side only. Not applicable for server-side.'
  },

  // History
  {
    clientType: 'HISTORY_CHANGE',
    serverType: 'customEvent',
    name: 'History Change',
    canAutoMigrate: false,
    notes: 'History change is client-side. Send history_change events to server as custom events.'
  },
  {
    clientType: 'historyChange',
    serverType: 'customEvent',
    name: 'History Change (lowercase)',
    canAutoMigrate: false,
    notes: 'History change is client-side. Send history_change events to server as custom events.'
  },

  // JavaScript Error
  {
    clientType: 'JS_ERROR',
    serverType: null,
    name: 'JavaScript Error',
    canAutoMigrate: false,
    notes: 'JavaScript errors are client-side only. Send error events to server for logging.'
  },

  // Trigger Groups
  {
    clientType: 'triggerGroup',
    serverType: 'triggerGroup',
    name: 'Trigger Group',
    canAutoMigrate: true,
    notes: 'Trigger groups work identically on server-side. All triggers in group must fire.'
  },

  // Server-side specific triggers
  {
    clientType: 'serverPageview',
    serverType: 'serverPageview',
    name: 'Server Pageview (already server-side)',
    canAutoMigrate: true,
    notes: 'Already a server-side trigger. No migration needed.'
  },
  {
    clientType: 'customEvent',
    serverType: 'customEvent',
    name: 'Custom Event (already server-side)',
    canAutoMigrate: true,
    notes: 'Already a server-side trigger. No migration needed.'
  }
];

/**
 * Server-side only trigger types (not present on client)
 */
export const SERVER_ONLY_TRIGGERS = [
  'serverPageview',      // Fires on page_view events
  'customEvent',         // Fires on custom event names
  'eventNameEquals',     // Fires when event name matches
  'requestPath',         // Fires based on request path
  'clientName',          // Fires based on client name
  'requestUrl',          // Fires based on request URL
  'container',           // Container-level trigger
];

/**
 * Fast lookup map: clientType → serverType
 */
export const CLIENT_TO_SERVER_TRIGGER_TYPE: Record<string, string | null> =
  Object.fromEntries(
    TRIGGER_TYPE_MAPPINGS.map(m => [m.clientType, m.serverType])
  );

/**
 * Get trigger type mapping details
 */
export function getTriggerTypeMapping(clientType: string): TriggerTypeMapping | null {
  return TRIGGER_TYPE_MAPPINGS.find(m => m.clientType === clientType) || null;
}

/**
 * Check if trigger can be automatically migrated
 */
export function canAutoMigrateTrigger(clientType: string): boolean {
  const mapping = getTriggerTypeMapping(clientType);
  return mapping?.canAutoMigrate && mapping.serverType !== null || false;
}

/**
 * Get migration strategy for a trigger
 */
export function getTriggerMigrationStrategy(clientType: string): {
  canMigrate: boolean;
  serverType: string | null;
  strategy: 'automatic' | 'via-custom-event' | 'client-only';
  recommendation: string;
} {
  const mapping = getTriggerTypeMapping(clientType);

  if (!mapping) {
    return {
      canMigrate: false,
      serverType: null,
      strategy: 'client-only',
      recommendation: `Unknown trigger type "${clientType}". May need custom implementation.`
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

  // Check if it can migrate via custom event proxy
  if (mapping.serverType === 'customEvent') {
    return {
      canMigrate: true,
      serverType: 'customEvent',
      strategy: 'via-custom-event',
      recommendation: `Client-side trigger. Send events to server via dataLayer, then trigger on custom event. ${mapping.notes || ''}`
    };
  }

  return {
    canMigrate: false,
    serverType: null,
    strategy: 'client-only',
    recommendation: `This trigger is client-side only and cannot be migrated. ${mapping.notes || ''}`
  };
}

/**
 * Build server trigger configuration from client trigger
 * Copies compatible properties and filters
 */
export function buildServerTriggerConfig(
  clientTrigger: Record<string, any>,
  serverType: string
): Record<string, any> {
  const config: Record<string, any> = {
    name: clientTrigger.name || 'Unnamed Trigger',
    type: serverType
  };

  // Copy custom event filter if present
  if (clientTrigger.customEventFilter && Array.isArray(clientTrigger.customEventFilter)) {
    config.customEventFilter = clientTrigger.customEventFilter;
  }

  // Copy general filter conditions if present
  if (clientTrigger.filter && Array.isArray(clientTrigger.filter)) {
    // Some filters may reference client-side variables that don't exist on server
    // Copy as-is and let GTM API validate
    config.filter = clientTrigger.filter;
  }

  // Copy event name if specified
  if (clientTrigger.eventName) {
    config.eventName = clientTrigger.eventName;
  }

  // Copy parameters (some triggers have parameter arrays)
  if (clientTrigger.parameter && Array.isArray(clientTrigger.parameter)) {
    config.parameter = clientTrigger.parameter;
  }

  // Copy wait settings
  if (clientTrigger.waitForTags !== undefined) {
    config.waitForTags = clientTrigger.waitForTags;
  }
  if (clientTrigger.checkValidation !== undefined) {
    config.checkValidation = clientTrigger.checkValidation;
  }
  if (clientTrigger.waitForTagsTimeout) {
    config.waitForTagsTimeout = clientTrigger.waitForTagsTimeout;
  }

  // Copy auto-event filter settings
  if (clientTrigger.autoEventFilter && Array.isArray(clientTrigger.autoEventFilter)) {
    config.autoEventFilter = clientTrigger.autoEventFilter;
  }

  // Copy unique trigger ID (for reference tracking)
  if (clientTrigger.uniqueTriggerId) {
    config.uniqueTriggerId = clientTrigger.uniqueTriggerId;
  }

  return config;
}
