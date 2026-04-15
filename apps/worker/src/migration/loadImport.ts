import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { gtmExportSchema, type GtmExportPayload } from "./types.js";

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri.trim());
  if (!m) return null;
  return { bucket: m[1], key: m[2] };
}

export async function loadImportPayload(opts: {
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  tableImports: string;
  importId: string;
}): Promise<{
  payload: GtmExportPayload;
  rawBlobUri: string;
  projectId: string;
  hosting?: Record<string, unknown>;
  gtm?: Record<string, unknown>;
}> {
  const got = await opts.ddb.send(
    new GetCommand({
      TableName: opts.tableImports,
      Key: { importId: opts.importId }
    })
  );
  if (!got.Item) throw new Error(`Import ${opts.importId} not found`);
  const rawBlobUri = String(got.Item.rawBlobUri ?? "");
  const projectId = String(got.Item.projectId ?? "import");
  const hosting = got.Item.hosting as Record<string, unknown> | undefined;
  const gtm = got.Item.gtm as Record<string, unknown> | undefined;
  if (!rawBlobUri) throw new Error("Import missing rawBlobUri");

  const loc = parseS3Uri(rawBlobUri);
  if (!loc) throw new Error(`Invalid rawBlobUri: ${rawBlobUri}`);

  const obj = await opts.s3.send(
    new GetObjectCommand({
      Bucket: loc.bucket,
      Key: loc.key
    })
  );
  const text = await obj.Body?.transformToString();
  if (!text) throw new Error("Empty S3 object for import");

  const json = JSON.parse(text) as unknown;

  // Handle both formats:
  // 1. Normalized format from /gtm/import-container: has entities.tags
  // 2. Raw GTM export format from fixtures: has containerVersion.tag
  let normalizedJson = json;
  if (json && typeof json === "object" && "containerVersion" in json) {
    const cv = (json as any).containerVersion;
    if (cv && typeof cv === "object") {
      normalizedJson = {
        ...json,
        entities: {
          tags: cv.tag || [],
          triggers: cv.trigger || [],
          variables: cv.variable || [],
          builtInVariables: cv.builtInVariable || []
        }
      };
    }
  }

  const parsed = gtmExportSchema.safeParse(normalizedJson);
  if (!parsed.success) {
    throw new Error(`Import JSON validation failed: ${parsed.error.message}`);
  }
  const base = parsed.data;
  const ent = (base.entities ?? {}) as Record<string, unknown>;
  const payload = {
    ...base,
    entities: {
      tags: (Array.isArray(ent.tags) ? ent.tags : []) as Record<string, unknown>[],
      triggers: (Array.isArray(ent.triggers) ? ent.triggers : []) as Record<string, unknown>[],
      variables: (Array.isArray(ent.variables) ? ent.variables : []) as Record<string, unknown>[],
      folders: Array.isArray(ent.folders) ? (ent.folders as Record<string, unknown>[]) : undefined,
      builtInVariables: Array.isArray(ent.builtInVariables)
        ? (ent.builtInVariables as Record<string, unknown>[])
        : undefined
    }
  } as GtmExportPayload;
  return { payload, rawBlobUri, projectId, hosting, gtm };
}
