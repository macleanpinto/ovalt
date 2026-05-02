import type { SQSEvent, SQSRecord, Context } from "aws-lambda";
import type { MigrationMessage, QueueMessage } from "./migration/types.js";
import { ensureArtifactsBucket } from "./processor.js";

/**
 * Lambda handler for processing SQS messages (migration worker).
 *
 * Triggered by SQS queue: tag-relay-migrations
 * Processes migration jobs from the queue.
 * Routes to appropriate processor based on message type.
 *
 * NOTE: Does NOT import from index.ts to avoid dotenv dependency (Lambda doesn't need it).
 */
export async function handler(event: SQSEvent, context: Context): Promise<void> {
  console.log(`Processing ${event.Records.length} SQS message(s)`, {
    requestId: context.awsRequestId,
    functionName: context.functionName
  });

  // Ensure S3 bucket exists
  await ensureArtifactsBucket();

  // Process messages sequentially (batch size = 1 recommended for migrations)
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as QueueMessage;

      // Route based on message type
      if ('type' in message && message.type === 'deployment') {
        console.log(`Processing deployment message`, {
          messageId: record.messageId,
          runId: message.runId,
          type: message.type,
          tagCount: message.deploymentConfig.approvedTagIds.length
        });

        const { processDeployment } = await import('./deployment-processor.js');
        await processDeployment(message);
      } else {
        console.log(`Processing migration message`, {
          messageId: record.messageId,
          runId: message.runId,
          importId: message.importId
        });

        const { processRun } = await import('./processor.js');
        await processRun(message as MigrationMessage);
      }

      console.log(`Message processed successfully`, {
        messageId: record.messageId,
        runId: message.runId
      });
    } catch (error) {
      console.error(`Failed to process message`, {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      // Re-throw to send message to DLQ after retry exhaustion
      throw error;
    }
  }

  console.log(`Batch processing complete`);
}
