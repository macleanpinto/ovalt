import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Gate a route behind the platform-admin flag. Session auth only — API keys
 * and service tokens are rejected, since the flag lives on the user record.
 */
export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.auth) {
    reply.code(401).send({ error: "Unauthorized", message: "Authentication required" });
    return;
  }

  if (request.auth.authMethod !== "session" || !request.auth.user?.isPlatformAdmin) {
    reply.code(403).send({ error: "Forbidden", message: "Platform admin access required" });
    return;
  }
}
