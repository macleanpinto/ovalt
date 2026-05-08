import type { FastifyInstance } from "fastify";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { requirePlatformAdmin } from "./auth/platform-admin.js";

export type AdminRoutesConfig = {
  ddb: DynamoDBDocumentClient;
  usersTable: string;
  organizationsTable: string;
  importsTable: string;
  runsTable: string;
};

async function scanAll(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  projection?: string,
  attributeNames?: Record<string, string>
): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let exclusiveStartKey: Record<string, any> | undefined = undefined;
  do {
    const res: any = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
        ProjectionExpression: projection,
        ExpressionAttributeNames: attributeNames
      })
    );
    if (res.Items) items.push(...res.Items);
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

function maxIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function registerAdminRoutes(app: FastifyInstance, config: AdminRoutesConfig) {
  const { ddb, usersTable, organizationsTable, importsTable, runsTable } = config;

  app.get("/admin/metrics/summary", { preHandler: requirePlatformAdmin }, async (_req, reply) => {
    reply.header("Cache-Control", "no-store");

    const [users, orgs, imports, runs] = await Promise.all([
      scanAll(ddb, usersTable, "userId, email, createdAt"),
      scanAll(ddb, organizationsTable, "organizationId, #n, slug, #p, ownerId, createdAt", {
        "#n": "name",
        "#p": "plan"
      }),
      scanAll(ddb, importsTable, "importId, organizationId, createdAt"),
      scanAll(ddb, runsTable, "runId, organizationId, createdAt, runRef, deploymentStatus, deployedTagCount, lastDeployedAt")
    ]);

    // Exclude idempotency stub records (they carry a runRef pointing at the real run).
    const realRuns = runs.filter(r => !r.runRef);

    // deployedTagCount now reflects tags actually created in the server container,
    // even on partially-failed runs, so we sum it across all runs that have it.
    const totalTagsDeployed = realRuns.reduce((sum, r) => {
      const n = typeof r.deployedTagCount === "number" ? r.deployedTagCount : 0;
      return sum + n;
    }, 0);

    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeOrgIds = new Set<string>();
    const collectRecent = (rows: Record<string, any>[]) => {
      for (const row of rows) {
        if (!row.organizationId || !row.createdAt) continue;
        if (new Date(row.createdAt).getTime() >= cutoffMs) activeOrgIds.add(row.organizationId);
      }
    };
    collectRecent(realRuns);
    collectRecent(imports);

    const planBreakdown: Record<string, number> = { free: 0, pro: 0, enterprise: 0 };
    for (const o of orgs) {
      const plan = typeof o.plan === "string" ? o.plan : "free";
      planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
    }

    // Per-organization breakdown.
    const usersById = new Map<string, Record<string, any>>();
    for (const u of users) usersById.set(u.userId, u);

    type OrgRow = {
      organizationId: string;
      name: string;
      slug?: string;
      plan: string;
      ownerEmail?: string;
      imports: number;
      migrations: number;
      tagsDeployed: number;
      lastActivityAt?: string;
      createdAt?: string;
    };
    const orgRows = new Map<string, OrgRow>();
    for (const o of orgs) {
      orgRows.set(o.organizationId, {
        organizationId: o.organizationId,
        name: typeof o.name === "string" ? o.name : "(unnamed)",
        slug: typeof o.slug === "string" ? o.slug : undefined,
        plan: typeof o.plan === "string" ? o.plan : "free",
        ownerEmail: typeof o.ownerId === "string" ? usersById.get(o.ownerId)?.email : undefined,
        imports: 0,
        migrations: 0,
        tagsDeployed: 0,
        lastActivityAt: undefined,
        createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined
      });
    }

    for (const imp of imports) {
      const row = orgRows.get(imp.organizationId);
      if (!row) continue;
      row.imports += 1;
      row.lastActivityAt = maxIso(row.lastActivityAt, imp.createdAt);
    }

    for (const r of realRuns) {
      const row = orgRows.get(r.organizationId);
      if (!row) continue;
      row.migrations += 1;
      row.lastActivityAt = maxIso(row.lastActivityAt, r.lastDeployedAt ?? r.createdAt);
      if (typeof r.deployedTagCount === "number") {
        row.tagsDeployed += r.deployedTagCount;
      }
    }

    const organizations = Array.from(orgRows.values()).sort((a, b) => {
      if (b.tagsDeployed !== a.tagsDeployed) return b.tagsDeployed - a.tagsDeployed;
      if (b.migrations !== a.migrations) return b.migrations - a.migrations;
      return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
    });

    return {
      totalUsers: users.length,
      totalOrganizations: orgs.length,
      totalImports: imports.length,
      totalMigrations: realRuns.length,
      totalTagsDeployed,
      activeOrganizations30d: activeOrgIds.size,
      planBreakdown,
      organizations
    };
  });

  app.get<{ Params: { organizationId: string } }>(
    "/admin/organizations/:organizationId/migrations",
    { preHandler: requirePlatformAdmin },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const { organizationId } = req.params;

      const orgRes = await ddb.send(
        new GetCommand({ TableName: organizationsTable, Key: { organizationId } })
      );
      if (!orgRes.Item) {
        return reply.code(404).send({ error: "Not Found", message: "Organization not found" });
      }
      const org = orgRes.Item;

      const ownerId = typeof org.ownerId === "string" ? org.ownerId : undefined;
      let ownerEmail: string | undefined;
      if (ownerId) {
        const ownerRes = await ddb.send(
          new GetCommand({
            TableName: usersTable,
            Key: { userId: ownerId },
            ProjectionExpression: "email"
          })
        );
        if (ownerRes.Item && typeof ownerRes.Item.email === "string") {
          ownerEmail = ownerRes.Item.email;
        }
      }

      const items: Record<string, any>[] = [];
      let exclusiveStartKey: Record<string, any> | undefined = undefined;
      do {
        const res: any = await ddb.send(
          new QueryCommand({
            TableName: runsTable,
            IndexName: "organizationId-createdAt-index",
            KeyConditionExpression: "organizationId = :org",
            FilterExpression: "attribute_not_exists(runRef)",
            ExpressionAttributeValues: { ":org": organizationId },
            ScanIndexForward: false,
            ExclusiveStartKey: exclusiveStartKey
          })
        );
        if (res.Items) items.push(...res.Items);
        exclusiveStartKey = res.LastEvaluatedKey;
      } while (exclusiveStartKey);

      return {
        organization: {
          organizationId,
          name: typeof org.name === "string" ? org.name : "(unnamed)",
          slug: typeof org.slug === "string" ? org.slug : undefined,
          plan: typeof org.plan === "string" ? org.plan : "free",
          ownerEmail,
          createdAt: typeof org.createdAt === "string" ? org.createdAt : undefined
        },
        migrations: items
      };
    }
  );

  app.get<{ Querystring: { days?: string } }>(
    "/admin/metrics/signups",
    { preHandler: requirePlatformAdmin },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");

      const daysParam = Number(req.query.days ?? 30);
      const days =
        Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 365 ? Math.floor(daysParam) : 30;

      const users = await scanAll(ddb, usersTable, "userId, createdAt");

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const buckets = new Map<string, number>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }

      for (const u of users) {
        if (!u.createdAt) continue;
        const key = String(u.createdAt).slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }

      const series = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
      return { series };
    }
  );
}
