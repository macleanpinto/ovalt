import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { buildTriggerNameLookup, extractCanonicalTags } from "./canonical.js";
import { applyRuleset, aggregateConfidence, RULESET_VERSION } from "./engine/index.js";
import { enrichMappingsWithWebAgent, parseMappingAgentEnv } from "./mappingAgent.js";
import { buildMigrationReport } from "./buildReport.js";
import { reportToMarkdown } from "./markdown.js";
import { loadImportPayload } from "./loadImport.js";
import { verifyContainerProvisioning, type ProvisioningContext } from "../provisioning/index.js";
import type { QueueMessage } from "./types.js";

export type PipelineResult = { ok: true } | { ok: false; message: string };

async function writeArtifacts(
  s3: S3Client,
  bucket: string,
  runId: string,
  report: ReturnType<typeof buildMigrationReport>,
  blueprint: Record<string, unknown>
): Promise<void> {
  const json = JSON.stringify(report, null, 2);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `runs/${runId}/report.json`,
      Body: json,
      ContentType: "application/json"
    })
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `runs/${runId}/report.md`,
      Body: reportToMarkdown(report),
      ContentType: "text/markdown; charset=utf-8"
    })
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `runs/${runId}/server_blueprint.json`,
      Body: JSON.stringify(blueprint, null, 2),
      ContentType: "application/json"
    })
  );
}

export async function runMigrationPipeline(opts: {
  msg: QueueMessage;
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  tableImports: string;
  tableRuns: string;
  bucket: string;
}): Promise<PipelineResult> {
  const { msg, ddb, s3, tableImports, tableRuns, bucket } = opts;
  try {
    const { payload, projectId, hosting, gtm } = await loadImportPayload({
      ddb,
      s3,
      tableImports,
      importId: msg.importId
    });

    // Verify container provisioning before migration
    const provisioningCtx: ProvisioningContext = {
      importId: msg.importId,
      projectId,
      hosting,
      gtm
    };

    const provisioningResult = await verifyContainerProvisioning(provisioningCtx);

    // Update provisioning status
    await ddb.send(
      new UpdateCommand({
        TableName: tableRuns,
        Key: { runId: msg.runId },
        UpdateExpression: "SET containerProvisioningStatus = :cps, updatedAt = :u",
        ExpressionAttributeValues: {
          ":cps": provisioningResult.status,
          ":u": new Date().toISOString()
        }
      })
    );

    // If container is not ready, still proceed with migration but flag it
    if (provisioningResult.status !== "ready") {
      console.warn(
        `[pipeline] Container provisioning status: ${provisioningResult.status} - migration will proceed but deployment may require additional setup`
      );
    }

    const triggerLookup = buildTriggerNameLookup(payload.entities);
    const tags = extractCanonicalTags(payload);

    // Apply production ruleset engine
    const ruleMappings = applyRuleset(tags);

    // Enrich low-confidence mappings with web agent (optional)
    const mappings = await enrichMappingsWithWebAgent(tags, ruleMappings, parseMappingAgentEnv(process.env));
    const { score, provisional } = aggregateConfidence(mappings);

    // Build container summary
    const containerSummary = {
      totalTags: payload.entities?.tags?.length || 0,
      totalTriggers: payload.entities?.triggers?.length || 0,
      totalVariables: payload.entities?.variables?.length || 0
    };

    // Include raw container elements for UI review
    const containerElements = {
      tags: payload.entities?.tags || [],
      triggers: payload.entities?.triggers || [],
      variables: payload.entities?.variables || []
    };

    const report = buildMigrationReport({
      runId: msg.runId,
      importId: msg.importId,
      projectId,
      rulesetVersion: RULESET_VERSION,
      tags,
      mappings,
      confidenceScore: score,
      provisional,
      triggerLookup,
      containerProvisioning: {
        status: provisioningResult.status,
        containerInfo: provisioningResult.containerInfo,
        message: provisioningResult.message,
        requiredActions: provisioningResult.requiredActions || []
      },
      containerSummary,
      containerElements
    });

    const blueprint = {
      schema: "tag-relay.server_blueprint.v1",
      runId: msg.runId,
      importId: msg.importId,
      rulesetVersion: RULESET_VERSION,
      generatedAt: report.generatedAt,
      mappings: report.mappings,
      hostingHints: {
        note: "Apply in server GTM container after provisioning; pair with hosting fields on the import record."
      }
    };

    await writeArtifacts(s3, bucket, msg.runId, report, blueprint);

    const status = provisional ? "needs_review" : "completed";
    const manualActions = report.manualActions.slice(0, 25);

    await ddb.send(
      new UpdateCommand({
        TableName: tableRuns,
        Key: { runId: msg.runId },
        UpdateExpression:
          "SET #s = :s, updatedAt = :u, confidenceScore = :cs, summaryCounts = :sc, manualActions = :ma, containerProvisioningStatus = :cps",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": status,
          ":u": new Date().toISOString(),
          ":cs": score,
          ":sc": report.summaryCounts,
          ":ma": manualActions,
          ":cps": "pending_client_deploy"
        }
      })
    );

    const imp = await ddb.send(
      new GetCommand({
        TableName: tableImports,
        Key: { importId: msg.importId }
      })
    );
    if (imp.Item) {
      await ddb.send(
        new PutCommand({
          TableName: tableImports,
          Item: {
            ...imp.Item,
            status: "normalized",
            normalizedAt: new Date().toISOString()
          }
        })
      );
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: tableRuns,
          Key: { runId: msg.runId },
          UpdateExpression: "SET #s = :s, updatedAt = :u, manualActions = :ma",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":s": "failed",
            ":u": new Date().toISOString(),
            ":ma": [
              {
                priority: "high",
                reason: "Migration pipeline error",
                recommendation: message.slice(0, 900)
              }
            ]
          }
        })
      );
    } catch {
      /* ignore */
    }
    return { ok: false, message };
  }
}
