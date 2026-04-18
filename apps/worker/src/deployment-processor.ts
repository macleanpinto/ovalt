import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { DeploymentMessage } from './migration/types.js';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';

// Import deployment logic from API (esbuild will bundle it)
import { deployMigrationWithExportImport } from '../../api/src/gtm-migration-deploy.js';

const env = z
  .object({
    AWS_REGION: z.string().default('us-east-1'),
    AWS_ENDPOINT: z.string().optional(),
    DDB_TABLE_RUNS: z.string(),
    DDB_TABLE_SESSIONS: z.string(),
  })
  .parse(process.env);

const ddb = new DynamoDBClient({ region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT });
const ddbDoc = DynamoDBDocumentClient.from(ddb);

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

    // Create OAuth2Client from stored tokens
    const tokens = sessionResult.Item.tokens;
    const auth = new OAuth2Client();
    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

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
        metaAccessToken: deploymentConfig.metaAccessToken
      },
      logger
    );

    // Save successful deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression:
          'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), ' +
          'lastDeployedAt = :timestamp, deploymentStatus = :status, deploymentCompletedAt = :completed',
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
          ':completed': new Date().toISOString()
        }
      })
    );

    logger.info({ runId, deployed: result.tagsModified }, 'Deployment completed successfully');
  } catch (err) {
    logger.error({ err, runId }, 'Deployment failed');
    const message = err instanceof Error ? err.message : 'Deployment failed';

    // Save failed deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression:
          'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), ' +
          'deploymentStatus = :status, deploymentCompletedAt = :completed, deploymentError = :error',
        ExpressionAttributeValues: {
          ':empty': [],
          ':deployment': [
            {
              timestamp: new Date().toISOString(),
              deployed: 0,
              failed: deploymentConfig.approvedTagIds.length,
              error: message,
              success: false
            }
          ],
          ':status': 'failed',
          ':completed': new Date().toISOString(),
          ':error': message
        }
      })
    );

    // Re-throw so SQS knows the message failed
    throw err;
  }
}
