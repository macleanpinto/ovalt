// NOTE: dotenv is NOT loaded here to avoid runtime dependency in Lambda.
// Lambda gets env vars from CDK/CloudFormation directly.
// For local development, use index.ts which loads dotenv.

import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import type { MigrationMessage } from "./migration/types.js";
import { runMigrationPipeline } from "./migration/pipeline.js";

// Lazy initialization to ensure environment variables are loaded first (by index.ts)
let env: {
  AWS_REGION: string;
  AWS_ENDPOINT?: string;
  S3_BUCKET: string;
  DDB_TABLE_RUNS: string;
  DDB_TABLE_IMPORTS: string;
  ENVIRONMENT?: string;
};
let s3: S3Client;
let ddb: DynamoDBDocumentClient;

function initClients() {
  if (env) return; // Already initialized

  env = z
    .object({
      AWS_REGION: z.string().default("us-east-1"),
      AWS_ENDPOINT: z.string().optional(),
      S3_BUCKET: z.string().default("tag-relay-artifacts"),
      DDB_TABLE_RUNS: z.string().default("tag-relay-runs"),
      DDB_TABLE_IMPORTS: z.string().default("tag-relay-imports"),
      ENVIRONMENT: z.string().optional()
    })
    .parse(process.env);

  // SAFETY: Force LocalStack in local/development mode
  const isLocal = env.ENVIRONMENT === "local" || process.env.NODE_ENV === "development";
  if (isLocal && !env.AWS_ENDPOINT) {
    console.warn("[worker] ⚠️  LOCAL MODE: AWS_ENDPOINT not set, defaulting to LocalStack");
    env.AWS_ENDPOINT = "http://localhost:4566";
  }

  // SAFETY: Prevent accidental real AWS usage in local mode
  if (isLocal && env.AWS_ENDPOINT !== "http://localhost:4566") {
    throw new Error(
      `[worker] ❌ SAFETY CHECK FAILED: Local mode must use LocalStack (http://localhost:4566), but AWS_ENDPOINT is "${env.AWS_ENDPOINT}"`
    );
  }

  console.log("[worker] AWS Config:", {
    environment: env.ENVIRONMENT || process.env.NODE_ENV,
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT || "AWS (production)",
    bucket: env.S3_BUCKET,
    isLocalStack: env.AWS_ENDPOINT === "http://localhost:4566"
  });

  // Configure AWS clients with explicit credentials for LocalStack
  const awsConfig: any = {
    region: env.AWS_REGION,
    endpoint: env.AWS_ENDPOINT
  };

  // Force test credentials for LocalStack to override ~/.aws/credentials
  if (isLocal || env.AWS_ENDPOINT === "http://localhost:4566") {
    awsConfig.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test"
    };
    console.log("[worker] 🔒 Using LocalStack test credentials (overriding ~/.aws/credentials)");
  }

  s3 = new S3Client({
    ...awsConfig,
    forcePathStyle: Boolean(env.AWS_ENDPOINT)
  });
  ddb = DynamoDBDocumentClient.from(new DynamoDBClient(awsConfig));
}

export async function processRun(msg: MigrationMessage): Promise<void> {
  initClients(); // Ensure clients are initialized
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
  initClients(); // Ensure clients are initialized
  console.log(`[worker] Checking S3 bucket ${env.S3_BUCKET} at endpoint ${env.AWS_ENDPOINT || 'AWS'}`);
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    console.log(`[worker] ✅ S3 bucket ${env.S3_BUCKET} verified at ${env.AWS_ENDPOINT || 'AWS'}`);
    return;
  } catch (headErr) {
    // Bucket doesn't exist, try to create it
    console.log(`[worker] Bucket not found, attempting to create at ${env.AWS_ENDPOINT || 'AWS'}...`);
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    console.info(`[worker] ✅ Created S3 bucket ${env.S3_BUCKET}`);
  } catch (err: unknown) {
    const n = (err as { name?: string }).name;
    if (n === "BucketAlreadyOwnedByYou" || n === "BucketAlreadyExists") {
      console.log(`[worker] ✅ Bucket ${env.S3_BUCKET} already exists`);
      return;
    }
    // Don't throw - just warn and continue
    console.warn("[worker] ⚠️  Could not verify S3 bucket - continuing anyway:", (err as Error).message);
  }
}
