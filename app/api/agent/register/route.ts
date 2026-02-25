import { Prisma } from "@prisma/client";

import { createAgentToken, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LIMITS, badRequest, trimAndValidate } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON");

  const agentName = trimAndValidate(body.agentName, LIMITS.agentName);
  if (!agentName) return badRequest("Invalid agentName");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const agentToken = createAgentToken();
    const tokenHash = hashToken(agentToken);

    try {
      await prisma.agentToken.create({
        data: {
          agentName,
          tokenHash
        }
      });

      return Response.json({ agentToken });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return Response.json({ error: "Could not generate unique token" }, { status: 500 });
}
