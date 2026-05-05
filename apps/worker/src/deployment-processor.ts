import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { DeploymentMessage } from './migration/types.js';
import { z } from 'zod';
import { google } from 'googleapis';
import type { FastifyBaseLogger } from 'fastify';

// Import deployment logic from API (esbuild bundles it for Lambda).
import { deployMigrationWithExportImport } from '../../api/src/gtm-migration-deploy.js';

const env = z
  .object({
    AWS_REGION: z.string().default('us-east-1'),
    AWS_ENDPOINT: z.string().optional(),
    DDB_TABLE_RUNS: z.string(),
    DDB_TABLE_SESSIONS: z.string(),
    ENVIRONMENT: z.string().default('local'),
    GTM_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GTM_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GTM_OAUTH_REDIRECT_URI: z.string().optional(),
  })
  .parse(process.env);

const ddb = new DynamoDBClient({ region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT });
const ddbDoc = DynamoDBDocumentClient.from(ddb);
const secretsClient = new SecretsManagerClient({ region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT });

// Cache for secrets loaded from Secrets Manager
let secretsCache: Record<string, string> | null = null;

async function loadSecretsIfNeeded() {
  if (secretsCache) return secretsCache;

  // Try to load from Secrets Manager if not in env
  if (!env.GTM_OAUTH_CLIENT_ID && !env.GOOGLE_OAUTH_CLIENT_ID) {
    try {
      const secretName = `tag-relay/${env.ENVIRONMENT}/app-secrets`;
      const response = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretName })
      );
      const secrets = JSON.parse(response.SecretString || '{}');
      secretsCache = secrets;
      return secrets;
    } catch (err) {
      console.warn('Failed to load secrets from Secrets Manager:', err);
      secretsCache = {};
      return {};
    }
  }

  // Secrets already in environment
  secretsCache = {};
  return secretsCache;
}

// Simple logger for worker
const logger = {
  info: (obj: any, msg?: string) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  error: (obj: any, msg?: string) => console.error(JSON.stringify({ level: 'error', ...obj, msg })),
  warn: (obj: any, msg?: string) => console.warn(JSON.stringify({ level: 'warn', ...obj, msg })),
};

export async function processDeployment(message: DeploymentMessage): Promise<void> {
  const { runId, gtmSessionId, deploymentConfig } = message;

  logger.info(
    { runId, tagCount: deploymentConfig.approvedTagIds.length },
    'Processing deployment from SQS'
  );

  try {
    // Get GTM OAuth session from DynamoDB
    const sessionResult = await ddbDoc.send(
      new GetCommand({
        TableName: env.DDB_TABLE_SESSIONS,
        Key: { sessionId: gtmSessionId }
      })
    );

    if (!sessionResult.Item || sessionResult.Item.type !== 'gtm') {
      throw new Error('GTM session not found or expired');
    }

    // Load secrets from Secrets Manager if needed
    const secrets = await loadSecretsIfNeeded();

    // Create OAuth2Client with credentials for token refresh
    const clientId = env.GTM_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID || secrets.GTM_OAUTH_CLIENT_ID || secrets.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = env.GTM_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET || secrets.GTM_OAUTH_CLIENT_SECRET || secrets.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = env.GTM_OAUTH_REDIRECT_URI || secrets.GTM_OAUTH_REDIRECT_URI;

    logger.info({
      runId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      clientIdPrefix: clientId ? clientId.substring(0, 20) + '...' : 'missing',
      redirectUri: redirectUri || 'missing'
    }, 'OAuth client credentials check');

    if (!clientId || !clientSecret) {
      throw new Error('GTM OAuth credentials not configured. Set GTM_OAUTH_CLIENT_ID/SECRET in Secrets Manager or environment');
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const tokens = sessionResult.Item.tokens;
    auth.setCredentials({
      access_token: tokens.access_token ?? undefined,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type ?? undefined,
      id_token: tokens.id_token ?? undefined,
    });

    // Check token validity and credentials
    logger.info({
      runId,
      tokenExpiry: tokens.expiry_date,
      expiresIn: tokens.expiry_date ? Math.round((tokens.expiry_date - Date.now()) / 1000 / 60) + ' minutes' : 'unknown',
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      hasClientCredentials: !!(clientId && clientSecret)
    }, 'Using GTM OAuth tokens');

    // Trigger refresh if tokens are expired or about to expire (within 5 minutes)
    const now = Date.now();
    if (tokens.expiry_date && tokens.expiry_date < now + 300000) {
      logger.info({ runId }, 'Tokens expired or expiring soon, refreshing...');
      try {
        const refreshedTokens = await auth.refreshAccessToken();

        logger.info({
          runId,
          refreshedHasAccessToken: !!refreshedTokens.credentials.access_token,
          refreshedHasRefreshToken: !!refreshedTokens.credentials.refresh_token,
          refreshedExpiry: refreshedTokens.credentials.expiry_date
        }, 'Token refresh response');

        auth.setCredentials(refreshedTokens.credentials);

        // Update session with refreshed tokens
        await ddbDoc.send(
          new UpdateCommand({
            TableName: env.DDB_TABLE_SESSIONS,
            Key: { sessionId: gtmSessionId },
            UpdateExpression: 'SET tokens = :tokens, updatedAt = :updated',
            ExpressionAttributeValues: {
              ':tokens': refreshedTokens.credentials,
              ':updated': new Date().toISOString()
            }
          })
        );
        logger.info({ runId }, 'Tokens refreshed and saved successfully');
      } catch (refreshErr) {
        logger.error({
          err: refreshErr,
          runId,
          errorDetails: refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
        }, 'Failed to refresh tokens');
        throw new Error('GTM OAuth session expired. Please re-authenticate via /gtm/oauth');
      }
    }

    // Convert tagsByCategory back to Map
    const tagsByCategory = new Map(Object.entries(deploymentConfig.tagsByCategory));

    // Execute deployment
    const result = await deployMigrationWithExportImport(
      auth,
      {
        clientContainerPath: deploymentConfig.clientContainerPath,
        clientWorkspacePath: deploymentConfig.clientWorkspacePath,
        serverContainerPath: deploymentConfig.serverContainerPath,
        serverContainerUrl: deploymentConfig.serverContainerUrl,
        approvedTagIds: deploymentConfig.approvedTagIds,
        tagsByType: tagsByCategory,
        metaAccessToken: deploymentConfig.metaAccessToken,
        parameterOverrides: deploymentConfig.parameterOverrides
      },
      logger as FastifyBaseLogger
    );

    // Save successful deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression:
          'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), ' +
          'lastDeployedAt = :timestamp, deploymentStatus = :status, deploymentCompletedAt = :completed, ' +
          'deployedTagCount = :count',
        ExpressionAttributeValues: {
          ':empty': [],
          ':deployment': [
            {
              timestamp: new Date().toISOString(),
              deployed: result.serverTagsCreated.length,
              tagsModified: result.tagsModified,
              clientWorkspacePath: result.clientWorkspacePath,
              clientWorkspaceName: result.clientWorkspaceName,
              serverWorkspacePath: result.serverWorkspacePath,
              serverWorkspaceName: result.serverWorkspaceName,
              serverContainerUrl: deploymentConfig.serverContainerUrl,
              serverTags: result.serverTagsCreated,
              deployedTagIds: deploymentConfig.approvedTagIds,
              success: true
            }
          ],
          ':timestamp': new Date().toISOString(),
          ':status': 'completed',
          ':completed': new Date().toISOString(),
          ':count': result.serverTagsCreated.length
        }
      })
    );

    logger.info({ runId, deployed: result.tagsModified }, 'Deployment completed successfully');
  } catch (err) {
    logger.error({ err, runId }, 'Deployment failed');
    const message = err instanceof Error ? err.message : 'Deployment failed';

    // If the deploy threw mid-way, the migration module wraps the error in
    // DeploymentPartialFailureError carrying the tags that DID land in the
    // server container. Count those so our stats reflect reality.
    const partial = (err as { partialServerTagsCreated?: any[] })?.partialServerTagsCreated ?? [];
    const deployedCount = Array.isArray(partial) ? partial.length : 0;
    const failedCount = Math.max(deploymentConfig.approvedTagIds.length - deployedCount, 0);

    // Save failed deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression:
          'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), ' +
          'deploymentStatus = :status, deploymentCompletedAt = :completed, deploymentError = :error, ' +
          'deployedTagCount = :count',
        ExpressionAttributeValues: {
          ':empty': [],
          ':deployment': [
            {
              timestamp: new Date().toISOString(),
              deployed: deployedCount,
              failed: failedCount,
              serverTags: partial,
              error: message,
              success: false
            }
          ],
          ':status': 'failed',
          ':completed': new Date().toISOString(),
          ':error': message,
          ':count': deployedCount
        }
      })
    );

    // Re-throw so SQS knows the message failed
    throw err;
  }
}
