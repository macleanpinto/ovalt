import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { QueueMessage } from './migration/types.js';
import { z } from 'zod';

// Import deployment logic from API
import { deployMigrationWithExportImport } from '../../api/src/gtm-migration-deploy.js';
import { getOAuthClient } from '../../api/src/auth-service.js';

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

export async function processDeployment(message: Extract<QueueMessage, { type: 'deployment' }>): Promise<void> {
  const { runId, deploymentConfig, gtmSessionId } = message;

  console.log('Processing deployment', { runId, tagCount: deploymentConfig.approvedTagIds.length });

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

    const auth = getOAuthClient(sessionResult.Item.tokens);

    // Convert tagsByType back to Map
    const tagsByType = new Map(Object.entries(deploymentConfig.tagsByType));

    // Execute deployment
    const result = await deployMigrationWithExportImport(
      auth,
      {
        clientContainerPath: deploymentConfig.clientContainerPath,
        clientWorkspacePath: deploymentConfig.clientWorkspacePath,
        serverContainerPath: deploymentConfig.serverContainerPath,
        serverContainerUrl: deploymentConfig.serverContainerUrl,
        approvedTagIds: deploymentConfig.approvedTagIds,
        tagsByType,
        metaAccessToken: deploymentConfig.metaAccessToken
      },
      console // Use console for logging in worker
    );

    // Save successful deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: 'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), lastDeployedAt = :timestamp, deploymentStatus = :status, deploymentCompletedAt = :completed',
        ExpressionAttributeValues: {
          ':empty': [],
          ':deployment': [{
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
          }],
          ':timestamp': new Date().toISOString(),
          ':status': 'completed',
          ':completed': new Date().toISOString()
        }
      })
    );

    console.log('Deployment completed successfully', { runId, deployed: result.tagsModified });
  } catch (err) {
    console.error('Deployment failed', { err, runId });
    const message = err instanceof Error ? err.message : 'Deployment failed';

    // Save failed deployment to DynamoDB
    await ddbDoc.send(
      new UpdateCommand({
        TableName: env.DDB_TABLE_RUNS,
        Key: { runId },
        UpdateExpression: 'SET deploymentHistory = list_append(if_not_exists(deploymentHistory, :empty), :deployment), deploymentStatus = :status, deploymentCompletedAt = :completed, deploymentError = :error',
        ExpressionAttributeValues: {
          ':empty': [],
          ':deployment': [{
            timestamp: new Date().toISOString(),
            deployed: 0,
            failed: deploymentConfig.approvedTagIds.length,
            error: message,
            success: false
          }],
          ':status': 'failed',
          ':completed': new Date().toISOString(),
          ':error': message
        }
      })
    );

    throw err;
  }
}
