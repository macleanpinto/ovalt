/**
 * GTM Migration Deployment using Clean Workspace Pattern
 *
 * This module handles the deployment of migrated tags:
 * 0. Create new clean workspace in client container (avoids conflicts)
 * 1. Fetch all tags/triggers/variables from client workspace
 * 2. Modify GA4 Config tags (googtag) to add server_container_url
 * 3. Convert Google Ads tags to GA4 Event tags with google_ads_* event names
 * 4. Create/update tags in the new client workspace
 * 5. Create new "Ovalt Migration Workspace" in server container
 * 6. Copy required variables to server workspace
 * 7. Create server-side tags per Google & Stape.io best practices
 *
 * CLIENT CONTAINER (per Google & Stape.io official documentation):
 * - GA4 Config tags (googtag): Modified with server_container_url in configSettingsTable
 * - GA4 Event tags (gaawe): Automatically inherit config - NO modification needed
 * - Google Ads tags (awct, sp): CONVERTED to GA4 Event tags
 *   - Event name: "google_ads_{meaningful_name}" (e.g., "google_ads_purchase", "google_ads_lead")
 *   - Name extracted from tag name and normalized
 *   - Event parameters include conversion_id and conversion_label
 *   - Keeps original triggers from Google Ads tag
 * - Meta Pixel tags (cvt_*): CONVERTED to GA4 Event tags
 *   - Event name: "meta_{meaningful_name}" (e.g., "meta_pixel", "meta_purchase")
 *   - Name extracted from tag name and normalized
 *   - Keeps original triggers from Meta Pixel tag
 *
 * SERVER CONTAINER (per Google & Stape.io official documentation):
 * - Creates new "Ovalt Migration Workspace"
 * - GA4: Creates consolidated GA4 tag (one per account)
 *   - BLOCKS google_ads_* and meta_* events (prevents GA4 pollution)
 *   - Only sends real user events to Google Analytics
 * - Google Ads: Creates individual Conversion Tracking tags
 *   - Custom Event triggers (one per conversion event: google_ads_purchase, google_ads_lead, etc.)
 *   - Individual Conversion Tracking tags (each fires on its specific google_ads_* event)
 *   - Note: Conversion Linker not needed on server-side (client-side only)
 * - Meta Pixel: Creates individual Meta Pixel tags
 *   - Custom Event triggers (one per event: meta_pixel, meta_purchase, etc.)
 *   - Individual Meta Pixel tags (each fires on its specific meta_* event)
 *
 * TAG TYPE BEHAVIOR:
 * - googtag (GA4 Config): Modified with server_container_url in configSettingsTable
 * - gaawe (GA4 Event): Inherits from config - no modification
 * - gaawc (GA4 Configuration): Deprecated - no modification
 * - awct, sp (Google Ads): CONVERTED to GA4 Event tags with "google_ads_*" events
 *   - Example: "Google Ads - Purchase" → GA4 Event "google_ads_purchase"
 *   - Example: "Google Ads Conversion Tracking" → GA4 Event "google_ads_conversion"
 *
 * GOOGLE ADS SERVER-SIDE SETUP (per Google & Stape.io):
 * - Converts client-side Google Ads tags → GA4 Event tags (google_ads_* naming)
 * - Event names derived from tag names for easy identification and filtering
 * - Events flow through GA4 infrastructure (has deduplication during testing)
 * - Server receives google_ads_* events (purchase, lead, conversion, etc.)
 * - Creates custom event triggers (using {{_event}} on server-side)
 * - Conversion Tracking tags fire on their specific google_ads_* events
 * - Routes conversions to Google Ads Conversion API with original ID + Label
 * - Note: Conversion Linker not needed (server-side conversions work without it)
 *
 * NO GA4 POLLUTION (Server-Side Filtering):
 * - google_ads_* events blocked from GA4 (server-side blocking triggers)
 * - meta_* events blocked from GA4 (server-side blocking triggers)
 * - Only real user events sent to Google Analytics
 * - Conversion events still trigger Google Ads and Meta tags on server
 *
 * DEDUPLICATION:
 * - GA4 events have built-in deduplication (safe during testing)
 * - Google Ads conversions sent via server-side only (no client-side direct calls)
 * - Meta Pixel events sent via server-side only (no client-side direct calls)
 * - Original conversion tags converted to GA4 Events (flow through GA4 infrastructure)
 *
 * BLOCKING TRIGGERS:
 * - Single vendor (e.g., only GA4): No blocking triggers created - tag fires on all events
 * - Multiple vendors (e.g., GA4 + Google Ads): Blocking triggers prevent cross-vendor firing
 *   - GA4 tag blocks when "Client Name Contains Google Ads"
 *   - Google Ads tag blocks when "Client Name Contains GA4"
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { FastifyBaseLogger } from 'fastify';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GTMCallOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Wrapper for GTM API calls with rate limiting and retry
 */
async function gtmCall<T>(
  log: FastifyBaseLogger,
  operation: string,
  fn: () => Promise<T>,
  opts: GTMCallOptions = {}
): Promise<T> {
  const { maxRetries = 3, retryDelayMs = 1000 } = opts;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimited = err?.response?.status === 429 ||
                           err?.message?.toLowerCase().includes('quota');

      if (isRateLimited && attempt < maxRetries) {
        const waitMs = retryDelayMs * Math.pow(2, attempt - 1);
        log.warn({ operation, attempt, waitMs }, 'Rate limited, retrying...');
        await delay(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw new Error(`GTM operation ${operation} failed after ${maxRetries} attempts`);
}

interface DeploymentRequest {
  clientContainerPath: string;
  clientWorkspacePath: string;
  serverContainerPath: string;
  serverContainerUrl: string;
  approvedTagIds: string[];
  tagsByType: Map<string, any[]>; // Group of client tags by type
  metaAccessToken?: string; // Optional Meta Pixel Access Token for server-side deployment
}

interface DeploymentResult {
  clientWorkspacePath: string;
  clientWorkspaceName: string;
  tagsModified: number;
  serverWorkspacePath: string;
  serverWorkspaceName: string;
  serverTagsCreated: Array<{
    tagId: string;
    tagName: string;
    tagType: string;
    handlesClientTags: string[];
  }>;
}

/**
 * Map client tag types to server tag types
 */
function mapClientTypeToServerType(clientType: string, category?: string): string | null {
  const mapping: Record<string, string> = {
    'gaawe': 'sgtmgaaw',      // GA4 Event → Server GA4
    'googtag': 'sgtmgaaw',    // Google Tag → Server GA4
    'gaawc': 'sgtmgaaw',      // GA4 Config → Server GA4
    'awct': 'googads',        // Google Ads Conversion → Server Google Ads (via template)
    'sp': 'googads',          // Google Ads Remarketing → Server Google Ads (via template)
    'gclidw': 'sgtmadscl',    // Conversion Linker → Server Conversion Linker
  };

  // Handle by category for custom templates
  if (category === 'meta') {
    return 'cvt'; // Meta Pixel uses custom variable template on server-side
  }

  return mapping[clientType] || null;
}

/**
 * Determine tag category for consolidation
 * Also checks tag name for Meta/Facebook tags (since they use custom templates)
 */
function getTagCategory(clientType: string, tagName?: string): string | null {
  if (['gaawe', 'googtag', 'gaawc'].includes(clientType)) return 'ga4';
  if (['awct', 'sp'].includes(clientType)) return 'googads';

  // Meta Pixel tags use custom templates (cvt_*), check by name
  if (clientType && clientType.startsWith('cvt') && tagName) {
    const lowerName = tagName.toLowerCase();
    if (lowerName.includes('facebook') || lowerName.includes('meta') || lowerName.includes('pixel')) {
      return 'meta';
    }
  }

  return null;
}

/**
 * Create server-side trigger from client-side trigger
 */
async function createServerTriggerFromClientTrigger(
  tm: any,
  serverWorkspacePath: string,
  clientTrigger: any,
  log: FastifyBaseLogger
): Promise<string | null> {
  try {
    // Map client trigger types to server trigger types
    let serverTriggerType: string;
    let triggerConfig: any = {
      name: `${clientTrigger.name} (Server)`,
      type: ''
    };

    // Map trigger type
    if (clientTrigger.type === 'PAGEVIEW' || clientTrigger.type === 'pageview') {
      serverTriggerType = 'serverPageview';
    } else if (clientTrigger.type === 'CUSTOM_EVENT' || clientTrigger.type === 'customEvent') {
      serverTriggerType = 'customEvent';
      // Copy event name if present
      if (clientTrigger.customEventFilter && clientTrigger.customEventFilter.length > 0) {
        triggerConfig.customEventFilter = clientTrigger.customEventFilter;
      }
    } else if (clientTrigger.type === 'ALWAYS' || clientTrigger.type === 'always') {
      serverTriggerType = 'serverPageview'; // Server equivalent of "All Pages"
    } else {
      log.warn({ triggerType: clientTrigger.type, triggerName: clientTrigger.name }, 'Unknown trigger type, using serverPageview');
      serverTriggerType = 'serverPageview';
    }

    triggerConfig.type = serverTriggerType;

    // Copy filters if present
    if (clientTrigger.filter && clientTrigger.filter.length > 0) {
      triggerConfig.filter = clientTrigger.filter;
    }

    const createdTrigger: any = await gtmCall(log, 'triggers.create', () =>
      tm.accounts.containers.workspaces.triggers.create({
        parent: serverWorkspacePath,
        requestBody: triggerConfig
      })
    );

    log.info({
      clientTriggerName: clientTrigger.name,
      serverTriggerId: createdTrigger.data.triggerId,
      serverTriggerType
    }, 'Created server-side trigger from client trigger');

    return createdTrigger.data.triggerId!;
  } catch (err: any) {
    log.error({
      triggerName: clientTrigger.name,
      err: err.message
    }, 'Failed to create server trigger');
    return null;
  }
}

/**
 * Extract Google Ads conversion parameters from client tag
 */
function extractGoogleAdsConversionParams(tag: any): {
  conversionId: string | null;
  conversionLabel: string | null;
  tagName: string;
  clientTagId: string;
  firingTriggerIds: string[];
} {
  const params = tag.parameter || [];

  // Find conversionId parameter (key: 'conversionId')
  const conversionIdParam = params.find((p: any) => p.key === 'conversionId');
  const conversionId = conversionIdParam?.value || null;

  // Find conversionLabel parameter (key: 'conversionLabel')
  const conversionLabelParam = params.find((p: any) => p.key === 'conversionLabel');
  const conversionLabel = conversionLabelParam?.value || null;

  return {
    conversionId,
    conversionLabel,
    tagName: tag.name || 'Unnamed Google Ads Tag',
    clientTagId: tag.tagId,
    firingTriggerIds: tag.firingTriggerId || []
  };
}

/**
 * Deploy migration using fetch-modify-create pattern
 */
export async function deployMigrationWithExportImport(
  auth: OAuth2Client,
  request: DeploymentRequest,
  log: FastifyBaseLogger
): Promise<DeploymentResult> {
  const tm = google.tagmanager({ version: 'v2', auth });

  // ================================================================
  // STEP 0: Create clean workspace for migration
  // ================================================================
  // Delete existing "Ovalt Migration Workspace" if it exists, then create fresh one
  const CLIENT_WORKSPACE_NAME = 'Ovalt Migration Workspace';

  log.info({ workspaceName: CLIENT_WORKSPACE_NAME }, 'Ensuring clean workspace for migration');

  try {
    // Get all workspaces in client container
    const clientWorkspaces = await gtmCall(log, 'workspaces.list', () =>
      tm.accounts.containers.workspaces.list({ parent: request.clientContainerPath })
    );

    // Find existing Ovalt Migration Workspace
    const existingWorkspace = clientWorkspaces.data.workspace?.find(
      (w: any) => w.name === CLIENT_WORKSPACE_NAME
    );

    // Delete existing workspace if found
    if (existingWorkspace?.path) {
      log.info({ path: existingWorkspace.path }, 'Deleting existing Ovalt Migration Workspace');
      await gtmCall(log, 'workspaces.delete', () =>
        tm.accounts.containers.workspaces.delete({ path: existingWorkspace.path! })
      );

      // Wait for deletion to complete
      log.info('Waiting for workspace deletion to complete...');
      await delay(3000);

      // Verify deletion completed
      const verifyWorkspaces = await gtmCall(log, 'workspaces.list', () =>
        tm.accounts.containers.workspaces.list({ parent: request.clientContainerPath })
      );
      const stillExists = verifyWorkspaces.data.workspace?.find((w: any) => w.name === CLIENT_WORKSPACE_NAME);
      if (stillExists) {
        log.warn('Workspace still exists after deletion, waiting additional time...');
        await delay(2000);
      }
    }

    // Create new workspace with consistent name
    log.info({ workspaceName: CLIENT_WORKSPACE_NAME }, 'Creating new Ovalt Migration Workspace');
    const newWorkspace = await gtmCall(log, 'workspaces.create', () =>
      tm.accounts.containers.workspaces.create({
        parent: request.clientContainerPath,
        requestBody: {
          name: CLIENT_WORKSPACE_NAME,
          description: 'Workspace created by Ovalt for server-side migration. Contains GA4 server routing and Google Ads event conversions.'
        }
      })
    );

    // Update workspace path to new workspace
    const oldWorkspacePath = request.clientWorkspacePath;
    request.clientWorkspacePath = newWorkspace.data.path!;

    log.info({
      oldPath: oldWorkspacePath,
      newPath: request.clientWorkspacePath,
      workspaceName: CLIENT_WORKSPACE_NAME
    }, 'Created clean Ovalt Migration Workspace');

    await delay(2000);
  } catch (err: any) {
    log.warn({ err: err.message }, 'Failed to create new workspace, continuing with existing workspace');
    // Continue with existing workspace if creation fails
  }

  // ================================================================
  // STEP 1: Fetch all entities from client workspace
  // ================================================================
  log.info({ workspace: request.clientWorkspacePath }, 'Fetching client workspace entities');

  const [tagsRes, triggersRes, variablesRes] = await Promise.all([
    gtmCall(log, 'tags.list', () =>
      tm.accounts.containers.workspaces.tags.list({ parent: request.clientWorkspacePath })
    ),
    gtmCall(log, 'triggers.list', () =>
      tm.accounts.containers.workspaces.triggers.list({ parent: request.clientWorkspacePath })
    ),
    gtmCall(log, 'variables.list', () =>
      tm.accounts.containers.workspaces.variables.list({ parent: request.clientWorkspacePath })
    )
  ]);

  const originalTags = tagsRes.data.tag || [];
  const originalTriggers = triggersRes.data.trigger || [];
  const originalVariables = variablesRes.data.variable || [];

  log.info({
    tagCount: originalTags.length,
    triggerCount: originalTriggers.length,
    variableCount: originalVariables.length
  }, 'Fetched client workspace entities');

  // ================================================================
  // STEP 2: Modify tags for server-side migration
  // ================================================================
  // Per Google & Stape.io documentation:
  // - GA4 Config tags (googtag): Add server_container_url in configSettingsTable
  // - GA4 Event tags (gaawe): Automatically inherit config - no modification
  // - Google Ads tags (awct, sp): CONVERT to GA4 Event tags with google_ads_* event names
  log.info({ serverUrl: request.serverContainerUrl }, 'Modifying tags for server-side migration');

  // Use the GA4 - ID variable for measurementId in converted tags
  // This variable should exist in the container and will be auto-detected
  const measurementIdVariable = '{{GA4 - ID}}';
  log.info({ measurementIdVariable }, 'Using GA4 ID variable for converted tags');

  let modifiedCount = 0;
  let convertedCount = 0;
  const modifiedTags = originalTags.map((tag: any) => {
    // Only modify approved tags
    if (!request.approvedTagIds.includes(tag.tagId)) {
      return tag;
    }

    // CONVERT Google Ads tags to GA4 Event tags
    // Per Google Docs: "Google Ads conversion tracking works exclusively with the Google Analytics 4 (GA4) tag"
    // Approach: Convert to GA4 Event tag that sends event to server, then server routes to Google Ads API
    // Events prefixed with google_ads_* are blocked from GA4 on server-side, but trigger Google Ads conversion tags
    if (['awct', 'sp'].includes(tag.type)) {
      const conversionParams = extractGoogleAdsConversionParams(tag);

      // Generate event name from tag name: extract meaningful part and prepend google_ads_
      // Examples:
      // "Google Ads - Purchase Conversion" → "google_ads_purchase"
      // "Google Ads Conversion Tracking" → "google_ads_conversion"
      // "Lead Generation" → "google_ads_lead_generation"
      let eventName = tag.name
        .toLowerCase()
        .replace(/google\s*ads\s*[-–—]?\s*/gi, '') // Remove "Google Ads -" prefix
        .replace(/conversion\s*tracking/gi, 'conversion') // Simplify "Conversion Tracking"
        .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
        .replace(/^_+|_+$/g, ''); // Trim underscores from start/end

      // Prepend google_ads_
      eventName = `google_ads_${eventName || 'conversion'}`;

      log.info({
        tagName: tag.name,
        tagType: tag.type,
        eventName,
        conversionId: conversionParams.conversionId,
        conversionLabel: conversionParams.conversionLabel
      }, 'Converting Google Ads tag to GA4 Event tag');

      convertedCount++;

      // Convert to GA4 Event tag
      // Must include measurementId for GA4 Event tags
      const googleAdsEventParams: any[] = [
        {
          type: 'template',
          key: 'eventName',
          value: eventName
        }
      ];

      // Use GA4 ID variable for measurementId
      googleAdsEventParams.push({
        type: 'template',
        key: 'measurementIdOverride',
        value: measurementIdVariable
      });

      // Store conversion ID and label as event parameters so server can route to Google Ads
      googleAdsEventParams.push({
        type: 'list',
        key: 'eventParameters',
        list: [
          {
            type: 'map',
            map: [
              { type: 'template', key: 'name', value: 'google_ads_conversion_id' },
              { type: 'template', key: 'value', value: conversionParams.conversionId || '' }
            ]
          },
          {
            type: 'map',
            map: [
              { type: 'template', key: 'name', value: 'google_ads_conversion_label' },
              { type: 'template', key: 'value', value: conversionParams.conversionLabel || '' }
            ]
          }
        ]
      });

      return {
        ...tag,
        type: 'gaawe', // GA4 Event tag type
        parameter: googleAdsEventParams,
        notes: (tag.notes || '') + `\n\n[Converted by Tag Relay] Original Google Ads tag converted to GA4 Event "${eventName}". Server-side filters this event from GA4 (no pollution) and routes to Google Ads Conversion API with ID: ${conversionParams.conversionId}, Label: ${conversionParams.conversionLabel}`
      };
    }

    // CONVERT Meta Pixel tags to GA4 Event tags
    // Same approach: Convert to GA4 Event, filter on server-side from GA4, route to Meta Conversions API
    // Meta Pixel template ID starts with 'cvt' (Custom Variable Template)
    if (tag.type && tag.type.startsWith('cvt') &&
        (tag.name?.toLowerCase().includes('facebook') ||
         tag.name?.toLowerCase().includes('meta') ||
         tag.name?.toLowerCase().includes('pixel'))) {

      // Extract event name from tag parameters (custom event name configured in Meta Pixel)
      // Check for customEventName (custom events) or standardEventName (standard events)
      let eventName: string | null = null;
      const customEventNameParam = tag.parameter?.find((p: any) => p.key === 'customEventName');
      const standardEventNameParam = tag.parameter?.find((p: any) => p.key === 'standardEventName');

      if (customEventNameParam?.value) {
        // Use custom event name, PRESERVE GTM variables
        // e.g., "clicks_{{DLV - gtm.elementText}}" → "meta_clicks_{{DLV - gtm.elementText}}"
        eventName = customEventNameParam.value;
      } else if (standardEventNameParam?.value) {
        // Use standard event name (lowercase and clean)
        eventName = standardEventNameParam.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      } else {
        // Fallback: derive from tag name
        // Examples:
        // "Facebook - Pixel" → "pixel"
        // "Facebook - Purchase" → "purchase"
        eventName = tag.name
          .toLowerCase()
          .replace(/facebook\s*[-–—]?\s*/gi, '') // Remove "Facebook -" prefix
          .replace(/meta\s*[-–—]?\s*/gi, '') // Remove "Meta -" prefix
          .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
          .replace(/^_+|_+$/g, ''); // Trim underscores from start/end
      }

      // Prepend meta_ if not already present
      if (!eventName.startsWith('meta_')) {
        eventName = `meta_${eventName || 'event'}`;
      }

      log.info({
        tagName: tag.name,
        tagType: tag.type,
        eventName
      }, 'Converting Meta Pixel tag to GA4 Event tag');

      convertedCount++;

      // Convert to GA4 Event tag
      const metaEventParams: any[] = [
        {
          type: 'template',
          key: 'eventName',
          value: eventName
        },
        {
          type: 'template',
          key: 'measurementIdOverride',
          value: measurementIdVariable
        }
      ];

      // Store original tag parameters as event parameters so server can access them
      // This preserves pixel ID, event name, custom data, etc.
      if (tag.parameter && tag.parameter.length > 0) {
        const metaParamsList: any[] = [];

        // Copy relevant parameters from original Meta tag
        for (const param of tag.parameter) {
          if (param.key && param.value) {
            metaParamsList.push({
              type: 'map',
              map: [
                { type: 'template', key: 'name', value: `meta_${param.key}` },
                { type: 'template', key: 'value', value: param.value }
              ]
            });
          }
        }

        if (metaParamsList.length > 0) {
          metaEventParams.push({
            type: 'list',
            key: 'eventParameters',
            list: metaParamsList
          });
        }
      }

      return {
        ...tag,
        type: 'gaawe', // GA4 Event tag type
        parameter: metaEventParams,
        notes: (tag.notes || '') + `\n\n[Converted by Tag Relay] Original Meta Pixel tag converted to GA4 Event "${eventName}". Server-side filters this event from GA4 (no pollution) and routes to Meta Conversions API.`
      };
    }

    // PAUSE Conversion Linker tags (gclidw)
    // Server-side Conversion Linker (sgtmadscl) will handle click ID reading and cookie setting
    // No need to convert to GA4 Event - that would pollute GA4 reports
    if (tag.type === 'gclidw') {
      log.info({
        tagName: tag.name,
        tagType: tag.type
      }, 'Pausing client-side Conversion Linker tag - server-side Conversion Linker will handle this');

      convertedCount++;

      return {
        ...tag,
        paused: true,
        notes: (tag.notes || '') + `\n\n[Paused by Tag Relay] Client-side Conversion Linker tag paused. Server-side Conversion Linker (sgtmadscl) handles click ID reading and cookie setting without polluting GA4 reports.`
      };
    }

    // Only modify GA4 Config tags (googtag type)
    // Skip: gaawe (inherits from config), gaawc (deprecated)
    if (tag.type !== 'googtag') {
      log.info({ tagName: tag.name, tagType: tag.type }, 'Skipping tag - not a GA4 Config tag');
      return tag;
    }

    const parameters = [...(tag.parameter || [])];

    // For GA4 Config tags: Add server_container_url to configSettingsTable
    let configSettingsTable = parameters.find((p: any) => p.key === 'configSettingsTable');

    if (!configSettingsTable) {
      // Create configSettingsTable if it doesn't exist
      configSettingsTable = {
        type: 'list',
        key: 'configSettingsTable',
        list: []
      };
      parameters.push(configSettingsTable);
    }

    // Remove existing server_container_url if present
    if (configSettingsTable.list) {
      configSettingsTable.list = configSettingsTable.list.filter((item: any) => {
        const paramKey = item.map?.find((m: any) => m.key === 'parameter')?.value;
        return paramKey !== 'server_container_url';
      });

      // Add server_container_url to configSettingsTable
      configSettingsTable.list.push({
        type: 'map',
        map: [
          { type: 'template', key: 'parameter', value: 'server_container_url' },
          { type: 'template', key: 'parameterValue', value: request.serverContainerUrl }
        ]
      });
    }

    modifiedCount++;

    return {
      ...tag,
      parameter: parameters,
      notes: (tag.notes || '') + `\n\n[Modified by Tag Relay] Routes to server: ${request.serverContainerUrl}`
    };
  });

  log.info({ modifiedCount, convertedCount }, 'Modified GA4 Config tags and converted Google Ads tags to GA4 Events');

  // ================================================================
  // STEP 3: Update GA4 Config tags and CREATE new GA4 Event tags for conversions
  // ================================================================
  log.info({ workspace: request.clientWorkspacePath }, 'Updating tags in original workspace');

  let updatedCount = 0;
  let createdCount = 0;

  for (const tag of modifiedTags) {
    // Only process approved tags
    if (!request.approvedTagIds.includes(tag.tagId)) {
      continue;
    }

    // Find the original tag to check its original type
    const originalTag = originalTags.find((t: any) => t.tagId === tag.tagId);
    const wasConverted = originalTag && ['awct', 'sp'].includes(originalTag.type) ||
                         (originalTag?.type?.startsWith('cvt') &&
                          (originalTag.name?.toLowerCase().includes('facebook') ||
                           originalTag.name?.toLowerCase().includes('meta') ||
                           originalTag.name?.toLowerCase().includes('pixel')));

    // If this was a conversion tag (Google Ads or Meta), CREATE a new GA4 Event tag instead of updating
    if (wasConverted && tag.type === 'gaawe') {
      try {
        const newTag = await gtmCall(log, 'tags.create', () =>
          tm.accounts.containers.workspaces.tags.create({
            parent: request.clientWorkspacePath,
            requestBody: {
              name: `${tag.name} (Server-Side)`,
              type: tag.type,
              parameter: tag.parameter,
              firingTriggerId: tag.firingTriggerId,
              blockingTriggerId: tag.blockingTriggerId,
              priority: tag.priority,
              tagFiringOption: tag.tagFiringOption,
              monitoringMetadata: tag.monitoringMetadata,
              consentSettings: tag.consentSettings,
              notes: tag.notes
            }
          })
        );
        createdCount++;
        log.info({ tagName: `${tag.name} (Server-Side)`, tagType: tag.type }, 'Created new GA4 Event tag for conversion tracking');

        // Pause the original tag so it doesn't double-fire
        try {
          await gtmCall(log, 'tags.update', () =>
            tm.accounts.containers.workspaces.tags.update({
              path: originalTag.path,
              requestBody: {
                ...originalTag,
                paused: true,
                notes: (originalTag.notes || '') + '\n\n[Paused by Tag Relay] Replaced with GA4 Event tag for server-side conversion tracking',
                fingerprint: originalTag.fingerprint
              }
            })
          );
          log.info({ tagName: originalTag.name }, 'Paused original conversion tag');
        } catch (err: any) {
          log.warn({ tagName: originalTag.name, err: err.message }, 'Failed to pause original tag');
        }
      } catch (err: any) {
        log.error({ tagName: tag.name, err: err.message }, 'Failed to create GA4 Event tag');
      }
      continue;
    }

    // Update GA4 Config tags (googtag) and Conversion Linker (gclidw) in place
    if (tag.type !== 'googtag' && tag.type !== 'gclidw') {
      log.info({ tagName: tag.name, tagType: tag.type }, 'Skipping tag - not modified');
      continue;
    }

    try {
      await gtmCall(log, 'tags.update', () =>
        tm.accounts.containers.workspaces.tags.update({
          path: tag.path,
          requestBody: {
            name: tag.name,
            type: tag.type,
            parameter: tag.parameter,
            firingTriggerId: tag.firingTriggerId,
            blockingTriggerId: tag.blockingTriggerId,
            priority: tag.priority,
            tagFiringOption: tag.tagFiringOption,
            monitoringMetadata: tag.monitoringMetadata,
            consentSettings: tag.consentSettings,
            paused: tag.paused,  // Important: include paused status
            notes: tag.notes,
            fingerprint: tag.fingerprint  // Required for updates
          }
        })
      );
      updatedCount++;

      if (tag.type === 'googtag') {
        log.info({ tagName: tag.name, tagType: tag.type }, 'Updated GA4 Config tag with server routing');
      } else if (tag.type === 'gaawe') {
        log.info({ tagName: tag.name, tagType: tag.type }, 'Converted Google Ads tag to GA4 Event tag');
      } else if (tag.type === 'gclidw') {
        log.info({ tagName: tag.name, tagType: tag.type }, 'Paused Conversion Linker tag');
      }

      await delay(2500);
    } catch (err: any) {
      log.warn({ tagName: tag.name, err: err.message }, 'Failed to update tag, skipping');
    }
  }

  log.info({ updatedCount, createdCount }, 'Updated GA4 Config tags and created GA4 Event tags in original workspace');

  // ================================================================
  // STEP 4: Create consolidated server tags
  // ================================================================
  const SERVER_WORKSPACE_NAME = 'Ovalt Migration Workspace';
  log.info({ workspaceName: SERVER_WORKSPACE_NAME }, 'Creating server workspace');

  const serverWorkspaces = await gtmCall(log, 'workspaces.list', () =>
    tm.accounts.containers.workspaces.list({ parent: request.serverContainerPath })
  );

  const existingServerWorkspace = serverWorkspaces.data.workspace?.find(
    (w: any) => w.name === 'Ovalt Migration Workspace'
  );

  if (existingServerWorkspace?.path) {
    log.info({ path: existingServerWorkspace.path }, 'Deleting existing server migration workspace');
    await gtmCall(log, 'workspaces.delete', () =>
      tm.accounts.containers.workspaces.delete({ path: existingServerWorkspace.path! })
    );
    // Wait longer for GTM API to fully process deletion
    log.info('Waiting for workspace deletion to complete...');
    await delay(3000);

    // Verify deletion completed
    const verifyServerWorkspaces = await gtmCall(log, 'workspaces.list', () =>
      tm.accounts.containers.workspaces.list({ parent: request.serverContainerPath })
    );
    const stillExists = verifyServerWorkspaces.data.workspace?.find((w: any) => w.name === SERVER_WORKSPACE_NAME);
    if (stillExists) {
      log.warn('Server workspace still exists after deletion, waiting additional time...');
      await delay(2000);
    }
  }

  const serverWorkspace = await gtmCall(log, 'workspaces.create', () =>
    tm.accounts.containers.workspaces.create({
      parent: request.serverContainerPath,
      requestBody: {
        name: SERVER_WORKSPACE_NAME,
        description: 'Consolidated server-side tags receiving events from client container. Created by Ovalt.'
      }
    })
  );

  const serverWorkspacePath = serverWorkspace.data.path!;
  log.info({ workspacePath: serverWorkspacePath }, 'Created server workspace');

  // ================================================================
  // STEP 5: Copy required variables to server workspace
  // ================================================================
  // Extract all variable references from approved tags and copy them to server
  const variableReferences = new Set<string>();
  for (const [_, clientTags] of request.tagsByType.entries()) {
    for (const tag of clientTags) {
      const params = tag.parameter || [];
      for (const param of params) {
        // Check for variable references in format {{Variable Name}}
        const value = param.value || '';
        const matches = value.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
          for (const match of matches) {
            const varName = match.replace(/\{\{|\}\}/g, '').trim();
            variableReferences.add(varName);
          }
        }
        // Also check nested list/map parameters
        if (param.list) {
          for (const item of param.list) {
            if (item.map) {
              for (const mapEntry of item.map) {
                const val = mapEntry.value || '';
                const nestedMatches = val.match(/\{\{([^}]+)\}\}/g);
                if (nestedMatches) {
                  for (const match of nestedMatches) {
                    const varName = match.replace(/\{\{|\}\}/g, '').trim();
                    variableReferences.add(varName);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  log.info({
    variableReferencesCount: variableReferences.size,
    variables: Array.from(variableReferences)
  }, 'Found variable references in approved tags');

  // Copy referenced variables to server workspace
  const serverVariableIdMap = new Map<string, string>();
  for (const varRef of variableReferences) {
    // Find variable in original variables by name
    const variable = originalVariables.find(v => v.name === varRef);
    if (!variable) {
      log.warn({ variableName: varRef }, 'Variable reference not found in client workspace, skipping');
      continue;
    }

    try {
      const created = await gtmCall(log, 'variables.create', () =>
        tm.accounts.containers.workspaces.variables.create({
          parent: serverWorkspacePath,
          requestBody: {
            name: variable.name,
            type: variable.type,
            parameter: variable.parameter,
            notes: (variable.notes || '') + '\n\n[Copied by Tag Relay from client workspace]'
          }
        })
      );
      serverVariableIdMap.set(variable.name!, created.data.variableId!);
      log.info({ variableName: variable.name, variableType: variable.type }, 'Created variable in server workspace');
      await delay(2500);
    } catch (err: any) {
      log.warn({ variableName: variable.name, err: err.message }, 'Failed to create variable in server, will continue without it');
    }
  }

  log.info({ variablesCreated: serverVariableIdMap.size }, 'Copied variables to server workspace');

  // Note: Event Data variables (value, currency, transaction_id, event_id) are NOT created
  // because they're not currently used by the tags. If conversion value tracking is needed
  // in the future, these can be added to the Google Ads and Meta Pixel tags.

  // Create one "All Events" trigger that fires on all requests
  const allEventsTrigger = await gtmCall(log, 'triggers.create', () =>
    tm.accounts.containers.workspaces.triggers.create({
      parent: serverWorkspacePath,
      requestBody: {
        name: 'All Events',
        type: 'serverPageview', // Fires on all incoming server requests
        notes: 'Fires on all incoming requests to the server container'
      }
    })
  );

  const allEventsTriggerId = allEventsTrigger.data.triggerId!;
  log.info({ triggerId: allEventsTriggerId }, 'Created All Events trigger');

  // Note: Client Name blocking triggers are NOT needed because we convert
  // all Google Ads and Meta tags to GA4 Event tags on client-side.
  // All events now come through the GA4 client, so blocking is done by EVENT NAME instead.
  const blockingTriggersByCategory = new Map<string, string[]>();

  // ================================================================
  // Create blocking triggers for synthetic events (google_ads_*, meta_*)
  // ================================================================
  // These events should be blocked from GA4 to prevent pollution
  // But they should trigger Google Ads and Meta conversion tags
  log.info('Creating blocking triggers for synthetic conversion events');

  const syntheticEventBlockingTriggers: string[] = [];

  // Block google_ads_* events from GA4
  if (request.tagsByType.has('googads')) {
    try {
      const blockGoogleAdsEventsTrigger = await gtmCall(log, 'triggers.create', () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: serverWorkspacePath,
          requestBody: {
            name: 'Block google_ads_* events',
            type: 'customEvent',
            customEventFilter: [{
              type: 'matchRegex',
              parameter: [
                { type: 'template', key: 'arg0', value: '{{_event}}' },
                { type: 'template', key: 'arg1', value: '^google_ads_.*' }
              ]
            }],
            notes: 'Blocks google_ads_* events from being sent to GA4 (prevents pollution). These events are only for Google Ads conversion tracking.'
          }
        })
      );

      syntheticEventBlockingTriggers.push(blockGoogleAdsEventsTrigger.data.triggerId!);

      log.info({
        triggerId: blockGoogleAdsEventsTrigger.data.triggerId,
        eventPrefix: 'google_ads_'
      }, 'Created blocking trigger for google_ads_* events');

      await delay(2500);
    } catch (err: any) {
      log.warn({ err: err.message }, 'Failed to create google_ads_* blocking trigger');
    }
  }

  // Block meta_* events from GA4
  if (request.tagsByType.has('meta')) {
    try {
      const blockMetaEventsTrigger = await gtmCall(log, 'triggers.create', () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: serverWorkspacePath,
          requestBody: {
            name: 'Block meta_* events',
            type: 'customEvent',
            customEventFilter: [{
              type: 'matchRegex',
              parameter: [
                { type: 'template', key: 'arg0', value: '{{_event}}' },
                { type: 'template', key: 'arg1', value: '^meta_.*' }
              ]
            }],
            notes: 'Blocks meta_* events from being sent to GA4 (prevents pollution). These events are only for Meta Pixel conversion tracking.'
          }
        })
      );

      syntheticEventBlockingTriggers.push(blockMetaEventsTrigger.data.triggerId!);

      log.info({
        triggerId: blockMetaEventsTrigger.data.triggerId,
        eventPrefix: 'meta_'
      }, 'Created blocking trigger for meta_* events');

      await delay(2500);
    } catch (err: any) {
      log.warn({ err: err.message }, 'Failed to create meta_* blocking trigger');
    }
  }

  log.info({
    blockingTriggersCount: syntheticEventBlockingTriggers.length,
    blockedPrefixes: ['google_ads_*', 'meta_*'].filter((_, i) =>
      i === 0 ? request.tagsByType.has('googads') : request.tagsByType.has('meta')
    )
  }, 'Created synthetic event blocking triggers for GA4');

  // ================================================================
  // STEP 6: Create consolidated server tags
  // ================================================================
  // Create one server tag per category with blocking triggers
  // EXCEPTION: Google Ads and Meta require individual conversion tracking tags
  const serverTagsCreated: Array<{
    tagId: string;
    tagName: string;
    tagType: string;
    handlesClientTags: string[];
  }> = [];

  for (const [category, clientTags] of request.tagsByType.entries()) {
    if (clientTags.length === 0) continue;

    const serverType = mapClientTypeToServerType(clientTags[0].type, category);
    if (!serverType) {
      log.warn({ category }, 'No server type mapping for category');
      continue;
    }

    const blockingTriggers = blockingTriggersByCategory.get(category) || [];

    // ================================================================
    // SPECIAL HANDLING: Google Ads Server-Side Conversion Tracking
    // ================================================================
    // Per GA4 Transport Architecture:
    // 1. Create Custom Event triggers (one per google_ads_* event) using re2 filter
    // 2. Create awct tags with Event Data variables for dynamic value extraction
    // 3. These tags fire on google_ads_* events routed through GA4 client
    if (category === 'googads') {
      log.info({ clientTagCount: clientTags.length }, 'Creating Google Ads server-side conversion tracking tags');

      // Create individual Conversion Tracking tags with event-specific triggers
      for (const clientTag of clientTags) {
        const conversionParams = extractGoogleAdsConversionParams(clientTag);

        if (!conversionParams.conversionId || !conversionParams.conversionLabel) {
          log.warn({
            tagName: clientTag.name,
            conversionId: conversionParams.conversionId,
            conversionLabel: conversionParams.conversionLabel
          }, 'Missing conversion parameters, skipping tag');
          continue;
        }

        // Generate same event name as client-side conversion
        let eventName = clientTag.name
          .toLowerCase()
          .replace(/google\s*ads\s*[-–—]?\s*/gi, '')
          .replace(/conversion\s*tracking/gi, 'conversion')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        eventName = `google_ads_${eventName || 'conversion'}`;

        // Create Custom Event trigger using matchRegex filter type
        let conversionTriggerId: string;
        try {
          const conversionTrigger = await gtmCall(log, 'triggers.create', () =>
            tm.accounts.containers.workspaces.triggers.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: `Trigger - ${eventName}`,
                type: 'customEvent',
                customEventFilter: [{
                  type: 'matchRegex',
                  parameter: [
                    { type: 'template', key: 'arg0', value: '{{_event}}' },
                    { type: 'template', key: 'arg1', value: `^${eventName}$` }
                  ]
                }],
                notes: `Fires when ${eventName} event is received from GA4 client. Created by Ovalt.`
              }
            })
          );

          conversionTriggerId = conversionTrigger.data.triggerId!;

          log.info({
            triggerId: conversionTriggerId,
            eventName
          }, 'Created Google Ads conversion event trigger');

          await delay(2500);
        } catch (err: any) {
          log.error({ eventName, err: err.message }, 'Failed to create conversion trigger, skipping this conversion');
          continue;
        }

        try {
          // Create server-side Google Ads Conversion Tracking tag
          // Type: sgtmadsct (Server GTM Ads Conversion Tracking)
          // Discovered via API inspection of manually created tag
          const conversionTrackingTag = await gtmCall(log, 'tags.create', () =>
            tm.accounts.containers.workspaces.tags.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: `Server - ${conversionParams.tagName}`,
                type: 'sgtmadsct',
                parameter: [
                  {
                    type: 'boolean',
                    key: 'enableNewCustomerReporting',
                    value: 'false'
                  },
                  {
                    type: 'boolean',
                    key: 'enableConversionLinker',
                    value: 'true'
                  },
                  {
                    type: 'boolean',
                    key: 'enableProductReporting',
                    value: 'false'
                  },
                  {
                    type: 'template',
                    key: 'conversionId',
                    value: conversionParams.conversionId
                  },
                  {
                    type: 'template',
                    key: 'conversionLabel',
                    value: conversionParams.conversionLabel
                  },
                  {
                    type: 'boolean',
                    key: 'rdp',
                    value: 'false'
                  }
                ],
                firingTriggerId: [conversionTriggerId],
                notes: `Server-side Google Ads conversion tracking for ${conversionParams.tagName}. Fires on ${eventName} event from GA4 client. Created by Ovalt using type sgtmadsct.`
              }
            })
          );

          serverTagsCreated.push({
            tagId: conversionTrackingTag.data.tagId!,
            tagName: `Server - ${conversionParams.tagName}`,
            tagType: 'sgtmadsct',
            handlesClientTags: [clientTag.name]
          });

          log.info({
            tagId: conversionTrackingTag.data.tagId,
            tagName: conversionParams.tagName,
            conversionId: conversionParams.conversionId,
            conversionLabel: conversionParams.conversionLabel,
            eventName
          }, 'Created Google Ads Conversion Tracking tag');

          await delay(2500);
        } catch (err: any) {
          log.error({
            tagName: clientTag.name,
            conversionId: conversionParams.conversionId,
            conversionLabel: conversionParams.conversionLabel,
            err: err.message
          }, 'Failed to create Google Ads Conversion Tracking tag');
        }
      }

      continue; // Skip standard consolidation for Google Ads
    }

    // ================================================================
    // SPECIAL HANDLING: Conversion Linker Server-Side Tag
    // ================================================================
    // Create server-side Conversion Linker tag (sgtmadscl) to handle click IDs
    if (category === 'conversionlinker') {
      log.info({ clientTagCount: clientTags.length }, 'Creating server-side Conversion Linker tag');

      try {
        // Create server-side Conversion Linker tag
        const conversionLinkerTag = await gtmCall(log, 'tags.create', () =>
          tm.accounts.containers.workspaces.tags.create({
            parent: serverWorkspacePath,
            requestBody: {
              name: 'Conversion Linker',
              type: 'sgtmadscl',
              parameter: [
                {
                  type: 'boolean',
                  key: 'enableLinkerParams',
                  value: 'true'
                },
                {
                  type: 'boolean',
                  key: 'enableCookieOverrides',
                  value: 'false'
                }
              ],
              firingTriggerId: [allEventsTrigger.data.triggerId!],
              notes: 'Server-side Conversion Linker handles click ID reading and first-party cookie setting. Created by Ovalt.'
            }
          })
        );

        serverTagsCreated.push({
          tagId: conversionLinkerTag.data.tagId!,
          tagName: 'Conversion Linker',
          tagType: 'sgtmadscl',
          handlesClientTags: clientTags.map(t => t.name)
        });

        log.info({
          tagId: conversionLinkerTag.data.tagId,
          tagName: 'Conversion Linker'
        }, 'Created server-side Conversion Linker tag');

        await delay(2500);
      } catch (err: any) {
        log.error({
          err: err.message
        }, 'Failed to create server-side Conversion Linker tag');
      }

      continue; // Skip standard consolidation for Conversion Linker
    }

    // ================================================================
    // SPECIAL HANDLING: Meta Pixel Server-Side Conversion Tracking
    // ================================================================
    // Per GA4 Transport Architecture:
    // 1. Fetch Meta CAPI template ID from installed templates
    // 2. Create Custom Event triggers (one per meta_* event) using re2 filter
    // 3. Create Meta tags using the template with Event Data variables
    if (category === 'meta') {
      log.info({ clientTagCount: clientTags.length }, 'Creating Meta Pixel server-side conversion tracking tags');

      // Try to find Meta CAPI template in workspace, or add it from container
      let metaTemplateType: string | null = null;
      try {
        // First, check workspace templates
        const workspaceTemplates = await gtmCall(log, 'templates.list', () =>
          tm.accounts.containers.workspaces.templates.list({
            parent: serverWorkspacePath
          })
        );

        let metaTemplate = workspaceTemplates.data.template?.find((t: any) =>
          t.name?.toLowerCase().includes('meta') ||
          t.name?.toLowerCase().includes('facebook') ||
          t.name?.toLowerCase().includes('capi') ||
          t.galleryReference?.repository?.toLowerCase().includes('meta') ||
          t.galleryReference?.repository?.toLowerCase().includes('facebook')
        );

        if (!metaTemplate) {
          // Template not in workspace - check all workspaces in container
          log.info('Meta template not in migration workspace, checking all workspaces...');

          try {
            // List all workspaces in server container
            const workspacesList = await gtmCall(log, 'workspaces.list', () =>
              tm.accounts.containers.workspaces.list({
                parent: request.serverContainerPath
              })
            );

            const allWorkspaces = workspacesList.data.workspace || [];
            log.info({ workspacesCount: allWorkspaces.length }, 'Found workspaces in server container');

            // Check each workspace for the Meta template
            for (const workspace of allWorkspaces) {
              // Skip the migration workspace we just created (already checked)
              if (workspace.path === serverWorkspacePath) {
                log.info({
                  workspaceName: workspace.name,
                  workspaceId: workspace.workspaceId
                }, 'Skipping migration workspace (already checked)');
                continue;
              }

              log.info({
                workspaceName: workspace.name,
                workspaceId: workspace.workspaceId,
                workspacePath: workspace.path
              }, 'Checking workspace for Meta template');

              try {
                const workspaceTemplates = await gtmCall(log, 'templates.list', () =>
                  tm.accounts.containers.workspaces.templates.list({
                    parent: workspace.path
                  })
                );

                const templatesCount = workspaceTemplates.data.template?.length || 0;
                log.info({
                  workspaceName: workspace.name,
                  workspaceId: workspace.workspaceId,
                  templatesCount,
                  templateNames: workspaceTemplates.data.template?.map((t: any) => t.name) || []
                }, 'Found templates in workspace');

                const foundMetaTemplate = workspaceTemplates.data.template?.find((t: any) =>
                  t.name?.toLowerCase().includes('meta') ||
                  t.name?.toLowerCase().includes('facebook') ||
                  t.name?.toLowerCase().includes('capi') ||
                  t.galleryReference?.repository?.toLowerCase().includes('meta') ||
                  t.galleryReference?.repository?.toLowerCase().includes('facebook')
                );

                if (foundMetaTemplate) {
                  log.info({
                    workspaceName: workspace.name,
                    templateName: foundMetaTemplate.name,
                    templateId: foundMetaTemplate.templateId,
                    galleryReference: foundMetaTemplate.galleryReference?.repository
                  }, 'Found Meta template in workspace, copying to migration workspace');

                  // Fetch the full template details
                  const fullTemplate = await gtmCall(log, 'templates.get', () =>
                    tm.accounts.containers.workspaces.templates.get({
                      path: foundMetaTemplate.path
                    })
                  );

                  // Create template in migration workspace
                  const workspaceTemplate = await gtmCall(log, 'templates.create', () =>
                    tm.accounts.containers.workspaces.templates.create({
                      parent: serverWorkspacePath,
                      requestBody: {
                        name: fullTemplate.data.name,
                        templateData: fullTemplate.data.templateData,
                        galleryReference: fullTemplate.data.galleryReference
                      }
                    })
                  );

                  metaTemplate = workspaceTemplate.data;
                  log.info({
                    templateId: metaTemplate.templateId,
                    templateName: metaTemplate.name
                  }, 'Created Meta template in migration workspace');

                  await delay(2500);
                  break; // Found and copied, stop searching
                }

                await delay(500); // Small delay between workspace checks
              } catch (err: any) {
                log.warn({
                  workspaceName: workspace.name,
                  err: err.message
                }, 'Failed to check workspace for templates');
              }
            }
          } catch (err: any) {
            log.warn({ err: err.message }, 'Failed to check workspaces for Meta template');
          }
        }

        if (metaTemplate) {
          // Use the workspace template ID for creating tags
          metaTemplateType = metaTemplate.templateId;
          log.info({
            templateId: metaTemplate.templateId,
            templateName: metaTemplate.name,
            galleryReference: metaTemplate.galleryReference?.repository,
            templateType: metaTemplateType
          }, 'Using Meta CAPI template');
        } else {
          // Template not found anywhere - install from Community Gallery
          log.info('Meta template not found, installing from Community Gallery...');

          try {
            // Try multiple known Meta Conversions API templates from Gallery
            const knownMetaTemplates = [
              { owner: 'stape-io', repo: 'facebook-tag', name: 'Stape.io Facebook Conversion API' },
              { owner: 'datomni', repo: 'facebook-conversions-api-gtm-server-side', name: 'Datomni Meta Conversion API' },
              { owner: 'gtm-templates-simo-ahava', repo: 'meta-conversions-api', name: 'Simo Ahava Meta Conversions API' }
            ];

            let importSuccess = false;

            for (const template of knownMetaTemplates) {
              try {
                log.info({
                  galleryOwner: template.owner,
                  galleryRepository: template.repo
                }, `Attempting to import ${template.name} Meta template from Gallery...`);

                // Make direct HTTP request since the method might not be in googleapis yet
                const importedTemplate = await gtmCall(log, 'templates.import_from_gallery', async () => {
                  const url = `https://tagmanager.googleapis.com/tagmanager/v2/${serverWorkspacePath}/templates:import_from_gallery`;
                  const response = await auth.request({
                    url,
                    method: 'POST',
                    data: {
                      galleryOwner: template.owner,
                      galleryRepository: template.repo,
                      acknowledgePermissions: true
                    }
                  });
                  return response;
                });

                metaTemplate = importedTemplate.data;

                log.info({
                  templateId: metaTemplate.templateId,
                  templateName: metaTemplate.name,
                  templatePath: metaTemplate.path,
                  fingerprint: metaTemplate.fingerprint,
                  galleryOwner: template.owner,
                  galleryRepository: template.repo
                }, 'Successfully imported Meta template from Community Gallery');

                // Wait longer for template to propagate
                log.info('Waiting for template to become usable...');
                await delay(5000);

                // Re-fetch the template from workspace to get the correct type reference
                // Re-fetch templates to see what format GTM expects
                log.info('Re-fetching templates to determine correct type format...');
                const relistTemplates = await gtmCall(log, 'templates.list', () =>
                  tm.accounts.containers.workspaces.templates.list({
                    parent: serverWorkspacePath
                  })
                );

                log.info({
                  templatesFound: relistTemplates.data.template?.length || 0,
                  templates: relistTemplates.data.template?.map((t: any) => ({
                    name: t.name,
                    templateId: t.templateId,
                    fingerprint: t.fingerprint,
                    accountId: t.accountId
                  }))
                }, 'Templates in workspace after import');

                const importedTemplateInList = relistTemplates.data.template?.find((t: any) =>
                  t.fingerprint === metaTemplate.fingerprint ||
                  t.templateId === metaTemplate.templateId ||
                  t.name === metaTemplate.name
                );

                if (importedTemplateInList) {
                  // GROUND TRUTH: Get the CVT ID from templateData
                  // The tag's `type` field must be the `id` from the template's templateData JSON
                  // (e.g., "cvt_5TP8W"), NOT the raw templateId
                  try {
                    const fullTemplate = await gtmCall(log, 'templates.get', () =>
                      tm.accounts.containers.workspaces.templates.get({
                        path: importedTemplateInList.path
                      })
                    );

                    if (fullTemplate.data.templateData) {
                      // Parse the templateData to extract the CVT ID
                      const templateDataMatch = fullTemplate.data.templateData.match(/"id":\s*"(cvt_[^"]+)"/);
                      if (templateDataMatch) {
                        metaTemplateType = templateDataMatch[1];
                        log.info({
                          cvtId: metaTemplateType,
                          templateId: importedTemplateInList.templateId,
                          fingerprint: importedTemplateInList.fingerprint
                        }, 'Extracted CVT ID from templateData for tag creation');
                      } else {
                        log.warn('Could not extract CVT ID from templateData, falling back to templateId');
                        metaTemplateType = importedTemplateInList.templateId;
                      }
                    } else {
                      metaTemplateType = importedTemplateInList.templateId;
                    }
                  } catch (err: any) {
                    log.warn({ err: err.message }, 'Failed to fetch full template, using templateId');
                    metaTemplateType = importedTemplateInList.templateId;
                  }
                } else {
                  // Fallback: use import response
                  metaTemplateType = metaTemplate.templateId;
                  log.warn({ metaTemplateType }, 'Template not found in list, using import response templateId');
                }

                importSuccess = true;
                break;
              } catch (templateErr: any) {
                log.warn({
                  galleryOwner: template.owner,
                  err: templateErr.message
                }, `Failed to import ${template.name} template, trying next...`);
              }
            }

            if (!importSuccess) {
              throw new Error('All Meta template import attempts failed');
            }
          } catch (err: any) {
            log.error({
              err: err.message,
              response: err.response?.data
            }, 'Failed to import Meta template from Gallery - all attempts exhausted');
          }
        }

        if (!metaTemplateType) {
          log.warn({ templatesCount: workspaceTemplates.data.template?.length || 0 }, 'Meta Conversions API template not found and could not be imported');
        }
      } catch (err: any) {
        log.warn({ err: err.message }, 'Failed to fetch/create Meta template');
      }

      if (!metaTemplateType) {
        // Template not found AND could not be imported - provide full manual setup instructions
        const metaEvents = clientTags.map(tag => {
          let eventName = tag.name
            .toLowerCase()
            .replace(/facebook\s*[-–—]?\s*/gi, '')
            .replace(/meta\s*[-–—]?\s*/gi, '')
            .replace(/pixel\s*/gi, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
          return {
            tagName: tag.name,
            eventName: `meta_${eventName || 'event'}`
          };
        });

        serverTagsCreated.push({
          tagId: 'manual_setup_required',
          tagName: 'Meta Pixel Conversions (Manual Setup Required)',
          tagType: 'meta_manual',
          handlesClientTags: clientTags.map(t => t.name),
          manualSetup: {
            instructions: [
              '1. In server container, go to Templates → Search Gallery',
              '2. Install "Facebook Conversion API" by Stape.io',
              '3. Configure Pixel ID and Access Token in template settings',
              '4. Create tags using the template with these triggers:'
            ].concat(
              metaEvents.map(e =>
                `   • Trigger: Custom Event "${e.eventName}"`
              )
            )
          }
        } as any);

        continue; // Skip tag creation
      }

      // Template was imported successfully
      // Extract Pixel ID from client-side Meta Pixel tags
      log.info({
        templateType: metaTemplateType,
        clientTagCount: clientTags.length
      }, 'Meta template imported successfully, extracting Pixel IDs from client tags');

      // Helper function to extract Facebook Pixel ID from client tag parameters
      const extractPixelId = (tag: any): string | null => {
        if (!tag.parameter) return null;

        // Look for common parameter keys that contain Pixel ID
        const pixelIdKeys = ['pixelId', 'pixel_id', 'facebookPixelId', 'fbPixelId', 'id'];

        for (const key of pixelIdKeys) {
          const param = tag.parameter.find((p: any) =>
            p.key?.toLowerCase() === key.toLowerCase() && p.value
          );
          if (param?.value) {
            return param.value;
          }
        }

        // Also check in list-type parameters (some templates use nested structures)
        for (const param of tag.parameter) {
          if (param.type === 'list' && param.list) {
            for (const item of param.list) {
              if (item.map) {
                const pixelIdEntry = item.map.find((m: any) =>
                  pixelIdKeys.includes(m.key?.toLowerCase()) && m.value
                );
                if (pixelIdEntry?.value) {
                  return pixelIdEntry.value;
                }
              }
            }
          }
        }

        return null;
      };

      // Extract Pixel IDs from all client Meta tags
      const pixelIds = new Set<string>();
      for (const clientTag of clientTags) {
        const pixelId = extractPixelId(clientTag);
        if (pixelId) {
          pixelIds.add(pixelId);
          log.info({
            tagName: clientTag.name,
            pixelId
          }, 'Extracted Pixel ID from client tag');
        } else {
          log.warn({
            tagName: clientTag.name,
            parameters: clientTag.parameter?.map((p: any) => p.key)
          }, 'Could not extract Pixel ID from client tag');
        }
      }

      // Create individual Meta Pixel tags with event-specific triggers
      for (const clientTag of clientTags) {
        // Extract event name from tag parameters (same as client-side conversion)
        let eventName: string | null = null;
        const customEventNameParam = clientTag.parameter?.find((p: any) => p.key === 'customEventName');
        const standardEventNameParam = clientTag.parameter?.find((p: any) => p.key === 'standardEventName');

        if (customEventNameParam?.value) {
          // Use custom event name, PRESERVE GTM variables
          // e.g., "clicks_{{DLV - gtm.elementText}}" → "meta_clicks_{{DLV - gtm.elementText}}"
          eventName = customEventNameParam.value;
        } else if (standardEventNameParam?.value) {
          // Use standard event name (lowercase and clean)
          eventName = standardEventNameParam.value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        } else {
          // Fallback: derive from tag name
          eventName = clientTag.name
            .toLowerCase()
            .replace(/facebook\s*[-–—]?\s*/gi, '')
            .replace(/meta\s*[-–—]?\s*/gi, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        }

        // Prepend meta_ if not already present
        if (!eventName.startsWith('meta_')) {
          eventName = `meta_${eventName || 'event'}`;
        }

        const pixelId = extractPixelId(clientTag);

        // Create Custom Event trigger with regex pattern
        // If event name contains GTM variables, convert to regex for server-side matching
        let triggerPattern: string;
        let triggerName: string;

        if (eventName.includes('{{')) {
          // Replace GTM variables with regex wildcards for the pattern
          // e.g., "meta_clicks_{{DLV - gtm.elementText}}" → "^meta_clicks_.*$"
          triggerPattern = eventName.replace(/\{\{[^}]+\}\}/g, '.*');
          triggerPattern = `^${triggerPattern}$`;

          // Create safe trigger name (strip variables for the name)
          // e.g., "meta_clicks_{{DLV - gtm.elementText}}" → "Trigger - meta_clicks"
          triggerName = `Trigger - ${eventName.replace(/\{\{[^}]+\}\}/g, '').replace(/_+$/, '')}`;
        } else {
          // Exact match for static event names
          triggerPattern = `^${eventName}$`;
          triggerName = `Trigger - ${eventName}`;
        }

        let metaTriggerId: string;
        try {
          const metaTrigger = await gtmCall(log, 'triggers.create', () =>
            tm.accounts.containers.workspaces.triggers.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: triggerName,
                type: 'customEvent',
                customEventFilter: [{
                  type: 'matchRegex',
                  parameter: [
                    { type: 'template', key: 'arg0', value: '{{_event}}' },
                    { type: 'template', key: 'arg1', value: triggerPattern }
                  ]
                }],
                notes: `Fires when ${eventName} event is received from GA4 client. Created by Ovalt.`
              }
            })
          );

          metaTriggerId = metaTrigger.data.triggerId!;

          log.info({
            triggerId: metaTriggerId,
            eventName
          }, 'Created Meta Pixel event trigger');

          await delay(2500);
        } catch (err: any) {
          log.error({ eventName, err: err.message }, 'Failed to create Meta trigger, skipping this event');
          continue;
        }

        try {
          // Create server-side Meta Pixel tag using the template
          // GROUND TRUTH structure from manually created tag:
          // - type: CVT ID (e.g., "cvt_5TP8W") extracted from templateData
          // - parameter: Template-specific keys (NO templateId parameter)

          const accessToken = request.metaAccessToken || 'YOUR_META_ACCESS_TOKEN_HERE';
          const isPlaceholder = !request.metaAccessToken;

          if (isPlaceholder) {
            log.warn('Meta Access Token not provided, using placeholder. User must update in GTM.');
          }

          // Using parameter keys from the Stape.io Facebook Conversion API template
          const tagParameters: any[] = [
            { type: 'template', key: 'inheritEventName', value: 'inherit' },
            { type: 'template', key: 'actionSource', value: 'website' },
            { type: 'template', key: 'accessToken', value: accessToken }
          ];

          // Add Pixel ID if we extracted it
          if (pixelId) {
            tagParameters.push({
              type: 'template',
              key: 'pixelId',
              value: pixelId
            });
          }

          // Build notes based on what's configured
          let notes = `Server-side Meta Pixel tracking for ${clientTag.name}. Fires on ${eventName} event from GA4 client.`;
          if (pixelId) {
            notes += ` Pixel ID: ${pixelId}.`;
          } else {
            notes += ` ⚠️ MISSING: Pixel ID (could not extract from client tag).`;
          }
          if (isPlaceholder) {
            notes += ` ⚠️ IMPORTANT: Update Access Token in tag settings - currently using placeholder.`;
          } else {
            notes += ` Access Token configured.`;
          }
          notes += ` Created by Ovalt.`;

          log.info({
            tagName: clientTag.name,
            cvtType: metaTemplateType,
            parametersCount: tagParameters.length,
            parameters: tagParameters.map(p => ({ key: p.key, type: p.type, hasValue: !!p.value })),
            triggerId: metaTriggerId
          }, 'Attempting to create Meta Pixel tag with ground truth CVT structure');

          const metaPixelTag = await gtmCall(log, 'tags.create', () =>
            tm.accounts.containers.workspaces.tags.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: `Server - ${clientTag.name}`,
                type: metaTemplateType!,
                parameter: tagParameters,
                firingTriggerId: [metaTriggerId],
                notes
              }
            })
          );

          serverTagsCreated.push({
            tagId: metaPixelTag.data.tagId!,
            tagName: `Server - ${clientTag.name}`,
            tagType: metaTemplateType!,
            handlesClientTags: [clientTag.name],
            pixelIdConfigured: !!pixelId,
            accessTokenConfigured: !isPlaceholder
          });

          log.info({
            tagId: metaPixelTag.data.tagId,
            tagName: clientTag.name,
            eventName,
            templateType: metaTemplateType,
            pixelId: pixelId || 'NOT_FOUND',
            accessToken: isPlaceholder ? 'PLACEHOLDER' : 'PROVIDED'
          }, 'Created Meta Pixel tag');

          await delay(2500);
        } catch (err: any) {
          log.error({
            tagName: clientTag.name,
            err: err.message,
            response: err.response?.data
          }, 'Failed to create Meta Pixel tag');

          // Add manual setup instruction for this tag
          serverTagsCreated.push({
            tagId: 'manual_config_required',
            tagName: `${clientTag.name} (Manual Configuration Required)`,
            tagType: metaTemplateType!,
            handlesClientTags: [clientTag.name],
            manualSetup: {
              instructions: [
                `Failed to create tag automatically. Please create manually:`,
                `1. Use template: ${metaTemplateType}`,
                `2. Event name: ${eventName}`,
                pixelId ? `3. Pixel ID: ${pixelId}` : '3. Pixel ID: Extract from original tag',
                '4. Access Token: Generate from Meta Events Manager',
                `5. Trigger: Custom Event "${eventName}"`
              ],
              error: err.message
            }
          } as any);
        }
      }

      continue; // Skip standard consolidation for Meta

      // Create individual Meta Pixel tags with event-specific triggers
      for (const clientTag of clientTags) {
        // Extract event name from tag parameters (same as client-side conversion)
        let eventName: string | null = null;
        const eventNameParam = clientTag.parameter?.find((p: any) =>
          ['eventName', 'event', 'standardEventName'].includes(p.key)
        );

        if (eventNameParam?.value) {
          // Use the configured event name (preserves variables like {{DLV - gtm.elementText}})
          eventName = eventNameParam.value;
        } else {
          // Fallback: derive from tag name
          eventName = clientTag.name
            .toLowerCase()
            .replace(/facebook\s*[-–—]?\s*/gi, '')
            .replace(/meta\s*[-–—]?\s*/gi, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        }

        // Prepend meta_ if not already present
        if (!eventName.startsWith('meta_')) {
          eventName = `meta_${eventName || 'event'}`;
        }

        // Create Custom Event trigger using matchRegex filter type
        let metaTriggerId: string;
        try {
          const metaTrigger = await gtmCall(log, 'triggers.create', () =>
            tm.accounts.containers.workspaces.triggers.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: `Trigger - ${eventName}`,
                type: 'customEvent',
                customEventFilter: [{
                  type: 'matchRegex',
                  parameter: [
                    { type: 'template', key: 'arg0', value: '{{_event}}' },
                    { type: 'template', key: 'arg1', value: `^${eventName}$` }
                  ]
                }],
                notes: `Fires when ${eventName} event is received from GA4 client. Created by Ovalt.`
              }
            })
          );

          metaTriggerId = metaTrigger.data.triggerId!;

          log.info({
            triggerId: metaTriggerId,
            eventName
          }, 'Created Meta Pixel event trigger');

          await delay(2500);
        } catch (err: any) {
          log.error({ eventName, err: err.message }, 'Failed to create Meta trigger, skipping this event');
          continue;
        }

        try {
          // Create server-side Meta Pixel tag using the template
          const metaPixelTag = await gtmCall(log, 'tags.create', () =>
            tm.accounts.containers.workspaces.tags.create({
              parent: serverWorkspacePath,
              requestBody: {
                name: `Server - ${clientTag.name}`,
                type: metaTemplateType!,
                parameter: [
                  {
                    type: 'template',
                    key: 'eventMatchingMethod',
                    value: 'inherit'
                  }
                ],
                firingTriggerId: [metaTriggerId],
                notes: `Server-side Meta Pixel tracking for ${clientTag.name}. Fires on ${eventName} event from GA4 client. Uses Event Data for matching. Created by Ovalt.`
              }
            })
          );

          serverTagsCreated.push({
            tagId: metaPixelTag.data.tagId!,
            tagName: `Server - ${clientTag.name}`,
            tagType: metaTemplateType!,
            handlesClientTags: [clientTag.name]
          });

          log.info({
            tagId: metaPixelTag.data.tagId,
            tagName: clientTag.name,
            eventName,
            templateType: metaTemplateType
          }, 'Created Meta Pixel tag');

          await delay(2500);
        } catch (err: any) {
          log.warn({
            tagName: clientTag.name,
            err: err.message
          }, 'Failed to create Meta Pixel tag - template may need additional configuration');
        }
      }

      continue; // Skip standard consolidation for Meta
    }

    // ================================================================
    // STANDARD HANDLING: Other tag types (GA4, etc.)
    // ================================================================
    const tagName = category === 'ga4' ? 'GA4 - All Events (Server)' :
                    category === 'meta' ? 'Meta Pixel - All Events (Server)' :
                    `${category} - All Events (Server)`;

    const templateTag = clientTags[0];

    // Server-side tags don't need client-side parameters
    // They only create clients and route events from incoming requests
    let parameters: any[] = [];

    if (category === 'ga4' && serverType === 'sgtmgaaw') {
      // GA4 server tags only need eventName
      parameters = [
        {
          type: 'template',
          key: 'eventName',
          value: '{{Event Name}}'
        }
      ];
    }
    // Other server tags (Meta) work with empty parameters

    // Combine blocking triggers
    // For GA4: Block vendor-specific Client Names + synthetic events (google_ads_*, meta_*)
    // For Meta: Block vendor-specific Client Names only
    let allBlockingTriggers = [...blockingTriggers];
    if (category === 'ga4' && syntheticEventBlockingTriggers.length > 0) {
      allBlockingTriggers = [...blockingTriggers, ...syntheticEventBlockingTriggers];
      log.info({
        category,
        vendorBlockingCount: blockingTriggers.length,
        syntheticBlockingCount: syntheticEventBlockingTriggers.length,
        totalBlockingCount: allBlockingTriggers.length
      }, 'Applying synthetic event blocking triggers to GA4 tag');
    }

    const serverTag = await gtmCall(log, 'tags.create', () =>
      tm.accounts.containers.workspaces.tags.create({
        parent: serverWorkspacePath,
        requestBody: {
          name: tagName,
          type: serverType,
          parameter: parameters,
          firingTriggerId: [allEventsTriggerId],
          blockingTriggerId: allBlockingTriggers.length > 0 ? allBlockingTriggers : undefined,
          notes: category === 'ga4'
            ? `GA4 server tag. Fires on all events EXCEPT: google_ads_* and meta_* (synthetic conversion events - filtered to prevent GA4 pollution).`
            : `Consolidated server tag handling all ${category} events from client container. Fires on all events, but blocked when Client Name belongs to other vendors.`
        }
      })
    );

    serverTagsCreated.push({
      tagId: serverTag.data.tagId!,
      tagName,
      tagType: serverType,
      handlesClientTags: clientTags.map(t => t.name)
    });

    log.info({
      tagId: serverTag.data.tagId,
      tagName,
      firingTriggerId: allEventsTriggerId,
      blockingTriggerCount: blockingTriggers.length,
      clientTagCount: clientTags.length
    }, 'Created consolidated server tag with category-specific blocking triggers');
  }

  return {
    clientWorkspacePath: request.clientWorkspacePath,
    clientWorkspaceName: request.clientWorkspacePath.split('/').pop() || 'workspace',
    tagsModified: updatedCount + createdCount,
    tagsUpdated: updatedCount,
    tagsCreated: createdCount,
    serverWorkspacePath,
    serverWorkspaceName: SERVER_WORKSPACE_NAME,
    serverTagsCreated
  };
}
