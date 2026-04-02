import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import awsLambdaFastify from "aws-lambda-fastify";
import { buildApp } from "./server.js";

let cached: any;
let secretsLoaded = false;

/**
 * Load secrets from AWS Secrets Manager and inject into process.env
 */
async function loadSecrets(): Promise<void> {
  if (secretsLoaded) return;

  const environment = process.env.ENVIRONMENT || 'production';
  const secretName = `tag-relay/${environment}/app-secrets`;
  const region = process.env.AWS_REGION || 'us-east-1';

  try {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);

      // Inject secrets into process.env
      Object.keys(secrets).forEach((key) => {
        if (secrets[key] && !process.env[key]) {
          process.env[key] = secrets[key];
        }
      });

      secretsLoaded = true;
      console.log('✅ Secrets loaded from AWS Secrets Manager');
    }
  } catch (error) {
    console.error('❌ Failed to load secrets from AWS Secrets Manager:', error);
    throw error;
  }
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> {
  if (!cached) {
    // Load secrets before building app
    await loadSecrets();

    const app = await buildApp();
    cached = awsLambdaFastify(app as any);
  }
  return cached(event, context) as Promise<APIGatewayProxyResultV2>;
}
