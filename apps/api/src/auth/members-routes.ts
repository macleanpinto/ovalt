import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "./service.js";
import {
  SeatLimitError,
  InviteNotFoundError,
  InviteExpiredError,
  InviteAlreadyUsedError,
  InviteEmailMismatchError,
  AlreadyMemberError,
  LastOwnerError
} from "./service.js";
import type { UserRole, Invite } from "./types.js";

const inviteRoles: UserRole[] = ["admin", "member", "viewer"]; // can't invite owners

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"])
});

const updateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"])
});

function requireSessionAuth(req: any, reply: any): boolean {
  if (!req.auth?.user) {
    reply.code(401).send({ error: "Unauthorized", message: "Session authentication required" });
    return false;
  }
  return true;
}

/** Fail fast if the caller isn't acting on their own authenticated org. */
function requireSameOrg(req: any, reply: any, orgIdParam: string): boolean {
  const ctxOrgId = req.auth?.organization?.organizationId;
  if (!ctxOrgId || ctxOrgId !== orgIdParam) {
    reply.code(403).send({
      error: "Forbidden",
      message: "You can only manage members of your current organization"
    });
    return false;
  }
  return true;
}

/** Public-safe projection of an invite (no organizationId internals, just enough for accept UI). */
function publicInviteView(invite: Invite, orgName: string) {
  return {
    email: invite.email,
    role: invite.role,
    organizationName: orgName,
    status: invite.status,
    expiresAt: invite.expiresAt,
    expired: new Date(invite.expiresAt) < new Date()
  };
}

export function registerMembersRoutes(app: FastifyInstance, authService: AuthService) {
  // =========================================================================
  // Organization members
  // =========================================================================

  /** List members of an organization. */
  app.get<{ Params: { orgId: string } }>("/organizations/:orgId/members", async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;
    if (!requireSameOrg(req, reply, req.params.orgId)) return;
    if (!authService.hasPermission(req.auth!, "members:read")) {
      return reply.code(403).send({ error: "Forbidden", message: "Missing members:read" });
    }

    const members = await authService.listMembers(req.params.orgId);
    // Hydrate with basic user info
    const enriched = await Promise.all(
      members.map(async m => {
        const user = await authService.getUser(m.userId);
        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          invitedBy: m.invitedBy,
          email: user?.email,
          name: user?.name
        };
      })
    );
    return reply.send({ members: enriched });
  });

  /** Update a member's role. Owner only. */
  app.patch<{ Params: { orgId: string; userId: string } }>(
    "/organizations/:orgId/members/:userId",
    async (req, reply) => {
      if (!requireSessionAuth(req, reply)) return;
      if (!requireSameOrg(req, reply, req.params.orgId)) return;
      if (req.auth!.membership?.role !== "owner") {
        return reply.code(403).send({ error: "Forbidden", message: "Only owners can change member roles" });
      }

      const parsed = updateMemberSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

      try {
        const member = await authService.updateMemberRole(req.params.orgId, req.params.userId, parsed.data.role);
        return reply.send({ member });
      } catch (err) {
        if (err instanceof LastOwnerError) {
          return reply.code(409).send({ error: "Conflict", message: err.message });
        }
        throw err;
      }
    }
  );

  /** Remove a member. Owner only. */
  app.delete<{ Params: { orgId: string; userId: string } }>(
    "/organizations/:orgId/members/:userId",
    async (req, reply) => {
      if (!requireSessionAuth(req, reply)) return;
      if (!requireSameOrg(req, reply, req.params.orgId)) return;
      if (req.auth!.membership?.role !== "owner") {
        return reply.code(403).send({ error: "Forbidden", message: "Only owners can remove members" });
      }
      if (req.auth!.user!.userId === req.params.userId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Use a leave-organization flow to remove yourself"
        });
      }

      try {
        await authService.removeMember(req.params.orgId, req.params.userId);
        return reply.send({ success: true });
      } catch (err) {
        if (err instanceof LastOwnerError) {
          return reply.code(409).send({ error: "Conflict", message: err.message });
        }
        throw err;
      }
    }
  );

  // =========================================================================
  // Invites (authenticated side — create, list, revoke)
  // =========================================================================

  /** Create an invite. Owner/admin only. Enforces seat limits. */
  app.post<{ Params: { orgId: string } }>("/organizations/:orgId/invites", async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;
    if (!requireSameOrg(req, reply, req.params.orgId)) return;
    if (!authService.hasPermission(req.auth!, "members:invite")) {
      return reply.code(403).send({ error: "Forbidden", message: "Missing members:invite" });
    }

    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ errors: parsed.error.issues });

    try {
      const invite = await authService.createInvite({
        organization: req.auth!.organization,
        email: parsed.data.email,
        role: parsed.data.role,
        invitedByUserId: req.auth!.user!.userId
      });

      const webBase = process.env.WEB_BASE_URL ?? "http://localhost:5173";
      const acceptUrl = `${webBase}/invites/${invite.token}`;

      return reply.code(201).send({ invite, acceptUrl });
    } catch (err) {
      if (err instanceof SeatLimitError) {
        return reply.code(402).send({
          error: "Payment Required",
          message: err.message,
          code: "seat_limit_reached",
          limit: err.limit,
          current: err.current,
          plan: err.plan
        });
      }
      if (err instanceof AlreadyMemberError) {
        return reply.code(409).send({ error: "Conflict", message: err.message });
      }
      throw err;
    }
  });

  /** List pending invites for an organization. */
  app.get<{ Params: { orgId: string } }>("/organizations/:orgId/invites", async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;
    if (!requireSameOrg(req, reply, req.params.orgId)) return;
    if (!authService.hasPermission(req.auth!, "members:read")) {
      return reply.code(403).send({ error: "Forbidden", message: "Missing members:read" });
    }

    const invites = await authService.listInvites(req.params.orgId);
    const webBase = process.env.WEB_BASE_URL ?? "http://localhost:5173";
    return reply.send({
      invites: invites.map(i => ({ ...i, acceptUrl: `${webBase}/invites/${i.token}` }))
    });
  });

  /** Revoke a pending invite. Owner/admin only. */
  app.delete<{ Params: { orgId: string; inviteId: string } }>(
    "/organizations/:orgId/invites/:inviteId",
    async (req, reply) => {
      if (!requireSessionAuth(req, reply)) return;
      if (!requireSameOrg(req, reply, req.params.orgId)) return;
      if (!authService.hasPermission(req.auth!, "members:invite")) {
        return reply.code(403).send({ error: "Forbidden", message: "Missing members:invite" });
      }

      await authService.revokeInvite(req.params.inviteId);
      return reply.send({ success: true });
    }
  );

  // =========================================================================
  // Invites (public token lookup & accept)
  // =========================================================================

  /** Public: fetch minimal invite info by token for the accept UI. */
  app.get<{ Params: { token: string } }>("/invites/:token", async (req, reply) => {
    const invite = await authService.getInviteByToken(req.params.token);
    if (!invite) return reply.code(404).send({ error: "Not Found", message: "Invite not found" });

    const org = await authService.getOrganization(invite.organizationId);
    return reply.send({
      invite: publicInviteView(invite, org?.name ?? "Unknown organization")
    });
  });

  /** Accept an invite. Requires authenticated user whose email matches. */
  app.post<{ Params: { token: string } }>("/invites/:token/accept", async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    try {
      const { invite, membership } = await authService.acceptInvite({
        token: req.params.token,
        user: req.auth!.user!
      });

      // Create a fresh session scoped to the newly-joined org so subsequent calls
      // reflect the new membership/role.
      const { token } = await authService.createSession({
        userId: req.auth!.user!.userId,
        organizationId: invite.organizationId,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip
      });

      return reply.send({
        organizationId: invite.organizationId,
        role: membership.role,
        token
      });
    } catch (err) {
      if (err instanceof InviteNotFoundError) {
        return reply.code(404).send({ error: "Not Found", message: err.message });
      }
      if (err instanceof InviteExpiredError) {
        return reply.code(410).send({ error: "Gone", message: err.message });
      }
      if (err instanceof InviteAlreadyUsedError) {
        return reply.code(410).send({ error: "Gone", message: err.message, status: err.status });
      }
      if (err instanceof InviteEmailMismatchError) {
        return reply.code(409).send({ error: "Conflict", message: err.message });
      }
      if (err instanceof AlreadyMemberError) {
        return reply.code(409).send({ error: "Conflict", message: err.message });
      }
      if (err instanceof SeatLimitError) {
        return reply.code(402).send({
          error: "Payment Required",
          message: err.message,
          code: "seat_limit_reached",
          limit: err.limit,
          current: err.current,
          plan: err.plan
        });
      }
      throw err;
    }
  });
}
