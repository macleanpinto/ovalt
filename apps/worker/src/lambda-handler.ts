import type { SQSEvent, SQSRecord, Context } from "aws-lambda";
import { processMessage } from "./index.js";

/**
 * Lambda handler for processing SQS messages (migration worker).
 *
 * Triggered by SQS queue: tag-relay-migrations
 * Processes migration jobs from the queue.
 */
export async function handler(event: SQSEvent, context: Context): Promise<void> {
  console.log(`Processing ${event.Records.length} SQS message(s)`, {
    requestId: context.awsRequestId,
    functionName: context.functionName
  });

  // Process messages sequentially (batch size = 1 recommended for migrations)
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);

      console.log(`Processing message`, {
        messageId: record.messageId,
        runId: message.runId,
        importId: message.importId
      });

      await processMessage(message);

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
