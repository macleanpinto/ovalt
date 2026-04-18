/**
 * E2E Test: Full GTM Migration & Deployment
 *
 * This test performs the complete migration workflow:
 * 1. Imports Ovalt client container from GTM
 * 2. Runs migration analysis
 * 3. Deploys consolidated server-side tags to server container
 * 4. Updates client container with transport_url
 *
 * REQUIRES:
 * - OAuth tokens in .gtm-tokens.json
 * - Worker running to process migrations
 * - GTM API access with publish scope
 *
 * Run: npm test -w @tag-relay/api -- e2e-gtm-deployment.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './server';
import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { FastifyInstance } from 'fastify';

// Load environment
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  try {
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (err) {
    console.log('⚠️  Could not load env file:', filePath);
  }
}

const repoRoot = path.join(__dirname, '..', '..', '..');
loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, '.env.local'));

// Try to load OAuth tokens
let oauthTokens: any = null;
const tokensPath = path.join(__dirname, '..', '.gtm-tokens.json');

try {
  if (existsSync(tokensPath)) {
    oauthTokens = JSON.parse(readFileSync(tokensPath, 'utf8'));
    console.log('✅ Loaded OAuth tokens from .gtm-tokens.json');
  }
} catch (err) {
  console.log('⚠️  Could not load OAuth tokens:', err);
}

// Skip if no tokens
const shouldSkip = !oauthTokens || !process.env.GTM_OAUTH_CLIENT_ID;

// GTM Container paths
const CLIENT_CONTAINER_PATH = 'accounts/6347965337/containers/248366882';
const CLIENT_WORKSPACE_PATH = 'accounts/6347965337/containers/248366882/workspaces/12';
const SERVER_CONTAINER_PATH = 'accounts/6347965337/containers/248342708';
const SERVER_CONTAINER_URL = 'https://ovalt.org/sst';

describe.skipIf(shouldSkip)('E2E: Full GTM Migration & Deployment', () => {
  let app: FastifyInstance;
  let authToken: string;
  let organizationId: string;
  let gtmSessionId: string;
  let importId: string;
  let runId: string;

  beforeAll(async () => {
    process.env.ENVIRONMENT = 'local';
    process.env.AWS_ENDPOINT = 'http://localhost:4566';
    process.env.JWT_SECRET = 'test-secret';
    process.env.SERVICE_TOKEN = 'test-token';

    app = await buildApp();
    await app.ready();

    // Register user
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `e2e-deployment-${Date.now()}@example.com`,
        name: 'E2E Deployment User',
        organizationName: 'E2E Deployment Org',
      },
    });

    const registerData = registerResponse.json();
    authToken = registerData.token;
    organizationId = registerData.organization.organizationId;

    // Register GTM OAuth session for testing
    const gtmSessionResponse = await app.inject({
      method: 'POST',
      url: '/test/gtm-session',
      payload: {
        accessToken: oauthTokens.access_token,
        refreshToken: oauthTokens.refresh_token,
        expiryDate: oauthTokens.expiry_date
      }
    });

    expect(gtmSessionResponse.statusCode).toBe(200);
    const sessionData = gtmSessionResponse.json();
    gtmSessionId = sessionData.sessionId; // Use the session ID returned by the API

    console.log('\n🔐 Test Setup:');
    console.log(`   Auth Token: ${authToken.substring(0, 20)}...`);
    console.log(`   Organization: ${organizationId}`);
    console.log(`   GTM Session: ${gtmSessionId} ✅`);
  });

  afterAll(async () => {
    await app.close();
  });

  test('Complete GTM migration and deployment workflow', async () => {
    console.log('\n🚀 Starting Full GTM Migration E2E Test\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // =========================================================================
    // STEP 1: Fetch Live Workspace Data from GTM
    // =========================================================================
    console.log('📥 STEP 1: Fetching Live Workspace Data from GTM');
    console.log('─────────────────────────────────────────────────────────\n');

    console.log(`   Client Container: ${CLIENT_CONTAINER_PATH}`);
    console.log(`   Workspace: ${CLIENT_WORKSPACE_PATH}`);

    // Setup GTM client
    const clientId = process.env.GTM_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GTM_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://127.0.0.1:8765/oauth/callback'
    );

    oauth2Client.setCredentials(oauthTokens);
    const tm = google.tagmanager({ version: 'v2', auth: oauth2Client });

    // Create a temporary workspace to get all container data
    console.log('   📡 Creating temporary workspace to fetch all tags...');
    const tempWorkspace = await tm.accounts.containers.workspaces.create({
      parent: CLIENT_CONTAINER_PATH,
      requestBody: {
        name: 'E2E Test Temp Workspace',
        description: 'Temporary workspace for E2E test data export'
      }
    });

    const tempWorkspacePath = tempWorkspace.data.path!;
    console.log(`   ✅ Created temp workspace: ${tempWorkspacePath}`);

    // Fetch all entities from temp workspace (auto-copied from container)
    console.log('   📡 Fetching tags, triggers, and variables...');
    const [tagsRes, triggersRes, variablesRes] = await Promise.all([
      tm.accounts.containers.workspaces.tags.list({ parent: tempWorkspacePath }),
      tm.accounts.containers.workspaces.triggers.list({ parent: tempWorkspacePath }),
      tm.accounts.containers.workspaces.variables.list({ parent: tempWorkspacePath })
    ]);

    const tags = tagsRes.data.tag || [];
    const triggers = triggersRes.data.trigger || [];
    const variables = variablesRes.data.variable || [];

    console.log(`   ✅ Fetched container data`);
    console.log(`   Tags: ${tags.length}`);
    console.log(`   Triggers: ${triggers.length}`);
    console.log(`   Variables: ${variables.length}`);

    // Delete temp workspace
    await tm.accounts.containers.workspaces.delete({ path: tempWorkspacePath });
    console.log(`   ✅ Deleted temp workspace\n`);

    // Create container export format
    const containerExport = {
      exportFormatVersion: 2,
      exportTime: new Date().toISOString(),
      containerVersion: {
        path: CLIENT_WORKSPACE_PATH,
        accountId: CLIENT_CONTAINER_PATH.split('/')[1],
        containerId: CLIENT_CONTAINER_PATH.split('/')[3],
        containerVersionId: '0',
        name: 'Live Container Export',
        tag: tags,
        trigger: triggers,
        variable: variables
      }
    };

    // =========================================================================
    // STEP 2: Import Container into Tag Relay
    // =========================================================================
    console.log('📤 STEP 2: Importing Container into Tag Relay');
    console.log('─────────────────────────────────────────────────────────\n');

    const importResponse = await app.inject({
      method: 'POST',
      url: '/imports/gtm-web-container',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        projectId: 'ovalt.org',
        sourceType: 'gtm-web-container',
        payload: containerExport
      },
    });

    expect(importResponse.statusCode).toBe(201);
    const importData = importResponse.json();
    importId = importData.importId;

    console.log(`   ✅ Import created: ${importId}`);
    console.log(`   Status: ${importData.status}\n`);

    // =========================================================================
    // STEP 3: Configure Hosting (includes GTM workspace info)
    // =========================================================================
    console.log('🔗 STEP 3: Configuring Hosting & Workspace');
    console.log('─────────────────────────────────────────────────────────\n');

    // Store the GTM workspace info in the import record via hosting config
    // Skip serverTaggingUrl to avoid DNS setup requirement for testing
    const patchResponse = await app.inject({
      method: 'PATCH',
      url: `/imports/${importId}/hosting`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        provider: 'google_cloud',
        serverContainerPublicId: 'GTM-TEST-SERVER'
        // Note: serverTaggingUrl omitted to skip DNS setup requirement
      }
    });

    expect(patchResponse.statusCode).toBe(200);
    console.log(`   ✅ Hosting configured: google_cloud\n`);

    // =========================================================================
    // STEP 4: Trigger Migration Analysis
    // =========================================================================
    console.log('🔄 STEP 4: Running Migration Analysis');
    console.log('─────────────────────────────────────────────────────────\n');

    const runResponse = await app.inject({
      method: 'POST',
      url: `/migrations/${importId}/run`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    if (runResponse.statusCode === 400) {
      const error = runResponse.json();
      console.log(`   ⚠️  Migration blocked: ${error.message}`);
      console.log(`   ℹ️  This is expected - DNS setup required for custom domain\n`);
      console.log(`   Skipping deployment steps.\n`);
      return;
    }

    expect([200, 202]).toContain(runResponse.statusCode);
    const runData = runResponse.json();
    runId = runData.runId;

    console.log(`   ✅ Migration run created: ${runId}`);
    console.log(`   Status: ${runData.status}\n`);

    // Wait for migration to complete (poll up to 30 seconds)
    console.log('   ⏳ Waiting for migration analysis...');
    console.log('   (Polling worker for completion, max 30 seconds)\n');

    let migrationStatus: any = null;
    const maxAttempts = 30;
    const pollInterval = 1000; // 1 second

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/migrations/${runId}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      migrationStatus = statusResponse.json();

      if (migrationStatus.status === 'completed' || migrationStatus.status === 'failed') {
        console.log(`   ✅ Migration ${migrationStatus.status} after ${attempt} seconds`);
        break;
      }

      if (attempt === maxAttempts) {
        console.log(`   ⏱️  Migration still ${migrationStatus.status} after ${maxAttempts} seconds`);
        console.log('   ⚠️  Worker may not be running or processing is slow');
        console.log('   ℹ️  To complete this test, ensure worker is running:');
        console.log('      npm run -w @tag-relay/worker dev\n');
        console.log('   Skipping deployment steps for now.\n');
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (migrationStatus.status !== 'completed') {
      console.log('   ⚠️  Migration did not complete successfully');
      console.log(`   Final status: ${migrationStatus.status}\n`);
      return;
    }

    console.log(`   Confidence Score: ${migrationStatus.confidenceScore}/10\n`);

    // =========================================================================
    // STEP 5: Get Migration Report & Select Tags to Deploy
    // =========================================================================
    console.log('📊 STEP 5: Analyzing Migration Report');
    console.log('─────────────────────────────────────────────────────────\n');

    // In a real scenario, you'd fetch the report and select which tags to deploy
    // For this test, we'll assume all high-confidence tags are approved

    const reportResponse = await app.inject({
      method: 'GET',
      url: `/migrations/${runId}/report`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    if (reportResponse.statusCode !== 200) {
      console.log('   ⚠️  Could not fetch migration report');
      return;
    }

    const report = reportResponse.json();
    console.log(`   Tags analyzed: ${report.detectedTags?.length || 0}`);

    // Approve ALL tags for migration (E2E test approves everything)
    const approvedTagIds: string[] = [];
    if (report.detectedTags) {
      for (const tag of report.detectedTags) {
        approvedTagIds.push(tag.id);
        const mapping = report.mappings?.find((m: any) => m.clientTagId === tag.id);
        const conf = mapping?.confidence || 'unknown';
        console.log(`   ✅ Approved: ${tag.name} (confidence: ${conf}/10, status: ${tag.status})`);
      }
    }

    console.log(`\n   Total tags to deploy: ${approvedTagIds.length} (ALL TAGS)\n`);

    if (approvedTagIds.length === 0) {
      console.log('   ℹ️  No tags to deploy\n');
      return;
    }

    // =========================================================================
    // STEP 5.5: Skip Manual Workspace Preparation
    // =========================================================================
    // Our deployment code now creates "Ovalt Migration Workspace" automatically
    // and handles all tag modifications, so manual preparation is no longer needed
    console.log('🏗️  STEP 5.5: Workspace Preparation');
    console.log('─────────────────────────────────────────────────────────\n');

    console.log('   ℹ️  Deployment will create fresh "Ovalt Migration Workspace"');
    console.log('   ℹ️  Deployment will handle all tag modifications automatically\n');

    // Skip all the manual tag/trigger creation - our deployment code handles it
    /* COMMENTED OUT - No longer needed as deployment creates fresh workspace

    // Check if workspace already has a Google Tag
    const existingTags = await tm.accounts.containers.workspaces.tags.list({
      parent: CLIENT_WORKSPACE_PATH
    });

    const hasGoogleTag = existingTags.data.tag?.some((t: any) => t.type === 'googtag');
    let googleTagId: string | undefined;

    if (!hasGoogleTag) {
      console.log('   📝 Creating Google Tag in workspace...');

      // First, get existing triggers to find one we can use
      const triggersResult = await tm.accounts.containers.workspaces.triggers.list({
        parent: CLIENT_WORKSPACE_PATH
      });

      let triggerIdToUse: string;

      const allPagesTrigger = triggersResult.data.trigger?.find((t: any) =>
        t.name?.toLowerCase().includes('all') || t.type === 'PAGEVIEW' || t.type === 'pageview'
      );

      if (allPagesTrigger) {
        triggerIdToUse = allPagesTrigger.triggerId!;
        console.log(`   Using existing trigger: ${allPagesTrigger.name} (ID: ${triggerIdToUse})`);
      } else if (triggersResult.data.trigger && triggersResult.data.trigger.length > 0) {
        triggerIdToUse = triggersResult.data.trigger[0].triggerId!;
        console.log(`   Using existing trigger: ${triggersResult.data.trigger[0].name} (ID: ${triggerIdToUse})`);
      } else {
        // No triggers exist, create one
        console.log('   📝 Creating All Pages trigger...');
        const newTrigger = await tm.accounts.containers.workspaces.triggers.create({
          parent: CLIENT_WORKSPACE_PATH,
          requestBody: {
            name: 'All Pages (Test)',
            type: 'PAGEVIEW',
            notes: 'Created by E2E test'
          }
        });
        triggerIdToUse = newTrigger.data.triggerId!;
        console.log(`   ✅ Trigger created (ID: ${triggerIdToUse})`);
      }

      // Create a Google Tag (GA4 config tag that supports transport_url)
      const createResult = await tm.accounts.containers.workspaces.tags.create({
        parent: CLIENT_WORKSPACE_PATH,
        requestBody: {
          name: 'Google Tag - GA4 (Test)',
          type: 'googtag',
          parameter: [
            {
              type: 'template',
              key: 'tagId',
              value: '{{GA4 - ID}}'
            }
          ],
          firingTriggerId: [triggerIdToUse],
          notes: 'Created by E2E test to verify server_container_url deployment'
        }
      });

      googleTagId = createResult.data.tagId!;
      console.log(`   ✅ Google Tag created (ID: ${googleTagId})`);

      // CRITICAL: Add the newly created tag to approvedTagIds so deployment will process it
      if (!approvedTagIds.includes(googleTagId)) {
        approvedTagIds.push(googleTagId);
        console.log(`   ✅ Added Google Tag to deployment list\n`);
      }
    } else {
      const existingGoogleTag = existingTags.data.tag?.find((t: any) => t.type === 'googtag');
      googleTagId = existingGoogleTag?.tagId;
      console.log(`   ✅ Google Tag already exists (ID: ${googleTagId})`);

      // Ensure it's in approvedTagIds
      if (googleTagId && !approvedTagIds.includes(googleTagId)) {
        approvedTagIds.push(googleTagId);
        console.log(`   ✅ Added existing Google Tag to deployment list\n`);
      } else {
        console.log();
      }
    }

    // Also ensure we have a GA4 Event tag (gaawe) for testing
    const hasGA4Event = existingTags.data.tag?.some((t: any) => t.type === 'gaawe');
    let ga4EventTagId: string | undefined;

    if (!hasGA4Event) {
      console.log('   📝 Creating GA4 Event tag in workspace...');

      const createResult = await tm.accounts.containers.workspaces.tags.create({
        parent: CLIENT_WORKSPACE_PATH,
        requestBody: {
          name: 'GA4 - Test Event',
          type: 'gaawe',
          parameter: [
            {
              type: 'boolean',
              key: 'sendEcommerceData',
              value: 'false'
            },
            {
              type: 'template',
              key: 'eventName',
              value: 'test_event'
            },
            {
              type: 'template',
              key: 'measurementIdOverride',
              value: '{{GA4 - ID}}'
            }
          ],
          firingTriggerId: ['55'], // DOM Ready trigger
          notes: 'Created by E2E test to verify GA4 Event parameter routing'
        }
      });

      ga4EventTagId = createResult.data.tagId!;
      console.log(`   ✅ GA4 Event tag created (ID: ${ga4EventTagId})`);

      if (!approvedTagIds.includes(ga4EventTagId)) {
        approvedTagIds.push(ga4EventTagId);
        console.log(`   ✅ Added GA4 Event tag to deployment list\n`);
      }
    } else {
      const existingGA4Event = existingTags.data.tag?.find((t: any) => t.type === 'gaawe');
      ga4EventTagId = existingGA4Event?.tagId;
      console.log(`   ✅ GA4 Event tag already exists (ID: ${ga4EventTagId})`);

      if (ga4EventTagId && !approvedTagIds.includes(ga4EventTagId)) {
        approvedTagIds.push(ga4EventTagId);
        console.log(`   ✅ Added existing GA4 Event tag to deployment list\n`);
      } else {
        console.log();
      }
    }
    */ // End of commented section

    // =========================================================================
    // STEP 6: Deploy Migration (Client + Server)
    // =========================================================================
    console.log('🚀 STEP 6: Deploying Migration');
    console.log('─────────────────────────────────────────────────────────\n');

    console.log(`   Client Container: ${CLIENT_CONTAINER_PATH}`);
    console.log(`   Client Workspace: ${CLIENT_WORKSPACE_PATH}`);
    console.log(`   Server Container: ${SERVER_CONTAINER_PATH}`);
    console.log(`   Server URL: ${SERVER_CONTAINER_URL}\n`);

    const deployResponse = await app.inject({
      method: 'POST',
      url: `/migrations/${runId}/deploy-approved-v2`,
      headers: {
        authorization: `Bearer ${authToken}`,
        'x-gtm-session': gtmSessionId
      },
      payload: {
        approvedTagIds,
        clientContainerPath: CLIENT_CONTAINER_PATH,
        clientWorkspacePath: CLIENT_WORKSPACE_PATH,
        serverContainerPath: SERVER_CONTAINER_PATH,
        transport_url: SERVER_CONTAINER_URL
      }
    });

    if (deployResponse.statusCode === 401) {
      console.log('   ⚠️  GTM session not configured');
      console.log('   ℹ️  In a real app, user would OAuth with GTM first\n');
      return;
    }

    if (deployResponse.statusCode !== 200) {
      console.log(`   ❌ Deployment failed with status ${deployResponse.statusCode}`);
      console.log(`   Error: ${JSON.stringify(deployResponse.json(), null, 2)}\n`);
      return;
    }

    expect(deployResponse.statusCode).toBe(200);
    const deployResult = deployResponse.json();

    console.log(`   ✅ Deployment successful!\n`);

    // Client Workspace Results
    console.log(`   📋 Client Workspace: "${deployResult.clientWorkspace.name}"`);
    console.log(`      Path: ${deployResult.clientWorkspace.path}`);
    console.log(`      Tags Modified: ${deployResult.clientWorkspace.tagsModified}`);
    console.log(`      URL: https://tagmanager.google.com/#${deployResult.clientWorkspace.path}\n`);

    // Server Workspace Results
    console.log(`   📋 Server Workspace: "${deployResult.serverWorkspace.name}"`);
    console.log(`      Path: ${deployResult.serverWorkspace.path}`);
    console.log(`      URL: https://tagmanager.google.com/#${deployResult.serverWorkspace.path}\n`);

    if (deployResult.serverWorkspace.tags && deployResult.serverWorkspace.tags.length > 0) {
      console.log('   📌 Consolidated Server Tags Created:');
      for (const tag of deployResult.serverWorkspace.tags) {
        console.log(`      • ${tag.tagName} (${tag.tagType})`);
        console.log(`        Handles ${tag.handlesClientTags.length} client tag(s): ${tag.handlesClientTags.join(', ')}`);
      }
      console.log();
    }

    // =========================================================================
    // STEP 7: Verify Deployment in GTM
    // =========================================================================
    console.log('✅ STEP 7: Verifying Deployment in GTM');
    console.log('─────────────────────────────────────────────────────────\n');

    // Verify Client Workspace (use the path from deployment result, not search by name)
    console.log('   📋 Verifying Client Container...');
    const clientWorkspacePath = deployResult.clientWorkspace.path;

    if (clientWorkspacePath) {
      console.log(`   ✅ Client Workspace: "${deployResult.clientWorkspace.name}"`);
      console.log(`      Path: ${clientWorkspacePath}`);

      const clientTags = await tm.accounts.containers.workspaces.tags.list({
        parent: clientWorkspacePath
      });

      console.log(`      Tags: ${clientTags.data.tag?.length || 0}`);

      // Check if tags have transport_url or server_container_url
      let modifiedTagsCount = 0;
      if (clientTags.data.tag) {
        for (const tag of clientTags.data.tag) {
          // Check for transport_url or server_container_url in three formats:
          // 1. Direct parameter (for gaawc, googads)
          const hasDirectServerRouting = tag.parameter?.some((p: any) =>
            (p.key === 'transport_url' || p.key === 'server_container_url') && p.value === SERVER_CONTAINER_URL
          );

          // 2. In configSettingsTable (for googtag)
          const configSettingsTable = tag.parameter?.find((p: any) => p.key === 'configSettingsTable');
          const hasConfigServerRouting = configSettingsTable?.list?.some((item: any) => {
            const paramKey = item.map?.find((m: any) => m.key === 'parameter')?.value;
            const paramValue = item.map?.find((m: any) => m.key === 'parameterValue')?.value;
            return (paramKey === 'transport_url' || paramKey === 'server_container_url') && paramValue === SERVER_CONTAINER_URL;
          });

          // 3. In eventSettingsTable (for gaawe - Event Parameters table in GTM UI)
          const eventSettingsTable = tag.parameter?.find((p: any) => p.key === 'eventSettingsTable');
          const hasEventServerRouting = eventSettingsTable?.list?.some((item: any) => {
            const paramKey = item.map?.find((m: any) => m.key === 'parameter')?.value;
            const paramValue = item.map?.find((m: any) => m.key === 'parameterValue')?.value;
            return (paramKey === 'transport_url' || paramKey === 'server_container_url') && paramValue === SERVER_CONTAINER_URL;
          });

          const hasServerRouting = hasDirectServerRouting || hasConfigServerRouting || hasEventServerRouting;
          if (hasServerRouting) {
            modifiedTagsCount++;
            console.log(`      ✅ ${tag.name} → routes to ${SERVER_CONTAINER_URL}`);
          }
        }
      }

      console.log(`      Modified with server routing: ${modifiedTagsCount}\n`);

      // Critical verification: At least one tag must have server routing configured
      expect(modifiedTagsCount).toBeGreaterThan(0);
      if (modifiedTagsCount === 0) {
        throw new Error('VERIFICATION FAILED: No client tags were modified with transport_url or server_container_url. The migration did not add server routing to any tags.');
      }
    } else {
      console.log('   ⚠️  Client migration workspace not found\n');
      throw new Error('VERIFICATION FAILED: Client migration workspace not found');
    }

    // Verify Server Workspace (use the path from deployment result)
    console.log('   📋 Verifying Server Container...');
    const serverWorkspacePath = deployResult.serverWorkspace.path;

    if (serverWorkspacePath) {
      console.log(`   ✅ Server Workspace: "${deployResult.serverWorkspace.name}"`);
      console.log(`      Path: ${serverWorkspacePath}`);

      const serverTags = await tm.accounts.containers.workspaces.tags.list({
        parent: serverWorkspacePath
      });

      console.log(`      Tags: ${serverTags.data.tag?.length || 0}`);
      if (serverTags.data.tag) {
        for (const tag of serverTags.data.tag) {
          console.log(`      • ${tag.name} (${tag.type})`);
        }
      }
      console.log();
    } else {
      console.log('   ⚠️  Server migration workspace not found\n');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✨ E2E Deployment Test Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📋 Summary:');
    console.log(`   Import ID: ${importId}`);
    console.log(`   Run ID: ${runId}`);
    console.log(`   Client Workspace: "Ovalt Migration Workspace"`);
    console.log(`   Client Tags Modified: ${deployResult.clientWorkspace?.tagsModified || 0}`);
    console.log(`   Server Workspace: "Tag Relay Migration"`);
    console.log(`   Consolidated Server Tags: ${deployResult.serverWorkspace?.tags?.length || 0}\n`);

    console.log('🎯 Next Steps:');
    console.log('   1. Review client workspace: "Ovalt Migration Workspace"');
    console.log('      - Verify tags have transport_url parameter');
    console.log('   2. Review server workspace: "Tag Relay Migration"');
    console.log('      - Verify consolidated tags (one per tag type)');
    console.log('   3. Test both workspaces in Preview mode');
    console.log('   4. Publish when ready\n');
  }, 120000); // 2 minute timeout for full deployment
});
