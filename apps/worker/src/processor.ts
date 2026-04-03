// NOTE: dotenv is NOT loaded here to avoid runtime dependency in Lambda.
// Lambda gets env vars from CDK/CloudFormation directly.
// For local development, use index.ts which loads dotenv.

import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { QueueMessage } from "./migration/types.js";
import { runMigrationPipeline } from "./migration/pipeline.js";

const env = z
  .object({
    AWS_REGION: z.string().default("us-east-1"),
    AWS_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string(),
    DDB_TABLE_RUNS: z.string().default("tag-relay-runs"),
    DDB_TABLE_IMPORTS: z.string().default("tag-relay-imports")
  })
  .parse(process.env);

const baseAws = { region: env.AWS_REGION, endpoint: env.AWS_ENDPOINT };
const s3 = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_ENDPOINT,
  forcePathStyle: Boolean(env.AWS_ENDPOINT)
});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(baseAws));

export async function processRun(msg: QueueMessage): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: env.DDB_TABLE_RUNS,
      Key: { runId: msg.runId },
      UpdateExpression: "SET #s = :s, updatedAt = :u, containerProvisioningStatus = :cps",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": "running",
        ":u": now,
        ":cps": "processing"
      }
    })
  );

  const result = await runMigrationPipeline({
    msg,
    ddb,
    s3,
    tableImports: env.DDB_TABLE_IMPORTS,
    tableRuns: env.DDB_TABLE_RUNS,
    bucket: env.S3_BUCKET
  });

  if (!result.ok) {
    console.error("[worker] pipeline failed", result.message);
  }
}

export async function ensureArtifactsBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    return;
  } catch {
    /* try create */
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    console.info(`[worker] created S3 bucket ${env.S3_BUCKET}`);
  } catch (err: unknown) {
    const n = (err as { name?: string }).name;
    if (n === "BucketAlreadyOwnedByYou" || n === "BucketAlreadyExists") return;
    console.warn("[worker] could not auto-create S3 bucket", err);
  }
}
