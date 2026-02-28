import { Prisma, PrismaClient, RunLike } from "@prisma/client";

import type { LikeDto } from "@/lib/types";

export async function getLikeCountsForRunIds(
  client: PrismaClient,
  runIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (runIds.length === 0) return counts;

  try {
    const rows = await client.runLike.groupBy({
      by: ["runId"],
      where: { runId: { in: runIds } },
      _count: { _all: true }
    });

    for (const row of rows) {
      counts.set(row.runId, row._count._all);
    }
  } catch (error) {
    if (!isLikeStorageNotReadyError(error)) {
      console.error("Failed to read like counts", error);
    }
    return counts;
  }

  return counts;
}

export async function listRunLikes(client: PrismaClient, runId: number): Promise<LikeDto[]> {
  const rows = await client.runLike.findMany({
    where: { runId },
    orderBy: { id: "desc" }
  });
  return rows.map((row) => serializeLikeRow(row));
}

export async function createRunLike(
  client: PrismaClient,
  runId: number,
  name: string,
  source: "human" | "agent"
): Promise<{ like: LikeDto; duplicate: boolean }> {
  try {
    const inserted = await client.runLike.create({
      data: {
        runId,
        name,
        source
      }
    });
    return { like: serializeLikeRow(inserted), duplicate: false };
  } catch (error) {
    if (!isLikeDuplicateError(error)) {
      throw error;
    }
  }

  const existing = await client.runLike.findUnique({
    where: {
      runId_source_name: {
        runId,
        source,
        name
      }
    }
  });

  if (!existing) {
    throw new Error("Could not load existing like after conflict");
  }

  return { like: serializeLikeRow(existing), duplicate: true };
}

export function isLikeStorageNotReadyError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === "P2021" ||
      error.code === "P2022" ||
      error.code === "P2010"
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("runlike") &&
      (
        message.includes("does not exist") ||
        message.includes("relation") ||
        message.includes("table")
      )
    );
  }

  return false;
}

function isLikeDuplicateError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function serializeLikeRow(row: Pick<RunLike, "id" | "runId" | "name" | "source" | "ts">): LikeDto {
  return {
    id: row.id,
    runId: row.runId,
    name: row.name,
    source: row.source === "agent" ? "agent" : "human",
    ts: row.ts.toISOString()
  };
}
