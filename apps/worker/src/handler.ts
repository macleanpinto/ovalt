import type { SQSEvent } from "aws-lambda";
import type { QueueMessage } from "./migration/types.js";
import { processRun } from "./processor.js";

/**
 * SQS-triggered Lambda. Failed records are retried via partial batch response.
 */
export async function handler(event: SQSEvent): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body) as QueueMessage;
      await processRun(msg);
    } catch (err) {
      console.error("[worker-lambda] record failed", record.messageId, err);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}
