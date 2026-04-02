/**
 * Deploy Google's server-side GTM image to Cloud Run using the same flow as
 * https://developers.google.com/tag-platform/tag-manager/server-side/cloud-run-setup-guide
 *
 * Requires OAuth scope: https://www.googleapis.com/auth/cloud-platform
 */
import type { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";

const GTM_CLOUD_IMAGE = "gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function gcpJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const errObj = data as { error?: { message?: string; details?: unknown } } | null;
    const msg = errObj?.error?.message ?? text;
    throw new Error(msg || `GCP request failed (${res.status})`);
  }
  return data as T;
}

type Lro = {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: {
    uri?: string;
    "@type"?: string;
    [k: string]: unknown;
  };
};

async function pollRunOperation(accessToken: string, operationName: string): Promise<Lro["response"]> {
  const opUrl = `https://run.googleapis.com/v2/${operationName}`;
  for (let i = 0; i < 90; i++) {
    const op = await gcpJson<Lro>(accessToken, opUrl, { method: "GET" });
    if (op.error?.message) throw new Error(op.error.message);
    if (op.done && op.response) return op.response;
    await sleep(2000);
  }
  throw new Error("Cloud Run operation timed out (still running). Check Google Cloud Console for status.");
}

export async function buildSgtmContainerConfigBase64(
  auth: OAuth2Client,
  containerPath: string,
  publicId: string
): Promise<string> {
  const tm = google.tagmanager({ version: "v2", auth });
  const list = await tm.accounts.containers.environments.list({ parent: containerPath });
  const envs = list.data.environment ?? [];
  const live = envs.find((e) => e.type === "live");
  if (!live?.authorizationCode || live.environmentId == null || String(live.environmentId).length === 0) {
    throw new Error(
      "Could not read the Live environment for this server container. In tagmanager.google.com, open the server container, publish a version, then retry."
    );
  }
  const qs = new URLSearchParams();
  qs.set("id", publicId);
  qs.set("env", String(live.environmentId));
  qs.set("auth", live.authorizationCode);
  return Buffer.from(qs.toString(), "utf8").toString("base64");
}

async function tryEnableApi(accessToken: string, projectId: string, service: string) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services/${encodeURIComponent(service)}:enable`;
  try {
    await gcpJson(accessToken, url, { method: "POST", body: "{}" });
  } catch (e) {
    const m = String((e as Error)?.message ?? "");
    if (m.includes("already") || m.includes("ENABLED") || m.includes("PENDING")) return;
    throw e;
  }
}

function extractServiceUri(response: Lro["response"] | undefined): string | null {
  if (!response) return null;
  if (typeof response.uri === "string" && response.uri.startsWith("http")) return response.uri;
  const any = response as Record<string, unknown>;
  if (typeof any.uri === "string") return any.uri as string;
  return null;
}

export type DeployTaggingServerParams = {
  auth: OAuth2Client;
  gcpProjectId: string;
  region: string;
  serviceId: string;
  containerConfigBase64: string;
};

/**
 * Creates or updates a Cloud Run service running the official sGTM image, then opens `roles/run.invoker` to allUsers
 * so browsers can send tagging requests (same as `gcloud run deploy --allow-unauthenticated`).
 */
export async function deployTaggingServerToCloudRun(p: DeployTaggingServerParams): Promise<{ taggingUrl: string }> {
  const { auth, gcpProjectId, region, serviceId, containerConfigBase64 } = p;
  const { token: accessToken } = await auth.getAccessToken();
  if (!accessToken) throw new Error("No Google access token — reconnect Google on the Containers screen.");

  await tryEnableApi(accessToken, gcpProjectId, "run.googleapis.com");

  const parent = `projects/${encodeURIComponent(gcpProjectId)}/locations/${encodeURIComponent(region)}`;
  const createUrl = `https://run.googleapis.com/v2/${parent}/services?serviceId=${encodeURIComponent(serviceId)}`;

  const serviceBody = {
    ingress: "INGRESS_TRAFFIC_ALL",
    invokerIamDisabled: true,
    template: {
      containers: [
        {
          image: GTM_CLOUD_IMAGE,
          env: [{ name: "CONTAINER_CONFIG", value: containerConfigBase64 }],
          resources: { limits: { cpu: "1", memory: "512Mi" } }
        }
      ],
      timeout: "60s",
      maxInstanceRequestConcurrency: 80,
      scaling: { minInstanceCount: 0, maxInstanceCount: 10 }
    }
  };

  let responsePayload: Lro["response"];

  try {
    const createRes = await gcpJson<Lro | Lro["response"]>(accessToken, createUrl, {
      method: "POST",
      body: JSON.stringify(serviceBody)
    });

    if (createRes && typeof createRes === "object" && "name" in createRes && String((createRes as Lro).name).includes("/operations/")) {
      responsePayload = await pollRunOperation(accessToken, String((createRes as Lro).name));
    } else {
      responsePayload = createRes as Lro["response"];
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (!msg.includes("409") && !msg.toLowerCase().includes("already exists")) throw e;

    const patchUrl = `https://run.googleapis.com/v2/${parent}/services/${encodeURIComponent(serviceId)}`;
    const patchRes = await gcpJson<Lro | Lro["response"]>(accessToken, patchUrl, {
      method: "PATCH",
      body: JSON.stringify(serviceBody),
      headers: { "X-Goog-FieldMask": "template,ingress,invokerIamDisabled" }
    });
    if (patchRes && typeof patchRes === "object" && "name" in patchRes && String((patchRes as Lro).name).includes("/operations/")) {
      responsePayload = await pollRunOperation(accessToken, String((patchRes as Lro).name));
    } else {
      responsePayload = patchRes as Lro["response"];
    }
  }

  let uri = extractServiceUri(responsePayload);
  if (!uri) {
    const getUrl = `https://run.googleapis.com/v2/${parent}/services/${encodeURIComponent(serviceId)}`;
    const svc = await gcpJson<{ uri?: string }>(accessToken, getUrl, { method: "GET" });
    uri = svc.uri ?? null;
  }
  if (!uri) throw new Error("Cloud Run deploy finished but no service URL was returned.");

  const taggingUrl = uri.endsWith("/") ? uri.slice(0, -1) : uri;
  return { taggingUrl };
}
