import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Tenant-scoped data access layer.
 * Ensures all database operations are scoped to the authenticated organization.
 */

export type TenantDataConfig = {
  ddb: DynamoDBDocumentClient;
  /** DynamoDB table names */
  tables: {
    imports: string;
    runs: string;
  };
};

export class TenantDataService {
  constructor(private config: TenantDataConfig) {}

  /**
   * Create an import scoped to an organization.
   */
  async createImport(organizationId: string, data: Record<string, unknown>): Promise<void> {
    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.tables.imports,
        Item: {
          ...data,
          organizationId, // Add tenant partition
          createdAt: new Date().toISOString()
        }
      })
    );
  }

  /**
   * Get an import, ensuring it belongs to the organization.
   */
  async getImport(organizationId: string, importId: string): Promise<Record<string, unknown> | null> {
    const result = await this.config.ddb.send(
      new GetCommand({
        TableName: this.config.tables.imports,
        Key: { importId }
      })
    );

    const item = result.Item as Record<string, unknown> | undefined;

    // Verify tenant ownership
    if (!item || item.organizationId !== organizationId) {
      return null;
    }

    return item;
  }

  /**
   * List all imports for an organization.
   */
  async listImports(organizationId: string, limit = 100): Promise<Record<string, unknown>[]> {
    // Use GSI to query by organizationId
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.tables.imports,
        IndexName: "organizationId-createdAt-index",
        KeyConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": organizationId
        },
        ScanIndexForward: false, // Newest first
        Limit: limit
      })
    );

    return (result.Items || []) as Record<string, unknown>[];
  }

  /**
   * Update an import, ensuring it belongs to the organization.
   */
  async updateImport(
    organizationId: string,
    importId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    // First verify ownership
    const existing = await this.getImport(organizationId, importId);
    if (!existing) {
      throw new Error("Import not found or access denied");
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (key === "importId" || key === "organizationId") {
        continue; // Don't allow changing primary keys
      }
      updateExpressions.push(`#${key} = :${key}`);
      attributeNames[`#${key}`] = key;
      attributeValues[`:${key}`] = value;
    }

    if (updateExpressions.length === 0) {
      return;
    }

    updateExpressions.push("#updatedAt = :updatedAt");
    attributeNames["#updatedAt"] = "updatedAt";
    attributeValues[":updatedAt"] = new Date().toISOString();

    await this.config.ddb.send(
      new UpdateCommand({
        TableName: this.config.tables.imports,
        Key: { importId },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: attributeNames,
        ConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: {
          ...attributeValues,
          ":orgId": organizationId
        }
      })
    );
  }

  /**
   * Delete an import, ensuring it belongs to the organization.
   */
  async deleteImport(organizationId: string, importId: string): Promise<void> {
    await this.config.ddb.send(
      new DeleteCommand({
        TableName: this.config.tables.imports,
        Key: { importId },
        ConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": organizationId
        }
      })
    );
  }

  /**
   * Create a migration run scoped to an organization.
   */
  async createRun(organizationId: string, data: Record<string, unknown>): Promise<void> {
    await this.config.ddb.send(
      new PutCommand({
        TableName: this.config.tables.runs,
        Item: {
          ...data,
          organizationId, // Add tenant partition
          createdAt: new Date().toISOString()
        }
      })
    );
  }

  /**
   * Get a run, ensuring it belongs to the organization.
   */
  async getRun(organizationId: string, runId: string): Promise<Record<string, unknown> | null> {
    const result = await this.config.ddb.send(
      new GetCommand({
        TableName: this.config.tables.runs,
        Key: { runId }
      })
    );

    const item = result.Item as Record<string, unknown> | undefined;

    // Verify tenant ownership
    if (!item || item.organizationId !== organizationId) {
      return null;
    }

    return item;
  }

  /**
   * List all runs for an organization.
   */
  async listRuns(organizationId: string, limit = 100): Promise<Record<string, unknown>[]> {
    // Use GSI to query by organizationId
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.tables.runs,
        IndexName: "organizationId-createdAt-index",
        KeyConditionExpression: "organizationId = :orgId",
        ExpressionAttributeValues: {
          ":orgId": organizationId
        },
        ScanIndexForward: false, // Newest first
        Limit: limit
      })
    );

    return (result.Items || []) as Record<string, unknown>[];
  }

  /**
   * List runs for a specific import within an organization.
   */
  async listRunsByImport(
    organizationId: string,
    importId: string,
    limit = 50
  ): Promise<Record<string, unknown>[]> {
    // First verify import ownership
    const importExists = await this.getImport(organizationId, importId);
    if (!importExists) {
      throw new Error("Import not found or access denied");
    }

    // Query runs by importId (requires GSI)
    const result = await this.config.ddb.send(
      new QueryCommand({
        TableName: this.config.tables.runs,
        IndexName: "importId-createdAt-index",
        KeyConditionExpression: "importId = :importId",
        ExpressionAttributeValues: {
          ":importId": importId
        },
        ScanIndexForward: false, // Newest first
        Limit: limit
      })
    );

    // Double-check all results belong to the organization
    const items = (result.Items || []) as Record<string, unknown>[];
    return items.filter(item => item.organizationId === organizationId);
  }

  /**
   * Update a run, ensuring it belongs to the organization.
   */
  async updateRun(
    organizationId: string,
    runId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    // First verify ownership
    const existing = await this.getRun(organizationId, runId);
    if (!existing) {
      throw new Error("Run not found or access denied");
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const attributeNames: Record<string, string> = {};
    const attributeValues: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (key === "runId" || key === "organizationId") {
        continue; // Don't allow changing primary keys
      }
      updateExpressions.push(`#${key} = :${key}`);
      attributeNames[`#${key}`] = key;
      attributeValues[`:${key}`] = value;
    }

    if (updateExpressions.length === 0) {
      return;
    }

    updateExpressions.push("#updatedAt = :updatedAt");
    attributeNames["#updatedAt"] = "updatedAt";
    attributeValues[":updatedAt"] = new Date().toISOString();

    await this.config.ddb.send(
      new UpdateCommand({
        TableName: this.config.tables.runs,
        Key: { runId },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: attributeNames,
        ExpressionAttributeValues: {
          ...attributeValues,
          ":orgId": organizationId
        },
        ConditionExpression: "organizationId = :orgId"
      })
    );
  }
}
