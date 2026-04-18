import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load repo-root .env FIRST before any other imports
const __repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
loadDotenv({ path: resolve(__repoRoot, ".env") });
loadDotenv({ path: resolve(__repoRoot, ".env.local"), override: true });

// Now safe to import modules that depend on process.env
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { z } from "zod";
import type { QueueMessage } from "./migration/types.js";
import { ensureArtifactsBucket, processRun } from "./processor.js";

const env = z
  .object({
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ENDPOINT: z.string().optional(),
    SQS_QUEUE_URL: z.string()
  })
  .parse(process.env);

const sqs = new SQSClient({ region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Process a single message (used by Lambda handler).
 * Exported for use in lambda-handler.ts.
 */
export async function processMessage(message: QueueMessage): Promise<void> {
  await ensureArtifactsBucket();

  if (message.type === 'deployment') {
    // Handle deployment message
    const { processDeployment } = await import('./deployment-processor.js');
    await processDeployment(message);
  } else {
    // Handle migration message (backwards compatible - old messages don't have type field)
    await processRun(message);
  }
}

/**
 * Long-running worker loop (for Docker/local development).
 * Polls SQS queue continuously.
 */
async function main(): Promise<void> {
  await ensureArtifactsBucket();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: env.SQS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20
      })
    );

    const m = resp.Messages?.[0];
    if (!m?.Body || !m.ReceiptHandle) {
      await sleep(500);
      continue;
    }

    try {
      const payload = JSON.parse(m.Body) as QueueMessage;
      await processMessage(payload);
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: env.SQS_QUEUE_URL,
          ReceiptHandle: m.ReceiptHandle
        })
      );
    } catch (err) {
      console.error("worker processing failed", err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
