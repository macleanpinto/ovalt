/**
 * GTM Migration Deployment using Fetch-Modify-Create Pattern
 *
 * This module handles the deployment of migrated tags:
 * 1. Fetch all tags/triggers/variables from client workspace
 * 2. Modify tags to add transport_url parameters
 * 3. Create new "Ovalt Migration Workspace" in client container
 * 4. Copy ALL triggers, variables, and modified tags to new client workspace
 * 5. Create new "Ovalt Migration Workspace" in server container
 * 6. Copy required variables to server workspace
 * 7. Create consolidated server tags (one per tag type)
 *
 * WORKSPACE NAMING:
 * - Both client and server use the same workspace name: "Ovalt Migration Workspace"
 * - This makes it easy to identify migration workspaces in both containers
 * - Original workspaces remain untouched
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
function mapClientTypeToServerType(clientType: string): string | null {
  const mapping: Record<string, string> = {
    'gaawe': 'sgtmgaaw',      // GA4 Event → Server GA4
    'googtag': 'sgtmgaaw',    // Google Tag → Server GA4
    'gaawc': 'sgtmgaaw',      // GA4 Config → Server GA4
    // Note: Google Ads (awct, sp) don't have built-in server-side templates
    // Google Ads conversions are typically tracked through GA4 events on server-side
    // Add more mappings as needed
  };

  return mapping[clientType] || null;
}

/**
 * Determine tag category for consolidation
 */
function getTagCategory(clientType: string): string | null {
  if (['gaawe', 'googtag', 'gaawc'].includes(clientType)) return 'ga4';
  if (['awct', 'sp'].includes(clientType)) return 'googads';
  // Add meta pixel, linkedin, etc.
  return null;
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
  // STEP 2: Modify ALL approved tags to add server_container_url
  // ================================================================
  log.info({ serverUrl: request.serverContainerUrl }, 'Modifying tags to add server routing');

  let modifiedCount = 0;
  const modifiedTags = originalTags.map((tag: any) => {
    // Only modify approved tags
    if (!request.approvedTagIds.includes(tag.tagId)) {
      return tag;
    }

    const parameters = [...(tag.parameter || [])];

    // For ALL tags: Add server_container_url to event settings/parameters
    // Find or create the eventSettingsTable list
    let eventSettingsTable = parameters.find((p: any) => p.key === 'eventSettingsTable');

    if (!eventSettingsTable) {
      eventSettingsTable = {
        type: 'list',
        key: 'eventSettingsTable',
        list: []
      };
      parameters.push(eventSettingsTable);
    }

    // Remove existing server_container_url if present
    if (eventSettingsTable.list) {
      eventSettingsTable.list = eventSettingsTable.list.filter((item: any) => {
        const paramKey = item.map?.find((m: any) => m.key === 'parameter')?.value;
        return paramKey !== 'server_container_url';
      });

      // Add server_container_url as event parameter
      eventSettingsTable.list.push({
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

  log.info({ modifiedCount }, 'Modified tags with server routing');

  // ================================================================
  // STEP 3: Create new "Ovalt Migration Workspace" in client container
  // ================================================================
  const CLIENT_WORKSPACE_NAME = 'Ovalt Migration Workspace';
  log.info({ workspaceName: CLIENT_WORKSPACE_NAME }, 'Creating new client workspace');

  // Delete existing migration workspace if it exists
  const existingWorkspaces = await gtmCall(log, 'workspaces.list', () =>
    tm.accounts.containers.workspaces.list({ parent: request.clientContainerPath })
  );

  const migrationWorkspace = existingWorkspaces.data.workspace?.find(
    (w: any) => w.name === CLIENT_WORKSPACE_NAME
  );

  if (migrationWorkspace?.path) {
    log.info({ path: migrationWorkspace.path }, 'Deleting existing client migration workspace');
    await gtmCall(log, 'workspaces.delete', () =>
      tm.accounts.containers.workspaces.delete({ path: migrationWorkspace.path! })
    );
    // Wait for GTM API to fully process deletion
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

  // Create new workspace
  const newClientWorkspace = await gtmCall(log, 'workspaces.create', () =>
    tm.accounts.containers.workspaces.create({
      parent: request.clientContainerPath,
      requestBody: {
        name: CLIENT_WORKSPACE_NAME,
        description: 'Client-side tags modified to route to server-side GTM. Created by Ovalt.'
      }
    })
  );

  const newClientWorkspacePath = newClientWorkspace.data.path!;
  log.info({ workspacePath: newClientWorkspacePath }, 'Created new client workspace');

  // Copy triggers first (tags may depend on them)
  const triggerIdMap = new Map<string, string>();

  for (const trigger of originalTriggers) {
    try {
      const created = await gtmCall(log, 'triggers.create', () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: newClientWorkspacePath,
          requestBody: {
            name: trigger.name,
            type: trigger.type,
            customEventFilter: trigger.customEventFilter,
            filter: trigger.filter,
            autoEventFilter: trigger.autoEventFilter,
            notes: trigger.notes
          }
        })
      );
      triggerIdMap.set(trigger.triggerId!, created.data.triggerId!);
      await delay(1000);
    } catch (err: any) {
      log.warn({ triggerName: trigger.name, err: err.message }, 'Failed to create trigger, skipping');
    }
  }

  // Copy variables
  const variableIdMap = new Map<string, string>();

  for (const variable of originalVariables) {
    try {
      const created = await gtmCall(log, 'variables.create', () =>
        tm.accounts.containers.workspaces.variables.create({
          parent: newClientWorkspacePath,
          requestBody: {
            name: variable.name,
            type: variable.type,
            parameter: variable.parameter,
            notes: variable.notes
          }
        })
      );
      variableIdMap.set(variable.variableId!, created.data.variableId!);
      await delay(1000);
    } catch (err: any) {
      log.warn({ variableName: variable.name, err: err.message }, 'Failed to create variable, skipping');
    }
  }

  // Copy modified tags with remapped trigger IDs
  let tagsCreated = 0;
  for (const tag of modifiedTags) {
    try {
      // Remap trigger IDs to new workspace
      const firingTriggerIds = tag.firingTriggerId?.map((id: string) =>
        triggerIdMap.get(id) || id
      ).filter(Boolean);

      const blockingTriggerIds = tag.blockingTriggerId?.map((id: string) =>
        triggerIdMap.get(id) || id
      ).filter(Boolean);

      await gtmCall(log, 'tags.create', () =>
        tm.accounts.containers.workspaces.tags.create({
          parent: newClientWorkspacePath,
          requestBody: {
            name: tag.name,
            type: tag.type,
            parameter: tag.parameter,
            firingTriggerId: firingTriggerIds?.length ? firingTriggerIds : undefined,
            blockingTriggerId: blockingTriggerIds?.length ? blockingTriggerIds : undefined,
            priority: tag.priority,
            tagFiringOption: tag.tagFiringOption,
            monitoringMetadata: tag.monitoringMetadata,
            consentSettings: tag.consentSettings,
            notes: tag.notes
          }
        })
      );
      tagsCreated++;
      await delay(1000);
    } catch (err: any) {
      log.warn({ tagName: tag.name, err: err.message }, 'Failed to create tag, skipping');
    }
  }

  log.info({
    modifiedCount,
    triggersCreated: triggerIdMap.size,
    variablesCreated: variableIdMap.size,
    tagsCreated
  }, 'Copied and modified all entities to new workspace');

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
      await delay(1000);
    } catch (err: any) {
      log.warn({ variableName: variable.name, err: err.message }, 'Failed to create variable in server, will continue without it');
    }
  }

  log.info({ variablesCreated: serverVariableIdMap.size }, 'Copied variables to server workspace');

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

  // Create blocking triggers per category (fires when Client Name does NOT match)
  // Note: Only needed when multiple vendor types exist (e.g., GA4 + Google Ads)
  // Single vendor deployments won't have any blocking triggers (correct behavior)
  const blockingTriggersByCategory = new Map<string, string[]>();

  log.info({
    categoriesCount: request.tagsByType.size,
    categories: Array.from(request.tagsByType.keys())
  }, 'Creating blocking triggers for multi-vendor filtering');

  for (const [category] of request.tagsByType.entries()) {
    const blockingTriggers: string[] = [];

    // Create blocking triggers for OTHER categories
    for (const [otherCategory] of request.tagsByType.entries()) {
      if (otherCategory === category) continue; // Don't block self

      let clientNamePattern: string;
      if (otherCategory === 'ga4') {
        clientNamePattern = 'GA4';
      } else if (otherCategory === 'googads') {
        clientNamePattern = 'Google Ads';
      } else if (otherCategory === 'meta') {
        clientNamePattern = 'Facebook';
      } else {
        clientNamePattern = otherCategory;
      }

      // Create a trigger that fires when Client Name CONTAINS this pattern
      // (We'll use this as a blocking trigger)
      const blockingTrigger = await gtmCall(log, 'triggers.create', () =>
        tm.accounts.containers.workspaces.triggers.create({
          parent: serverWorkspacePath,
          requestBody: {
            name: `Client Name Contains ${clientNamePattern}`,
            type: 'serverPageview',
            filter: [{
              type: 'contains',
              parameter: [
                { type: 'template', key: 'arg0', value: '{{Client Name}}' },
                { type: 'template', key: 'arg1', value: clientNamePattern }
              ]
            }]
          }
        })
      );

      blockingTriggers.push(blockingTrigger.data.triggerId!);
      await delay(1000);
    }

    blockingTriggersByCategory.set(category, blockingTriggers);

    if (blockingTriggers.length === 0) {
      log.info({
        category,
        reason: 'Single vendor deployment - no blocking needed'
      }, 'No blocking triggers created for category');
    } else {
      log.info({
        category,
        blockingTriggersCount: blockingTriggers.length,
        blocksVendors: Array.from(request.tagsByType.keys()).filter(c => c !== category)
      }, 'Created blocking triggers for category');
    }
  }

  // ================================================================
  // STEP 6: Create consolidated server tags
  // ================================================================
  // Create one server tag per category with blocking triggers
  const serverTagsCreated: Array<{
    tagId: string;
    tagName: string;
    tagType: string;
    handlesClientTags: string[];
  }> = [];

  for (const [category, clientTags] of request.tagsByType.entries()) {
    if (clientTags.length === 0) continue;

    const serverType = mapClientTypeToServerType(clientTags[0].type);
    if (!serverType) {
      log.warn({ category }, 'No server type mapping for category');
      continue;
    }

    const blockingTriggers = blockingTriggersByCategory.get(category) || [];

    const tagName = category === 'ga4' ? 'GA4 - All Events (Server)' :
                    category === 'googads' ? 'Google Ads - All Events (Server)' :
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
    // Other server tags (Meta, Google Ads) work with empty parameters

    const serverTag = await gtmCall(log, 'tags.create', () =>
      tm.accounts.containers.workspaces.tags.create({
        parent: serverWorkspacePath,
        requestBody: {
          name: tagName,
          type: serverType,
          parameter: parameters,
          firingTriggerId: [allEventsTriggerId],
          blockingTriggerId: blockingTriggers.length > 0 ? blockingTriggers : undefined,
          notes: `Consolidated server tag handling all ${category} events from client container. Fires on all events, but blocked when Client Name belongs to other vendors.`
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
    clientWorkspacePath: newClientWorkspacePath,
    clientWorkspaceName: CLIENT_WORKSPACE_NAME,
    tagsModified: tagsCreated,
    serverWorkspacePath,
    serverWorkspaceName: SERVER_WORKSPACE_NAME,
    serverTagsCreated
  };
}
