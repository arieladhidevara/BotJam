import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

export function createAgentToken(): string {
  return `btj_${randomBytes(24).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authenticateAgent(request: Request): Promise<{
  ok: true;
  token: string;
  tokenHash: string;
  agentName: string;
} | {
  ok: false;
  response: Response;
}> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, response: Response.json({ error: "Missing bearer token" }, { status: 401 }) };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, response: Response.json({ error: "Invalid bearer token" }, { status: 401 }) };
  }

  const tokenHash = hashToken(token);
  const agentToken = await prisma.agentToken.findUnique({
    where: { tokenHash }
  });

  if (!agentToken) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  await prisma.agentToken.update({
    where: { tokenHash },
    data: { lastUsedAt: new Date() }
  });

  return {
    ok: true,
    token,
    tokenHash,
    agentName: agentToken.agentName
  };
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
