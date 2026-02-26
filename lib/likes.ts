import { Prisma, PrismaClient } from "@prisma/client";

import type { LikeDto } from "@/lib/types";

type RawLikeRow = {
  id: number;
  runId: number;
  name: string;
  source: string;
  ts: Date;
};

type RawCountRow = {
  runId: number;
  count: bigint | number;
};

export async function getLikeCountsForRunIds(
  client: PrismaClient,
  runIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (runIds.length === 0) return counts;

  let rows: RawCountRow[] = [];
  try {
    rows = await client.$queryRaw<RawCountRow[]>(
      Prisma.sql`
        SELECT "runId", COUNT(*)::bigint AS "count"
        FROM "RunLike"
        WHERE "runId" IN (${Prisma.join(runIds)})
        GROUP BY "runId"
      `
    );
  } catch {
    return counts;
  }

  for (const row of rows) {
    counts.set(row.runId, Number(row.count));
  }

  return counts;
}

export async function listRunLikes(client: PrismaClient, runId: number): Promise<LikeDto[]> {
  const rows = await client.$queryRaw<RawLikeRow[]>(
    Prisma.sql`
      SELECT "id", "runId", "name", "source", "ts"
      FROM "RunLike"
      WHERE "runId" = ${runId}
      ORDER BY "id" DESC
    `
  );

  return rows.map(serializeLikeRow);
}

export async function createRunLike(
  client: PrismaClient,
  runId: number,
  name: string,
  source: "human" | "agent"
): Promise<{ like: LikeDto; duplicate: boolean }> {
  const inserted = await client.$queryRaw<RawLikeRow[]>(
    Prisma.sql`
      INSERT INTO "RunLike" ("runId", "name", "source")
      VALUES (${runId}, ${name}, ${source}::"LikeSource")
      ON CONFLICT ("runId", "source", "name")
      DO NOTHING
      RETURNING "id", "runId", "name", "source", "ts"
    `
  );

  if (inserted.length > 0) {
    return { like: serializeLikeRow(inserted[0]), duplicate: false };
  }

  const existing = await client.$queryRaw<RawLikeRow[]>(
    Prisma.sql`
      SELECT "id", "runId", "name", "source", "ts"
      FROM "RunLike"
      WHERE "runId" = ${runId} AND "source" = ${source}::"LikeSource" AND "name" = ${name}
      LIMIT 1
    `
  );

  if (existing.length === 0) {
    throw new Error("Could not load existing like after conflict");
  }

  return { like: serializeLikeRow(existing[0]), duplicate: true };
}

function serializeLikeRow(row: RawLikeRow): LikeDto {
  return {
    id: row.id,
    runId: row.runId,
    name: row.name,
    source: row.source === "agent" ? "agent" : "human",
    ts: row.ts.toISOString()
  };
}
