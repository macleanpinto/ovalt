#!/usr/bin/env node

// Quick script to reset stuck deployment status
// Usage: node reset-deployment-status.js <runId>

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node reset-deployment-status.js <runId>');
  process.exit(1);
}

const client = new DynamoDBClient({ region: 'eu-north-1' });
const ddbDoc = DynamoDBDocumentClient.from(client);

async function resetDeploymentStatus() {
  try {
    console.log(`Resetting deployment status for run: ${runId}`);

    await ddbDoc.send(
      new UpdateCommand({
        TableName: 'tag-relay-runs-production',
        Key: { runId },
        UpdateExpression: 'REMOVE deploymentStatus, deploymentStartedAt',
        ReturnValues: 'ALL_NEW'
      })
    );

    console.log('✅ Deployment status cleared');
    console.log('The UI will now allow starting a new deployment');
  } catch (error) {
    console.error('❌ Failed to reset deployment status:', error);
    process.exit(1);
  }
}

resetDeploymentStatus();
