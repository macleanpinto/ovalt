/**
 * API Client for Ovalt
 * Handles authentication and API requests
 */

/** Base URL without trailing slash (env often has trailing `/`, paths start with `/`). */
export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");
}

const API_URL = getApiBaseUrl();

/** localStorage key for GTM OAuth state id (server holds tokens in memory / future persistence). */
export const GTM_SESSION_STORAGE_KEY = 'gtm_session';

export class APIError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'APIError';
  }
}

export interface AuthTokens {
  token: string;
  refreshToken?: string;
}

export interface User {
  userId: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Organization {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
}

type MeResponse =
  | { authMethod: "session"; user: User; organization: Organization }
  | { authMethod: "api_key"; organization: Organization }
  | { authMethod: string; user?: User; organization?: Organization };

export interface Import {
  importId: string;
  organizationId: string;
  projectId: string;
  sourceType: string;
  status: string;
  createdAt: string;
  gtm?: {
    containerPath: string;
    workspacePath: string;
  };
}

export interface Run {
  runId: string;
  importId: string;
  organizationId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'needs_review';
  confidenceScore?: number;
  rulesetVersion: string;
  createdAt: string;
  completedAt?: string;
  deploymentHistory?: Array<{
    timestamp: string;
    deployed: number;
    failed: number;
    deployedTagIds: string[];
    serverContainerPath: string;
    transport_url: string;
    workspacePath: string;
  }>;
  lastDeployedAt?: string;
}

export interface Stats {
  totalImports: number;
  totalRuns: number;
  successRate: number;
  lastRun?: string;
}

class APIClient {
  // Use a getter instead of caching to always read from localStorage
  private getToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    // Only set Content-Type for requests with a body
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: options.cache ?? "no-store",
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const msg = typeof (error as { message?: string }).message === 'string' ? (error as { message: string }).message : '';
      if (
        response.status === 401 &&
        typeof window !== 'undefined' &&
        /invalid gtm session|missing x-gtm-session|invalid or expired gtm session/i.test(msg)
      ) {
        window.localStorage.removeItem(GTM_SESSION_STORAGE_KEY);
        window.dispatchEvent(
          new CustomEvent('tagrelay:gtm-session-lost', {
            detail: { path, message: msg }
          })
        );
      }
      throw new APIError(response.status, msg || response.statusText, error);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<{ token: string; user: User; organization?: Organization }> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, name: string): Promise<{ token: string; user: User; organization?: Organization }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  async getMe(): Promise<User> {
    const res = await this.request<MeResponse>('/auth/me');
    if ((res as any)?.user) return (res as any).user as User;
    return res as any as User;
  }

  async getMeWithOrg(): Promise<{ user: User; organization: Organization }> {
    const res = await this.request<MeResponse>('/auth/me');
    const user = (res as any)?.user as User | undefined;
    const organization = (res as any)?.organization as Organization | undefined;
    if (!user || !organization) {
      throw new APIError(500, "Unexpected /auth/me response", res);
    }
    return { user, organization };
  }

  // OAuth — JSON URL for programmatic use; prefer getOAuthStartUrl for browser login
  getOAuthURL(provider: 'google' | 'github'): string {
    return `${API_URL}/auth/oauth/${provider}`;
  }

  /** Full API URL that sets oauth_state cookie and 302s to Google (use with window.location). */
  getOAuthStartUrl(provider: 'google' | 'github'): string {
    return `${API_URL}/auth/oauth/${provider}?redirect=1`;
  }

  // GTM OAuth (Tag Manager access)
  async gtmOAuthStart(): Promise<{ url: string; sessionId?: string; redirectUri?: string }> {
    return this.request('/gtm/oauth/start');
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const res = await this.request<{ organizations: Organization[] }>('/auth/organizations');
    return res.organizations ?? [];
  }

  async createOrganization(name: string, slug: string): Promise<Organization> {
    return this.request('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  }

  // Imports
  async getImports(organizationId: string): Promise<Import[]> {
    const res = await this.request<any>(`/imports?organizationId=${encodeURIComponent(organizationId)}`);
    if (Array.isArray(res)) return res as Import[];
    return (res?.items ?? []) as Import[];
  }

  async deleteImport(importId: string): Promise<{ success: boolean; importId: string }> {
    return this.request(`/imports/${importId}`, {
      method: 'DELETE',
    });
  }

  async createImport(organizationId: string, file: File): Promise<Import> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('organizationId', organizationId);

    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/imports/gtm-web-container`, {
      method: "POST",
      headers,
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new APIError(
        response.status,
        error.message || response.statusText,
        error
      );
    }

    return response.json();
  }

  // Runs
  async getRuns(organizationId: string): Promise<Run[]> {
    const res = await this.request<{ items: Run[] }>(`/migrations?organizationId=${organizationId}`);
    return res.items;
  }

  async createRun(importId: string): Promise<Run> {
    // Generate unique idempotency key to allow multiple migrations from same import
    const idempotencyKey = `${importId}:${Date.now()}`;
    return this.request(`/migrations/${importId}/run`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    });
  }

  async getRun(runId: string): Promise<Run> {
    return this.request(`/migrations/${runId}`);
  }

  async deleteRun(runId: string): Promise<any> {
    return this.request(`/migrations/${runId}`, {
      method: 'DELETE'
    });
  }

  async getRunReport(runId: string): Promise<any> {
    return this.request(`/migrations/${runId}/report`);
  }

  async getImport(importId: string): Promise<Import> {
    return this.request(`/imports/${importId}`);
  }

  // Stats
  async getStats(organizationId: string): Promise<Stats> {
    const [imports, runs] = await Promise.all([
      this.getImports(organizationId),
      this.getRuns(organizationId),
    ]);

    const totalImports = imports.length;
    const totalRuns = runs.length;
    const successfulRuns = runs.filter(r => r.status === 'completed').length;
    const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;
    const lastRun = runs.length > 0 ? runs[runs.length - 1].createdAt : undefined;

    return {
      totalImports,
      totalRuns,
      successRate,
      lastRun,
    };
  }

  // Health check
  async health(): Promise<{ ok: boolean }> {
    return this.request('/health');
  }

  // GTM OAuth
  async startGtmOAuth(returnUrl?: string): Promise<{ sessionId: string; url: string }> {
    const queryParams = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    return this.request(`/gtm/oauth/start${queryParams}`);
  }

  async deployApprovedTags(
    runId: string,
    approvedTagIds: string[],
    clientContainerPath: string,
    clientWorkspacePath: string,
    serverContainerPath: string,
    transport_url: string,
    gtmSessionId: string,
    metaAccessToken?: string
  ): Promise<any> {
    const endpoint = `/migrations/${runId}/deploy-approved-v2`;
    const fullUrl = `${API_URL}${endpoint}`;

    console.log('🌐 API CLIENT: Making deployment request');
    console.log('📍 Full URL:', fullUrl);
    console.log('📋 Endpoint:', endpoint);
    console.log('📦 Request body:', {
      approvedTagIds,
      clientContainerPath,
      clientWorkspacePath,
      serverContainerPath,
      transport_url,
      hasMetaAccessToken: !!metaAccessToken
    });

    return this.request(endpoint, {
      method: 'POST',
      headers: { 'x-gtm-session': gtmSessionId },
      body: JSON.stringify({
        approvedTagIds,
        clientContainerPath,
        clientWorkspacePath,
        serverContainerPath,
        transport_url,
        metaAccessToken
      })
    });
  }

  async getGtmAccounts(gtmSessionId: string): Promise<{ accounts: any[] }> {
    return this.request('/gtm/accounts', {
      headers: { 'x-gtm-session': gtmSessionId }
    });
  }

  async getGtmContainers(gtmSessionId: string, accountPath: string): Promise<{ containers: any[] }> {
    return this.request(`/gtm/containers?accountPath=${encodeURIComponent(accountPath)}`, {
      headers: { 'x-gtm-session': gtmSessionId }
    });
  }

  async importGtmContainer(gtmSessionId: string, containerPath: string, workspaceId?: string): Promise<{ importId: string; status: string }> {
    return this.request('/gtm/import-container', {
      method: 'POST',
      headers: { 'x-gtm-session': gtmSessionId },
      body: JSON.stringify({ containerPath, workspaceId })
    });
  }

  async createGtmServerContainer(
    gtmSessionId: string,
    body: { accountPath: string; name: string; importId?: string }
  ): Promise<{ path: string; publicId?: string; containerId?: string; tagManagerUrl?: string }> {
    return this.request('/gtm/create-server-container', {
      method: 'POST',
      headers: { 'x-gtm-session': gtmSessionId },
      body: JSON.stringify(body)
    });
  }
}

export const apiClient = new APIClient();

/** True when the API rejected the GTM OAuth session (e.g. API restarted, stale state id in localStorage). */
export function isGtmSessionApiError(err: unknown): boolean {
  if (!(err instanceof APIError) || err.status !== 401) return false;
  return /invalid gtm session|missing x-gtm-session|invalid or expired gtm session/i.test(err.message);
}

/**
 * Clears stored GTM session and redirects the browser to Google OAuth.
 * After consent, user returns to `returnPath` with `?gtmSession=` set.
 */
export async function reconnectGoogleTagManager(returnPath?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(GTM_SESSION_STORAGE_KEY);
  const rp = returnPath ?? `${window.location.pathname}${window.location.search}`;
  const { url } = await apiClient.startGtmOAuth(rp);
  window.location.assign(url);
}
