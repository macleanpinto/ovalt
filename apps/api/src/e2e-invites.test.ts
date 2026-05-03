/**
 * E2E: Organization invites + members + seat limits.
 *
 * Boots the Fastify app in-process against LocalStack DynamoDB.
 * Does NOT require GTM OAuth tokens or external APIs.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./server";

describe("E2E: invites, members, seat limits", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ENVIRONMENT = "local";
    process.env.AWS_ENDPOINT = "http://localhost:4566";
    process.env.JWT_SECRET = "test-secret";
    process.env.SERVICE_TOKEN = "test-token";
    process.env.WEB_BASE_URL = "http://localhost:5173";
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Register a fresh user + org. Returns token + ids. */
  async function register(suffix: string) {
    const email = `invites-${Date.now()}-${suffix}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, name: `User ${suffix}`, organizationName: `Org ${suffix}` }
    });
    expect(res.statusCode, `register ${suffix}: ${res.body}`).toBe(201);
    const json = res.json();
    return {
      email,
      token: json.token as string,
      userId: json.user.userId as string,
      organizationId: json.organization.organizationId as string
    };
  }

  async function registerExistingUser(email: string, orgName: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, organizationName: orgName }
    });
    return res;
  }

  test("owner invites a brand-new user who registers via the invite link", async () => {
    const owner = await register("owner-a");
    const inviteeEmail = `invitee-a-${Date.now()}@example.com`;

    const createRes = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: inviteeEmail, role: "member" }
    });
    expect(createRes.statusCode, createRes.body).toBe(201);
    const { invite, acceptUrl } = createRes.json();
    expect(invite.status).toBe("pending");
    expect(acceptUrl).toContain(`/invites/${invite.token}`);

    // Public preview works without auth
    const previewRes = await app.inject({ method: "GET", url: `/invites/${invite.token}` });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.json().invite.email).toBe(inviteeEmail);
    expect(previewRes.json().invite.expired).toBe(false);

    // Register with the invite token → joins owner's org, no new org created
    const registerRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: inviteeEmail, inviteToken: invite.token }
    });
    expect(registerRes.statusCode, registerRes.body).toBe(201);
    const registered = registerRes.json();
    expect(registered.organization.organizationId).toBe(owner.organizationId);
    expect(registered.role).toBe("member");

    // Owner lists members → 2 entries
    const listRes = await app.inject({
      method: "GET",
      url: `/organizations/${owner.organizationId}/members`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().members).toHaveLength(2);

    // Invite now marked accepted
    const preview2 = await app.inject({ method: "GET", url: `/invites/${invite.token}` });
    expect(preview2.json().invite.status).toBe("accepted");
  });

  test("owner invites an existing user who accepts while logged in", async () => {
    const owner = await register("owner-b");
    const member = await register("member-b");

    const createRes = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: member.email, role: "admin" }
    });
    expect(createRes.statusCode).toBe(201);
    const { invite } = createRes.json();

    const acceptRes = await app.inject({
      method: "POST",
      url: `/invites/${invite.token}/accept`,
      headers: { authorization: `Bearer ${member.token}` }
    });
    expect(acceptRes.statusCode, acceptRes.body).toBe(200);
    expect(acceptRes.json().organizationId).toBe(owner.organizationId);
    expect(acceptRes.json().role).toBe("admin");

    // member now belongs to owner's org + their personal org
    const listRes = await app.inject({
      method: "GET",
      url: `/organizations/${owner.organizationId}/members`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    expect(listRes.json().members).toHaveLength(2);
  });

  test("non-owner member cannot invite (only admin+ with members:invite)", async () => {
    const owner = await register("owner-c");
    const memberUser = await register("member-c");

    // Invite them as a plain member
    const inv = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: memberUser.email, role: "member" }
    });
    await app.inject({
      method: "POST",
      url: `/invites/${inv.json().invite.token}/accept`,
      headers: { authorization: `Bearer ${memberUser.token}` }
    });

    // Create a fresh session scoped to the owner's org for the member (login)
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: memberUser.email, organizationId: owner.organizationId }
    });
    expect(loginRes.statusCode).toBe(200);
    const memberOrgToken = loginRes.json().token;

    // Plain member tries to invite — should be forbidden
    const forbidden = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${memberOrgToken}` },
      payload: { email: `foo-${Date.now()}@example.com`, role: "member" }
    });
    expect(forbidden.statusCode).toBe(403);
  });

  test("invite email mismatch on accept is rejected", async () => {
    const owner = await register("owner-d");
    const wrongUser = await register("wrong-d");

    const inv = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: `someone-else-${Date.now()}@example.com`, role: "member" }
    });
    const { invite } = inv.json();

    const acceptRes = await app.inject({
      method: "POST",
      url: `/invites/${invite.token}/accept`,
      headers: { authorization: `Bearer ${wrongUser.token}` }
    });
    expect(acceptRes.statusCode).toBe(409);
  });

  test("revoked invite cannot be accepted", async () => {
    const owner = await register("owner-e");
    const inviteeEmail = `invitee-e-${Date.now()}@example.com`;

    const inv = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: inviteeEmail, role: "member" }
    });
    const { invite } = inv.json();

    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/organizations/${owner.organizationId}/invites/${invite.inviteId}`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    expect(revokeRes.statusCode).toBe(200);

    // Register via revoked invite fails
    const regRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: inviteeEmail, inviteToken: invite.token }
    });
    expect(regRes.statusCode).toBe(410);
  });

  test("owner can change a member role and remove them", async () => {
    const owner = await register("owner-f");
    const member = await register("member-f");

    const inv = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: member.email, role: "member" }
    });
    await app.inject({
      method: "POST",
      url: `/invites/${inv.json().invite.token}/accept`,
      headers: { authorization: `Bearer ${member.token}` }
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/organizations/${owner.organizationId}/members/${member.userId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { role: "admin" }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().member.role).toBe("admin");

    const delRes = await app.inject({
      method: "DELETE",
      url: `/organizations/${owner.organizationId}/members/${member.userId}`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    expect(delRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: `/organizations/${owner.organizationId}/members`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    expect(listRes.json().members).toHaveLength(1);
  });

  test("owner cannot remove themselves (or the last owner)", async () => {
    const owner = await register("owner-g");
    const selfDelete = await app.inject({
      method: "DELETE",
      url: `/organizations/${owner.organizationId}/members/${owner.userId}`,
      headers: { authorization: `Bearer ${owner.token}` }
    });
    // Either 400 (self-removal) or 409 (last-owner) — both are correct safety errors
    expect([400, 409]).toContain(selfDelete.statusCode);
  });

  test("free-plan seat limit (3) blocks further invites", async () => {
    const owner = await register("owner-h");

    // Fill to the limit: owner + 2 accepted members = 3
    for (let i = 0; i < 2; i++) {
      const u = await register(`fill-h-${i}`);
      const inv = await app.inject({
        method: "POST",
        url: `/organizations/${owner.organizationId}/invites`,
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { email: u.email, role: "member" }
      });
      const accept = await app.inject({
        method: "POST",
        url: `/invites/${inv.json().invite.token}/accept`,
        headers: { authorization: `Bearer ${u.token}` }
      });
      expect(accept.statusCode, accept.body).toBe(200);
    }

    // Next invite must be rejected with 402
    const blocked = await app.inject({
      method: "POST",
      url: `/organizations/${owner.organizationId}/invites`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { email: `overflow-${Date.now()}@example.com`, role: "member" }
    });
    expect(blocked.statusCode).toBe(402);
    const body = blocked.json();
    expect(body.code).toBe("seat_limit_reached");
    expect(body.limit).toBe(3);
    expect(body.current).toBe(3);
  });
});
